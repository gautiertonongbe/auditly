import express from "express";
import cors from "cors";
import multer from "multer";
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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));

// ── Boot-time migrations ────────────────────────────────────────────────────
void (async () => {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS portal_tokens (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        engagement_id TEXT NOT NULL,
        client_name TEXT NOT NULL,
        client_email TEXT,
        created_by TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Add new columns to pbc_items if they don't exist
    await db.execute(sql`ALTER TABLE pbc_items ADD COLUMN IF NOT EXISTS file_content TEXT`);
    await db.execute(sql`ALTER TABLE pbc_items ADD COLUMN IF NOT EXISTS ai_classification TEXT`);
    // Portal suggestions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS portal_suggestions (
        id TEXT PRIMARY KEY,
        engagement_id TEXT NOT NULL,
        portal_token_id TEXT NOT NULL,
        client_name TEXT NOT NULL,
        process_name TEXT NOT NULL,
        system_name TEXT,
        description TEXT NOT NULL,
        contact_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        auditor_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ
      )
    `);
    // SOC 2 + MFA + SSO columns on users
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_provider TEXT`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_id TEXT`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ`);
    console.log("[Migration] Portal tables and PBC columns ready");
  } catch (err) {
    console.error("[Migration] Non-fatal:", err);
  }
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

// ── tRPC ────────────────────────────────────────────────────────────────────
app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

app.listen(PORT, () => {
  console.log(`[Auditly] Server running on port ${PORT}`);
});

export type AppRouter = typeof appRouter;
