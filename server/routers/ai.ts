import { z } from "zod";
import { router, auditedProcedure, protectedProcedure } from "../_core/trpc";
import { generateDeficiencyAssessment, classifyPbcFile, helpChat } from "../lib/ai";
import { exceptions, engagements, engagementMembers, controls, workpapers, pbcItems } from "../../drizzle/schema";
import { eq, inArray, and } from "drizzle-orm";

export const aiRouter = router({
  assessDeficiency: auditedProcedure
    .input(z.object({
      engagementId: z.string(),
      exceptionIds: z.string().array(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [eng] = await ctx.db.select().from(engagements).where(eq(engagements.id, input.engagementId));
      const excList = await ctx.db.select().from(exceptions).where(inArray(exceptions.id, input.exceptionIds));

      const result = await generateDeficiencyAssessment({
        clientName: eng.clientName,
        exceptions: excList.map(e => ({
          controlRef: e.controlId,
          description: e.description,
          severity: e.severity,
        })),
      });

      return result;
    }),

  classifyPbc: auditedProcedure
    .input(z.object({
      fileName: z.string(),
      fileContent: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return classifyPbcFile(input);
    }),

  helpChat: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(2000),
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })).max(20),
      context: z.object({
        page: z.string().optional(),
        engagementId: z.string().optional(),
        controlId: z.string().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      // Gather context data scoped to this user's accessible engagements
      const memberOf = await ctx.db.select({ engagementId: engagementMembers.engagementId })
        .from(engagementMembers).where(eq(engagementMembers.userId, ctx.user.id));
      const accessibleIds = memberOf.map(m => m.engagementId);

      // Summary of all accessible engagements
      let engagementSummary = "";
      if (accessibleIds.length > 0) {
        const engs = await ctx.db.select().from(engagements).where(inArray(engagements.id, accessibleIds));
        engagementSummary = engs.map(e =>
          `- ${e.clientName} (${e.fiscalYear}, ${e.framework}, status: ${e.status})`
        ).join("\n");
      }

      // Deep context for a specific engagement
      let engagementDetail = "";
      if (input.context.engagementId && accessibleIds.includes(input.context.engagementId)) {
        const engId = input.context.engagementId;
        const [eng] = await ctx.db.select().from(engagements).where(eq(engagements.id, engId));
        const ctrlList = await ctx.db.select().from(controls).where(eq(controls.engagementId, engId));
        const excList = await ctx.db.select().from(exceptions).where(eq(exceptions.engagementId, engId));
        const pbcList = await ctx.db.select().from(pbcItems).where(eq(pbcItems.engagementId, engId));

        const openPbc = pbcList.filter(p => p.status === "Requested").length;
        const openExc = excList.filter(e => e.status === "Open").length;
        const ctrlByStatus = ctrlList.reduce((acc, c) => {
          acc[c.status] = (acc[c.status] ?? 0) + 1; return acc;
        }, {} as Record<string, number>);

        engagementDetail = `
CURRENT ENGAGEMENT: ${eng?.clientName} (${eng?.fiscalYear}, ${eng?.framework})
Status: ${eng?.status}
Controls: ${ctrlList.length} total | ${JSON.stringify(ctrlByStatus)}
Exceptions: ${excList.length} total, ${openExc} open
PBC items: ${pbcList.length} total, ${openPbc} outstanding
`;

        // Control detail if on a specific control
        if (input.context.controlId) {
          const ctrl = ctrlList.find(c => c.id === input.context.controlId);
          if (ctrl) {
            const wp = await ctx.db.select().from(workpapers)
              .where(and(eq(workpapers.controlId, ctrl.id), eq(workpapers.engagementId, engId)));
            engagementDetail += `
CURRENT CONTROL: ${ctrl.controlRef} - ${ctrl.objective}
Domain: ${ctrl.domain}${ctrl.itgcType ? ` / ${ctrl.itgcType}` : ""}${ctrl.itacType ? ` / ${ctrl.itacType}` : ""}
Status: ${ctrl.status} | Risk: ${ctrl.riskLevel}
Workpaper status: ${wp[0]?.conclusion ?? "Not started"}
`;
          }
        }
      }

      const response = await helpChat({
        message: input.message,
        history: input.history,
        userName: ctx.user.name,
        userRole: ctx.user.role,
        currentPage: input.context.page,
        engagementSummary,
        engagementDetail,
      });

      return { reply: response };
    }),
});
