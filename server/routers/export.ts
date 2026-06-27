import { z } from "zod";
import { randomUUID } from "crypto";
import { router, auditedProcedure } from "../_core/trpc";
import { engagements, controls, workpapers, pbcItems, exceptions, ipeItems, exportLog, auditTrail, users } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { buildWorkbook } from "../lib/excel";
import { generateTestDetail } from "../lib/ai";
import { TRPCError } from "@trpc/server";

export const exportRouter = router({
  exportEngagement: auditedProcedure
    .input(z.object({ engagementId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [eng] = await ctx.db.select().from(engagements).where(eq(engagements.id, input.engagementId));
      if (!eng) throw new TRPCError({ code: "NOT_FOUND" });

      const controlList = await ctx.db.select().from(controls).where(eq(controls.engagementId, input.engagementId));
      const workpaperList = await ctx.db.select().from(workpapers).where(eq(workpapers.engagementId, input.engagementId));
      const pbcList = await ctx.db.select().from(pbcItems).where(eq(pbcItems.engagementId, input.engagementId));
      const exceptionList = await ctx.db.select().from(exceptions).where(eq(exceptions.engagementId, input.engagementId));
      const ipeList = await ctx.db.select().from(ipeItems).where(eq(ipeItems.engagementId, input.engagementId));

      // Resolve user IDs → display names for sign-off blocks
      const userIds = [
        ...new Set(
          workpaperList
            .flatMap(wp => [wp.preparedBy, wp.reviewedBy, wp.approvedBy])
            .filter((id): id is string => id !== null && id !== undefined)
        ),
      ];
      const userRecords = userIds.length > 0
        ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
        : [];
      const userMap: Record<string, string> = Object.fromEntries(userRecords.map(u => [u.id, u.name]));

      // Build workpaper rows: join control refs + user names + GTest AI detail
      const wpWithRef = await Promise.all(
        workpaperList.map(async wp => {
          const ctrl = controlList.find(c => c.id === wp.controlId);
          const controlRef = ctrl?.controlRef ?? wp.controlId;
          // Prefer ITGC type for attribute selection; fall back to ITAC or CM
          const controlType = ctrl?.itgcType ?? ctrl?.itacType ?? "CM";

          // Find accepted PBC items for this control that have extracted text
          const acceptedPbc = pbcList.filter(
            p => p.controlId === wp.controlId && p.status === "Accepted" && p.fileContent
          );

          let testDetail = null;
          if (acceptedPbc.length > 0 && ctrl && wp.sampleSize && wp.populationCount) {
            // Combine content from all accepted evidence files
            const combinedContent = acceptedPbc
              .map(p => `[Evidence File: ${p.fileName ?? "unknown"}]\n${p.fileContent}`)
              .join("\n\n---\n\n");
            const combinedFileName = acceptedPbc
              .map(p => p.fileName ?? "evidence")
              .join(", ");

            try {
              testDetail = await generateTestDetail({
                controlRef: ctrl.controlRef,
                controlType,
                controlObjective: ctrl.objective,
                frequency: ctrl.frequency,
                riskLevel: ctrl.riskLevel,
                sampleSize: wp.sampleSize,
                populationCount: wp.populationCount,
                populationDescription: wp.populationDescription ?? `${ctrl.frequency} ${ctrl.domain} control population`,
                pbcContent: combinedContent,
                pbcFileName: combinedFileName,
                preparedBy: wp.preparedBy ? (userMap[wp.preparedBy] ?? wp.preparedBy) : "Audit Manager",
                reviewedBy: wp.reviewedBy ? (userMap[wp.reviewedBy] ?? wp.reviewedBy) : undefined,
              });
            } catch (err) {
              console.error(`[GTest] generateTestDetail failed for ${controlRef}:`, err);
              // Non-fatal: export continues without GTest sheet for this control
            }
          }

          return {
            ...wp,
            controlRef,
            preparedBy: wp.preparedBy ? (userMap[wp.preparedBy] ?? wp.preparedBy) : undefined,
            reviewedBy: wp.reviewedBy ? (userMap[wp.reviewedBy] ?? wp.reviewedBy) : undefined,
            approvedBy: wp.approvedBy ? (userMap[wp.approvedBy] ?? wp.approvedBy) : undefined,
            testDetail,
          };
        })
      );

      const pbcWithRef = pbcList.map(pbc => {
        const ctrl = pbc.controlId ? controlList.find(c => c.id === pbc.controlId) : null;
        return { ...pbc, controlRef: ctrl?.controlRef };
      });

      const excWithRef = exceptionList.map(exc => {
        const ctrl = controlList.find(c => c.id === exc.controlId);
        return { ...exc, controlRef: ctrl?.controlRef ?? exc.controlId };
      });

      const buffer = await buildWorkbook({
        engagement: eng,
        controls: controlList,
        workpapers: wpWithRef,
        pbcItems: pbcWithRef,
        exceptions: excWithRef,
        ipeItems: ipeList,
      });

      // Audit trail
      await ctx.db.insert(exportLog).values({
        id: randomUUID(),
        engagementId: input.engagementId,
        exportType: "full_workbook",
        exportedBy: ctx.user.id,
        exportedAt: new Date(),
      });

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        engagementId: input.engagementId,
        entityType: "engagement",
        entityId: input.engagementId,
        action: "exported",
        description: `Full workbook exported by ${ctx.user.name}`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return {
        fileName: `Auditly_${eng.clientName.replace(/\s+/g, "_")}_FY${eng.fiscalYear}_Workpaper.xlsx`,
        base64: buffer.toString("base64"),
      };
    }),
});
