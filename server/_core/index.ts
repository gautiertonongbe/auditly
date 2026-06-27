import express from "express";
import cors from "cors";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers/index";
import { createContext } from "./context";
import { db } from "./db";
import { sql, eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { portalTokens, pbcItems, controls, portalSuggestions } from "../../drizzle/schema";
import { buildSSORouter } from "../lib/sso";
import { uploadToS3 } from "../lib/s3";
import { parseFileBuffer, getMimeType, classifyPbcFileAI } from "../lib/fileParser";
import { cloudConnections } from "../../drizzle/schema";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));

// ── SOC 2 Rate Limiting ──────────────────────────────────────────────────────
// Auth routes: 10 attempts per 15 minutes per IP (prevents brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  skip: () => process.env.NODE_ENV === "test",
});

// File upload: 30 uploads per 10 minutes per IP
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many file uploads. Please slow down." },
  skip: () => process.env.NODE_ENV === "test",
});

// General API: 300 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// ── Boot-time migrations (MySQL/TiDB-compatible) ─────────────────────────────
void (async () => {
  const tryExec = async (statement: string) => {
    try { await db.execute(sql.raw(statement)); } catch { /* column/table already exists */ }
  };

  await tryExec(`
    CREATE TABLE IF NOT EXISTS portal_tokens (
      id VARCHAR(36) PRIMARY KEY,
      token VARCHAR(255) NOT NULL UNIQUE,
      engagement_id VARCHAR(36) NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT,
      created_by VARCHAR(36) NOT NULL,
      expires_at DATETIME NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`ALTER TABLE pbc_items ADD COLUMN file_content TEXT`);
  await tryExec(`ALTER TABLE pbc_items ADD COLUMN ai_classification TEXT`);
  await tryExec(`ALTER TABLE workpapers ADD COLUMN procedure_template TEXT`);
  await tryExec(`ALTER TABLE workpapers ADD COLUMN results_template TEXT`);
  await tryExec(`ALTER TABLE workpapers ADD COLUMN conclusion_template TEXT`);
  await tryExec(`ALTER TABLE workpapers ADD COLUMN template_id VARCHAR(36)`);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS workpaper_templates (
      id VARCHAR(36) PRIMARY KEY,
      engagement_id VARCHAR(36),
      name TEXT NOT NULL,
      control_type TEXT,
      risk_level TEXT,
      framework TEXT DEFAULT 'PCAOB',
      procedure_template TEXT,
      results_template TEXT,
      conclusion_template TEXT,
      use_count INT NOT NULL DEFAULT 0,
      tags TEXT,
      created_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS api_connections (
      id VARCHAR(36) PRIMARY KEY,
      engagement_id VARCHAR(36) NOT NULL,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT,
      credentials TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_tested_at DATETIME,
      last_test_result TEXT,
      created_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS control_api_mappings (
      id VARCHAR(36) PRIMARY KEY,
      control_id VARCHAR(36) NOT NULL,
      api_connection_id VARCHAR(36) NOT NULL,
      query_config TEXT,
      last_pulled_at DATETIME,
      last_pull_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS cloud_connections (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      provider TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at DATETIME,
      email TEXT,
      display_name TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS control_folder_links (
      id VARCHAR(36) PRIMARY KEY,
      control_id VARCHAR(36) NOT NULL,
      cloud_connection_id VARCHAR(36) NOT NULL,
      folder_id TEXT NOT NULL,
      folder_name TEXT,
      folder_path TEXT,
      last_synced_at DATETIME,
      last_sync_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS portal_suggestions (
      id VARCHAR(36) PRIMARY KEY,
      engagement_id VARCHAR(36) NOT NULL,
      portal_token_id VARCHAR(36) NOT NULL,
      client_name TEXT NOT NULL,
      process_name TEXT NOT NULL,
      system_name TEXT,
      description TEXT NOT NULL,
      contact_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      auditor_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME
    )
  `);
  await tryExec(`ALTER TABLE users ADD COLUMN sso_provider TEXT`);
  await tryExec(`ALTER TABLE users ADD COLUMN sso_id TEXT`);
  await tryExec(`ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
  await tryExec(`ALTER TABLE users ADD COLUMN mfa_secret TEXT`);
  await tryExec(`ALTER TABLE users ADD COLUMN mfa_backup_codes TEXT`);
  await tryExec(`ALTER TABLE users ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0`);
  await tryExec(`ALTER TABLE users ADD COLUMN locked_until DATETIME`);
  await tryExec(`ALTER TABLE users ADD COLUMN password_changed_at DATETIME`);
  await tryExec(`ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE`);
  await tryExec(`ALTER TABLE users ADD COLUMN last_activity_at DATETIME`);
  console.log("[Migration] Boot-time migrations complete");
})();

// ── Health check ────────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

// ── Public portal API (no auth — token-gated) ───────────────────────────────

// GET /api/portal/:token — validate token, return engagement + PBC items + controls (simplified)
app.get("/api/portal/:token", async (req, res) => {
  try {
    const [pt] = await db.select().from(portalTokens).where(
      and(eq(portalTokens.token, req.params.token), eq(portalTokens.isActive, true))
    );
    if (!pt) return res.status(404).json({ error: "Portal link not found or revoked" });
    if (new Date(pt.expiresAt) < new Date()) return res.status(410).json({ error: "Portal link has expired" });

    const items = await db.select().from(pbcItems).where(eq(pbcItems.engagementId, pt.engagementId));

    // Return simplified control view — no workpaper content exposed to client
    const ctls = await db.select({
      id: controls.id,
      controlRef: controls.controlRef,
      objective: controls.objective,
      domain: controls.domain,
      itgcType: controls.itgcType,
      itacType: controls.itacType,
      riskLevel: controls.riskLevel,
      status: controls.status,
    }).from(controls).where(eq(controls.engagementId, pt.engagementId));

    res.json({
      portalToken: pt,
      pbcItems: items,
      controls: ctls,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/portal/:token/suggest — client submits a control suggestion
app.post("/api/portal/:token/suggest", async (req, res) => {
  try {
    const [pt] = await db.select().from(portalTokens).where(
      and(eq(portalTokens.token, req.params.token), eq(portalTokens.isActive, true))
    );
    if (!pt) return res.status(404).json({ error: "Portal link not found" });
    if (new Date(pt.expiresAt) < new Date()) return res.status(410).json({ error: "Portal link expired" });

    const { processName, systemName, description, contactName } = req.body as {
      processName: string; systemName?: string; description: string; contactName?: string;
    };
    if (!processName || !description) return res.status(400).json({ error: "processName and description are required" });

    await db.insert(portalSuggestions).values({
      id: randomUUID(),
      engagementId: pt.engagementId,
      portalTokenId: pt.id,
      clientName: pt.clientName,
      processName,
      systemName: systemName ?? null,
      description,
      contactName: contactName ?? null,
      status: "pending",
      createdAt: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("[Portal suggest]", err);
    res.status(500).json({ error: "Failed to submit suggestion" });
  }
});

// POST /api/portal/:token/upload/:pbcItemId — client file upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post("/api/portal/:token/upload/:pbcItemId", upload.single("file"), async (req, res) => {
  try {
    const [pt] = await db.select().from(portalTokens).where(
      and(eq(portalTokens.token, req.params.token), eq(portalTokens.isActive, true))
    );
    if (!pt) return res.status(404).json({ error: "Portal link not found" });
    if (new Date(pt.expiresAt) < new Date()) return res.status(410).json({ error: "Portal link expired" });

    const [item] = await db.select().from(pbcItems).where(
      and(eq(pbcItems.id, req.params.pbcItemId), eq(pbcItems.engagementId, pt.engagementId))
    );
    if (!item) return res.status(404).json({ error: "PBC item not found" });

    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const mimeType = getMimeType(file.originalname);
    const s3Key = `pbc/${pt.engagementId}/${req.params.pbcItemId}/${randomUUID()}-${file.originalname}`;

    const { url, hash } = await uploadToS3({ key: s3Key, buffer: file.buffer, contentType: mimeType });

    // Parse file content for AI classification
    const parsed = await parseFileBuffer(file.buffer, file.originalname);
    let aiClassification: string | null = null;
    try {
      const cls = await classifyPbcFileAI({
        fileName: file.originalname,
        buffer: file.buffer,
        mimeType: parsed.mimeType,
        isImage: parsed.isImage,
        isPdf: parsed.isPdf,
        textContent: parsed.text,
      });
      aiClassification = JSON.stringify(cls);
    } catch {
      // Classification failure is non-fatal
    }

    await db.update(pbcItems).set({
      fileUrl: url,
      fileName: file.originalname,
      fileHash: hash,
      fileSizeBytes: file.size,
      status: "Received",
      receivedDate: new Date(),
      uploadedAt: new Date(),
      fileContent: parsed.text.slice(0, 8000),
      aiClassification,
    }).where(eq(pbcItems.id, req.params.pbcItemId));

    res.json({ success: true, fileName: file.originalname, fileUrl: url, aiClassification });
  } catch (err) {
    console.error("[Portal upload]", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ── SSO routes ───────────────────────────────────────────────────────────────
app.use("/api/auth/sso", buildSSORouter());

// ── Google Drive OAuth ────────────────────────────────────────────────────────
// Step 1: Redirect user to Google consent screen
app.get("/api/cloud/google-drive/connect", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "Google OAuth not configured" });
  const redirectUri = `${process.env.APP_URL ?? "http://localhost:3001"}/api/cloud/google-drive/callback`;
  const scope = encodeURIComponent("https://www.googleapis.com/auth/drive.readonly email profile");
  const state = encodeURIComponent((req.query.userId as string) ?? "");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
  res.redirect(url);
});

// Step 2: Exchange code for tokens, store connection
app.get("/api/cloud/google-drive/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code: string; state: string };
    const userId = decodeURIComponent(state ?? "");
    if (!userId || !code) return res.status(400).send("Missing code or user context");

    const redirectUri = `${process.env.APP_URL ?? "http://localhost:3001"}/api/cloud/google-drive/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    const tokens = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number };

    // Get user info
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json() as { email: string; name: string };

    // Upsert connection (one per user per provider)
    const existing = await db.select().from(cloudConnections).where(
      and(eq(cloudConnections.userId, userId), eq(cloudConnections.provider, "google_drive"))
    );

    if (existing.length > 0) {
      await db.update(cloudConnections).set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing[0].refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        email: profile.email,
        displayName: profile.name,
        isActive: true,
      }).where(eq(cloudConnections.id, existing[0].id));
    } else {
      await db.insert(cloudConnections).values({
        id: randomUUID(),
        userId,
        provider: "google_drive",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        email: profile.email,
        displayName: profile.name,
        isActive: true,
        createdAt: new Date(),
      });
    }

    // Redirect back to the app settings page
    res.redirect(`${process.env.CLIENT_URL ?? "http://localhost:5173"}/settings?cloud=connected&provider=google_drive`);
  } catch (err) {
    console.error("[Google Drive OAuth]", err);
    res.redirect(`${process.env.CLIENT_URL ?? "http://localhost:5173"}/settings?cloud=error`);
  }
});

