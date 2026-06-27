/**
 * Cloud storage router — Google Drive and OneDrive integration.
 * Lists folders, syncs evidence files into PBC items, manages connections.
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { cloudConnections, controlFolderLinks, pbcItems, auditTrail } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { parseFileBuffer, getMimeType, classifyPbcFileAI } from "../lib/fileParser";
import { uploadToS3 } from "../lib/s3";

// ── Google Drive helpers ────────────────────────────────────────────────────

async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!response.ok) throw new Error(`Google token refresh failed: ${response.status}`);
  const data = await response.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  return { accessToken: data.access_token, expiresAt };
}

async function getGoogleAccessToken(
  conn: { accessToken: string | null; refreshToken: string | null; tokenExpiresAt: Date | null }
): Promise<string> {
  if (conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) > new Date(Date.now() + 60000)) {
    return conn.accessToken!;
  }
  if (!conn.refreshToken) throw new Error("No refresh token available. Please reconnect Google Drive.");
  const { accessToken } = await refreshGoogleToken(conn.refreshToken);
  return accessToken;
}

async function listGoogleDriveFolders(accessToken: string, parentId?: string): Promise<{ id: string; name: string; path: string }[]> {
  const q = parentId
    ? `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`;

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name,parents)");
  url.searchParams.set("pageSize", "100");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error(`Google Drive API error: ${response.status}`);
  const data = await response.json() as { files: { id: string; name: string }[] };
  return data.files.map(f => ({ id: f.id, name: f.name, path: f.name }));
}

async function listGoogleDriveFiles(accessToken: string, folderId: string): Promise<{
  id: string; name: string; mimeType: string; size: string; webViewLink: string
}[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`);
  url.searchParams.set("fields", "files(id,name,mimeType,size,webViewLink)");
  url.searchParams.set("pageSize", "50");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error(`Google Drive API error: ${response.status}`);
  const data = await response.json() as { files: { id: string; name: string; mimeType: string; size: string; webViewLink: string }[] };
  return data.files;
}

async function downloadGoogleDriveFile(accessToken: string, fileId: string): Promise<Buffer> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Failed to download file from Google Drive: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── OneDrive helpers ────────────────────────────────────────────────────────

async function refreshOneDriveToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.ONEDRIVE_CLIENT_ID ?? "",
      client_secret: process.env.ONEDRIVE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "Files.Read.All offline_access",
    }).toString(),
  });

  if (!response.ok) throw new Error(`OneDrive token refresh failed: ${response.status}`);
  const data = await response.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  return { accessToken: data.access_token, expiresAt };
}

async function getOneDriveAccessToken(
  conn: { accessToken: string | null; refreshToken: string | null; tokenExpiresAt: Date | null }
): Promise<string> {
  if (conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) > new Date(Date.now() + 60000)) {
    return conn.accessToken!;
  }
  if (!conn.refreshToken) throw new Error("No refresh token. Please reconnect OneDrive.");
  const { accessToken } = await refreshOneDriveToken(conn.refreshToken);
  return accessToken;
}

async function listOneDriveFolders(accessToken: string, parentId?: string): Promise<{ id: string; name: string; path: string }[]> {
  const endpoint = parentId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children?$filter=folder ne null&$select=id,name,folder`
    : "https://graph.microsoft.com/v1.0/me/drive/root/children?$filter=folder ne null&$select=id,name,folder";

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (!response.ok) throw new Error(`OneDrive API error: ${response.status}`);
  const data = await response.json() as { value: { id: string; name: string }[] };
  return data.value.map(f => ({ id: f.id, name: f.name, path: f.name }));
}

async function listOneDriveFiles(accessToken: string, folderId: string): Promise<{
  id: string; name: string; mimeType: string; size: number; webViewLink: string
}[]> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?$filter=file ne null&$select=id,name,file,size,webUrl`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
  );

  if (!response.ok) throw new Error(`OneDrive API error: ${response.status}`);
  const data = await response.json() as { value: { id: string; name: string; file: { mimeType: string }; size: number; webUrl: string }[] };
  return data.value.map(f => ({ id: f.id, name: f.name, mimeType: f.file?.mimeType ?? "application/octet-stream", size: f.size, webViewLink: f.webUrl }));
}

async function downloadOneDriveFile(accessToken: string, fileId: string): Promise<Buffer> {
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Failed to download from OneDrive: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// ── Router ──────────────────────────────────────────────────────────────────

export const cloudRouter = router({
  // List active cloud connections for the current user
  listConnections: protectedProcedure.query(async ({ ctx }) => {
    const conns = await ctx.db
      .select({
        id: cloudConnections.id,
        provider: cloudConnections.provider,
        email: cloudConnections.email,
        displayName: cloudConnections.displayName,
        isActive: cloudConnections.isActive,
        createdAt: cloudConnections.createdAt,
      })
      .from(cloudConnections)
      .where(and(eq(cloudConnections.userId, ctx.user.id), eq(cloudConnections.isActive, true)));
    return conns;
  }),

  // Disconnect a cloud provider
  disconnect: auditedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(cloudConnections).set({ isActive: false }).where(
        and(eq(cloudConnections.id, input.id), eq(cloudConnections.userId, ctx.user.id))
      );
      return { ok: true };
    }),

  // List folders from connected cloud storage
  listFolders: protectedProcedure
    .input(z.object({ connectionId: z.string(), parentId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const [conn] = await ctx.db.select().from(cloudConnections).where(
        and(eq(cloudConnections.id, input.connectionId), eq(cloudConnections.userId, ctx.user.id))
      );
      if (!conn) throw new TRPCError({ code: "NOT_FOUND" });

      if (conn.provider === "google_drive") {
        const token = await getGoogleAccessToken(conn);
        return listGoogleDriveFolders(token, input.parentId);
      } else if (conn.provider === "onedrive") {
        const token = await getOneDriveAccessToken(conn);
        return listOneDriveFolders(token, input.parentId);
      }

      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown provider" });
    }),

  // Link a folder to a control
  linkFolder: auditedProcedure
    .input(z.object({
      controlId: z.string(),
      cloudConnectionId: z.string(),
      folderId: z.string(),
      folderName: z.string(),
      folderPath: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = randomUUID();
      await ctx.db.insert(controlFolderLinks).values({
        id,
        controlId: input.controlId,
        cloudConnectionId: input.cloudConnectionId,
        folderId: input.folderId,
        folderName: input.folderName,
        folderPath: input.folderPath ?? input.folderName,
        createdAt: new Date(),
      });
      return { id };
    }),

  // Get folder links for a control
  getFolderLinks: protectedProcedure
    .input(z.object({ controlId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(controlFolderLinks).where(eq(controlFolderLinks.controlId, input.controlId));
    }),

  // Remove a folder link
  unlinkFolder: auditedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(controlFolderLinks).where(eq(controlFolderLinks.id, input.id));
      return { ok: true };
    }),

  // Sync a linked folder — downloads files and creates PBC items
  syncFolder: auditedProcedure
    .input(z.object({
      folderLinkId: z.string(),
      controlId: z.string(),
      engagementId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [link] = await ctx.db.select().from(controlFolderLinks).where(eq(controlFolderLinks.id, input.folderLinkId));
      if (!link) throw new TRPCError({ code: "NOT_FOUND" });

      const [conn] = await ctx.db.select().from(cloudConnections).where(eq(cloudConnections.id, link.cloudConnectionId));
      if (!conn) throw new TRPCError({ code: "NOT_FOUND", message: "Cloud connection not found or revoked" });

      let files: { id: string; name: string; mimeType: string; size: number | string; webViewLink: string }[] = [];
      let getToken: () => Promise<string>;

      if (conn.provider === "google_drive") {
        getToken = () => getGoogleAccessToken(conn);
        const token = await getToken();
        files = await listGoogleDriveFiles(token, link.folderId);
      } else if (conn.provider === "onedrive") {
        getToken = () => getOneDriveAccessToken(conn);
        const token = await getToken();
        files = await listOneDriveFiles(token, link.folderId);
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown cloud provider" });
      }

      const created: string[] = [];
      const errors: string[] = [];

      for (const file of files) {
        try {
          const token = await getToken!();
          let buffer: Buffer;

          if (conn.provider === "google_drive") {
            buffer = await downloadGoogleDriveFile(token, file.id);
          } else {
            buffer = await downloadOneDriveFile(token, file.id);
          }

          const mimeType = getMimeType(file.name);
          const s3Key = `pbc/${input.engagementId}/${input.controlId}/cloud/${randomUUID()}-${file.name}`;
          const { url, hash } = await uploadToS3({ key: s3Key, buffer, contentType: mimeType });

          const parsed = await parseFileBuffer(buffer, file.name);
          let aiClassification: string | null = null;
          try {
            const cls = await classifyPbcFileAI({
              fileName: file.name,
              buffer,
              mimeType: parsed.mimeType,
              isImage: parsed.isImage,
              isPdf: parsed.isPdf,
              textContent: parsed.text,
            });
            aiClassification = JSON.stringify(cls);
          } catch {
            // non-fatal
          }

          const pbcId = randomUUID();
          await ctx.db.insert(pbcItems).values({
            id: pbcId,
            engagementId: input.engagementId,
            controlId: input.controlId,
            description: `[${conn.provider === "google_drive" ? "Google Drive" : "OneDrive"}] ${file.name}`,
            status: "Received",
            receivedDate: new Date(),
            fileUrl: url,
            fileName: file.name,
            fileHash: hash,
            fileSizeBytes: typeof file.size === "string" ? parseInt(file.size) : (file.size ?? 0),
            fileContent: parsed.text.slice(0, 8000),
            aiClassification,
            notes: `Synced from ${conn.displayName ?? conn.provider}: ${link.folderPath ?? link.folderName}`,
            createdAt: new Date(),
          });
          created.push(pbcId);
        } catch (err) {
          errors.push(`${file.name}: ${String(err)}`);
        }
      }

      // Update sync status
      await ctx.db.update(controlFolderLinks).set({
        lastSyncedAt: new Date(),
        lastSyncStatus: errors.length === 0
          ? `ok — ${created.length} files`
          : `partial — ${created.length} ok, ${errors.length} errors`,
      }).where(eq(controlFolderLinks.id, input.folderLinkId));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        engagementId: input.engagementId,
        entityType: "cloud_connection",
        entityId: input.folderLinkId,
        action: "folder_synced",
        description: `${created.length} files synced from ${conn.provider} folder "${link.folderName}"`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { synced: created.length, errors };
    }),
});
