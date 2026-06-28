import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Plus, FileCheck2, Clock, CheckCircle, XCircle, AlertCircle, Upload, Share2, Copy, Check, ExternalLink, Mail, Send, Paperclip, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format, differenceInDays } from "date-fns";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  Requested:   { label: "Requested",    color: "#F39C12", bg: "#FFF8E6", icon: Clock },
  Received:    { label: "Received",     color: "#2E86DE", bg: "#EBF3FB", icon: Upload },
  Accepted:    { label: "Accepted",     color: "#27AE60", bg: "#EAFAF1", icon: CheckCircle },
  Rejected:    { label: "Rejected",     color: "#E74C3C", bg: "#FDEDEC", icon: XCircle },
  NotRequired: { label: "Not Required", color: "#95A5A6", bg: "#F2F3F4", icon: AlertCircle },
};

function AddPbcModal({ engagementId, onClose, onCreated }: { engagementId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ description: "", dueDate: "", isIpe: false, controlRef: "" });
  const create = trpc.pbc.create.useMutation({ onSuccess: () => { onCreated(); onClose(); } });
  const { data: controls } = trpc.controls.listByEngagement.useQuery({ engagementId });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "20px 24px" }}>
          <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0 }}>Request PBC Item</h2>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={lbl}>Description *</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. User access report for Active Directory as of 12/31/2024" style={inp} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={lbl}>Linked Control</label>
                <select value={form.controlRef} onChange={e => setForm(f => ({ ...f, controlRef: e.target.value }))} style={inp}>
                  <option value="">Not linked</option>
                  {controls?.map(c => <option key={c.id} value={c.id}>{c.controlRef}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" id="isIpe" checked={form.isIpe} onChange={e => setForm(f => ({ ...f, isIpe: e.target.checked }))} style={{ width: 16, height: 16 }} />
              <label htmlFor="isIpe" style={{ fontSize: 13, color: "var(--text)", cursor: "pointer" }}>This item will also be tested as an IPE</label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button onClick={onClose} style={btnSec}>Cancel</button>
            <button onClick={() => create.mutate({ engagementId, description: form.description, controlId: form.controlRef || undefined, dueDate: form.dueDate ? new Date(form.dueDate) : undefined, isIpe: form.isIpe })}
              disabled={!form.description || create.isPending}
              style={{ ...btnPri, opacity: !form.description ? 0.5 : 1 }}>
              {create.isPending ? "Adding..." : "Add PBC Request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SharePortalModal({ engagementId, onClose }: { engagementId: string; onClose: () => void }) {
  const [form, setForm] = useState({ clientName: "", clientEmail: "", expiryDays: "14" });
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: existing, refetch: refetchLinks } = trpc.portal.listByEngagement.useQuery({ engagementId });
  const createLink = trpc.portal.createLink.useMutation({
    onSuccess: (data) => {
      setGeneratedUrl(data.portalUrl);
      refetchLinks();
    },
  });
  const revokeLink = trpc.portal.revoke.useMutation({ onSuccess: () => refetchLinks() });

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeLinks = (existing ?? []).filter(l => l.isActive);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.22)" }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Share2 size={16} color="#fff" />
              </div>
              <div>
                <h2 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>Client Portal Link</h2>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, margin: 0, marginTop: 1 }}>Send clients a secure link to upload PBC documents</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, color: "#fff", width: 28, height: 28, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {!generatedUrl ? (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 14px" }}>Generate New Portal Link</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                <div>
                  <label style={lbl}>Client Name *</label>
                  <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                    placeholder="e.g. Acme Corp" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Client Email (optional)</label>
                  <input value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))}
                    placeholder="client@company.com" type="email" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Link Expires In</label>
                  <select value={form.expiryDays} onChange={e => setForm(f => ({ ...f, expiryDays: e.target.value }))} style={inp}>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
                <button onClick={onClose} style={btnSec}>Cancel</button>
                <button
                  onClick={() => createLink.mutate({ engagementId, clientName: form.clientName, clientEmail: form.clientEmail || undefined, expiryDays: parseInt(form.expiryDays) })}
                  disabled={!form.clientName || createLink.isPending}
                  style={{ ...btnPri, opacity: !form.clientName ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                  <Share2 size={13} />
                  {createLink.isPending ? "Generating..." : "Generate Link"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: 26, background: "#EAFAF1", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <CheckCircle size={24} color="#27AE60" />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 6px" }}>Portal Link Generated</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>Share this link with your client. They can upload files without creating an account.</p>
              <div style={{ background: "var(--surface-alt)", borderRadius: 10, padding: 14, marginBottom: 16, border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px", fontWeight: 600, textAlign: "left" }}>Portal URL</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <code style={{ flex: 1, fontSize: 11, color: "var(--accent)", wordBreak: "break-all", textAlign: "left", background: "none", lineHeight: 1.5 }}>{generatedUrl}</code>
                  <button onClick={() => handleCopy(generatedUrl)} style={{ flexShrink: 0, background: copied ? "#EAFAF1" : "var(--navy)", border: "none", borderRadius: 7, color: copied ? "#27AE60" : "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                    {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <a href={generatedUrl} target="_blank" rel="noreferrer" style={{ ...btnSec, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <ExternalLink size={12} /> Preview Portal
                </a>
                <button onClick={() => { setGeneratedUrl(null); setForm({ clientName: "", clientEmail: "", expiryDays: "14" }); }} style={btnSec}>Generate Another</button>
                <button onClick={onClose} style={btnPri}>Done</button>
              </div>
            </div>
          )}

          {activeLinks && activeLinks.length > 0 && !generatedUrl && (
            <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 18 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>Active Portal Links</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeLinks.map(link => (
                  <div key={link.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-alt)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--border)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)", margin: 0 }}>{link.clientName}</p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>Expires {format(new Date(link.expiresAt), "MMM d, yyyy")}</p>
                    </div>
                    <button onClick={() => handleCopy(`${window.location.origin}/portal/${link.token}`)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", padding: "4px 8px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <Copy size={11} /> Copy
                    </button>
                    <button onClick={() => revokeLink.mutate({ tokenId: link.id })} style={{ background: "none", border: "1px solid #FECACA", borderRadius: 6, color: "var(--red)", padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PBC Reminder Email Modal ─────────────────────────────────────────────────
function PbcReminderModal({
  items, engagementId, clientName, engagementPeriod, onClose,
}: {
  items: Array<{ description: string; dueDate?: Date | string | null; status: string }>;
  engagementId: string;
  clientName: string;
  engagementPeriod: string;
  onClose: () => void;
}) {
  const outstanding = items.filter(i => i.status === "Requested");
  const today = new Date();

  const buildDraft = () => {
    const lines = outstanding
      .map((it, idx) => {
        const dd = it.dueDate ? new Date(it.dueDate) : null;
        const daysOver = dd ? differenceInDays(today, dd) : 0;
        const dueTxt = dd ? ` (due ${format(dd, "MMM d, yyyy")})` : "";
        const overTxt = daysOver > 0 ? ` — ${daysOver} days overdue` : "";
        return `  ${idx + 1}. ${it.description}${dueTxt}${overTxt}`;
      })
      .join("\n");

    return `Subject: [Action Required] Outstanding Audit Evidence Request — ${clientName}

Dear [Client Contact Name],

As part of our audit of ${clientName} for the period ended ${engagementPeriod}, we are following up on the items listed below that remain outstanding. Timely receipt of these items is critical to completing our fieldwork on schedule.

Outstanding Items (${outstanding.length}):
${lines}

Please upload your documents using the secure client portal we shared previously, or reply to this email with the files attached.

Do not hesitate to reach out if you have any questions. We appreciate your continued cooperation.

Best regards,
[Your Name]
[Firm Name]`;
  };

  const [body, setBody] = useState(buildDraft);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mailtoHref = `mailto:?subject=${encodeURIComponent(`[Action Required] Outstanding Audit Evidence Request — ${clientName}`)}&body=${encodeURIComponent(body)}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 600, maxHeight: "88vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.22)" }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Mail size={16} color="#fff" />
              </div>
              <div>
                <h2 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>Send PBC Reminder</h2>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, margin: 0, marginTop: 1 }}>{outstanding.length} outstanding item{outstanding.length !== 1 ? "s" : ""} · edit and send</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, color: "#fff", width: 28, height: 28, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          {outstanding.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <CheckCircle size={32} color="#27AE60" style={{ margin: "0 auto 12px" }} />
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>All PBC items have been received. No reminder needed.</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                Edit the draft below before sending. The email opens in your mail app pre-filled.
              </p>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={22}
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 14, fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", color: "var(--text)" }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                <button onClick={onClose} style={btnSec}>Cancel</button>
                <button onClick={handleCopy} style={{ ...btnSec, display: "flex", alignItems: "center", gap: 6 }}>
                  {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy Text</>}
                </button>
                <a href={mailtoHref} style={{ ...btnPri, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, color: "#fff" }}>
                  <Send size={13} /> Open in Mail App
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Fieldwork Complete Email Modal ───────────────────────────────────────────
function FieldworkCompleteModal({
  items, clientName, engagementPeriod, exceptionsCount, controlsTested, onClose,
}: {
  items: Array<{ status: string }>;
  clientName: string;
  engagementPeriod: string;
  exceptionsCount: number;
  controlsTested: number;
  onClose: () => void;
}) {
  const accepted = items.filter(i => i.status === "Accepted").length;
  const exceptionNote = exceptionsCount > 0
    ? `During fieldwork we identified ${exceptionsCount} exception(s). These will be discussed separately in the management letter, and we will follow up with you to agree remediation timelines.`
    : "We are pleased to confirm that no exceptions were identified during fieldwork.";

  const buildDraft = () => `Subject: Fieldwork Complete — ${clientName} IT Audit (${engagementPeriod})

Dear [Client Contact Name],

We are pleased to inform you that we have completed our IT audit fieldwork for ${clientName} for the period ended ${engagementPeriod}.

Fieldwork Summary:
  - Controls Tested: ${controlsTested}
  - Evidence Items Accepted: ${accepted}
  - Exceptions Identified: ${exceptionsCount}

${exceptionNote}

Next Steps: We will be preparing the final workpaper package and will share our report with you in the coming weeks. If you have any questions in the meantime, please do not hesitate to contact us.

Thank you for your cooperation and the timely provision of evidence throughout this engagement.

Best regards,
[Your Name]
[Firm Name]`;

  const [body, setBody] = useState(buildDraft);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mailtoHref = `mailto:?subject=${encodeURIComponent(`Fieldwork Complete — ${clientName} IT Audit (${engagementPeriod})`)}&body=${encodeURIComponent(body)}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 600, maxHeight: "88vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.22)" }}>
        <div style={{ background: "linear-gradient(135deg, #27AE60 0%, #1e8a4a 100%)", padding: "22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle size={16} color="#fff" />
              </div>
              <div>
                <h2 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>Notify Client: Fieldwork Complete</h2>
                <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, margin: 0, marginTop: 1 }}>{controlsTested} controls tested · {accepted} items accepted</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 6, color: "#fff", width: 28, height: 28, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            Edit the draft below. Figures are auto-filled from current engagement data.
          </p>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={22}
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 14, fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", color: "var(--text)" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button onClick={onClose} style={btnSec}>Cancel</button>
            <button onClick={handleCopy} style={{ ...btnSec, display: "flex", alignItems: "center", gap: 6 }}>
              {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy Text</>}
            </button>
            <a href={mailtoHref} style={{ ...btnPri, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, color: "#fff", background: "#27AE60" }}>
              <Send size={13} /> Open in Mail App
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PbcTrackerPage() {
  const [, params] = useRoute("/engagements/:id/pbc");
  const engagementId = params?.id ?? "";
  const [showCreate, setShowCreate] = useState(false);
  const [showPortal, setShowPortal] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [showFieldworkComplete, setShowFieldworkComplete] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: items, refetch } = trpc.pbc.listByEngagement.useQuery({ engagementId });
  const { data: controls } = trpc.controls.listByEngagement.useQuery({ engagementId });
  const { data: engagement } = trpc.engagements.get.useQuery({ id: engagementId });
  const updateStatus = trpc.pbc.updateStatus.useMutation({ onSuccess: () => refetch() });

  const filtered = (items ?? []).filter(i => filterStatus === "all" || i.status === filterStatus);

  const counts = (items ?? []).reduce<Record<string, number>>((acc, i) => { acc[i.status] = (acc[i.status] ?? 0) + 1; return acc; }, {});
  const overdue = (items ?? []).filter(i => i.dueDate && i.status === "Requested" && differenceInDays(new Date(), new Date(i.dueDate)) > 0).length;

  const { data: exceptions } = trpc.exceptions.listByEngagement.useQuery({ engagementId });

  const clientName = engagement?.clientName ?? "Client";
  const engagementPeriod = engagement?.periodEnd ? format(new Date(engagement.periodEnd), "MMMM d, yyyy") : "";
  const controlsTested = (engagement?.controls ?? []).filter(c => c.status !== "NotStarted").length;
  const exceptionsCount = exceptions?.length ?? 0;

  return (
    <div style={{ padding: 32 }}>
      <Link href={`/engagements/${engagementId}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Engagement Overview
        </a>
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>PBC Tracker</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            {items?.length ?? 0} items · {counts.Accepted ?? 0} accepted · {overdue > 0 ? <span style={{ color: "var(--red)" }}>{overdue} overdue</span> : "none overdue"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setShowReminder(true)} style={{ ...btnSec, display: "flex", alignItems: "center", gap: 6 }}>
            <Mail size={14} /> Send Reminder
          </button>
          <button onClick={() => setShowFieldworkComplete(true)} style={{ ...btnSec, display: "flex", alignItems: "center", gap: 6, borderColor: "#A9DFBF", color: "var(--green)" }}>
            <Send size={14} /> Notify Client: Done
          </button>
          <button onClick={() => setShowPortal(true)} style={{ ...btnSec, display: "flex", alignItems: "center", gap: 6 }}>
            <Share2 size={14} /> Share Portal
          </button>
          <button onClick={() => setShowCreate(true)} style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> Request PBC Item
          </button>
        </div>
      </div>

      {/* Status filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <button onClick={() => setFilterStatus("all")} style={{ ...filterBtn, background: filterStatus === "all" ? "var(--navy)" : "var(--surface)", color: filterStatus === "all" ? "#fff" : "var(--text)", borderColor: filterStatus === "all" ? "var(--navy)" : "var(--border)" }}>
          All ({items?.length ?? 0})
        </button>
        {Object.entries(STATUS_CFG).map(([status, { label, color }]) => (
          <button key={status} onClick={() => setFilterStatus(status)}
            style={{ ...filterBtn, background: filterStatus === status ? color : "var(--surface)", color: filterStatus === status ? "#fff" : color, borderColor: filterStatus === status ? color : "var(--border)" }}>
            {label} ({counts[status] ?? 0})
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--surface-alt)" }}>
              {["Control", "Description", "Due Date", "File", "Status", "Action"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => {
              const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.Requested;
              const StatusIcon = cfg.icon;
              const ctrl = controls?.find(c => c.id === item.controlId);
              const dueDate = item.dueDate ? new Date(item.dueDate) : null;
              const isOverdue = dueDate && item.status === "Requested" && differenceInDays(new Date(), dueDate) > 0;
              const daysOverdue = dueDate ? differenceInDays(new Date(), dueDate) : 0;
              return (
                <tr key={item.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "#fff" : "var(--surface-alt)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    {ctrl ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accent-light)", padding: "2px 7px", borderRadius: 4 }}>{ctrl.controlRef}</span> : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text)", maxWidth: 280 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                    {item.isIpe && <span style={{ fontSize: 10, background: "#E8F8F5", color: "#16A085", padding: "1px 6px", borderRadius: 3, fontWeight: 600, marginTop: 3, display: "inline-block" }}>IPE</span>}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13 }}>
                    {dueDate ? (
                      <span style={{ color: isOverdue ? "var(--red)" : "var(--text)", fontWeight: isOverdue ? 700 : 400 }}>
                        {format(dueDate, "MMM d, yyyy")}
                        {isOverdue && <div style={{ fontSize: 10, color: "var(--red)" }}>{daysOverdue}d overdue</div>}
                      </span>
                    ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {item.fileName ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Paperclip size={12} color="var(--accent)" />
                        {item.fileUrl ? (
                          <a href={item.fileUrl} target="_blank" rel="noreferrer"
                            style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            title={item.fileName}>
                            {item.fileName}
                            <Download size={11} style={{ flexShrink: 0 }} />
                          </a>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }} title={item.fileName}>
                            {item.fileName}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "#CBD5E1", display: "flex", alignItems: "center", gap: 4 }}>
                        <Upload size={11} /> No file
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600 }}>
                      <StatusIcon size={11} /> {cfg.label}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {item.status === "Received" && (
                        <button onClick={() => updateStatus.mutate({ id: item.id, status: "Accepted" })}
                          style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "1px solid #A9DFBF", background: "#EAFAF1", color: "var(--green)", cursor: "pointer", fontWeight: 600 }}>
                          Accept
                        </button>
                      )}
                      {item.status === "Received" && (
                        <button onClick={() => updateStatus.mutate({ id: item.id, status: "Rejected" })}
                          style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "1px solid #FECACA", background: "#FDEDEC", color: "var(--red)", cursor: "pointer", fontWeight: 600 }}>
                          Reject
                        </button>
                      )}
                      {item.status === "Requested" && (
                        <button onClick={() => updateStatus.mutate({ id: item.id, status: "Received" })}
                          style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer" }}>
                          Mark Received
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <div style={{ padding: "50px 40px", textAlign: "center" }}>
            <FileCheck2 size={28} color="var(--border)" style={{ margin: "0 auto 12px" }} />
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No PBC items yet. Start by requesting evidence from the client.</p>
          </div>
        )}
      </div>

      {showCreate && <AddPbcModal engagementId={engagementId} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
      {showPortal && <SharePortalModal engagementId={engagementId} onClose={() => setShowPortal(false)} />}
      {showReminder && (
        <PbcReminderModal
          items={items ?? []}
          engagementId={engagementId}
          clientName={clientName}
          engagementPeriod={engagementPeriod}
          onClose={() => setShowReminder(false)}
        />
      )}
      {showFieldworkComplete && (
        <FieldworkCompleteModal
          items={items ?? []}
          clientName={clientName}
          engagementPeriod={engagementPeriod}
          exceptionsCount={exceptionsCount}
          controlsTested={controlsTested}
          onClose={() => setShowFieldworkComplete(false)}
        />
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 13, background: "#fff" };
const btnPri: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSec: React.CSSProperties = { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const filterBtn: React.CSSProperties = { padding: "5px 12px", borderRadius: 20, border: "1px solid", fontSize: 12, fontWeight: 500, cursor: "pointer" };
