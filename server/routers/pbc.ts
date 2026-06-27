import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { pbcItems, auditTrail } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

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
