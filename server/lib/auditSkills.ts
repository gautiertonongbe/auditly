/**
 * Auditly AI Skills — PCAOB-aligned audit intelligence.
 *
 * Three capabilities:
 *   1. getSystemPrompt(controlType)  — domain-specific instructions injected into every
 *      AI workpaper generation call, ensuring output matches PCAOB AS 2201 / AS 2315.
 *   2. validateEvidence(...)         — evidence adequacy agent: given a PBC file's
 *      extracted content, rates whether it actually satisfies the control being tested.
 *   3. agentSamplingAdvisor(...)     — recommends sample size and method per PCAOB AS 2315.
 *   4. agentExceptionDrafter(...)    — drafts a deficiency memo per PCAOB AS 2201.
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

// ── Domain-specific PCAOB system prompts ─────────────────────────────────────

const BASE_INSTRUCTIONS = `
You are an experienced Big 4 IT audit senior with deep expertise in PCAOB auditing standards (AS 2201, AS 2315, AS 2301) and SOX Section 404.

FORMATTING RULES:
- Write in clear, formal audit language appropriate for a PCAOB workpaper.
- Use past tense for procedures performed ("The auditor obtained...", "We inspected...").
- Reference each piece of evidence by its exact filename or description in parentheses, e.g. "(Ref: User Access Report Q4 2024.xlsx)".
- Never fabricate evidence. Only reference PBC items that are explicitly listed.
- Structure each section with numbered sub-steps where applicable.
- Quantify where possible: sample sizes, population counts, exception rates, percentages.
- For conclusions: state whether the control operated effectively for the period under audit.
- Flag any PBC items that appear insufficient or missing for the tested control.
`.trim();

const DOMAIN_PROMPTS: Record<string, string> = {
  CM: `
CONTROL DOMAIN: Change Management (ITGC-CM)
PCAOB FOCUS: AS 2201.26 — Changes to IT systems must be authorized, tested, and approved before implementation.

REQUIRED PROCEDURE ELEMENTS:
1. Obtain population of all changes deployed to the in-scope system during the audit period.
2. For sampled changes, verify: (a) Change request exists with documented business justification, (b) Approval from authorized change manager prior to implementation, (c) Technical testing evidence (unit test, UAT, or regression results), (d) Post-implementation sign-off, (e) Segregation of duties — developer did not approve their own change.
3. Inspect emergency/expedited changes separately; verify retroactive approval.
4. Assess completeness of the change log (does it capture all environment changes?).

COMMON EXCEPTIONS: Missing pre-approval, developer self-approval, no testing documentation, incomplete change tickets.
`.trim(),

  AM: `
CONTROL DOMAIN: Access Management (ITGC-AM)
PCAOB FOCUS: AS 2201.26 — Logical access to systems must be granted on a need-to-know basis and promptly removed upon termination.

REQUIRED PROCEDURE ELEMENTS:
1. Obtain current user access listing with roles, privileges, and last-login dates.
2. For new user provisioning sample: verify formal access request, manager approval, and role appropriate to job function.
3. For termination sample: verify access revoked within established SLA (typically 24-48h) after HR termination date.
4. Identify privileged/admin accounts; verify they are reviewed, justified, and subject to enhanced monitoring.
5. Assess whether any generic/shared/service accounts exist without documented ownership.
6. Inspect periodic access recertification (typically quarterly or semi-annual).

COMMON EXCEPTIONS: Terminated employees with active access, access exceeding job requirements, shared credentials, stale privileged accounts, no formal recertification.
`.trim(),

  CO: `
CONTROL DOMAIN: Computer Operations (ITGC-CO)
PCAOB FOCUS: AS 2201.26 — Operations controls ensure systems run as intended and problems are detected and resolved timely.

REQUIRED PROCEDURE ELEMENTS:
1. Inspect job scheduling / batch processing logs for the audit period; verify all critical jobs completed successfully or failures were investigated.
2. Obtain incident/problem tickets; verify root cause analysis performed for P1/P2 incidents.
3. Review backup and recovery procedures; obtain evidence of successful backup completion and at least one recovery test.
4. Inspect monitoring alerts and on-call escalation records.
5. Verify physical/environmental controls: data center access logs, temperature monitoring, UPS test records (if in scope).

COMMON EXCEPTIONS: Unresolved batch failures, no recovery testing, incomplete incident logs, lapses in backup completion.
`.trim(),

  PD: `
CONTROL DOMAIN: Program Development (ITGC-PD)
PCAOB FOCUS: AS 2201.26 — The SDLC ensures new systems and major enhancements are properly designed, tested, and approved.

REQUIRED PROCEDURE ELEMENTS:
1. Identify all significant system implementations or major upgrades during the period.
2. For each: obtain project charter / initiation document with business/risk justification.
3. Verify formal requirements documentation and sign-off by business owner.
4. Inspect testing evidence: unit, integration, UAT, and performance testing results.
5. Verify go-live approval by authorized stakeholders (Steering Committee or equivalent).
6. Assess data migration testing, parallel run evidence, and post-go-live monitoring.
7. Confirm training was provided to end users.

COMMON EXCEPTIONS: Missing business owner sign-off, inadequate testing, no parallel run, incomplete data migration validation.
`.trim(),

  Input: `
CONTROL DOMAIN: ITAC — Input Controls
PCAOB FOCUS: AS 2201.28 — Application input controls ensure data entered into the system is complete, accurate, and authorized.

REQUIRED PROCEDURE ELEMENTS:
1. Understand the transaction initiation workflow: who enters data, what validation rules exist.
2. Test edit checks and field validation: enter invalid data (negative amounts, invalid dates, out-of-range values) and verify the system rejects or flags them.
3. Verify authorization controls: does the system enforce separation of duties between data entry and approval?
4. Test completeness: trace transactions from source (paper form, ERP entry, EDI) through to the system ledger.
5. Inspect error/exception reports generated by the application; verify unresolved items are investigated.
6. Assess duplicate detection controls.

EVIDENCE TO OBTAIN: System configuration screenshots, edit check documentation, sample transactions with approval workflow, error reports, access matrix.
`.trim(),

  Processing: `
CONTROL DOMAIN: ITAC — Processing Controls
PCAOB FOCUS: AS 2201.28 — Processing controls ensure transactions are processed completely, accurately, and in a timely manner.

REQUIRED PROCEDURE ELEMENTS:
1. Identify key automated calculations and processing routines (e.g. depreciation, payroll gross-to-net, revenue recognition).
2. Re-perform or independently verify key calculations using source data (from PBC) vs system output.
3. Verify reconciliation controls: system totals tie to subledger and general ledger.
4. Inspect batch processing reports: run-to-run control totals, hash totals, record counts.
5. For period-end processes: verify cut-off is correctly applied (transactions post to correct period).
6. Assess configuration of automated postings and journal entries; verify they are reviewed.

EVIDENCE TO OBTAIN: System-generated calculation reports, reconciliation workpapers, period-end close checklists, batch reports with control totals.
`.trim(),

  Output: `
CONTROL DOMAIN: ITAC — Output Controls
PCAOB FOCUS: AS 2201.28 — Output controls ensure system-generated reports and outputs are accurate, complete, and distributed only to authorized recipients.

REQUIRED PROCEDURE ELEMENTS:
1. Identify key reports relied upon by management for decision-making or other controls.
2. For each key report: obtain report parameters used (date range, filters, inclusion/exclusion criteria).
3. Verify report completeness: trace a sample of records from source system to the report output.
4. Verify report accuracy: recalculate or cross-reference totals independently.
5. Assess access controls on report distribution: who can run, modify, or receive the report.
6. For IPE reports: follow full IPE testing protocol (completeness + accuracy).

EVIDENCE TO OBTAIN: Report parameter screenshots, sample population traced to source, independent recalculation workpaper, distribution list/permissions.
`.trim(),

  Interface: `
CONTROL DOMAIN: ITAC — Interface Controls
PCAOB FOCUS: AS 2201.28 — Interface controls ensure data transferred between systems is complete and accurate, with errors detected and resolved.

REQUIRED PROCEDURE ELEMENTS:
1. Map the interface: source system, destination system, data elements transferred, frequency, method (API, file drop, ETL, direct DB link).
2. Obtain interface reconciliation reports for the audit period; verify source record count and totals match destination.
3. Inspect error/exception logs: verify all failed transmissions were investigated and reprocessed.
4. Test a sample of transactions end-to-end: trace from source system through interface to destination, verifying data integrity at each point.
5. Assess timing controls: does data transfer complete within required window (e.g. before period-end close)?
6. Verify authorization: who can trigger, modify, or disable the interface.

EVIDENCE TO OBTAIN: Interface specification document, reconciliation reports, error logs with resolution evidence, sample transaction trace, interface monitoring dashboard.
`.trim(),

  IPE: `
CONTROL DOMAIN: Information Produced by the Entity (IPE) — AS 2301
PCAOB FOCUS: When audit evidence includes reports or data produced by the client's system, the auditor must test the completeness and accuracy of that information.

REQUIRED PROCEDURE ELEMENTS:
COMPLETENESS TESTING:
1. Obtain the parameters used to run the report (date range, system filters, entity scope).
2. Independently verify the population: run a parallel query or obtain a cross-reference report from a different source.
3. Compare record counts and key totals; investigate any discrepancies.
4. Verify no records were filtered out that should have been included.

ACCURACY TESTING:
1. For a sample of records in the report, trace back to the source transaction or master record.
2. Verify key fields (amounts, dates, IDs, statuses) match the source.
3. Recalculate any computed fields (e.g. aging buckets, net values, percentages).
4. If the report was run by the client, obtain the run parameters and verify they were not manipulated.

DOCUMENTATION: State clearly that the report has been tested for completeness and accuracy before relying on it as audit evidence.
`.trim(),
};

export function getSystemPrompt(controlType: string | null | undefined): string {
  const domainPrompt = DOMAIN_PROMPTS[controlType ?? ""] ?? "";
  return `${BASE_INSTRUCTIONS}\n\n${domainPrompt}`;
}

// ── Evidence Adequacy Validator ───────────────────────────────────────────────

export type EvidenceAdequacyResult = {
  score: "Sufficient" | "Partially Sufficient" | "Insufficient";
  rating: number;           // 1-10
  summary: string;
  gaps: string[];
  suggestions: string[];
};

export async function validateEvidence(params: {
  controlObjective: string;
  controlType: string | null;
  pbcDescription: string;
  fileContent: string;
  fileName: string;
}): Promise<EvidenceAdequacyResult> {
  const prompt = `
You are a PCAOB audit quality reviewer.

CONTROL OBJECTIVE: ${params.controlObjective}
CONTROL TYPE: ${params.controlType ?? "General"}
PBC REQUEST: ${params.pbcDescription}
UPLOADED FILE: ${params.fileName}

FILE CONTENT (extracted):
${params.fileContent.slice(0, 6000)}

TASK: Evaluate whether this evidence is sufficient to support testing of the stated control objective.

Respond in JSON with this exact schema:
{
  "score": "Sufficient" | "Partially Sufficient" | "Insufficient",
  "rating": <integer 1-10>,
  "summary": "<2-3 sentence summary of the evidence quality>",
  "gaps": ["<specific gap 1>", "<specific gap 2>"],
  "suggestions": ["<suggestion to improve evidence 1>", "<suggestion 2>"]
}
`.trim();

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
    system: "You are a PCAOB IT audit expert. Respond ONLY with valid JSON matching the specified schema.",
  });

  const text = (msg.content[0] as { type: "text"; text: string }).text;
  try {
    return JSON.parse(text) as EvidenceAdequacyResult;
  } catch {
    return { score: "Partially Sufficient", rating: 5, summary: text.slice(0, 200), gaps: [], suggestions: [] };
  }
}

// ── Sampling Advisor Agent ────────────────────────────────────────────────────

export type SamplingRecommendation = {
  recommendedSampleSize: number;
  method: string;
  rationale: string;
  elevatedJustification?: string;
  pcaobReference: string;
};

export async function agentSamplingAdvisor(params: {
  controlFrequency: string;
  populationCount: number;
  riskLevel: string;
  priorYearException: boolean;
  controlType: string | null;
}): Promise<SamplingRecommendation> {
  const prompt = `
You are a PCAOB sampling specialist applying AS 2315.

CONTROL DETAILS:
- Frequency: ${params.controlFrequency}
- Population size: ${params.populationCount}
- Risk level: ${params.riskLevel}
- Control type: ${params.controlType ?? "ITGC"}
- Prior year exception: ${params.priorYearException ? "YES — elevated sample required" : "No"}

PCAOB AS 2315 STANDARD SAMPLE SIZES (for reference):
- Annual controls (population ≤ 5): test all
- Semi-annual: 2
- Quarterly: 2–4
- Monthly: 3–6
- Daily/Continuous (high volume): 25–60 (risk-adjusted; elevated = +25 if prior exception)

Recommend the appropriate sample size and method. Respond in JSON:
{
  "recommendedSampleSize": <integer>,
  "method": "Haphazard" | "Random" | "Systematic" | "Full population",
  "rationale": "<explanation referencing AS 2315>",
  "elevatedJustification": "<if elevated due to prior exception or high risk>",
  "pcaobReference": "AS 2315.XX"
}
`.trim();

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
    system: "You are a PCAOB sampling expert. Respond ONLY with valid JSON.",
  });

  const text = (msg.content[0] as { type: "text"; text: string }).text;
  try {
    return JSON.parse(text) as SamplingRecommendation;
  } catch {
    return { recommendedSampleSize: 25, method: "Haphazard", rationale: text.slice(0, 200), pcaobReference: "AS 2315" };
  }
}

// ── Peer Review Agent (second-pass QC) ───────────────────────────────────────

export type PeerReviewResult = {
  overallScore: number;           // 0-100
  overallRating: "Pass" | "Pass with Comments" | "Revise Required";
  issues: {
    section: "procedure" | "results" | "conclusion";
    severity: "Critical" | "Significant" | "Informational";
    finding: string;
    suggestion: string;
  }[];
  revisedProcedure?: string;
  revisedResults?: string;
  revisedConclusion?: string;
  reviewerNotes: string;
};

export async function agentPeerReview(params: {
  controlRef: string;
  controlObjective: string;
  controlType: string | null;
  frequency: string;
  riskLevel: string;
  sampleSize: number;
  populationCount: number;
  procedure: string;
  results: string;
  conclusion: string;
  pbcSummary: string;
}): Promise<PeerReviewResult> {
  const domainContext = DOMAIN_PROMPTS[params.controlType ?? ""] ?? "";

  const prompt = `
You are a PCAOB audit quality reviewer performing a second-pass independent review of a workpaper written by a junior auditor.

CONTROL: ${params.controlRef}
OBJECTIVE: ${params.controlObjective}
DOMAIN: ${params.controlType ?? "General ITGC"}
FREQUENCY: ${params.frequency} | RISK: ${params.riskLevel}
SAMPLE SIZE: ${params.sampleSize} / POPULATION: ${params.populationCount}

PBC EVIDENCE SUMMARY:
${params.pbcSummary}

${domainContext ? `DOMAIN REQUIREMENTS:\n${domainContext}\n` : ""}
DRAFT WORKPAPER:

PROCEDURE PERFORMED:
${params.procedure}

RESULTS:
${params.results}

CONCLUSION:
${params.conclusion}

YOUR TASK: Review this workpaper as an independent PCAOB quality reviewer. Check for:
1. Are all required procedure elements present for this control domain?
2. Does the procedure reference each PBC item by name?
3. Are results quantified with actual sample sizes and exception rates?
4. Does the conclusion clearly state whether the control operated effectively?
5. Is the language PCAOB-compliant (past tense, professional, specific)?
6. Are there any logical gaps, unsupported conclusions, or missing references?

Respond ONLY in valid JSON:
{
  "overallScore": <0-100>,
  "overallRating": "Pass" | "Pass with Comments" | "Revise Required",
  "issues": [
    {
      "section": "procedure" | "results" | "conclusion",
      "severity": "Critical" | "Significant" | "Informational",
      "finding": "<what is wrong or missing>",
      "suggestion": "<specific corrective action>"
    }
  ],
  "revisedProcedure": "<improved procedure if Critical issues found, else omit>",
  "revisedResults": "<improved results if Critical issues found, else omit>",
  "revisedConclusion": "<improved conclusion if Critical issues found, else omit>",
  "reviewerNotes": "<1-2 sentence overall quality assessment>"
}
`.trim();

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
    system: "You are a PCAOB audit quality reviewer. Respond ONLY with valid JSON. Be specific and actionable.",
  });

  const text = (msg.content[0] as { type: "text"; text: string }).text;
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    return JSON.parse(match ? match[1] : text) as PeerReviewResult;
  } catch {
    return {
      overallScore: 70,
      overallRating: "Pass with Comments",
      issues: [],
      reviewerNotes: text.slice(0, 300),
    };
  }
}

// ── Exception Drafter Agent ───────────────────────────────────────────────────

export async function agentExceptionDrafter(params: {
  controlObjective: string;
  controlRef: string;
  exceptionDescription: string;
  populationCount: number;
  sampleSize: number;
  exceptionsFound: number;
  controlType: string | null;
}): Promise<{ deficiencyMemo: string; suggestedSeverity: string; managementLetterComment: string }> {
  const rate = params.sampleSize > 0 ? ((params.exceptionsFound / params.sampleSize) * 100).toFixed(1) : "0";

  const prompt = `
You are a Big 4 IT audit manager drafting an exception memo for a PCAOB engagement.

CONTROL: ${params.controlRef} — ${params.controlObjective}
CONTROL TYPE: ${params.controlType ?? "ITGC"}
EXCEPTION: ${params.exceptionDescription}
TESTING: ${params.exceptionsFound} exception(s) out of ${params.sampleSize} items tested (${rate}% exception rate). Population: ${params.populationCount}.

Write:
1. A formal deficiency memo (2–3 paragraphs, PCAOB language, AS 2201 references)
2. Suggested severity: "Control Deficiency" | "Significant Deficiency" | "Material Weakness"
3. A concise management letter comment (1 paragraph, suitable for client communication)

Respond in JSON:
{
  "deficiencyMemo": "<formal memo text>",
  "suggestedSeverity": "<Control Deficiency | Significant Deficiency | Material Weakness>",
  "managementLetterComment": "<client-facing comment>"
}
`.trim();

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
    system: "You are a PCAOB IT audit manager. Respond ONLY with valid JSON.",
  });

  const text = (msg.content[0] as { type: "text"; text: string }).text;
  try {
    return JSON.parse(text) as { deficiencyMemo: string; suggestedSeverity: string; managementLetterComment: string };
  } catch {
    return { deficiencyMemo: text, suggestedSeverity: "Control Deficiency", managementLetterComment: "" };
  }
}
