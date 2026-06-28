import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Plus, ClipboardList, ChevronRight, Zap, X, CheckCircle, Trash2, PlusCircle, Search, Shield, AlertTriangle, Clock3 } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ── Status / risk display helpers ─────────────────────────────────────────

const DOMAIN_COLORS: Record<string, { bg: string; color: string }> = {
  CM: { bg: "#EBF3FB", color: "#2E86DE" },
  AM: { bg: "#FFF8E6", color: "#F39C12" },
  CO: { bg: "#EAFAF1", color: "#27AE60" },
  PD: { bg: "#F5EEF8", color: "#8E44AD" },
  Input: { bg: "#EBF3FB", color: "#2E86DE" },
  Processing: { bg: "#FFF8E6", color: "#F39C12" },
  Output: { bg: "#EAFAF1", color: "#27AE60" },
  Interface: { bg: "#F5EEF8", color: "#8E44AD" },
};

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  NotStarted:  { color: "#95A5A6", bg: "#F2F3F4", label: "Not Started" },
  InProgress:  { color: "#F39C12", bg: "#FFF8E6", label: "In Progress" },
  UnderReview: { color: "#8E44AD", bg: "#F5EEF8", label: "Under Review" },
  Complete:    { color: "#27AE60", bg: "#EAFAF1", label: "Complete" },
  Exception:   { color: "#E74C3C", bg: "#FDEDEC", label: "Exception" },
};

const RISK_COLORS: Record<string, string> = { High: "#E74C3C", Medium: "#F39C12", Low: "#27AE60" };

// ── Per-type PCAOB templates ───────────────────────────────────────────────

type PbcTemplate = { description: string; isIpe: boolean };

type ControlTemplate = {
  domain: "ITGC" | "ITAC";
  code: string;
  label: string;
  fullLabel: string;
  color: string;
  bg: string;
  defaultFrequency: string;
  defaultRisk: "High" | "Medium" | "Low";
  refPrefix: string;
  description: string;
  objectiveSuggestions: string[];
  pbcTemplates: PbcTemplate[];
  sampleGuidance: string;
};