// ── OneDrive OAuth ────────────────────────────────────────────────────────────
app.get("/api/cloud/onedrive/connect", (req, res) => {
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "OneDrive OAuth not configured" });
  const redirectUri = `${process.env.APP_URL ?? "http://localhost:3001"}/api/cloud/onedrive/callback`;
  const scope = encodeURIComponent("Files.Read.All User.Read offline_access");
  const state = encodeURIComponent((req.query.userId as string) ?? "");
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`;
  res.redirect(url);
});

app.get("/api/cloud/onedrive/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code: string; state: string };
    const userId = decodeURIComponent(state ?? "");
    if (!userId || !code) return res.status(400).send("Missing code or user context");

    const redirectUri = `${process.env.APP_URL ?? "http://localhost:3001"}/api/cloud/onedrive/callback`;
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.ONEDRIVE_CLIENT_ID ?? "",
        client_secret: process.env.ONEDRIVE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) throw new Error(`OneDrive token exchange failed: ${tokenResponse.status}`);
    const tokens = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number };

    // Get user profile via Graph
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json() as { displayName: string; mail?: string; userPrincipalName?: string };
    const email = profile.mail ?? profile.userPrincipalName ?? "";

    const existing = await db.select().from(cloudConnections).where(
      and(eq(cloudConnections.userId, userId), eq(cloudConnections.provider, "onedrive"))
    );

    if (existing.length > 0) {
      await db.update(cloudConnections).set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing[0].refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        email,
        displayName: profile.displayName,
        isActive: true,
      }).where(eq(cloudConnections.id, existing[0].id));
    } else {
      await db.insert(cloudConnections).values({
        id: randomUUID(),
        userId,
        provider: "onedrive",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        email,
        displayName: profile.displayName,
        isActive: true,
        createdAt: new Date(),
      });
    }

    res.redirect(`${process.env.CLIENT_URL ?? "http://localhost:5173"}/settings?cloud=connected&provider=onedrive`);
  } catch (err) {
    console.error("[OneDrive OAuth]", err);
    res.redirect(`${process.env.CLIENT_URL ?? "http://localhost:5173"}/settings?cloud=error`);
  }
});

// ── tRPC (with rate limiters on sensitive paths) ─────────────────────────────
// Auth procedures get the strict limiter
app.use("/api/trpc/auth.login", authLimiter);
app.use("/api/trpc/auth.register", authLimiter);
app.use("/api/trpc/auth.verifyMfa", authLimiter);
// File operations get the upload limiter
app.use("/api/upload", uploadLimiter);
// All other API traffic gets the general limiter
app.use("/api/trpc", apiLimiter, createExpressMiddleware({ router: appRouter, createContext }));

// ── Serve built SPA in production ────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const { join } = await import("path");
  const { existsSync } = await import("fs");
  const distPath = join(process.cwd(), "dist/public");
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(join(distPath, "index.html")));
  }
}

app.listen(PORT, () => {
  console.log(`[Auditly] Server running on port ${PORT}`);
});

export type AppRouter = typeof appRouter;
