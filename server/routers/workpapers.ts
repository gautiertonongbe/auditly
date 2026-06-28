import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { workpapers, controls, pbcItems, engagementMembers, users, engagements, auditTrail } from "../../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { generateWorkpaperWriteup, generateAnnotations } from "../lib/ai";
import { getSampleSize, getSamplingRationale, selectRandomSample } from "../lib/sampling";
import { sendWorkpaperReviewRequest } from "../lib/email";
import { getSystemPrompt, validateEvidence, agentSamplingAdvisor, agentExceptionDrafter, agentPeerReview } from "../lib/auditSkills";

export const workpapersRouter = router({
  listByEngagement: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(async ({ ctx, input }) => {
      const ctls = await ctx.db.select({ id: controls.id }).from(controls).where(eq(controls.engagementId, input.engagementId));
      if (!ctls.length) return [];
      const all = await Promise.all(ctls.map(c =>
        ctx.db.select().from(workpapers).where(eq(workpapers.controlId, c.id))
      ));
      return all.flat();
    }),

  getByControl: protectedProcedure
    .input(z.object({ controlId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [wp] = await ctx.db.select().from(workpapers).where(eq(workpapers.controlId, input.controlId));
      return wp ?? null;
    }),

  upsert: auditedProcedure
    .input(z.object({
      controlId: z.string(),
      engagementId: z.string(),
      phase: z.enum(["TOD", "TOE", "Rollforward"]).optional().nullable(),
      rollforwardFromDate: z.string().optional().nullable(), // ISO date string
      populationDescription: z.string().optional(),
      populationCount: z.number().optional(),
      populationPeriod: z.string().optional(),
      procedureFinal: z.string().optional(),
      resultsFinal: z.string().optional(),
      conclusionFinal: z.string().optional(),
      conclusion: z.enum(["Pass", "ExceptionNoted", "InProgress"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { rollforwardFromDate, ...rest } = input;
      const rfDate = rollforwardFromDate ? new Date(rollforwardFromDate) : null;
      const existing = await ctx.db.select().from(workpapers).where(eq(workpapers.controlId, input.controlId));
      if (existing.length > 0) {
        await ctx.db.update(workpapers).set({ ...rest, rollforwardFromDate: rfDate, updatedAt: new Date() }).where(eq(workpapers.controlId, input.controlId));
        const [updated] = await ctx.db.select().from(workpapers).where(eq(workpapers.controlId, input.controlId));
        return updated;
      }
      const id = randomUUID();
      await ctx.db.insert(workpapers).values({ id, ...rest, rollforwardFromDate: rfDate, createdAt: new Date(), updatedAt: new Date() });
      const [wp] = await ctx.db.select().from(workpapers).where(eq(workpapers.id, id));
      return wp;
    }),

  generateAi: auditedProcedure
    .input(z.object({ controlId: z.string(), population: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [control] = await ctx.db.select().from(controls).where(eq(controls.id, input.controlId));
      if (!control) throw new TRPCError({ code: "NOT_FOUND" });

      const existingWp = await ctx.db.select().from(workpapers).where(eq(workpapers.controlId, input.controlId));
      const populationCount = existingWp[0]?.populationCount ?? 100;
      const sampleSize = getSampleSize(
        control.frequency,
        control.riskLevel,
        populationCount,
        control.priorYearResult === "ExceptionNoted"
      );

      // Fetch accepted PBC items for this control so the AI can reference them specifically
      const acceptedPbc = await ctx.db
        .select({
          description: pbcItems.description,
          fileName: pbcItems.fileName,
          fileUrl: pbcItems.fileUrl,
          fileContent: pbcItems.fileContent,
          receivedDate: pbcItems.receivedDate,
        })
        .from(pbcItems)
        .where(and(eq(pbcItems.controlId, input.controlId), eq(pbcItems.status, "Accepted")));

      // Pass firm/workpaper templates so AI strictly follows the defined structure
      const wp0 = existingWp[0];
      const aiResult = await generateWorkpaperWriteup({
        controlRef: control.controlRef,
        controlObjective: control.objective,
        domain: control.domain,
        controlType: (control.itgcType ?? control.itacType ?? ""),
        frequency: control.frequency,
        riskLevel: control.riskLevel,
        population: input.population ?? wp0?.populationDescription ?? "Not yet defined",
        sampleSize,
        phase: (wp0?.phase as "TOD" | "TOE" | "Rollforward" | null) ?? null,
        rollforwardFromDate: wp0?.rollforwardFromDate ? new Date(wp0.rollforwardFromDate).toISOString().split("T")[0] : null,
        pbcItems: acceptedPbc,
        framework: "PCAOB",
        procedureTemplate: wp0?.procedureTemplate ?? null,
        resultsTemplate: wp0?.resultsTemplate ?? null,
        conclusionTemplate: wp0?.conclusionTemplate ?? null,
      });

      const samplingRationale = getSamplingRationale(
        control.frequency,
        control.riskLevel,
        populationCount,
        sampleSize,
        control.priorYearResult === "ExceptionNoted"
      );

      if (existingWp.length > 0) {
        await ctx.db.update(workpapers).set({
          sampleSize,
          samplingMethod: "Random",
          procedureDraft: aiResult.procedure,
          resultsDraft: aiResult.results,
          conclusionDraft: aiResult.conclusion,
          aiGeneratedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(workpapers.controlId, input.controlId));
      } else {
        await ctx.db.insert(workpapers).values({
          id: randomUUID(),
          controlId: input.controlId,
          engagementId: control.engagementId,
          sampleSize,
          samplingMethod: "Random",
          populationCount,
          procedureDraft: samplingRationale + "\n\n" + aiResult.procedure,
          resultsDraft: aiResult.results,
          conclusionDraft: aiResult.conclusion,
          conclusion: "InProgress",
          aiGeneratedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Log AI generation to audit trail
      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        engagementId: control.engagementId,
        entityType: "workpaper",
        entityId: input.controlId,
        action: "ai_generated",
        description: `AI writeup generated for ${control.controlRef}`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { sampleSize, ...aiResult, samplingRationale };
    }),

  // ── Save Inline Template ─────────────────────────────────────────────────
  // Saves procedure/results/conclusion templates directly on the workpaper.
  // Next AI generation will strictly follow these templates.
  saveInlineTemplate: auditedProcedure
    .input(z.object({
      workpaperId: z.string(),
      procedureTemplate: z.string().nullable().optional(),
      resultsTemplate: z.string().nullable().optional(),
      conclusionTemplate: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(workpapers).set({
        procedureTemplate: input.procedureTemplate ?? null,
        resultsTemplate: input.resultsTemplate ?? null,
        conclusionTemplate: input.conclusionTemplate ?? null,
        updatedAt: new Date(),
      }).where(eq(workpapers.id, input.workpaperId));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "workpaper",
        entityId: input.workpaperId,
        action: "template_saved",
        description: "Workpaper template updated — AI will follow this structure on next generation",
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { ok: true };
    }),

  signOff: auditedProcedure
    .input(z.object({
      workpaperId: z.string(),
      level: z.enum(["preparer", "reviewer", "approver"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const updates =
        input.level === "preparer" ? { preparedBy: ctx.user.id, preparedAt: new Date() } :
        input.level === "reviewer" ? { reviewedBy: ctx.user.id, reviewedAt: new Date() } :
        { approvedBy: ctx.user.id, approvedAt: new Date() };

      await ctx.db.update(workpapers).set({ ...updates, updatedAt: new Date() }).where(eq(workpapers.id, input.workpaperId));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "workpaper",
        entityId: input.workpaperId,
        action: `signed_off_${input.level}`,
        description: `Workpaper signed off as ${input.level}`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      // When preparer signs off, notify the next reviewer (senior/manager/partner on the engagement)
      if (input.level === "preparer") {
        try {
          const [wp] = await ctx.db.select().from(workpapers).where(eq(workpapers.id, input.workpaperId));
          if (wp) {
            // Get engagement members with review-level roles (exclude the preparer)
            const members = await ctx.db
              .select({ userId: engagementMembers.userId, role: engagementMembers.role })
              .from(engagementMembers)
              .where(eq(engagementMembers.engagementId, wp.engagementId));

            const reviewerRoles = ["senior", "manager", "partner"];
            const reviewerMember = members.find(
              m => reviewerRoles.includes(m.role) && m.userId !== ctx.user.id
            );

            if (reviewerMember) {
              const [reviewer] = await ctx.db
                .select({ email: users.email, name: users.name })
                .from(users)
                .where(eq(users.id, reviewerMember.userId));

              const [preparerUser] = await ctx.db
                .select({ name: users.name })
                .from(users)
                .where(eq(users.id, ctx.user.id));

              const [ctrl] = await ctx.db
                .select({ controlRef: controls.controlRef })
                .from(controls)
                .where(eq(controls.id, wp.controlId));

              const [engagement] = await ctx.db
                .select({ clientName: engagements.clientName })
                .from(engagements)
                .where(eq(engagements.id, wp.engagementId));

              if (reviewer && ctrl && engagement) {
                await sendWorkpaperReviewRequest({
                  toEmail: reviewer.email,
                  toName: reviewer.name,
                  fromName: preparerUser?.name ?? "Your colleague",
                  controlRef: ctrl.controlRef,
                  engagementClient: engagement.clientName,
                  workpaperId: input.workpaperId,
                  engagementId: wp.engagementId,
                });
              }
            }
          }
        } catch (err) {
          // Email failure should not break sign-off
          console.error("[signOff] Email notification failed:", err);
        }
      }

      return { success: true };
    }),

  addReviewComment: auditedProcedure
    .input(z.object({
      workpaperId: z.string(),
      comment: z.string().min(1),
      sectionRef: z.string().optional(), // "procedure" | "results" | "conclusion" | null for general
    }))
    .mutation(async ({ ctx, input }) => {
      const [wp] = await ctx.db.select().from(workpapers).where(eq(workpapers.id, input.workpaperId));
      if (!wp) throw new TRPCError({ code: "NOT_FOUND" });

      const existing = (wp.reviewNotes ?? "") as string;
      const [commenter] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, ctx.user.id));
      const timestamp = new Date().toISOString();
      const prefix = input.sectionRef ? `[${input.sectionRef.toUpperCase()}] ` : "";
      const newEntry = `[${timestamp}] ${commenter?.name ?? "Reviewer"}: ${prefix}${input.comment}`;
      const updated = existing ? `${existing}\n${newEntry}` : newEntry;

      await ctx.db.update(workpapers).set({ reviewNotes: updated, updatedAt: new Date() }).where(eq(workpapers.id, input.workpaperId));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        entityType: "workpaper",
        entityId: input.workpaperId,
        action: "review_comment",
        description: `Review comment added${input.sectionRef ? ` on ${input.sectionRef}` : ""}`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { success: true };
    }),

  chatImprove: auditedProcedure
    .input(z.object({
      workpaperId: z.string(),
      userMessage: z.string().min(1),
      section: z.enum(["procedure", "results", "conclusion", "all"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [wp] = await ctx.db.select().from(workpapers).where(eq(workpapers.id, input.workpaperId));
      if (!wp) throw new TRPCError({ code: "NOT_FOUND" });

      const [ctrl] = await ctx.db.select().from(controls).where(eq(controls.id, wp.controlId));
      if (!ctrl) throw new TRPCError({ code: "NOT_FOUND" });

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const currentContent =
        input.section === "procedure" ? (wp.procedureDraft ?? "")
        : input.section === "results" ? (wp.resultsDraft ?? "")
        : input.section === "conclusion" ? (wp.conclusionDraft ?? "")
        : `PROCEDURE:\n${wp.procedureDraft ?? ""}\n\nRESULTS:\n${wp.resultsDraft ?? ""}\n\nCONCLUSION:\n${wp.conclusionDraft ?? ""}`;

      // Use domain-specific PCAOB skill prompt for highest accuracy
      const controlType = ctrl.itgcType ?? ctrl.itacType ?? null;
      const domainSystemPrompt = getSystemPrompt(controlType);
      const systemPrompt = `${domainSystemPrompt}

You are currently helping revise the workpaper for control ${ctrl.controlRef}.
The auditor will ask you to revise specific sections. Return ONLY the revised text with no explanation, no markdown, no JSON wrapper.
Write in professional past-tense audit language.`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: "user", content: `Current ${input.section} section:\n\n${currentContent}\n\n---\n\nInstruction: ${input.userMessage}` },
        ],
      });

      const revisedText = (response.content[0] as { text: string }).text.trim();

      // Auto-apply the revision to the draft fields
      const fieldMap: Record<string, object> = {
        procedure: { procedureDraft: revisedText, updatedAt: new Date() },
        results:   { resultsDraft: revisedText, updatedAt: new Date() },
        conclusion: { conclusionDraft: revisedText, updatedAt: new Date() },
        all: (() => {
          // "all" response comes back as three labeled sections; try to parse
          const pMatch = revisedText.match(/PROCEDURE:\s*([\s\S]*?)(?=\n\nRESULTS:|$)/i);
          const rMatch = revisedText.match(/RESULTS:\s*([\s\S]*?)(?=\n\nCONCLUSION:|$)/i);
          const cMatch = revisedText.match(/CONCLUSION:\s*([\s\S]*?)$/i);
          return {
            procedureDraft: pMatch?.[1]?.trim() ?? wp.procedureDraft,
            resultsDraft: rMatch?.[1]?.trim() ?? wp.resultsDraft,
            conclusionDraft: cMatch?.[1]?.trim() ?? wp.conclusionDraft,
            updatedAt: new Date(),
          };
        })(),
      };

      await ctx.db.update(workpapers).set(fieldMap[input.section] as object).where(eq(workpapers.id, input.workpaperId));

      return { revisedText, section: input.section };
    }),

  // ── Agent: Evidence Adequacy Validator ────────────────────────────────────
  agentValidateEvidence: auditedProcedure
    .input(z.object({ pbcItemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [item] = await ctx.db.select().from(pbcItems).where(eq(pbcItems.id, input.pbcItemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      if (!item.fileContent) throw new TRPCError({ code: "BAD_REQUEST", message: "No file content extracted. Upload the file first." });

      let controlObjective = "General IT control";
      let controlType: string | null = null;
      if (item.controlId) {
        const [ctrl] = await ctx.db.select().from(controls).where(eq(controls.id, item.controlId));
        if (ctrl) { controlObjective = ctrl.objective; controlType = ctrl.itgcType ?? ctrl.itacType ?? null; }
      }

      const result = await validateEvidence({
        controlObjective,
        controlType,
        pbcDescription: item.description,
        fileContent: item.fileContent,
        fileName: item.fileName ?? "unknown",
      });

      return result;
    }),

  // ── Agent: Sampling Advisor ───────────────────────────────────────────────
  agentSamplingAdvisor: auditedProcedure
    .input(z.object({ controlId: z.string(), populationCount: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [ctrl] = await ctx.db.select().from(controls).where(eq(controls.id, input.controlId));
      if (!ctrl) throw new TRPCError({ code: "NOT_FOUND" });

      const result = await agentSamplingAdvisor({
        controlFrequency: ctrl.frequency,
        populationCount: input.populationCount,
        riskLevel: ctrl.riskLevel,
        priorYearException: ctrl.priorYearResult === "ExceptionNoted",
        controlType: ctrl.itgcType ?? ctrl.itacType ?? null,
      });

      return result;
    }),

  // ── Agent: Peer Review (second-pass QC) ─────────────────────────────────
  agentPeerReview: auditedProcedure
    .input(z.object({ workpaperId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [wp] = await ctx.db.select().from(workpapers).where(eq(workpapers.id, input.workpaperId));
      if (!wp) throw new TRPCError({ code: "NOT_FOUND" });

      const procedure = wp.procedureFinal ?? wp.procedureDraft ?? "";
      const results   = wp.resultsFinal  ?? wp.resultsDraft  ?? "";
      const conclusion = wp.conclusionFinal ?? wp.conclusionDraft ?? "";

      if (!procedure && !results && !conclusion) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No workpaper content to review. Generate the AI writeup first." });
      }

      const [ctrl] = await ctx.db.select().from(controls).where(eq(controls.id, wp.controlId));
      if (!ctrl) throw new TRPCError({ code: "NOT_FOUND" });

      // Build PBC summary for context
      const acceptedPbc = await ctx.db
        .select({ description: pbcItems.description, fileName: pbcItems.fileName })
        .from(pbcItems)
        .where(and(eq(pbcItems.controlId, wp.controlId), eq(pbcItems.status, "Accepted")));

      const pbcSummary = acceptedPbc.length > 0
        ? acceptedPbc.map((p, i) => `${i + 1}. ${p.description}${p.fileName ? ` (${p.fileName})` : ""}`).join("\n")
        : "No accepted PBC items on file.";

      const reviewResult = await agentPeerReview({
        controlRef: ctrl.controlRef,
        controlObjective: ctrl.objective,
        controlType: ctrl.itgcType ?? ctrl.itacType ?? null,
        frequency: ctrl.frequency,
        riskLevel: ctrl.riskLevel,
        sampleSize: wp.sampleSize ?? 0,
        populationCount: wp.populationCount ?? 0,
        procedure,
        results,
        conclusion,
        pbcSummary,
      });

      // Log to audit trail
      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        engagementId: ctrl.engagementId,
        entityType: "workpaper",
        entityId: input.workpaperId,
        action: "peer_review",
        description: `AI peer review: ${reviewResult.overallRating} (score: ${reviewResult.overallScore}/100)`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return reviewResult;
    }),

  // ── Agent: Screenshot Annotation ─────────────────────────────────────────
  agentAnnotateScreenshot: auditedProcedure
    .input(z.object({ pbcItemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [item] = await ctx.db.select().from(pbcItems).where(eq(pbcItems.id, input.pbcItemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      if (!item.fileUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No file uploaded for this PBC item." });

      // Determine if it's an image type
      const lowerName = (item.fileName ?? "").toLowerCase();
      const isImage = /\.(png|jpg|jpeg|gif|webp)$/.test(lowerName);
      if (!isImage) throw new TRPCError({ code: "BAD_REQUEST", message: "Screenshot annotation only works with image files (PNG, JPG, JPEG, GIF, WEBP)." });

      const ext = lowerName.split(".").pop() ?? "png";
      const mediaTypeMap: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
      };
      const mediaType = mediaTypeMap[ext] ?? "image/png";

      // Fetch image from S3 and convert to base64
      const response = await fetch(item.fileUrl);
      if (!response.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch image from storage." });
      const arrayBuffer = await response.arrayBuffer();
      const imageBase64 = Buffer.from(arrayBuffer).toString("base64");

      // Get control context for better annotation
      let controlObjective = "IT control evidence";
      let controlType = "CM";
      if (item.controlId) {
        const [ctrl] = await ctx.db.select().from(controls).where(eq(controls.id, item.controlId));
        if (ctrl) {
          controlObjective = ctrl.objective;
          controlType = ctrl.itgcType ?? ctrl.itacType ?? "CM";
        }
      }

      const boxes = await generateAnnotations({
        imageBase64,
        mediaType,
        controlType,
        controlObjective,
        pbcDescription: item.description,
      });

      return { boxes, mediaType, imageBase64 };
    }),

  // ── Agent: Exception Drafter ─────────────────────────────────────────────
  agentExceptionDrafter: auditedProcedure
    .input(z.object({
      workpaperId: z.string(),
      exceptionDescription: z.string().min(10),
      exceptionsFound: z.number().int().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const [wp] = await ctx.db.select().from(workpapers).where(eq(workpapers.id, input.workpaperId));
      if (!wp) throw new TRPCError({ code: "NOT_FOUND" });
      const [ctrl] = await ctx.db.select().from(controls).where(eq(controls.id, wp.controlId));
      if (!ctrl) throw new TRPCError({ code: "NOT_FOUND" });

      const result = await agentExceptionDrafter({
        controlObjective: ctrl.objective,
        controlRef: ctrl.controlRef,
        exceptionDescription: input.exceptionDescription,
        populationCount: wp.populationCount ?? 0,
        sampleSize: wp.sampleSize ?? 0,
        exceptionsFound: input.exceptionsFound,
        controlType: ctrl.itgcType ?? ctrl.itacType ?? null,
      });

      return result;
    }),
});
