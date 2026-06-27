import { z } from "zod";
import { randomUUID } from "crypto";
import { router, auditedProcedure, protectedProcedure } from "../_core/trpc";
import { exceptions, controls, auditTrail } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { generateExceptionMemo } from "../lib/ai";

export const exceptionsRouter = router({
  listByEngagement: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(exceptions).where(eq(exceptions.engagementId, input.engagementId))
    ),

  create: auditedProcedure
    .input(z.object({
      workpaperId: z.string(),
      controlId: z.string(),
      engagementId: z.string(),
      description: z.string(),
      severity: z.enum(["ControlDeficiency", "SignificantDeficiency", "MaterialWeakness"]).default("ControlDeficiency"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [control] = await ctx.db.select().from(controls).where(eq(controls.id, input.controlId));
      if (!control) throw new TRPCError({ code: "NOT_FOUND" });

      // Auto-generate AI exception memo
      const aiMemo = await generateExceptionMemo({
        controlRef: control.controlRef,
        controlObjective: control.objective,
        exceptionDescription: input.description,
        severity: input.severity,
      });

      const [exc] = await ctx.db.insert(exceptions).values({
        id: randomUUID(),
        ...input,
        rootCause: aiMemo.rootCause,
        managementResponse: aiMemo.managementResponse,
        managementLetterComment: aiMemo.managementLetterComment,
        aiDraftMemo: JSON.stringify(aiMemo),
        raisedBy: ctx.user.id,
        raisedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        engagementId: input.engagementId,
        entityType: "exception",
        entityId: exc.id,
        action: "created",
        description: `Exception raised for control ${control.controlRef}`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return exc;
    }),

  update: auditedProcedure
    .input(z.object({
      id: z.string(),
      managementResponse: z.string().optional(),
      remediationPlan: z.string().optional(),
      remediationDueDate: z.date().optional(),
      status: z.enum(["Open", "Remediated", "AcceptedRisk", "PendingRetest"]).optional(),
      managementLetterComment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await ctx.db.update(exceptions).set({ ...updates, updatedAt: new Date() }).where(eq(exceptions.id, id));
      return { success: true };
    }),
});
