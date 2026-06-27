import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authenticator } = require("@otplib/preset-default") as {
  authenticator: {
    generateSecret: (length?: number) => string;
    keyuri: (user: string, service: string, secret: string) => string;
    generate: (s: string) => string;
    check: (token: string, secret: string) => boolean;
  }
};
import QRCode from "qrcode";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

// SOC 2 security constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const JWT_EXPIRY = "8h";                      // session timeout
const MIN_PASSWORD_LENGTH = 12;
const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;

function issueToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function checkPasswordStrength(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  if (!PASSWORD_COMPLEXITY.test(password)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Password must include uppercase, lowercase, a number, and a special character." });
  }
}

export const authRouter = router({

  // ── Login (with account lockout + MFA challenge) ─────────────────────────
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(users).where(eq(users.email, input.email.toLowerCase()));
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });

      // Account lockout check
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
        throw new TRPCError({ code: "FORBIDDEN", message: `Account locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.` });
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        const newAttempts = user.failedLoginAttempts + 1;
        const lockout = newAttempts >= MAX_FAILED_ATTEMPTS
          ? { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS), failedLoginAttempts: newAttempts }
          : { failedLoginAttempts: newAttempts };
        await ctx.db.update(users).set(lockout).where(eq(users.id, user.id));
        const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
        throw new TRPCError({ code: "UNAUTHORIZED", message: remaining > 0 ? `Invalid credentials. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` : "Account locked for 15 minutes due to too many failed attempts." });
      }

      // Reset lockout on success
      await ctx.db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastActivityAt: new Date() }).where(eq(users.id, user.id));

      // MFA required
      if (user.mfaEnabled) {
        // Issue a short-lived pre-auth token — client must verify TOTP before getting a full JWT
        const preAuthToken = jwt.sign({ userId: user.id, mfaPending: true }, JWT_SECRET, { expiresIn: "5m" });
        return { mfaRequired: true, preAuthToken, user: null as never, token: null as never };
      }

      const token = issueToken(user.id);
      return {
        mfaRequired: false, preAuthToken: null as never, token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, firmName: user.firmName, mustChangePassword: user.mustChangePassword },
      };
    }),

  // ── Verify MFA TOTP after login ──────────────────────────────────────────
  verifyMfa: publicProcedure
    .input(z.object({ preAuthToken: z.string(), code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      let payload: { userId: string; mfaPending?: boolean };
      try {
        payload = jwt.verify(input.preAuthToken, JWT_SECRET) as typeof payload;
      } catch {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Session expired. Please log in again." });
      }
      if (!payload.mfaPending) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid pre-auth token" });

      const [user] = await ctx.db.select().from(users).where(eq(users.id, payload.userId));
      if (!user?.mfaSecret) throw new TRPCError({ code: "UNAUTHORIZED", message: "MFA not configured" });

      const valid = authenticator.check(input.code, user.mfaSecret);
      if (!valid) {
        // Check backup codes
        const backupCodes: string[] = user.mfaBackupCodes ? JSON.parse(user.mfaBackupCodes) : [];
        const usedIndex = await Promise.all(backupCodes.map(h => bcrypt.compare(input.code, h))).then(rs => rs.findIndex(Boolean));
        if (usedIndex === -1) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid code" });
        // Consume the backup code
        backupCodes.splice(usedIndex, 1);
        await ctx.db.update(users).set({ mfaBackupCodes: JSON.stringify(backupCodes) }).where(eq(users.id, user.id));
      }

      await ctx.db.update(users).set({ lastLoginAt: new Date(), lastActivityAt: new Date() }).where(eq(users.id, user.id));
      const token = issueToken(user.id);
      return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, firmName: user.firmName, mustChangePassword: user.mustChangePassword } };
    }),

  // ── Register ──────────────────────────────────────────────────────────────
  register: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string(),
      name: z.string().min(2),
      firmName: z.string().optional(),
      role: z.enum(["preparer", "senior", "manager", "partner", "admin"]).default("preparer"),
    }))
    .mutation(async ({ ctx, input }) => {
      checkPasswordStrength(input.password);
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
        passwordChangedAt: new Date(),
      }).returning();
      const token = issueToken(user.id);
      return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, firmName: user.firmName, mustChangePassword: false } };
    }),

  // ── Change password ───────────────────────────────────────────────────────
  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string(), newPassword: z.string() }))
    .mutation(async ({ ctx, input }) => {
      checkPasswordStrength(input.newPassword);
      const [user] = await ctx.db.select().from(users).where(eq(users.id, ctx.user.id));
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      if (input.currentPassword === input.newPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "New password must be different from current password" });
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await ctx.db.update(users).set({ passwordHash, passwordChangedAt: new Date(), mustChangePassword: false }).where(eq(users.id, user.id));
      return { ok: true };
    }),

  // ── MFA setup: generate secret + QR code ─────────────────────────────────
  mfaSetup: protectedProcedure
    .mutation(async ({ ctx }) => {
      const secret = authenticator.generateSecret(20);
      const [user] = await ctx.db.select().from(users).where(eq(users.id, ctx.user.id));
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      // Save secret (not yet enabled — user must verify first)
      await ctx.db.update(users).set({ mfaSecret: secret }).where(eq(users.id, user.id));
      const otpauthUrl = authenticator.keyuri(user.email, "Auditly", secret);
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
      return { secret, qrDataUrl };
    }),

  // ── MFA enable: verify first code to confirm setup ───────────────────────
  mfaEnable: protectedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(users).where(eq(users.id, ctx.user.id));
      if (!user?.mfaSecret) throw new TRPCError({ code: "BAD_REQUEST", message: "Run mfaSetup first" });
      const valid = authenticator.check(input.code, user.mfaSecret);
      if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid code — please try again" });

      // Generate 8 backup codes
      const rawCodes = Array.from({ length: 8 }, () => randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase());
      const hashedCodes = await Promise.all(rawCodes.map(c => bcrypt.hash(c, 10)));
      await ctx.db.update(users).set({ mfaEnabled: true, mfaBackupCodes: JSON.stringify(hashedCodes) }).where(eq(users.id, user.id));

      return { ok: true, backupCodes: rawCodes }; // shown once — user must save them
    }),

  // ── MFA disable ───────────────────────────────────────────────────────────
  mfaDisable: protectedProcedure
    .input(z.object({ password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(users).where(eq(users.id, ctx.user.id));
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });
      await ctx.db.update(users).set({ mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null }).where(eq(users.id, user.id));
      return { ok: true };
    }),

  // ── Me ────────────────────────────────────────────────────────────────────
  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    role: ctx.user.role,
    firmName: ctx.user.firmName,
    mfaEnabled: ctx.user.mfaEnabled,
    mustChangePassword: ctx.user.mustChangePassword,
    ssoProvider: ctx.user.ssoProvider,
  })),

  // ── SSO providers available ───────────────────────────────────────────────
  ssoProviders: publicProcedure.query(() => ({
    google:    !!process.env.GOOGLE_CLIENT_ID,
    microsoft: !!process.env.AZURE_CLIENT_ID,
    saml:      !!process.env.SAML_ENTRY_POINT,
  })),
});
