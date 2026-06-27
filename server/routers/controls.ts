import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { controls, pbcItems } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const controlsRouter = router({
  listByEngagement: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.select().from(controls).where(eq(controls.engagementId, input.engagementId))
    ),

  create: auditedProcedure
    .input(z.object({
      engagementId: z.string(),
      systemId: z.string().optional(),
      domain: z.enum(["ITGC", "ITAC"]),
      itgcType: z.enum(["CM", "AM", "CO", "PD"]).optional(),
      itacType: z.enum(["Input", "Processing", "Output", "Interface"]).optional(),
      controlRef: z.string(),
      objective: z.string(),
      description: z.string().optional(),
      frequency: z.enum(["Annual", "SemiAnnual", "Quarterly", "Monthly", "Daily", "Continuous"]),
      riskLevel: z.enum(["High", "Medium", "Low"]).default("Medium"),
      assignedTo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [ctrl] = await ctx.db.insert(controls).values({
        id: randomUUID(),
        ...input,
        status: "NotStarted",
        elevatedSample: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return ctrl;
    }),

  update: auditedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["NotStarted", "InProgress", "UnderReview", "Complete", "Exception"]).optional(),
      assignedTo: z.string().optional(),
      riskLevel: z.enum(["High", "Medium", "Low"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await ctx.db.update(controls).set({ ...updates, updatedAt: new Date() }).where(eq(controls.id, id));
      return { success: true };
    }),

  // Create a control with pre-populated PBC requests in one shot (wizard flow)
  createWithPbc: auditedProcedure
    .input(z.object({
      engagementId: z.string(),
      domain: z.enum(["ITGC", "ITAC"]),
      itgcType: z.enum(["CM", "AM", "CO", "PD"]).optional(),
      itacType: z.enum(["Input", "Processing", "Output", "Interface"]).optional(),
      controlRef: z.string(),
      objective: z.string(),
      description: z.string().optional(),
      frequency: z.enum(["Annual", "SemiAnnual", "Quarterly", "Monthly", "Daily", "Continuous"]),
      riskLevel: z.enum(["High", "Medium", "Low"]).default("Medium"),
      pbcRequests: z.array(z.object({
        description: z.string(),
        isIpe: z.boolean().default(false),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const { pbcRequests, ...controlInput } = input;

      const [ctrl] = await ctx.db.insert(controls).values({
        id: randomUUID(),
        ...controlInput,
        status: "NotStarted",
        elevatedSample: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14); // default 2-week PBC due date

      for (const req of pbcRequests) {
        await ctx.db.insert(pbcItems).values({
          id: randomUUID(),
          engagementId: input.engagementId,
          controlId: ctrl.id,
          description: req.description,
          isIpe: req.isIpe,
          status: "Requested",
          dueDate,
          requestedDate: new Date(),
          createdAt: new Date(),
        });
      }

      return { control: ctrl, pbcCount: pbcRequests.length };
    }),

  // Bulk create standard ITGC control set for an engagement
  seedStandardControls: auditedProcedure
    .input(z.object({ engagementId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const standard = [
        { domain: "ITGC", itgcType: "CM", controlRef: "CM-01", objective: "Changes to production systems are authorized, tested, and approved prior to implementation.", frequency: "Continuous", riskLevel: "High" },
        { domain: "ITGC", itgcType: "CM", controlRef: "CM-02", objective: "Emergency changes to production are documented, authorized, and reviewed after implementation.", frequency: "Continuous", riskLevel: "High" },
        { domain: "ITGC", itgcType: "AM", controlRef: "AM-01", objective: "User access to in-scope systems is provisioned based on job responsibilities and approved by management.", frequency: "Continuous", riskLevel: "High" },
        { domain: "ITGC", itgcType: "AM", controlRef: "AM-02", objective: "User access is reviewed periodically to ensure appropriateness and remove unnecessary access.", frequency: "Quarterly", riskLevel: "High" },
        { domain: "ITGC", itgcType: "AM", controlRef: "AM-03", objective: "Access for terminated employees is removed timely upon separation.", frequency: "Continuous", riskLevel: "High" },
        { domain: "ITGC", itgcType: "AM", controlRef: "AM-04", objective: "Privileged and administrative access is restricted to authorized personnel and reviewed.", frequency: "Quarterly", riskLevel: "High" },
        { domain: "ITGC", itgcType: "CO", controlRef: "CO-01", objective: "System and data backups are performed and restored successfully on a defined schedule.", frequency: "Daily", riskLevel: "Medium" },
        { domain: "ITGC", itgcType: "CO", controlRef: "CO-02", objective: "Batch jobs and scheduled processes complete successfully and exceptions are investigated.", frequency: "Daily", riskLevel: "Medium" },
        { domain: "ITGC", itgcType: "PD", controlRef: "PD-01", objective: "System development and implementation follows a defined SDLC methodology with appropriate approvals.", frequency: "Annual", riskLevel: "Medium" },
      ] as const;

      const inserted = [];
      for (const ctrl of standard) {
        const [c] = await ctx.db.insert(controls).values({
          id: randomUUID(),
          engagementId: input.engagementId,
          domain: ctrl.domain as "ITGC",
          itgcType: ctrl.itgcType as "CM" | "AM" | "CO" | "PD",
          controlRef: ctrl.controlRef,
          objective: ctrl.objective,
          frequency: ctrl.frequency as "Annual" | "Quarterly" | "Daily" | "Continuous",
          riskLevel: ctrl.riskLevel as "High" | "Medium",
          status: "NotStarted",
          elevatedSample: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();
        inserted.push(c);
      }
      return inserted;
    }),
});
