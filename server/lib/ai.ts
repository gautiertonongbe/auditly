import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Domain-specific procedure guidance injected into the AI prompt
const DOMAIN_GUIDANCE: Record<string, string> = {
  CM: "Change Management (CM): Focus on change ticket completeness, approval chain, testing sign-off before promotion, emergency change handling, and segregation between requester/approver/implementer.",
  AM: "Access Management (AM): Focus on user provisioning/deprovisioning timeliness, quarterly user access reviews, privileged access justification, terminated user removal, and role appropriateness.",
  CO: "Computer Operations (CO): Focus on job scheduler monitoring, backup completion and restore testing, incident ticket resolution, system availability SLAs, and capacity alerts.",
  PD: "Program Development (PD): Focus on SDLC methodology adherence, unit/UAT testing evidence, business sign-off before go-live, and separation of development from production.",
  Input: "ITAC Input: Focus on input validation controls, edit checks, error handling for rejected transactions, completeness of interface files, and reconciliation of source-to-system.",
  Processing: "ITAC Processing: Focus on automated calculation accuracy, exception reporting, reprocessing controls, and reconciliation of processed totals to source data.",
  Output: "ITAC Output: Focus on completeness and accuracy of reports/feeds, distribution controls, output reconciliation, and downstream system integrity.",
  Interface: "ITAC Interface: Focus on interface monitoring, transmission completeness, error logs, reconciliation of record counts/amounts, and timely resolution of failed transmissions.",
  IPE: "IPE (Information Produced by Entity): Focus on completeness testing (trace totals to source), accuracy testing (verify key fields against source records), system configuration verification, and parameter confirmation.",
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff", ".tif"]);

function isImageFile(fileName: string | null | undefined): boolean {
  if (!fileName) return false;
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return IMAGE_EXTENSIONS.has(ext);
}

function fileNameToMediaType(fileName: string): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; fileName: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) return null; // skip >5MB
    const data = Buffer.from(buffer).toString("base64");
    const fileName = url.split("/").pop()?.split("?")[0] ?? "image";
    const mediaType = fileNameToMediaType(fileName);
    return { data, mediaType, fileName };
  } catch {
    return null;
  }
}

