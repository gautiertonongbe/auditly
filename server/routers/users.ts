import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

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
    .where(eq(users.id, ctx.userId))
    .then(rows => rows[0] ?? null)
  ),

  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().min(2).optional() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(users).set({ ...(input.name ? { name: input.name } : {}) }).where(eq(users.id, ctx.userId));
      return { ok: true };
    }),
});
