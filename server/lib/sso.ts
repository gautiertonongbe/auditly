import { insertReturning } from "../_core/db";
/**
 * SSO / SAML authentication helpers.
 *
 * Supports:
 *   - Google OAuth2     (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
 *   - Microsoft Azure   (AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID)
 *   - SAML 2.0          (SAML_ENTRY_POINT / SAML_CERT / SAML_ISSUER)
 *
 * All providers resolve to the same JWT issued by /api/auth/login.
 * If a user doesn't exist yet they are auto-provisioned with role=preparer.
 */

import { Router, Request, Response } from "express";
import { db } from "../_core/db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sign } from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const APP_URL    = process.env.APP_URL ?? "http://localhost:3000";
const API_URL    = process.env.API_URL ?? "http://localhost:3001";

/** Find an existing user by email or create one (SSO auto-provisioning). */
async function findOrCreateSSOUser(email: string, name: string, firmName?: string) {
  const [existing] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (existing) return existing;

  const id = randomUUID();
  // Random password hash — SSO users authenticate via IdP, never via password
  const passwordHash = await bcrypt.hash(randomUUID(), 10);
  const [created] = await insertReturning(db, users, {
    id, email: email.toLowerCase(), name, passwordHash,
    role: "preparer",
    firmName: firmName ?? null,
    createdAt: new Date(),
  });
  return created;
}

/** Issue a Auditly JWT (same shape as /api/auth/login). */
function issueJwt(userId: string) {
  return sign({ userId }, JWT_SECRET, { expiresIn: "8h" });
}

/** Redirect back to the client app with a JWT in the URL hash (client reads it once). */
function ssoSuccess(res: Response, userId: string) {
  const token = issueJwt(userId);
  res.redirect(`${APP_URL}/sso-callback#token=${token}`);
}

function ssoError(res: Response, message: string) {
  res.redirect(`${APP_URL}/login?sso_error=${encodeURIComponent(message)}`);
}

