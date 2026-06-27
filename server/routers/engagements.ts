import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { engagements, engagementMembers, controls } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const engagementsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(engagements).orderBy(engagements.createdAt)
  ),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [eng] = await ctx.db.select().from(engagements).where(eq(engagements.id, input.id));
      const members = await ctx.db.select().from(engagementMembers).where(eq(engagementMembers.engagementId, input.id));
      const controlList = await ctx.db.select().from(controls).where(eq(controls.engagementId, input.id));
      return { ...eng, members, controls: controlList };
    }),

  create: auditedProcedure
    .input(z.object({
      clientName: z.string(),
      clientIndustry: z.string().optional(),
      fiscalYear: z.number(),
      periodStart: z.date(),
      periodEnd: z.date(),
      framework: z.string().default("PCAOB"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [eng] = await ctx.db.insert(engagements).values({
        id: randomUUID(),
        ...input,
        status: "planning",
        createdBy: ctx.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      // Auto-add creator as engagement manager
      await ctx.db.insert(engagementMembers).values({
        id: randomUUID(),
        engagementId: eng.id,
        userId: ctx.user.id,
        role: ctx.user.role,
        assignedAt: new Date(),
      });
      return eng;
    }),

  updateStatus: auditedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["planning", "fieldwork", "review", "complete", "archived"]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(engagements).set({ status: input.status, updatedAt: new Date() }).where(eq(engagements.id, input.id));
      return { success: true };
    }),

  // Rollforward: copy prior year engagement to new period
  rollforward: auditedProcedure
    .input(z.object({
      sourceEngagementId: z.string(),
      newFiscalYear: z.number(),
      newPeriodStart: z.date(),
      newPeriodEnd: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [source] = await ctx.db.select().from(engagements).where(eq(engagements.id, input.sourceEngagementId));
      const sourceControls = await ctx.db.select().from(controls).where(eq(controls.engagementId, input.sourceEngagementId));

      // Create new engagement
      const [newEng] = await ctx.db.insert(engagements).values({
        id: randomUUID(),
        clientName: source.clientName,
        clientIndustry: source.clientIndustry,
        fiscalYear: input.newFiscalYear,
        periodStart: input.newPeriodStart,
        periodEnd: input.newPeriodEnd,
        framework: source.framework,
        status: "planning",
        createdBy: ctx.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Copy controls with prior year results
      for (const ctrl of sourceControls) {
        await ctx.db.insert(controls).values({
          id: randomUUID(),
          engagementId: newEng.id,
          systemId: null,
          domain: ctrl.domain,
          itgcType: ctrl.itgcType,
          itacType: ctrl.itacType,
          controlRef: ctrl.controlRef,
          objective: ctrl.objective,
          description: ctrl.description,
          frequency: ctrl.frequency,
          riskLevel: ctrl.riskLevel,
          status: "NotStarted",
          priorYearResult: ctrl.priorYearResult ?? null,
          priorYearException: ctrl.priorYearResult === "ExceptionNoted" ? "Exception noted in prior year" : null,
          elevatedSample: ctrl.priorYearResult === "ExceptionNoted",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return { newEngagement: newEng, controlsRolledForward: sourceControls.length };
    }),
});
