import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(users).where(eq(users.email, input.email.toLowerCase()));
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      await ctx.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: "7d" });
      return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, firmName: user.firmName } };
    }),

  register: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(2),
      firmName: z.string().optional(),
      role: z.enum(["preparer", "senior", "manager", "partner", "admin"]).default("preparer"),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(users).where(eq(users.email, input.email.toLowerCase()));
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
      const passwordHash = await bcrypt.hash(input.password, 12);
      const [user] = await ctx.db.insert(users).values({
        id: randomUUID(),
        email: input.email.toLowerCase(),
        passwordHash,
        name: input.name,
        role: input.role,
        firmName: input.firmName ?? null,
      }).returning();
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: "7d" });
      return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, firmName: user.firmName } };
    }),

  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    role: ctx.user.role,
    firmName: ctx.user.firmName,
  })),
});
