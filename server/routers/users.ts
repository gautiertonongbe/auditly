import { insertReturning } from "../_core/db";
import { z } from "zod";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { users, engagementMembers, engagements } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const usersRouter = router({
  me: protectedProcedure.query(({ ctx }) =>
    ctx.db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      firmName: users.firmName,
    })
    .from(users)
    .where(eq(users.id, ctx.user.id))
    .then(rows => rows[0] ?? null)
  ),

  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().min(2).optional() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(users).set({ ...(input.name ? { name: input.name } : {}) }).where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),

  // List all users in the firm (for team management)
  listAll: protectedProcedure.query(({ ctx }) =>
    ctx.db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      firmName: users.firmName,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    }).from(users)
  ),

  // List engagement members with user details
  listEngagementTeam: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.db.select().from(engagementMembers).where(eq(engagementMembers.engagementId, input.engagementId));
      const result = await Promise.all(members.map(async m => {
        const [user] = await ctx.db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
          .from(users).where(eq(users.id, m.userId));
        return { ...m, user };
      }));
      return result.filter(r => r.user);
    }),

  // Update a member's role on an engagement
  updateMemberRole: auditedProcedure
    .input(z.object({
      memberId: z.string(),
      role: z.enum(["preparer", "senior", "manager", "partner", "admin"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(engagementMembers).set({ role: input.role }).where(eq(engagementMembers.id, input.memberId));
      return { success: true };
    }),

  // Add a user to an engagement
  addToEngagement: auditedProcedure
    .input(z.object({
      engagementId: z.string(),
      userId: z.string(),
      role: z.enum(["preparer", "senior", "manager", "partner", "admin"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [member] = await insertReturning(ctx.db, engagementMembers, {
        id: randomUUID(),
        engagementId: input.engagementId,
        userId: input.userId,
        role: input.role,
        assignedAt: new Date(),
      });
      return member;
    }),

  // Remove a user from an engagement
  removeFromEngagement: auditedProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(engagementMembers).where(eq(engagementMembers.id, input.memberId));
      return { success: true };
    }),
});
