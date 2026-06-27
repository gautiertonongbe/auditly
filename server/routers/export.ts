import { z } from "zod";
import { randomUUID } from "crypto";
import { router, auditedProcedure } from "../_core/trpc";
import { engagements, controls, workpapers, pbcItems, exceptions, ipeItems, exportLog, auditTrail } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { buildWorkbook } from "../lib/excel";
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

      // Build workpaper rows with control refs
      const wpWithRef = workpaperList.map(wp => {
        const ctrl = controlList.find(c => c.id === wp.controlId);
        return { ...wp, controlRef: ctrl?.controlRef ?? wp.controlId };
      });

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

      // Log export
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

      // Return as base64 for client download
      return {
        fileName: `Auditly_${eng.clientName.replace(/\s+/g, "_")}_FY${eng.fiscalYear}_Workpaper.xlsx`,
        base64: buffer.toString("base64"),
      };
    }),
});