const TEMPLATES: Record<string, ControlTemplate> = {
  CM: {
    domain: "ITGC", code: "CM", label: "Change Management", fullLabel: "ITGC — Change Management",
    color: "#2E86DE", bg: "#EBF3FB", defaultFrequency: "Continuous", defaultRisk: "High",
    refPrefix: "CM-",
    description: "Controls over the process of requesting, approving, testing, and implementing changes to in-scope systems.",
    objectiveSuggestions: [
      "Changes to production systems are authorized, tested, and approved prior to implementation.",
      "Emergency changes to production are documented, authorized, and reviewed after-the-fact by an appropriate level of management.",
      "The segregation of duties between change requestors, approvers, and implementers is maintained.",
    ],
    sampleGuidance: "PCAOB: Select 25 change tickets for continuous controls. Inspect approval chain, testing documentation, and implementer segregation for each.",
    pbcTemplates: [
      { description: "Complete change ticket log for the audit period (all change requests, approvals, and implementations)", isIpe: true },
      { description: "Emergency change log for the audit period with post-implementation approval documentation", isIpe: false },
      { description: "Change management policy / SDLC policy document (most recent version)", isIpe: false },
      { description: "Sample change tickets (25 items to be selected by auditor) with approval emails and testing sign-off", isIpe: false },
      { description: "Production access list showing separation between requestors, approvers, and implementers", isIpe: true },
    ],
  },
  AM: {
    domain: "ITGC", code: "AM", label: "Access Management", fullLabel: "ITGC — Access Management",
    color: "#F39C12", bg: "#FFF8E6", defaultFrequency: "Quarterly", defaultRisk: "High",
    refPrefix: "AM-",
    description: "Controls over the provisioning, deprovisioning, and periodic review of user access to in-scope systems.",
    objectiveSuggestions: [
      "User access to in-scope systems is provisioned based on job responsibilities and approved by management prior to access being granted.",
      "Access for terminated or transferred employees is removed timely upon separation or role change.",
      "User access is reviewed quarterly to ensure appropriateness; inappropriate access is removed promptly.",
      "Privileged and administrative access is restricted to authorized IT personnel and reviewed periodically.",
    ],
    sampleGuidance: "PCAOB: Select 25 provisioning events and 25 terminations for continuous controls. For quarterly UAR, inspect most recent review sign-off and remediation evidence.",
    pbcTemplates: [
      { description: "Active user list export from system (all users with access as of period end, including role/privilege level)", isIpe: true },
      { description: "User provisioning log for the audit period (new access granted with approval documentation)", isIpe: true },
      { description: "Terminated employee list from HR for the audit period with termination dates", isIpe: false },
      { description: "User deprovisioning evidence for terminated employees (tickets, confirmation of access removal)", isIpe: false },
      { description: "Quarterly user access review (UAR) sign-off documentation for all in-scope reviews during the period", isIpe: false },
      { description: "Privileged / admin user list with business justification for each account", isIpe: true },
    ],
  },
  CO: {
    domain: "ITGC", code: "CO", label: "Computer Operations", fullLabel: "ITGC — Computer Operations",
    color: "#27AE60", bg: "#EAFAF1", defaultFrequency: "Daily", defaultRisk: "Medium",
    refPrefix: "CO-",
    description: "Controls over the ongoing operation of IT systems including backups, job scheduling, and incident management.",
    objectiveSuggestions: [
      "System and data backups are performed per defined schedule and restore tests are conducted to confirm recoverability.",
      "Batch jobs and scheduled processes complete successfully; exceptions are detected, investigated, and resolved timely.",
      "System incidents and outages are logged, escalated, and resolved in accordance with defined SLAs.",
    ],
    sampleGuidance: "PCAOB: For daily controls select 25 instances (job logs, backup confirmations). Inspect exception handling for any failures noted during the period.",
    pbcTemplates: [
      { description: "Backup completion logs for the audit period (scheduled backups with success/failure status)", isIpe: true },
      { description: "Backup restore test documentation (most recent test with results and sign-off)", isIpe: false },
      { description: "Job scheduler output / batch job completion log for the audit period", isIpe: true },
      { description: "Incident / ticket log for the period (system failures, outages with resolution documentation)", isIpe: true },
      { description: "System monitoring configuration showing alert thresholds and escalation procedures", isIpe: false },
    ],
  },
  PD: {
    domain: "ITGC", code: "PD", label: "Program Development", fullLabel: "ITGC — Program Development",
    color: "#8E44AD", bg: "#F5EEF8", defaultFrequency: "Annual", defaultRisk: "Medium",
    refPrefix: "PD-",
    description: "Controls over the system development lifecycle (SDLC) including design, testing, and approval before go-live.",
    objectiveSuggestions: [
      "System development and implementation follows a defined SDLC methodology with appropriate approvals at each gate.",
      "New systems and significant changes undergo unit testing, integration testing, and user acceptance testing (UAT) prior to go-live.",
      "Business and IT management sign off on new implementations before promotion to production.",
    ],
    sampleGuidance: "PCAOB: Select all major implementations during the period (typically 1-5). Inspect full SDLC documentation including design, testing, and approval sign-offs.",
    pbcTemplates: [
      { description: "SDLC / system development policy document (most recent version)", isIpe: false },
      { description: "List of all new system implementations and significant upgrades during the audit period", isIpe: false },
      { description: "Project documentation for selected implementations (requirements, design, UAT plan and results)", isIpe: false },
      { description: "Business owner and IT sign-off documentation for go-live approvals", isIpe: false },
      { description: "Evidence of testing (unit, integration, and UAT test scripts with results and sign-off)", isIpe: false },
    ],
  },
  Input: {
    domain: "ITAC", code: "Input", label: "Input Controls", fullLabel: "ITAC — Input Controls",
    color: "#2E86DE", bg: "#EBF3FB", defaultFrequency: "Continuous", defaultRisk: "High",
    refPrefix: "ITAC-IN-",
    description: "Automated controls validating that data entered into the application is complete, accurate, and authorized.",
    objectiveSuggestions: [
      "The system enforces input validation rules to prevent invalid, incomplete, or unauthorized data from being entered or processed.",
      "Rejected or errored transactions are logged, reported, and resolved timely to ensure completeness of processing.",
      "Interface files received from upstream systems are validated for completeness and accuracy before processing.",
    ],
    sampleGuidance: "PCAOB: Inspect system configuration screenshots. Test edit checks by examining error logs and reconcile rejected transactions to resolutions.",
    pbcTemplates: [
      { description: "System configuration screenshots showing input validation rules and edit checks (field formats, mandatory fields, range checks)", isIpe: false },
      { description: "Error / rejected transaction log for the audit period showing validation failures and resolutions", isIpe: true },
      { description: "Sample rejected transactions with evidence of investigation and correction (25 items)", isIpe: false },
      { description: "Interface file reconciliation report showing input counts matched to upstream source", isIpe: true },
    ],
  },
  Processing: {
    domain: "ITAC", code: "Processing", label: "Processing Controls", fullLabel: "ITAC — Processing Controls",
    color: "#F39C12", bg: "#FFF8E6", defaultFrequency: "Continuous", defaultRisk: "High",
    refPrefix: "ITAC-PR-",
    description: "Automated controls ensuring that data is processed accurately, completely, and in accordance with business rules.",
    objectiveSuggestions: [
      "The system performs automated calculations accurately in accordance with documented business rules and formulas.",
      "Processing exceptions are identified, reported, and investigated timely to ensure all transactions are processed completely.",
      "Re-processed or corrected transactions are subject to the same controls as original transactions.",
    ],
    sampleGuidance: "PCAOB: Obtain the calculation basis documentation. Re-perform calculations on a sample of transactions and agree to system output. Inspect exception reports.",
    pbcTemplates: [
      { description: "Calculation basis documentation / business rules specification for automated processing", isIpe: false },
      { description: "Processing exception / error report for the audit period with resolution evidence", isIpe: true },
      { description: "Sample of processed transactions (25 items) with supporting source data for recalculation testing", isIpe: false },
      { description: "Reconciliation of total transactions processed to control totals / source records for the period", isIpe: true },
    ],
  },
  Output: {
    domain: "ITAC", code: "Output", label: "Output Controls", fullLabel: "ITAC — Output Controls",
    color: "#27AE60", bg: "#EAFAF1", defaultFrequency: "Monthly", defaultRisk: "Medium",
    refPrefix: "ITAC-OUT-",
    description: "Controls ensuring system-generated reports and outputs are complete, accurate, and distributed to authorized recipients.",
    objectiveSuggestions: [
      "System-generated reports used in financial reporting are complete and accurate, with output reconciled to source data.",
      "Access to generate and receive reports is restricted to authorized personnel.",
      "Reports are distributed timely and only to authorized recipients in accordance with defined procedures.",
    ],
    sampleGuidance: "PCAOB: Inspect distribution access controls. Reconcile report output to source data for key reports. Test report completeness using control totals.",
    pbcTemplates: [
      { description: "Distribution list / access control list for key reports (who can generate and receive)", isIpe: false },
      { description: "Sample of key reports used in financial reporting with evidence of review and distribution", isIpe: false },
      { description: "Output reconciliation documentation showing agreement of report totals to source system", isIpe: true },
      { description: "Report generation log / timestamp showing timely production and delivery", isIpe: true },
    ],
  },
  Interface: {
    domain: "ITAC", code: "Interface", label: "Interface Controls", fullLabel: "ITAC — Interface Controls",
    color: "#8E44AD", bg: "#F5EEF8", defaultFrequency: "Daily", defaultRisk: "High",
    refPrefix: "ITAC-IF-",
    description: "Controls over the transmission of data between systems to ensure completeness, accuracy, and timely processing.",
    objectiveSuggestions: [
      "Data transmitted between in-scope systems via automated interfaces is complete and accurate, with transmission reconciled to source records.",
      "Interface errors and failed transmissions are detected, logged, and resolved timely to prevent data loss or corruption.",
      "Interface configurations are restricted to authorized personnel and changes are subject to change management controls.",
    ],
    sampleGuidance: "PCAOB: Obtain interface monitoring logs. Reconcile record counts and amounts from source to destination. Inspect exception log and resolution evidence.",
    pbcTemplates: [
      { description: "Interface monitoring / transmission log for the audit period (record counts, timestamps, success/failure)", isIpe: true },
      { description: "Interface error / exception log with evidence of investigation and resolution for each failure", isIpe: false },
      { description: "Reconciliation of records transmitted vs. records received by destination system (counts and amounts)", isIpe: true },
      { description: "Interface mapping / configuration documentation showing data elements and transformation rules", isIpe: false },
    ],
  },
};

