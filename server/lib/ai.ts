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
}): Promise<{ procedure: string; results: string; conclusion: string }> {
  const domainGuidance = DOMAIN_GUIDANCE[params.controlType] ?? "";

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

  const textPrompt = `You are a Big 4 SOX audit manager writing workpaper documentation. Generate a professional, ${params.framework}-compliant writeup for the following control.

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

Generate three sections in JSON format:
1. "procedure": Testing procedure performed (3-5 sentences, past tense, professional PCAOB audit language). Reference each PBC item explicitly by its description and filename. For screenshots, describe what the image shows and how you used it as evidence.
2. "results": Results of testing (2-3 sentences). Reference specific files/screenshots tested. Assume all ${params.sampleSize} sample items passed unless otherwise noted.
3. "conclusion": One-sentence conclusion referencing the control objective and testing period.

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