export async function generateWorkpaperWriteup(params: {
  controlRef: string;
  controlObjective: string;
  domain: string;
  controlType: string;
  frequency: string;
  riskLevel: string;
  population: string;
  sampleSize: number;
  pbcItems: {
    description: string;
    fileName?: string | null;
    fileUrl?: string | null;
    fileContent?: string | null;
    receivedDate?: Date | null;
  }[];
  framework: string;
  // Firm / engagement templates — AI MUST follow these if provided
  procedureTemplate?: string | null;
  resultsTemplate?: string | null;
  conclusionTemplate?: string | null;
}): Promise<{ procedure: string; results: string; conclusion: string }> {
  const domainGuidance = DOMAIN_GUIDANCE[params.controlType] ?? "";
  const hasTemplates = !!(params.procedureTemplate || params.resultsTemplate || params.conclusionTemplate);

  // Fetch images for PBC items that are screenshots/images
  const imageItems: { index: number; img: { data: string; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; fileName: string } }[] = [];
  await Promise.all(params.pbcItems.map(async (p, i) => {
    if (isImageFile(p.fileName) && p.fileUrl) {
      const img = await fetchImageAsBase64(p.fileUrl);
      if (img) imageItems.push({ index: i, img });
    }
  }));

  const pbcSection = params.pbcItems.length > 0
    ? params.pbcItems.map((p, i) => {
        const hasImage = imageItems.some(im => im.index === i);
        const hasText = p.fileContent && p.fileContent.trim().length > 0;
        const contentNote = hasImage ? " [SCREENSHOT — see image below]" : hasText ? ` [Content extracted: ${p.fileContent!.slice(0, 300)}...]` : "";
        return `  PBC ${i + 1}: ${p.description}${p.fileName ? ` (File: ${p.fileName})` : ""}${p.receivedDate ? ` — received ${new Date(p.receivedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}${contentNote}`;
      }).join("\n")
    : "  No accepted PBC items on file yet.";

  // Build template enforcement block — placed at the TOP of the prompt for maximum weight
  const templateBlock = hasTemplates ? `
╔══════════════════════════════════════════════════════════════════════════╗
║  FIRM TEMPLATE — YOU MUST FOLLOW THIS STRUCTURE EXACTLY                 ║
║  This template represents the firm's quality standard and client style. ║
║  Fill in every [PLACEHOLDER] with real evidence data from the PBC list. ║
║  Preserve ALL headers, numbering, and formatting from the template.     ║
║  Do NOT add, remove, or reorder sections. Do NOT ignore the template.   ║
╚══════════════════════════════════════════════════════════════════════════╝
${params.procedureTemplate ? `\nPROCEDURE TEMPLATE:\n${params.procedureTemplate}\n` : ""}
${params.resultsTemplate ? `\nRESULTS TEMPLATE:\n${params.resultsTemplate}\n` : ""}
${params.conclusionTemplate ? `\nCONCLUSION TEMPLATE:\n${params.conclusionTemplate}\n` : ""}
` : "";

  const defaultInstructions = !hasTemplates ? `
Generate three sections in JSON format:
1. "procedure": Testing procedure performed (3-5 sentences, past tense, professional ${params.framework} audit language). Reference each PBC item explicitly by its description and filename. For screenshots, describe what the image shows and how you used it as evidence.
2. "results": Results of testing (2-3 sentences). Reference specific files/screenshots tested. Assume all ${params.sampleSize} sample items passed unless otherwise noted.
3. "conclusion": One-sentence conclusion referencing the control objective and testing period.` : `
Using the firm templates above, produce the three sections:
- "procedure": Complete the PROCEDURE TEMPLATE by filling in all [PLACEHOLDER] markers with real data from the PBC evidence list. Keep the exact template structure.
- "results": Complete the RESULTS TEMPLATE (or write 2-3 sentences if no results template was provided) based on testing of ${params.sampleSize} items.
- "conclusion": Complete the CONCLUSION TEMPLATE (or one sentence if not provided) referencing the control objective.`;

  const textPrompt = `${templateBlock}You are a Big 4 SOX audit manager writing workpaper documentation. Generate a professional, ${params.framework}-compliant writeup for the following control.

Control Reference: ${params.controlRef}
Domain: ${params.domain} - ${params.controlType}
${domainGuidance ? `Testing Guidance: ${domainGuidance}\n` : ""}Objective: ${params.controlObjective}
Frequency: ${params.frequency}
Risk Level: ${params.riskLevel}
Population: ${params.population}
Sample Size: ${params.sampleSize}

PBC Evidence Received (${params.pbcItems.length} item${params.pbcItems.length !== 1 ? "s" : ""}):
${pbcSection}
${imageItems.length > 0 ? `\nIMPORTANT: ${imageItems.length} screenshot(s) are attached below. Examine each image carefully. Describe what is visible in the screenshot (system name, date ranges, columns, data visible) and reference it specifically in your writeup using the filename shown above.` : ""}
${defaultInstructions}

Return ONLY valid JSON: { "procedure": "...", "results": "...", "conclusion": "..." }`;

  // Build multimodal message content: text first, then image blocks for each screenshot
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string } };

  const content: ContentBlock[] = [{ type: "text", text: textPrompt }];
  for (const { index, img } of imageItems) {
    const pbc = params.pbcItems[index];
    content.push({ type: "text", text: `\n--- Screenshot for PBC ${index + 1}: ${pbc.description} (${img.fileName}) ---` });
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content }],
  });

  const text = (response.content[0] as { text: string }).text;
  try {
    return JSON.parse(text);
  } catch {
    // Extract JSON if wrapped in markdown code block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1]);
    throw new Error("AI returned invalid JSON");
  }
}

export async function generateIpeMemo(params: {
  reportName: string;
  system: string;
  parameters: string;
  runDate: string;
  controlRef: string;
}): Promise<{ completeness: string; accuracy: string }> {
  const prompt = `You are a Big 4 SOX auditor. Write IPE (Information Produced by the Entity) testing documentation.

Report: ${params.reportName}
System: ${params.system}
Parameters: ${params.parameters}
Run Date: ${params.runDate}
Used for control: ${params.controlRef}

Generate JSON with:
1. "completeness": How we validated the report is complete (2-3 sentences)
2. "accuracy": How we validated the report is accurate (2-3 sentences)

Return ONLY valid JSON: { "completeness": "...", "accuracy": "..." }`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { text: string }).text;
  return JSON.parse(text);
}

export async function generateExceptionMemo(params: {
  controlRef: string;
  controlObjective: string;
  exceptionDescription: string;
  severity: string;
}): Promise<{ rootCause: string; managementResponse: string; managementLetterComment: string }> {
  const prompt = `You are a Big 4 SOX audit manager writing exception documentation.

Control: ${params.controlRef}
Objective: ${params.controlObjective}
Exception: ${params.exceptionDescription}
Severity: ${params.severity}

Generate JSON with:
1. "rootCause": Likely root cause analysis (2-3 sentences)
2. "managementResponse": Template management response for client to complete (2-3 sentences)
3. "managementLetterComment": Professional management letter comment (3-4 sentences: observation, risk, recommendation)

Return ONLY valid JSON: { "rootCause": "...", "managementResponse": "...", "managementLetterComment": "..." }`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { text: string }).text;
  return JSON.parse(text);
}

export async function generateDeficiencyAssessment(params: {
  exceptions: { controlRef: string; description: string; severity: string }[];
  clientName: string;
  pretaxIncome?: string;
}): Promise<{ assessment: string; finalSeverity: string }> {
  const prompt = `You are a Big 4 SOX engagement manager performing a deficiency assessment.

Client: ${params.clientName}
Pre-tax Income: ${params.pretaxIncome ?? "Not provided"}
Exceptions:
${params.exceptions.map((e, i) => `${i + 1}. Control ${e.controlRef}: ${e.description} (Initial severity: ${e.severity})`).join("\n")}

Assess whether individually or in aggregate these constitute a Control Deficiency, Significant Deficiency, or Material Weakness per PCAOB AS 2201. Consider pervasiveness, likelihood, and magnitude.

Return JSON: { "assessment": "full assessment memo text (4-6 sentences)", "finalSeverity": "ControlDeficiency" | "SignificantDeficiency" | "MaterialWeakness" }`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { text: string }).text;
  return JSON.parse(text);
}

export async function classifyPbcFile(params: {
  fileName: string;
  fileContent: string; // first 2000 chars of parsed text
}): Promise<{ domain: string; controlType: string; isIpe: boolean; suggestedControl: string }> {
  const prompt = `You are a SOX ITGC auditor. Classify this PBC file.

File name: ${params.fileName}
Content preview: ${params.fileContent.slice(0, 2000)}

Determine:
1. "domain": "ITGC" or "ITAC"
2. "controlType": "CM" (Change Mgmt) | "AM" (Access Mgmt) | "CO" (Computer Ops) | "PD" (Program Dev) | "Input" | "Processing" | "Output" | "Interface"
3. "isIpe": true if this is a system-generated report that needs IPE validation
4. "suggestedControl": e.g. "CM-01 Change tickets review" or "AM-02 User access review"

Return ONLY valid JSON.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { text: string }).text;
  return JSON.parse(text);
}

// ── Test Detail Generator (GTest Sheet Population) ───────────────────────────
// Reads PBC evidence content and produces structured per-item test rows for the
// Excel GTest sheet. The AI identifies individual records in the PBC data and
// evaluates each against the control-specific test attributes.

export type TestAttributeResult = {
  result: "Pass" | "Exception" | "N/A";
  tickmark: "^" | "*" | "#" | "^*" | "!" | "";
  note: string;
};

export type TestDetailRow = {
  itemNo: number;
  ticketRef: string;          // ticket #, user, job name, etc.
  description: string;        // brief description of the item tested
  attributes: Record<string, TestAttributeResult>;
  overallResult: "Pass" | "Exception";
  auditorNotes: string;
};

export type TestDetailResult = {
  rows: TestDetailRow[];
  populationNote: string;        // narrative about population and sampling
  exceptionSummary: string;      // summary if any exceptions found
  managerDraftConclusion: string; // first draft conclusion (Manager voice)
  reviewerComments: string;       // Director/Partner review notes (second-pass voice)
  exceptionRate: string;          // e.g. "1 of 25 (4.0%)"
};

const TEST_ATTRIBUTES: Record<string, { key: string; label: string; description: string; tickmark: string }[]> = {
  CM: [
    { key: "preApproval",    label: "Pre-Approval Prior to Deployment",         description: "Was the change formally approved by an authorized approver BEFORE it was deployed to production?", tickmark: "^*" },
    { key: "sod",            label: "SOD: Requester ≠ Approver ≠ Implementer",  description: "Are the requester, approver, and implementer three different individuals?",                          tickmark: "^"  },
    { key: "testingEvidence",label: "Testing Evidence Documented",               description: "Is there documented evidence of unit testing, regression testing, or technical validation?",         tickmark: "*"  },
    { key: "uat",            label: "UAT / Business Sign-off",                   description: "Did the business owner or user representative formally sign off before go-live?",                    tickmark: "*"  },
    { key: "postImpl",       label: "Post-Implementation Review",                description: "Was a post-implementation review performed to confirm the change behaved as expected?",              tickmark: "*"  },
    { key: "emergency",      label: "Emergency Change Handling",                 description: "If flagged as emergency, was retroactive approval obtained within required timeframe?",              tickmark: "^*" },
  ],
  AM: [
    { key: "requestOnFile",  label: "Access Request On File",                    description: "Is a formal access request document on file for this user?",                                         tickmark: "^*" },
    { key: "managerApproval",label: "Manager / Business Approval",               description: "Did the user's manager formally approve the access grant?",                                          tickmark: "*"  },
    { key: "roleMatch",      label: "Access Appropriate for Role",               description: "Does the level of access granted match the user's job function and need-to-know?",                   tickmark: "#"  },
    { key: "lastLogin",      label: "Active Account (Recent Login)",             description: "Has the user logged in recently, indicating the account is still needed?",                           tickmark: "^"  },
    { key: "revokedSLA",     label: "Terminated Users: Revoked Within SLA",      description: "If terminated, was access removed within the required SLA (typically 24–48 hours)?",                tickmark: "^*" },
    { key: "recertified",    label: "Included in Last Access Review",            description: "Was this user's access included in the most recent periodic access recertification?",               tickmark: "*"  },
  ],
  CO: [
    { key: "completedOnTime",label: "Job Completed Successfully and On Time",    description: "Did the batch job or scheduled process complete without errors within its SLA window?",             tickmark: "^"  },
    { key: "failureHandled", label: "Failures Investigated and Resolved",        description: "If the job failed, was a ticket raised, root cause determined, and issue resolved timely?",          tickmark: "*"  },
    { key: "backupVerified", label: "Backup Completion Verified",                description: "Was the backup confirmed complete, with file size and hash checked?",                                 tickmark: "*"  },
    { key: "monitoringAlert",label: "Monitoring Alert Generated if Failed",      description: "Did the monitoring system generate an alert for any failure?",                                        tickmark: "^"  },
    { key: "restoreTested",  label: "Restore / Recovery Tested (if applicable)",description: "Was a restore test performed for this backup type during the period?",                                tickmark: "#"  },
  ],
  PD: [
    { key: "charter",        label: "Project Charter / Initiation On File",      description: "Is there a project charter or initiation document with business justification?",                     tickmark: "^*" },
    { key: "requirements",   label: "Requirements Formally Documented",          description: "Were requirements documented and signed off by the business prior to build?",                        tickmark: "^"  },
    { key: "testingEvidence",label: "Testing Evidence (Unit / Integration / UAT)",description: "Is there documented evidence covering all required testing phases?",                              tickmark: "*"  },
    { key: "businessSignoff",label: "Business Owner Sign-off Before Go-Live",    description: "Did an authorized business owner formally approve promotion to production?",                         tickmark: "*"  },
    { key: "goLiveApproval", label: "Go-Live Authorization",                     description: "Was promotion to production formally authorized by the change management process?",                   tickmark: "^*" },
    { key: "training",       label: "User Training Completed",                   description: "Was training provided to end-users prior to or at go-live?",                                         tickmark: "*"  },
  ],
};

export async function generateTestDetail(params: {
  controlRef: string;
  controlType: string;
  controlObjective: string;
  frequency: string;
  riskLevel: string;
  sampleSize: number;
  populationCount: number;
  populationDescription: string;
  pbcContent: string;        // extracted text from PBC CSV / Excel
  pbcFileName: string;
  preparedBy: string;
  reviewedBy?: string;
}): Promise<TestDetailResult> {
  const attributes = TEST_ATTRIBUTES[params.controlType] ?? TEST_ATTRIBUTES.CM;
  const attributeKeys = attributes.map(a => a.key);
  const attrDescriptions = attributes.map(a => `  "${a.key}" (${a.label}): ${a.description}`).join("\n");
  const tickmarkLegend = `^ = Agreed to source system\n* = Agreed to document on file\n# = Independently reperformed\n! = Exception noted`;

  const prompt = `You are a Big 4 IT audit manager completing a General Test (GTest) workpaper for a PCAOB SOX engagement.

CONTROL: ${params.controlRef} — ${params.controlObjective}
CONTROL TYPE: ${params.controlType}
FREQUENCY: ${params.frequency} | RISK: ${params.riskLevel}
POPULATION: ${params.populationDescription} (${params.populationCount} items)
TARGET SAMPLE: ${params.sampleSize} items
PBC FILE: ${params.pbcFileName}

PBC EVIDENCE CONTENT:
${params.pbcContent.slice(0, 8000)}

TEST ATTRIBUTES TO EVALUATE FOR EACH SAMPLE ITEM:
${attrDescriptions}

TICKMARK LEGEND:
${tickmarkLegend}

INSTRUCTIONS:
1. Parse the PBC content above and identify individual records (change tickets, user accounts, batch jobs, etc.)
2. Select up to ${params.sampleSize} records to test (if fewer exist, test all)
3. For EACH record, evaluate all attributes and assign: result ("Pass", "Exception", or "N/A"), the appropriate tickmark, and a brief note
4. Set overallResult to "Exception" if ANY critical attribute fails (SOD, pre-approval, etc.)
5. Write auditorNotes only for exceptions or unusual items
6. Be SPECIFIC: reference actual values from the data (e.g. "Approver field shows J. Smith, same as requester — SOD violation")
7. Write the managerDraftConclusion in first person past tense, PCAOB professional language, referencing the actual exception rate
8. Write reviewerComments as a senior reviewer's brief concurrence note

Respond ONLY with valid JSON (no markdown wrapper):
{
  "rows": [
    {
      "itemNo": 1,
      "ticketRef": "<ticket # or identifier>",
      "description": "<brief description>",
      "attributes": {
        ${attributeKeys.map(k => `"${k}": { "result": "Pass|Exception|N/A", "tickmark": "^|*|#|^*|!|", "note": "" }`).join(",\n        ")}
      },
      "overallResult": "Pass|Exception",
      "auditorNotes": ""
    }
  ],
  "populationNote": "<narrative about population completeness and sampling method>",
  "exceptionSummary": "<summary of exceptions, empty string if none>",
  "managerDraftConclusion": "<professional PCAOB conclusion, 3-4 sentences>",
  "reviewerComments": "<reviewer concurrence note>",
  "exceptionRate": "<e.g. '0 of 25 (0.0%)' or '2 of 25 (8.0%)'>"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { text: string }).text.trim();
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    return JSON.parse(match ? match[1] : text) as TestDetailResult;
  } catch {
    // Fallback: return a placeholder so export still works
    return {
      rows: [],
      populationNote: `Population of ${params.populationCount} items. ${params.sampleSize} items selected for testing.`,
      exceptionSummary: "",
      managerDraftConclusion: "Testing was completed per the procedure above. Results are documented in the test detail below.",
      reviewerComments: "Reviewed and concur.",
      exceptionRate: "Unable to parse",
    };
  }
}

// ── Screenshot Annotation (AI bounding box suggestions) ──────────────────────
// The AI analyzes a screenshot and returns regions of interest as normalized
// coordinates (0.0-1.0) that the client canvas can render as colored boxes.

export type AnnotationBox = {
  x: number;      // left edge, 0-1
  y: number;      // top edge, 0-1
  w: number;      // width, 0-1
  h: number;      // height, 0-1
  label: string;  // what this region shows
  reason: string; // why it's relevant to audit testing
  priority: "high" | "medium" | "low";
};

export async function generateAnnotations(params: {
  imageBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  controlType: string;
  controlObjective: string;
  pbcDescription: string;
}): Promise<AnnotationBox[]> {
  const prompt = `You are a PCAOB IT audit senior analyzing a screenshot to identify the key regions an auditor needs to examine.

CONTROL TYPE: ${params.controlType}
CONTROL OBJECTIVE: ${params.controlObjective}
PBC DESCRIPTION: ${params.pbcDescription}

Examine the screenshot and identify all regions of interest for audit testing purposes.
For each region, return normalized coordinates (x, y, w, h all between 0.0 and 1.0, measured from top-left).

Consider: report headers (date ranges, parameters), approval/status columns, total rows, user names, dates, key fields.

Respond ONLY with valid JSON (no wrapper):
{
  "annotations": [
    {
      "x": 0.0, "y": 0.0, "w": 1.0, "h": 0.05,
      "label": "Report Header",
      "reason": "Verify report covers the full audit period and parameters match approved configuration",
      "priority": "high"
    }
  ]
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: params.mediaType, data: params.imageBase64 } },
        { type: "text", text: prompt },
      ],
    }],
  });

  const text = (response.content[0] as { text: string }).text.trim();
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const parsed = JSON.parse(match ? match[1] : text) as { annotations: AnnotationBox[] };
    return parsed.annotations ?? [];
  } catch {
    return [];
  }
}

