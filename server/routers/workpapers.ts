import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { workpapers, controls, auditTrail } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { generateWorkpaperWriteup } from "../lib/ai";
import { getSampleSize, getSamplingRationale, selectRandomSample } from "../lib/sampling";

export const workpapersRouter = router({
  listByEngagement: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(async ({ ctx, input }) => {
      const ctls = await ctx.db.select({ id: controls.id }).from(controls).where(eq(controls.engagementId, input.engagementId));
      if (!ctls.length) return [];
      const all = await Promise.all(ctls.map(c =>
        ctx.db.select().from(workpapers).where(eq(workpapers.controlId, c.id))
      ));
      return all.flat();
    }),

  getByControl: protectedProcedure
    .input(z.object({ controlId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [wp] = await ctx.db.select().from(workpapers).where(eq(workpapers.controlId, input.controlId));
      return wp ?? null;
    }),

  upsert: auditedProcedure
    .input(z.object({
      controlId: z.string(),
      engagementId: z.string(),
      populationDescription: z.string().optional(),
      populationCount: z.number().optional(),
      populationPeriod: z.string().optional(),
      procedureFinal: z.string().optional(),
      resultsFinal: z.string().optional(),
      conclusionFinal: z.string().optional(),
      conclusion: z.enum(["Pass", "ExceptionNoted", "InProgress"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(workpapers).where(eq(workpapers.controlId, input.controlId));
      if (existing.length > 0) {
        await ctx.db.update(workpapers).set({ ...input, updatedAt: new Date() }).where(eq(workpapers.controlId, input.controlId));
        return existing[0];
      }
      const [wp] = await ctx.db.insert(workpapers).values({
        id: randomUUID(),
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return wp;
    }),

  generateAi: auditedProcedure
    .input(z.object({ controlId: z.string(), population: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [control] = await ctx.db.select().from(controls).where(eq(controls.id, input.controlId));
      if (!control) throw new TRPCError({ code: "NOT_FOUND" });

      const existingWp = await ctx.db.select().from(workpapers).where(eq(workpapers.controlId, input.controlId));
      const populationCount = existingWp[0]?.populationCount ?? 100;
      const sampleSize = getSampleSize(
        control.frequency,
        control.riskLevel,
        populationCount,
        control.priorYearResult === "ExceptionNoted"
      );

      const aiResult = await generateWorkpaperWriteup({
        controlRef: control.controlRef,
        controlObjective: control.objective,
        domain: control.domain,
        controlType: (control.itgcType ?? control.itacType ?? ""),
        frequency: control.frequency,
        riskLevel: control.riskLevel,
        population: input.population ?? existingWp[0]?.populationDescription ?? "Not yet defined",
        sampleSize,
        pbcDescription: "PBC received per tracker",
        framework: "PCAOB",
      });

      const samplingRationale = getSamplingRationale(
        control.frequency,
        control.riskLevel,
        populationCount,
        sampleSize,
        control.priorYearResult === "ExceptionNoted"
      );

      if (existingWp.length > 0) {
        await ctx.db.update(workpapers).set({
          sampleSize,
          samplingMethod: "Random",
          procedureDraft: aiResult.procedure,
          resultsDraft: aiResult.results,
          conclusionDraft: aiResult.conclusion,
          aiGeneratedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(workpapers.controlId, input.controlId));
      } else {
        await ctx.db.insert(workpapers).values({
          id: randomUUID(),
          controlId: input.controlId,
          engagementId: control.engagementId,
          sampleSize,
          samplingMethod: "Random",
          populationCount,
          procedureDraft: samplingRationale + "\n\n" + aiResult.procedure,
          resultsDraft: aiResult.results,
          conclusionDraft: aiResult.conclusion,
          conclusion: "InProgress",
          aiGeneratedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Log AI generation to audit trail
      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        engagementId: control.engagementId,
        entityType: "workpaper",
        entityId: input.controlId,
        action: "ai_generated",
        description: `AI writeup generated for ${control.controlRef}`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { sampleSize, ...aiResult, samplingRationale };
    }),

  signOff: auditedProcedure
    .input(z.object({
      workpaperId: z.string(),
      level: z.enum(["preparer", "reviewer", "approver"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const updates =
        input.level === "preparer" ? { preparedBy: ctx.user.id, preparedAt: new Date() } :
        input.level === "reviewer" ? { reviewedBy: ctx.user.id, reviewedAt: new Date() } :
        { approvedBy: ctx.user.id, approvedAt: new Date() };

      await ctx.db.update(workpapers).set({ ...updates, updatedAt: new Date() }).where(eq(workpapers.id, input.workpaperId));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "workpaper",
        entityId: input.workpaperId,
        action: `signed_off_${input.level}`,
        description: `Workpaper signed off as ${input.level}`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { success: true };
    }),
});