export function buildSSORouter(): Router {
  const router = Router();

  // ── Google OAuth2 ─────────────────────────────────────────────────────────
  const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    // Lazy-load passport + passport-google-oauth20 to avoid startup crash when creds not set
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const passport = require("passport") as typeof import("passport");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Strategy: GoogleStrategy } = require("passport-google-oauth20") as typeof import("passport-google-oauth20");

    passport.use("google", new GoogleStrategy({
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: `${API_URL}/api/auth/sso/google/callback`,
    }, async (_at, _rt, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("No email in Google profile"));
        const user = await findOrCreateSSOUser(email, profile.displayName ?? email);
        done(null, user);
      } catch (e) { done(e as Error); }
    }));

    passport.serializeUser((user: Express.User, done) => done(null, (user as { id: string }).id));
    passport.deserializeUser(async (id: string, done) => {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      done(null, user ?? null);
    });

    router.use(passport.initialize());

    router.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));
    router.get("/google/callback",
      passport.authenticate("google", { session: false, failureMessage: true }),
      (req: Request, res: Response) => {
        const u = req.user as { id: string } | undefined;
        if (!u) return ssoError(res, "Google authentication failed");
        ssoSuccess(res, u.id);
      }
    );
  }

  // ── Microsoft Azure AD (OAuth2/OIDC) ──────────────────────────────────────
  const AZURE_CLIENT_ID     = process.env.AZURE_CLIENT_ID;
  const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
  const AZURE_TENANT_ID     = process.env.AZURE_TENANT_ID ?? "common";

  if (AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { OIDCStrategy } = require("passport-azure-ad") as { OIDCStrategy: new (options: Record<string, unknown>, verify: (...args: any[]) => void) => import("passport").Strategy };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const passport = require("passport") as typeof import("passport");

    passport.use("azure-ad", new OIDCStrategy({
      identityMetadata: `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`,
      clientID: AZURE_CLIENT_ID,
      clientSecret: AZURE_CLIENT_SECRET,
      redirectUrl: `${API_URL}/api/auth/sso/microsoft/callback`,
      responseType: "code",
      responseMode: "form_post",
      allowHttpForRedirectUrl: process.env.NODE_ENV !== "production",
      scope: ["profile", "email", "offline_access"],
      passReqToCallback: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, async (_iss: string, _sub: string, profile: any, done: (err: Error | null, user?: object) => void) => {
      try {
        const email = profile?._json?.email ?? profile?.upn;
        const name  = profile?._json?.name ?? profile?.displayName ?? email ?? "Microsoft User";
        if (!email) return done(new Error("No email in Microsoft profile"));
        const user = await findOrCreateSSOUser(email, name);
        done(null, user);
      } catch (e) { done(e as Error); }
    }) as import("passport").Strategy);

    router.use(passport.initialize());

    router.get("/microsoft", passport.authenticate("azure-ad", { session: false }));
    router.post("/microsoft/callback",
      passport.authenticate("azure-ad", { session: false, failureMessage: true }),
      (req: Request, res: Response) => {
        const u = req.user as { id: string } | undefined;
        if (!u) return ssoError(res, "Microsoft authentication failed");
        ssoSuccess(res, u.id);
      }
    );
  }

  // ── SAML 2.0 ─────────────────────────────────────────────────────────────
  const SAML_ENTRY_POINT = process.env.SAML_ENTRY_POINT;
  const SAML_CERT        = process.env.SAML_CERT;        // PEM, newlines as \n
  const SAML_ISSUER      = process.env.SAML_ISSUER ?? "auditly";

  if (SAML_ENTRY_POINT && SAML_CERT) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Strategy: SamlStrategy } = require("passport-saml") as typeof import("passport-saml");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const passport = require("passport") as typeof import("passport");

    // Cast SamlStrategy to bypass strict overload checking — passport-saml types are imprecise
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AnySamlStrategy = SamlStrategy as unknown as new (opts: Record<string, unknown>, verify: (...args: any[]) => void) => import("passport").Strategy;
    passport.use("saml", new AnySamlStrategy({
      entryPoint: SAML_ENTRY_POINT,
      issuer: SAML_ISSUER,
      cert: SAML_CERT.replace(/\\n/g, "\n"),
      callbackUrl: `${API_URL}/api/auth/sso/saml/callback`,
      wantAssertionsSigned: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, async (profile: any, done: (err: Error | null, user?: Record<string, unknown>) => void) => {
      try {
        const email = profile?.email ?? profile?.nameID;
        const name  = profile?.displayName ?? email ?? "SAML User";
        if (!email) return done(new Error("No email in SAML assertion"));
        const user = await findOrCreateSSOUser(email, name);
        done(null, user as Record<string, unknown>);
      } catch (e) { done(e as Error); }
    }));

    router.get("/saml",
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("passport") as typeof import("passport")).authenticate("saml", { session: false })
    );
    router.post("/saml/callback",
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("passport") as typeof import("passport")).authenticate("saml", { session: false, failureMessage: true }),
      (req: Request, res: Response) => {
        const u = req.user as { id: string } | undefined;
        if (!u) return ssoError(res, "SAML authentication failed");
        ssoSuccess(res, u.id);
      }
    );

    // SAML metadata endpoint (for IdP configuration)
    router.get("/saml/metadata", (_req: Request, res: Response) => {
      res.type("application/xml").send(`<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${SAML_ISSUER}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="false"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${API_URL}/api/auth/sso/saml/callback"
      index="1"/>
  </SPSSODescriptor>
</EntityDescriptor>`);
    });
  }

  // ── Availability check ─────────────────────────────────────────────────────
  router.get("/providers", (_req: Request, res: Response) => {
    res.json({
      google:    !!GOOGLE_CLIENT_ID,
      microsoft: !!AZURE_CLIENT_ID,
      saml:      !!SAML_ENTRY_POINT,
    });
  });

  return router;
}
