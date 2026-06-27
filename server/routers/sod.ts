import { z } from "zod";
import { randomUUID } from "crypto";
import { router, auditedProcedure, protectedProcedure } from "../_core/trpc";
import { sodAnalyses, auditTrail } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { analyzeSodConflicts } from "../lib/ai";

export const sodRouter = router({
  listByEngagement: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(sodAnalyses).where(eq(sodAnalyses.engagementId, input.engagementId))
    ),

  analyze: auditedProcedure
    .input(z.object({
      engagementId: z.string(),
      systemName: z.string(),
      userAccessData: z.string(), // pasted CSV or table content
      pbcItemId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await analyzeSodConflicts({
        system: input.systemName,
        userAccessData: input.userAccessData,
      });

      const [analysis] = await ctx.db.insert(sodAnalyses).values({
        id: randomUUID(),
        engagementId: input.engagementId,
        systemName: input.systemName,
        pbcItemId: input.pbcItemId ?? null,
        conflicts: result.conflicts,
        totalUsersAnalyzed: input.userAccessData.split("\n").length - 1,
        totalConflictsFound: result.conflicts.length,
        highSeverityCount: result.conflicts.filter((c: { severity: string }) => c.severity === "High").length,
        aiSummary: result.summary,
        analyzedAt: new Date(),
        analyzedBy: ctx.user.id,
      }).returning();

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        engagementId: input.engagementId,
        entityType: "sod_analysis",
        entityId: analysis.id,
        action: "sod_analyzed",
        description: `SOD analysis for ${input.systemName}: ${result.conflicts.length} conflicts found`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return analysis;
    }),
});
