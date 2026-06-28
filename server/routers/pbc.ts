import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { pbcItems, auditTrail } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { uploadToS3 } from "../lib/s3";

export const pbcRouter = router({
  listByEngagement: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(pbcItems).where(eq(pbcItems.engagementId, input.engagementId))
    ),

  listByControl: protectedProcedure
    .input(z.object({ controlId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(pbcItems).where(eq(pbcItems.controlId, input.controlId))
    ),

  create: auditedProcedure
    .input(z.object({
      engagementId: z.string(),
      controlId: z.string().optional(),
      description: z.string(),
      dueDate: z.date().optional(),
      isIpe: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const [item] = await ctx.db.insert(pbcItems).values({
        id: randomUUID(),
        ...input,
        requestedDate: new Date(),
        status: "Requested",
        createdAt: new Date(),
      }).returning();
      return item;
    }),

  updateStatus: auditedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["Requested", "Received", "Accepted", "Rejected", "NotRequired"]),
      rejectionReason: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updates: Record<string, unknown> = { status: input.status };
      if (input.status === "Received") updates.receivedDate = new Date();
      if (input.rejectionReason) updates.rejectionReason = input.rejectionReason;
      if (input.notes) updates.notes = input.notes;

      await ctx.db.update(pbcItems).set(updates).where(eq(pbcItems.id, input.id));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "pbc",
        entityId: input.id,
        action: `status_changed_to_${input.status.toLowerCase()}`,
        description: `PBC status updated to ${input.status}`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { success: true };
    }),

  // Save annotated screenshot + annotation boxes
  saveAnnotations: auditedProcedure
    .input(z.object({
      pbcItemId: z.string(),
      annotations: z.array(z.object({
        id: z.string(),
        x: z.number(), y: z.number(), w: z.number(), h: z.number(),
        label: z.string(),
        reason: z.string(),
        color: z.string(),
        testAttribute: z.string().optional(),
      })),
      annotatedImageBase64: z.string(),
      testAttributes: z.array(z.object({
        key: z.string(),
        label: z.string(),
        color: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch the item to get engagementId for S3 key
      const [item] = await ctx.db.select({ engagementId: pbcItems.engagementId }).from(pbcItems).where(eq(pbcItems.id, input.pbcItemId)).limit(1);
      if (!item) throw new Error("PBC item not found");

      const buffer = Buffer.from(input.annotatedImageBase64, "base64");
      const s3Key = `pbc/${item.engagementId}/${input.pbcItemId}/annotated.png`;
      const { url } = await uploadToS3({ key: s3Key, buffer, contentType: "image/png" });

      await ctx.db.update(pbcItems).set({
        annotations: input.annotations,
        annotatedImageUrl: url,
        annotatedImageBase64: input.annotatedImageBase64,
        testAttributes: input.testAttributes,
      }).where(eq(pbcItems.id, input.pbcItemId));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "pbc",
        entityId: input.pbcItemId,
        action: "annotations_saved",
        description: `Annotated screenshot saved with ${input.annotations.length} bounding box${input.annotations.length !== 1 ? "es" : ""}`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { url };
    }),

  // Mark file uploaded (called after S3 upload completes)
  confirmUpload: auditedProcedure
    .input(z.object({
      id: z.string(),
      fileUrl: z.string(),
      fileName: z.string(),
      fileHash: z.string(),
      fileSizeBytes: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(pbcItems).set({
        fileUrl: input.fileUrl,
        fileName: input.fileName,
        fileHash: input.fileHash,
        fileSizeBytes: input.fileSizeBytes,
        status: "Received",
        receivedDate: new Date(),
        uploadedBy: ctx.user.id,
        uploadedAt: new Date(),
      }).where(eq(pbcItems.id, input.id));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "pbc",
        entityId: input.id,
        action: "file_uploaded",
        description: `File uploaded: ${input.fileName} (${Math.round(input.fileSizeBytes / 1024)}KB), hash: ${input.fileHash}`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { success: true };
    }),
});
