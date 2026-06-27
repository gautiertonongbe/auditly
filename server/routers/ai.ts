import { z } from "zod";
import { router, auditedProcedure } from "../_core/trpc";
import { generateDeficiencyAssessment, classifyPbcFile } from "../lib/ai";
import { exceptions, engagements } from "../../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

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
});
