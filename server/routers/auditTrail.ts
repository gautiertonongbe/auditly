import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { auditTrail } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export const auditTrailRouter = router({
  listByEngagement: protectedProcedure
    .input(z.object({ engagementId: z.string(), limit: z.number().default(200) }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(auditTrail)
        .where(eq(auditTrail.engagementId, input.engagementId))
        .orderBy(desc(auditTrail.timestamp))
        .limit(input.limit)
    ),

  listByEntity: protectedProcedure
    .input(z.object({ entityType: z.string(), entityId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(auditTrail)
        .where(eq(auditTrail.entityId, input.entityId))
        .orderBy(desc(auditTrail.timestamp))
    ),
});