// ── Wizard ─────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

function CreateControlWizard({ engagementId, onClose, onCreated }: { engagementId: string; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [form, setForm] = useState({ controlRef: "", objective: "", frequency: "", riskLevel: "Medium" as "High" | "Medium" | "Low", description: "" });
  const [pbcList, setPbcList] = useState<PbcTemplate[]>([]);
  const [newPbc, setNewPbc] = useState("");

  const createWithPbc = trpc.controls.createWithPbc.useMutation({ onSuccess: () => { onCreated(); onClose(); } });

  const tmpl = selectedType ? TEMPLATES[selectedType] : null;

  const selectType = (key: string) => {
    const t = TEMPLATES[key];
    setSelectedType(key);
    setForm({ controlRef: t.refPrefix, objective: t.objectiveSuggestions[0], frequency: t.defaultFrequency, riskLevel: t.defaultRisk, description: "" });
    setPbcList(t.pbcTemplates.map(p => ({ ...p })));
    setStep(2);
  };

  const submit = () => {
    if (!tmpl) return;
    createWithPbc.mutate({
      engagementId,
      domain: tmpl.domain,
      itgcType: tmpl.domain === "ITGC" ? tmpl.code as "CM" | "AM" | "CO" | "PD" : undefined,
      itacType: tmpl.domain === "ITAC" ? tmpl.code as "Input" | "Processing" | "Output" | "Interface" : undefined,
      controlRef: form.controlRef,
      objective: form.objective,
      description: form.description || undefined,
      frequency: form.frequency as "Annual" | "SemiAnnual" | "Quarterly" | "Monthly" | "Daily" | "Continuous",
      riskLevel: form.riskLevel,
      pbcRequests: pbcList.filter(p => p.description.trim()),
    });
  };

  const ITGC_TYPES = ["CM", "AM", "CO", "PD"];
  const ITAC_TYPES = ["Input", "Processing", "Output", "Interface"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, boxShadow: "0 24px 80px rgba(0,0,0,0.25)", overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0 }}>Add Control</h2>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, margin: "3px 0 0" }}>
              Step {step} of 3 — {step === 1 ? "Select control type" : step === 2 ? "Configure details" : "Review PBC requests"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Step indicators */}
            <div style={{ display: "flex", gap: 6 }}>
              {([1, 2, 3] as WizardStep[]).map(s => (
                <div key={s} style={{ width: 8, height: 8, borderRadius: "50%", background: s <= step ? "#D4AF37" : "rgba(255,255,255,0.25)", transition: "background 0.2s" }} />
              ))}
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={14} color="#fff" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ overflowY: "auto", flex: 1 }}>

          {/* STEP 1: Type picker */}
          {step === 1 && (
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>IT General Controls (ITGC)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {ITGC_TYPES.map(key => {
                    const t = TEMPLATES[key];
                    return (
                      <button key={key} onClick={() => selectType(key)}
                        style={{ textAlign: "left", background: "#fff", border: `2px solid ${t.bg}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = t.color; (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 3px ${t.bg}`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.bg; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <span style={{ width: 32, height: 32, borderRadius: 8, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: t.color, flexShrink: 0 }}>{key}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>{t.label}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>{t.description}</p>
                        <div style={{ marginTop: 10, fontSize: 11, color: t.color, fontWeight: 600 }}>
                          {t.pbcTemplates.length} PBC templates · {t.defaultFrequency} · {t.defaultRisk} risk
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>IT Application Controls (ITAC)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {ITAC_TYPES.map(key => {
                    const t = TEMPLATES[key];
                    return (
                      <button key={key} onClick={() => selectType(key)}
                        style={{ textAlign: "left", background: "#fff", border: `2px solid ${t.bg}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = t.color; (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 3px ${t.bg}`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.bg; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <span style={{ width: 32, height: 32, borderRadius: 8, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: t.color, flexShrink: 0 }}>{key.slice(0, 3)}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>{t.label}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>{t.description}</p>
                        <div style={{ marginTop: 10, fontSize: 11, color: t.color, fontWeight: 600 }}>
                          {t.pbcTemplates.length} PBC templates · {t.defaultFrequency} · {t.defaultRisk} risk
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Configure */}
          {step === 2 && tmpl && (
            <div style={{ padding: 24 }}>
              <div style={{ background: tmpl.bg, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: tmpl.color, flexShrink: 0 }}>{tmpl.code}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: tmpl.color }}>{tmpl.fullLabel}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{tmpl.sampleGuidance}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Control Ref *</label>
                  <input value={form.controlRef} onChange={e => setForm(f => ({ ...f, controlRef: e.target.value }))} placeholder={`e.g. ${tmpl.refPrefix}01`} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Frequency</label>
                  <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} style={inp}>
                    {["Annual", "SemiAnnual", "Quarterly", "Monthly", "Daily", "Continuous"].map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Risk Level</label>
                  <select value={form.riskLevel} onChange={e => setForm(f => ({ ...f, riskLevel: e.target.value as "High" | "Medium" | "Low" }))} style={inp}>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Control Objective *</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {tmpl.objectiveSuggestions.map((s, i) => (
                    <button key={i} onClick={() => setForm(f => ({ ...f, objective: s }))}
                      style={{ textAlign: "left", background: form.objective === s ? tmpl.bg : "var(--surface-alt)", border: `1px solid ${form.objective === s ? tmpl.color : "var(--border)"}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "var(--text)", cursor: "pointer", lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${form.objective === s ? tmpl.color : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                        {form.objective === s && <span style={{ width: 8, height: 8, borderRadius: "50%", background: tmpl.color }} />}
                      </span>
                      {s}
                    </button>
                  ))}
                </div>
                <textarea value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} rows={3}
                  placeholder="Or type a custom objective..."
                  style={{ ...inp, height: "auto", padding: "10px 12px", resize: "vertical", fontSize: 12 }} />
              </div>

              <div>
                <label style={lbl}>Description (optional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  placeholder="Additional details about how this control operates..."
                  style={{ ...inp, height: "auto", padding: "10px 12px", resize: "vertical", fontSize: 12 }} />
              </div>
            </div>
          )}

          {/* STEP 3: PBC requests */}
          {step === 3 && tmpl && (
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.6 }}>
                These PBC items will be created as <strong>Requested</strong> in the PBC Tracker when the control is saved.
                Remove any that don't apply, add your own, or keep them all.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {pbcList.map((pbc, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "var(--surface-alt)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--border)" }}>
                    <div style={{ flex: 1 }}>
                      <textarea
                        value={pbc.description}
                        onChange={e => setPbcList(l => l.map((p, j) => j === i ? { ...p, description: e.target.value } : p))}
                        rows={2}
                        style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 12, resize: "none", fontFamily: "inherit", background: "#fff" }}
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)", marginTop: 5, cursor: "pointer" }}>
                        <input type="checkbox" checked={pbc.isIpe} onChange={e => setPbcList(l => l.map((p, j) => j === i ? { ...p, isIpe: e.target.checked } : p))} />
                        Mark as IPE (system-generated report requiring IPE validation)
                      </label>
                    </div>
                    <button onClick={() => setPbcList(l => l.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input value={newPbc} onChange={e => setNewPbc(e.target.value)} placeholder="Add a custom PBC request..."
                  style={{ ...inp, flex: 1 }}
                  onKeyDown={e => { if (e.key === "Enter" && newPbc.trim()) { setPbcList(l => [...l, { description: newPbc.trim(), isIpe: false }]); setNewPbc(""); } }} />
                <button onClick={() => { if (newPbc.trim()) { setPbcList(l => [...l, { description: newPbc.trim(), isIpe: false }]); setNewPbc(""); } }}
                  style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <PlusCircle size={13} /> Add
                </button>
              </div>

              {/* Summary */}
              <div style={{ marginTop: 20, background: "var(--surface-alt)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)", marginBottom: 8 }}>Summary</div>
                <div style={{ display: "flex", gap: 20, fontSize: 12, color: "var(--text-muted)" }}>
                  <div><strong style={{ color: tmpl.color }}>{form.controlRef}</strong> · {tmpl.fullLabel}</div>
                  <div>{form.frequency} · {form.riskLevel} risk</div>
                  <div>{pbcList.length} PBC items</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "var(--surface-alt)" }}>
          <button onClick={() => step === 1 ? onClose() : setStep(s => (s - 1) as WizardStep)}
            style={{ ...btnSecondary, fontSize: 13 }}>
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 && (
            <button onClick={() => setStep(s => (s + 1) as WizardStep)}
              disabled={step === 2 && (!form.controlRef || !form.objective)}
              style={{ ...btnPrimary, opacity: step === 2 && (!form.controlRef || !form.objective) ? 0.5 : 1 }}>
              Continue
            </button>
          )}
          {step === 3 && (
            <button onClick={submit} disabled={createWithPbc.isPending}
              style={{ ...btnPrimary, background: "#27AE60", display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle size={14} />
              {createWithPbc.isPending ? "Creating..." : `Create Control + ${pbcList.length} PBC Requests`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  CM: "Change Mgmt", AM: "Access Mgmt", CO: "Computer Ops", PD: "Program Dev",
  Input: "Input", Processing: "Processing", Output: "Output", Interface: "Interface",
};

export default function ControlsPage() {
  const [, params] = useRoute("/engagements/:id/controls");
  const engagementId = params?.id ?? "";
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<"all" | "ITGC" | "ITAC">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");

  const { data: controls, refetch } = trpc.controls.listByEngagement.useQuery({ engagementId });
  const seedControls = trpc.controls.seedStandardControls.useMutation({ onSuccess: () => refetch() });

  const all = controls ?? [];

  const filtered = useMemo(() => all.filter(c => {
    if (domainFilter !== "all" && c.domain !== domainFilter) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (riskFilter !== "all" && c.riskLevel !== riskFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.controlRef.toLowerCase().includes(q) || c.objective.toLowerCase().includes(q);
    }
    return true;
  }), [all, domainFilter, statusFilter, riskFilter, search]);

  const counts = useMemo(() => ({
    total: all.length,
    notStarted: all.filter(c => c.status === "NotStarted").length,
    inProgress: all.filter(c => c.status === "InProgress").length,
    complete: all.filter(c => c.status === "Complete").length,
    exception: all.filter(c => c.status === "Exception").length,
    itgc: all.filter(c => c.domain === "ITGC").length,
    itac: all.filter(c => c.domain === "ITAC").length,
  }), [all]);

  const completePct = counts.total > 0 ? Math.round((counts.complete / counts.total) * 100) : 0;

  const clearFilters = () => { setSearch(""); setDomainFilter("all"); setStatusFilter("all"); setRiskFilter("all"); };
  const hasFilters = search || domainFilter !== "all" || statusFilter !== "all" || riskFilter !== "all";

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Back link */}
      <Link href={`/engagements/${engagementId}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)", textDecoration: "none", marginBottom: 18, fontWeight: 500 }}>
          <ArrowLeft size={13} /> Back to Engagement
        </a>
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0, letterSpacing: "-0.3px" }}>Controls</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            {counts.itgc} ITGC · {counts.itac} ITAC
            {filtered.length !== all.length && ` · ${filtered.length} matching`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!all.length && (
            <button onClick={() => seedControls.mutate({ engagementId })} disabled={seedControls.isPending}
              style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", fontSize: 13 }}>
              <Zap size={13} /> {seedControls.isPending ? "Seeding..." : "Seed Standard Controls"}
            </button>
          )}
          <button onClick={() => setShowCreate(true)} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Plus size={14} /> Add Control
          </button>
        </div>
      </div>

      {/* Progress + stats summary */}
      {all.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 24 }}>
          {/* Progress bar */}
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>Completion</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: completePct === 100 ? "#27AE60" : "var(--text-strong)" }}>{completePct}%</span>
            </div>
            <div style={{ height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${completePct}%`, background: completePct === 100 ? "#27AE60" : "var(--accent)", borderRadius: 3, transition: "width 0.4s" }} />
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: "var(--border)" }} />
          {[
            { label: "Not Started", value: counts.notStarted, color: "#95A5A6" },
            { label: "In Progress", value: counts.inProgress, color: "#F39C12" },
            { label: "Complete",    value: counts.complete,   color: "#27AE60" },
            { label: "Exception",   value: counts.exception,  color: "#E74C3C" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: "center", cursor: "pointer" }} onClick={() => setStatusFilter(statusFilter === label.replace(" ","") ? "all" : label.replace(" ",""))}>
              <div style={{ fontSize: 18, fontWeight: 700, color: value > 0 ? color : "#CBD5E1", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, whiteSpace: "nowrap" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ref or objective..."
            style={{ paddingLeft: 30, paddingRight: 12, height: 34, border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, outline: "none", width: 220, background: "#F8FAFC", color: "var(--text)" }} />
        </div>

        <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

        {/* Domain tabs */}
        {(["all", "ITGC", "ITAC"] as const).map(f => (
          <button key={f} onClick={() => setDomainFilter(f)}
            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.12s",
              background: domainFilter === f ? "var(--navy)" : "transparent",
              color: domainFilter === f ? "#fff" : "var(--text-muted)",
              borderColor: domainFilter === f ? "var(--navy)" : "transparent" }}>
            {f === "all" ? "All domains" : f}
            {f !== "all" && <span style={{ marginLeft: 4, opacity: 0.65, fontSize: 11 }}>{f === "ITGC" ? counts.itgc : counts.itac}</span>}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

        {/* Status select */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ height: 34, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 12, background: "#F8FAFC", color: "var(--text)", outline: "none" }}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        {/* Risk select */}
        <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
          style={{ height: 34, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 12, background: "#F8FAFC", color: "var(--text)", outline: "none" }}>
          <option value="all">All risk levels</option>
          <option value="High">High risk</option>
          <option value="Medium">Medium risk</option>
          <option value="Low">Low risk</option>
        </select>

        {hasFilters && (
          <button onClick={clearFilters} style={{ marginLeft: "auto", fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Controls table */}
      {all.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--border)", padding: "56px 40px", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <ClipboardList size={22} color="#CBD5E1" />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 8px" }}>No controls yet</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px" }}>Add controls manually or seed the standard ITGC set to get started.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => seedControls.mutate({ engagementId })} disabled={seedControls.isPending}
              style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)" }}>
              <Zap size={13} /> Seed Standard Controls
            </button>
            <button onClick={() => setShowCreate(true)} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={13} /> Add Control
            </button>
          </div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 90px 90px 90px 110px 36px", padding: "8px 16px", background: "#F8FAFC", borderBottom: "1px solid var(--border)" }}>
            {["Ref", "Control Objective", "Domain", "Risk", "Frequency", "Status", ""].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No controls match your filters.{" "}
              <button onClick={clearFilters} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Clear</button>
            </div>
          ) : (
            filtered.map((ctrl, i) => {
              const sc = STATUS_COLORS[ctrl.status] ?? STATUS_COLORS.NotStarted;
              const typeKey = ctrl.itgcType ?? ctrl.itacType ?? "";
              const dc = DOMAIN_COLORS[typeKey] ?? { bg: "#F1F5F9", color: "#64748B" };
              return (
                <Link key={ctrl.id} href={`/engagements/${engagementId}/controls/${ctrl.id}`}>
                  <a style={{ display: "grid", gridTemplateColumns: "80px 1fr 90px 90px 90px 110px 36px", alignItems: "center", padding: "12px 16px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none", transition: "background 0.1s", cursor: "pointer" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    {/* Ref */}
                    <div>
                      <span style={{ padding: "3px 8px", borderRadius: 5, background: dc.bg, color: dc.color, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                        {ctrl.controlRef}
                      </span>
                    </div>
                    {/* Objective */}
                    <div style={{ fontSize: 13, color: "var(--text-strong)", fontWeight: 500, paddingRight: 16, overflow: "hidden" }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ctrl.objective}
                      </div>
                    </div>
                    {/* Domain */}
                    <div style={{ fontSize: 11, color: dc.color, fontWeight: 600 }}>
                      <span>{ctrl.domain}</span>
                      {typeKey && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{TYPE_LABELS[typeKey]}</div>}
                    </div>
                    {/* Risk */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: RISK_COLORS[ctrl.riskLevel] ?? "#888" }}>
                      {ctrl.riskLevel}
                    </div>
                    {/* Frequency */}
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{ctrl.frequency}</div>
                    {/* Status */}
                    <div>
                      <span style={{ padding: "3px 9px", borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{sc.label}</span>
                    </div>
                    {/* Arrow */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <ChevronRight size={14} color="#CBD5E1" />
                    </div>
                  </a>
                </Link>
              );
            })
          )}
        </div>
      )}

      {showCreate && <CreateControlWizard engagementId={engagementId} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 13, background: "#fff" };
const btnPrimary: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
