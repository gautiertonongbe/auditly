import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { workpaperTemplates, workpapers, auditTrail } from "../../drizzle/schema";
import { eq, and, or, isNull, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const templatesRouter = router({
  // List templates available to this engagement (firm-wide + engagement-specific)
  list: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(async ({ ctx, input }) => {
      const templates = await ctx.db
        .select()
        .from(workpaperTemplates)
        .where(
          or(
            eq(workpaperTemplates.engagementId, input.engagementId),
            isNull(workpaperTemplates.engagementId) // firm-wide templates have no engagementId
          )
        )
        .orderBy(desc(workpaperTemplates.useCount));
      return templates;
    }),

  // Get a single template
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [template] = await ctx.db
        .select()
        .from(workpaperTemplates)
        .where(eq(workpaperTemplates.id, input.id));
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      return template;
    }),

  // Create a new reusable template
  create: auditedProcedure
    .input(z.object({
      engagementId: z.string().nullable().optional(), // null = firm-wide
      name: z.string().min(1).max(120),
      controlType: z.string().nullable().optional(),
      riskLevel: z.string().nullable().optional(),
      framework: z.string().default("PCAOB"),
      procedureTemplate: z.string().nullable().optional(),
      resultsTemplate: z.string().nullable().optional(),
      conclusionTemplate: z.string().nullable().optional(),
      tags: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = randomUUID();
      await ctx.db.insert(workpaperTemplates).values({
        id,
        engagementId: input.engagementId ?? null,
        name: input.name,
        controlType: input.controlType ?? null,
        riskLevel: input.riskLevel ?? null,
        framework: input.framework,
        procedureTemplate: input.procedureTemplate ?? null,
        resultsTemplate: input.resultsTemplate ?? null,
        conclusionTemplate: input.conclusionTemplate ?? null,
        useCount: 0,
        tags: input.tags ?? null,
        createdBy: ctx.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "template",
        entityId: id,
        action: "template_created",
        description: `Workpaper template "${input.name}" created`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      const [created] = await ctx.db.select().from(workpaperTemplates).where(eq(workpaperTemplates.id, id));
      return created;
    }),

  // Update an existing template
  update: auditedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(120).optional(),
      controlType: z.string().nullable().optional(),
      riskLevel: z.string().nullable().optional(),
      procedureTemplate: z.string().nullable().optional(),
      resultsTemplate: z.string().nullable().optional(),
      conclusionTemplate: z.string().nullable().optional(),
      tags: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await ctx.db.update(workpaperTemplates).set({ ...rest, updatedAt: new Date() }).where(eq(workpaperTemplates.id, id));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "template",
        entityId: id,
        action: "template_updated",
        description: `Workpaper template updated`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { ok: true };
    }),

  // Delete a template
  delete: auditedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(workpaperTemplates).where(eq(workpaperTemplates.id, input.id));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "template",
        entityId: input.id,
        action: "template_deleted",
        description: `Workpaper template deleted`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { ok: true };
    }),

  // Apply a library template to a workpaper (copies template content + records usage)
  applyToWorkpaper: auditedProcedure
    .input(z.object({
      templateId: z.string(),
      workpaperId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [template] = await ctx.db.select().from(workpaperTemplates).where(eq(workpaperTemplates.id, input.templateId));
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      // Copy template content to workpaper
      await ctx.db.update(workpapers).set({
        procedureTemplate: template.procedureTemplate,
        resultsTemplate: template.resultsTemplate,
        conclusionTemplate: template.conclusionTemplate,
        templateId: input.templateId,
        updatedAt: new Date(),
      }).where(eq(workpapers.id, input.workpaperId));

      // Increment template use count
      await ctx.db.update(workpaperTemplates).set({
        useCount: (template.useCount ?? 0) + 1,
        updatedAt: new Date(),
      }).where(eq(workpaperTemplates.id, input.templateId));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "workpaper",
        entityId: input.workpaperId,
        action: "template_applied",
        description: `Template "${template.name}" applied to workpaper`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { ok: true, templateName: template.name };
    }),

  // Save current workpaper templates back to the library as a new template
  saveToLibrary: auditedProcedure
    .input(z.object({
      workpaperId: z.string(),
      engagementId: z.string(),
      name: z.string().min(1).max(120),
      controlType: z.string().nullable().optional(),
      riskLevel: z.string().nullable().optional(),
      firmWide: z.boolean().default(false), // firm-wide vs engagement-specific
      tags: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [wp] = await ctx.db.select().from(workpapers).where(eq(workpapers.id, input.workpaperId));
      if (!wp) throw new TRPCError({ code: "NOT_FOUND" });

      const id = randomUUID();
      await ctx.db.insert(workpaperTemplates).values({
        id,
        engagementId: input.firmWide ? null : input.engagementId,
        name: input.name,
        controlType: input.controlType ?? null,
        riskLevel: input.riskLevel ?? null,
        framework: "PCAOB",
        procedureTemplate: wp.procedureTemplate ?? null,
        resultsTemplate: wp.resultsTemplate ?? null,
        conclusionTemplate: wp.conclusionTemplate ?? null,
        useCount: 1,
        tags: input.tags ?? null,
        createdBy: ctx.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "template",
        entityId: id,
        action: "template_saved_from_workpaper",
        description: `Template "${input.name}" saved to library from workpaper`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { ok: true, templateId: id };
    }),
});
