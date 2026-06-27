import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateWorkpaperWriteup(params: {
  controlRef: string;
  controlObjective: string;
  domain: string;
  controlType: string;
  frequency: string;
  riskLevel: string;
  population: string;
  sampleSize: number;
  pbcDescription: string;
  framework: string;
}): Promise<{ procedure: string; results: string; conclusion: string }> {
  const prompt = `You are a Big 4 SOX audit manager writing workpaper documentation. Generate a professional, ${params.framework}-compliant writeup for the following control.

Control Reference: ${params.controlRef}
Domain: ${params.domain} - ${params.controlType}
Objective: ${params.controlObjective}
Frequency: ${params.frequency}
Risk Level: ${params.riskLevel}
Population: ${params.population}
Sample Size: ${params.sampleSize}
PBC Evidence Received: ${params.pbcDescription}
Framework: ${params.framework}

Generate three sections in JSON format:
1. "procedure": Testing procedure performed (2-4 sentences, past tense, professional audit language)
2. "results": Results of testing (2-3 sentences describing what was found in the sample, assume all pass unless told otherwise)
3. "conclusion": One-sentence conclusion (Pass / No exceptions noted)

Return ONLY valid JSON: { "procedure": "...", "results": "...", "conclusion": "..." }`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { text: string }).text;
  return JSON.parse(text);
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
