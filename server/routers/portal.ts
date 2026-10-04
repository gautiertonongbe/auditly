import { insertReturning } from "../_core/db";
import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { portalTokens, engagements, pbcItems } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const portalRouter = router({
  createLink: auditedProcedure
    .input(z.object({
      engagementId: z.string(),
      clientName: z.string().min(1),
      clientEmail: z.string().email().optional(),
      expiryDays: z.number().min(1).max(90).default(14),
    }))
    .mutation(async ({ ctx, input }) => {
      const token = randomUUID().replace(/-/g, "");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiryDays);

      const [link] = await insertReturning(ctx.db, portalTokens, {
        id: randomUUID(),
        token,
        engagementId: input.engagementId,
        clientName: input.clientName,
        clientEmail: input.clientEmail ?? null,
        createdBy: ctx.user.id,
        expiresAt,
        isActive: true,
        createdAt: new Date(),
      });

      const portalUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/portal/${token}`;
      return { ...link, portalUrl };
    }),

  listByEngagement: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(portalTokens).where(eq(portalTokens.engagementId, input.engagementId))
    ),

  revoke: auditedProcedure
    .input(z.object({ tokenId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(portalTokens).set({ isActive: false }).where(eq(portalTokens.id, input.tokenId));
      return { success: true };
    }),
});