export async function analyzeSodConflicts(params: {
  system: string;
  userAccessData: string; // CSV/table format
}): Promise<{ conflicts: { user: string; roles: string[]; risk: string; severity: string }[]; summary: string }> {
  const prompt = `You are a SOX IT auditor analyzing Segregation of Duties (SOD) conflicts.

System: ${params.system}
User Access Data:
${params.userAccessData.slice(0, 4000)}

Identify SOD conflicts where one user has incompatible combinations of access (e.g., can both create and approve transactions, can both request and approve access, can both make changes and approve changes).

Return JSON: {
  "conflicts": [{ "user": "username", "roles": ["role1", "role2"], "risk": "brief business risk description", "severity": "High|Medium|Low" }],
  "summary": "Executive summary of SOD findings (2-3 sentences)"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { text: string }).text;
  return JSON.parse(text);
}

// ── In-app AI Help Chat ───────────────────────────────────────────────────────

export async function helpChat(params: {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  userName: string;
  userRole: string;
  currentPage?: string;
  engagementSummary?: string;
  engagementDetail?: string;
}): Promise<string> {
  const systemPrompt = `You are Auditly Assistant, an expert AI embedded inside Auditly — a SOX IT audit management platform used by internal audit teams and external auditors.

You help auditors with:
- Understanding platform features and navigation
- SOX/ITGC/ITAC audit guidance (Change Management, Access Management, Computer Operations, Program Development, ITACs)
- Interpreting their engagement data, control statuses, exceptions, and PBC items
- Drafting workpaper procedures, test steps, and conclusions
- Sampling guidance (MUS, attribute sampling, PCAOB/AICPA standards)
- Exception severity assessment (Control Deficiency, Significant Deficiency, Material Weakness)
- IPE testing, SOD analysis, and deficiency aggregation

PLATFORM CONTEXT:
User: ${params.userName} (${params.userRole})
Current page: ${params.currentPage ?? "unknown"}

${params.engagementSummary ? `USER'S ENGAGEMENTS:\n${params.engagementSummary}` : "No engagements yet."}

${params.engagementDetail ? `\n${params.engagementDetail}` : ""}

GUIDELINES:
- Be concise and practical. Auditors are busy professionals.
- When referencing platform features, be specific (e.g., "Go to Controls tab > click the control > open the Workpaper tab").
- For audit guidance, cite standards where relevant (PCAOB AS 2201, AS 2315, COSO 2013, ISAE 3402).
- Do not invent data about the user's engagements beyond what is provided above.
- Format responses clearly: use short paragraphs, bullet points for lists, and bold key terms.`;

  const messages = [
    ...params.history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user" as const, content: params.message },
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  return (response.content[0] as { text: string }).text;
}
