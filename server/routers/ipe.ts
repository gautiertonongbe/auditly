import { insertReturning } from "../_core/db";
import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { ipeItems } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { generateIpeMemo } from "../lib/ai";

export const ipeRouter = router({
  listByEngagement: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(ipeItems).where(eq(ipeItems.engagementId, input.engagementId))
    ),

  create: auditedProcedure
    .input(z.object({
      engagementId: z.string(),
      pbcItemId: z.string().optional(),
      reportName: z.string(),
      system: z.string(),
      parameters: z.string().optional(),
      runDate: z.date().optional(),
      runBy: z.string().optional(),
      linkedControls: z.string().array().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Auto-generate IPE memo
      const aiMemo = await generateIpeMemo({
        reportName: input.reportName,
        system: input.system,
        parameters: input.parameters ?? "Not specified",
        runDate: input.runDate?.toISOString().split("T")[0] ?? "Not specified",
        controlRef: input.linkedControls?.[0] ?? "N/A",
      });

      const [ipe] = await insertReturning(ctx.db, ipeItems, {
        id: randomUUID(),
        engagementId: input.engagementId,
        pbcItemId: input.pbcItemId ?? null,
        reportName: input.reportName,
        system: input.system,
        parameters: input.parameters ?? null,
        runDate: input.runDate ?? null,
        runBy: input.runBy ?? null,
        completenessStatus: "NotTested",
        completenessAiDraft: aiMemo.completeness,
        accuracyStatus: "NotTested",
        accuracyAiDraft: aiMemo.accuracy,
        linkedControls: input.linkedControls ?? [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return ipe;
    }),

  updateTestingResult: auditedProcedure
    .input(z.object({
      id: z.string(),
      completenessStatus: z.enum(["NotTested", "Pass", "Fail"]).optional(),
      completenessNotes: z.string().optional(),
      accuracyStatus: z.enum(["NotTested", "Pass", "Fail"]).optional(),
      accuracyNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await ctx.db.update(ipeItems).set({ ...updates, updatedAt: new Date() }).where(eq(ipeItems.id, id));
      return { success: true };
    }),
});
