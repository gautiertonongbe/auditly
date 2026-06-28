import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Plus, FileCheck2, Clock, CheckCircle, XCircle, AlertCircle, Upload, Share2, Copy, Check, ExternalLink, Mail, Send, Paperclip, Download, Sparkles, ChevronRight, MoreHorizontal, UserCheck } from "lucide-react";
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

// ── Forward for Review Modal ────────────────────────────────────────────────
function ForwardModal({ engagementId, onClose }: { engagementId: string; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const updateStatus = trpc.engagements.updateStatus.useMutation({
    onSuccess: () => setSent(true),
  });

  if (sent) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: 400, padding: 36, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ width: 52, height: 52, borderRadius: 26, background: "#EAFAF1", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <CheckCircle size={24} color="#27AE60" />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 8px" }}>Forwarded for Review</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 24px" }}>This engagement has been moved to the review queue.</p>
        <button onClick={onClose} style={btnPri}>Done</button>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UserCheck size={15} color="#fff" />
            </div>
            <h2 style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>Forward for Review</h2>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
            This will move the engagement to <strong>In Review</strong> status. The assigned reviewer will see it in their queue.
          </p>
          <label style={lbl}>Note to reviewer (optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. All evidence reviewed and accepted. Please check AM-01 sample selection."
            style={{ ...inp, height: "auto", padding: "10px", resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
            <button onClick={onClose} style={btnSec}>Cancel</button>
            <button
              onClick={() => updateStatus.mutate({ id: engagementId, status: "review" })}
              disabled={updateStatus.isPending}
              style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6 }}>
              <UserCheck size={13} />
              {updateStatus.isPending ? "Forwarding..." : "Forward to Review Queue"}
            </button>
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
  const [showForward, setShowForward] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const { data: items, refetch } = trpc.pbc.listByEngagement.useQuery({ engagementId });
  const { data: controls } = trpc.controls.listByEngagement.useQuery({ engagementId });
  const { data: engagement } = trpc.engagements.get.useQuery({ id: engagementId });
  const updateStatus = trpc.pbc.updateStatus.useMutation({ onSuccess: () => refetch() });
  const { data: exceptions } = trpc.exceptions.listByEngagement.useQuery({ engagementId });

  const exportMutation = trpc.export.exportEngagement.useMutation({
    onSuccess: (data) => {
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.base64}`;
      link.download = data.fileName;
      link.click();
    },
  });

  const allItems = items ?? [];
  const counts = allItems.reduce<Record<string, number>>((acc, i) => { acc[i.status] = (acc[i.status] ?? 0) + 1; return acc; }, {});
  const receivedCount = (counts.Received ?? 0) + (counts.Accepted ?? 0);
  const acceptedCount = counts.Accepted ?? 0;
  const pendingCount = counts.Requested ?? 0;
  const overdue = allItems.filter(i => i.dueDate && i.status === "Requested" && differenceInDays(new Date(), new Date(i.dueDate)) > 0).length;

  const clientName = engagement?.clientName ?? "Client";
  const engagementPeriod = engagement?.periodEnd ? format(new Date(engagement.periodEnd), "MMMM d, yyyy") : "";
  const controlsTested = (engagement?.controls ?? []).filter(c => c.status !== "NotStarted").length;
  const exceptionsCount = exceptions?.length ?? 0;

  // Determine which step is active
  const step = acceptedCount > 0 && acceptedCount >= allItems.length * 0.8 ? 3
    : receivedCount > 0 ? 2
    : 1;

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: "0 auto" }}>
      {/* Back link + header */}
      <Link href={`/engagements/${engagementId}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 18 }}>
          <ArrowLeft size={14} /> {clientName}
        </a>
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>Evidence Review</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            {allItems.length} items · {acceptedCount} accepted{overdue > 0 && <span style={{ color: "var(--red)" }}> · {overdue} overdue</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setShowCreate(true)} style={{ ...btnSec, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={13} /> Request Evidence
          </button>
          {/* More menu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              style={{ ...btnSec, padding: "8px 10px", display: "flex", alignItems: "center" }}>
              <MoreHorizontal size={15} />
            </button>
            {showMoreMenu && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setShowMoreMenu(false)} />
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 200, overflow: "hidden" }}>
                  {[
                    { label: "Share Client Portal", icon: Share2, action: () => { setShowPortal(true); setShowMoreMenu(false); } },
                    { label: "Send Reminder Email", icon: Mail, action: () => { setShowReminder(true); setShowMoreMenu(false); } },
                    { label: "Notify Client: Fieldwork Done", icon: Send, action: () => { setShowFieldworkComplete(true); setShowMoreMenu(false); } },
                  ].map(({ label, icon: Icon, action }) => (
                    <button key={label} onClick={action} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "none", border: "none", fontSize: 13, color: "var(--text)", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-alt)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <Icon size={14} color="var(--text-muted)" /> {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 3-Step Workflow Strip ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", alignItems: "center", marginBottom: 32, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        {/* Step 1 */}
        <div style={{ padding: "20px 24px", borderRight: "1px solid var(--border)", background: step === 1 ? "var(--accent-light)" : "transparent" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: step >= 1 ? "var(--accent)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {step > 1 ? <Check size={12} color="#fff" /> : <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>1</span>}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Collect Evidence</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {receivedCount} of {allItems.length} received
            {pendingCount > 0 && <span style={{ color: "var(--text-muted)" }}> · {pendingCount} pending</span>}
          </p>
        </div>

        <div style={{ padding: "0 4px" }}><ChevronRight size={16} color="var(--border)" /></div>

        {/* Step 2 */}
        <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border)", background: step === 2 ? "var(--accent-light)" : "transparent" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: step >= 2 ? "var(--accent)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {step > 2 ? <Check size={12} color="#fff" /> : <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>2</span>}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)", textTransform: "uppercase", letterSpacing: "0.04em" }}>AI Analysis</span>
          </div>
          <button
            onClick={() => exportMutation.mutate({ engagementId })}
            disabled={exportMutation.isPending || acceptedCount === 0}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              background: acceptedCount > 0 ? "var(--navy)" : "var(--border)",
              color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 16px", fontSize: 13, fontWeight: 600,
              cursor: acceptedCount > 0 ? "pointer" : "not-allowed",
              opacity: exportMutation.isPending ? 0.8 : 1,
              whiteSpace: "nowrap",
            }}>
            {exportMutation.isPending
              ? <><span style={{ display: "inline-block", width: 13, height: 13, borderRadius: 7, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} /> Analyzing...</>
              : <><Sparkles size={13} /> Analyze & Download</>}
          </button>
          {acceptedCount === 0 && <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>Accept evidence items first</p>}
        </div>

        <div style={{ padding: "0 4px" }}><ChevronRight size={16} color="var(--border)" /></div>

        {/* Step 3 */}
        <div style={{ padding: "18px 20px", background: step === 3 ? "var(--accent-light)" : "transparent" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: step >= 3 ? "var(--accent)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>3</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Forward for Review</span>
          </div>
          <button
            onClick={() => setShowForward(true)}
            disabled={acceptedCount === 0}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              background: acceptedCount > 0 ? "#27AE60" : "var(--border)",
              color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 16px", fontSize: 13, fontWeight: 600,
              cursor: acceptedCount > 0 ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}>
            <UserCheck size={13} /> Send to Reviewer
          </button>
        </div>
      </div>

      {/* ── Evidence Items ──────────────────────────────────────────────────── */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--surface-alt)" }}>
              {["Control", "Evidence Description", "File", "Status", ""].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allItems.map((item, i) => {
              const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.Requested;
              const StatusIcon = cfg.icon;
              const ctrl = controls?.find(c => c.id === item.controlId);
              const dueDate = item.dueDate ? new Date(item.dueDate) : null;
              const isOverdue = dueDate && item.status === "Requested" && differenceInDays(new Date(), dueDate) > 0;
              const daysOverdue = dueDate ? differenceInDays(new Date(), dueDate) : 0;

              return (
                <tr key={item.id} style={{ borderBottom: i < allItems.length - 1 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "#fff" : "var(--surface-alt)" }}>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    {ctrl
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accent-light)", padding: "2px 7px", borderRadius: 4 }}>{ctrl.controlRef}</span>
                      : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text)", maxWidth: 320 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                      {item.isIpe && <span style={{ fontSize: 10, background: "#E8F8F5", color: "#16A085", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>IPE</span>}
                      {dueDate && isOverdue && <span style={{ fontSize: 10, color: "var(--red)", fontWeight: 600 }}>{daysOverdue}d overdue</span>}
                      {dueDate && !isOverdue && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Due {format(dueDate, "MMM d")}</span>}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {item.fileName ? (
                      item.fileUrl
                        ? <a href={item.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.fileName}>
                            <Paperclip size={11} /> {item.fileName}
                          </a>
                        : <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.fileName}>
                            <Paperclip size={11} /> {item.fileName}
                          </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "#CBD5E1", display: "flex", alignItems: "center", gap: 4 }}>
                        <Upload size={11} /> Awaiting file
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600 }}>
                      <StatusIcon size={11} /> {cfg.label}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    {item.status === "Received" && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => updateStatus.mutate({ id: item.id, status: "Accepted" })}
                          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #A9DFBF", background: "#EAFAF1", color: "#27AE60", cursor: "pointer", fontWeight: 600 }}>
                          Accept
                        </button>
                        <button onClick={() => updateStatus.mutate({ id: item.id, status: "Rejected" })}
                          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #FECACA", background: "#FDEDEC", color: "#E74C3C", cursor: "pointer", fontWeight: 600 }}>
                          Reject
                        </button>
                      </div>
                    )}
                    {item.status === "Requested" && (
                      <button onClick={() => updateStatus.mutate({ id: item.id, status: "Received" })}
                        style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer" }}>
                        Mark Received
                      </button>
                    )}
                    {item.status === "Accepted" && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#27AE60" }}>
                        <CheckCircle size={12} /> Done
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!allItems.length && (
          <div style={{ padding: "50px 40px", textAlign: "center" }}>
            <FileCheck2 size={28} color="var(--border)" style={{ margin: "0 auto 12px" }} />
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>No evidence items yet.</p>
            <button onClick={() => setShowCreate(true)} style={{ ...btnPri, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Plus size={13} /> Request First Item
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && <AddPbcModal engagementId={engagementId} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
      {showPortal && <SharePortalModal engagementId={engagementId} onClose={() => setShowPortal(false)} />}
      {showForward && <ForwardModal engagementId={engagementId} onClose={() => setShowForward(false)} />}
      {showReminder && (
        <PbcReminderModal items={allItems} engagementId={engagementId} clientName={clientName} engagementPeriod={engagementPeriod} onClose={() => setShowReminder(false)} />
      )}
      {showFieldworkComplete && (
        <FieldworkCompleteModal items={allItems} clientName={clientName} engagementPeriod={engagementPeriod} exceptionsCount={exceptionsCount} controlsTested={controlsTested} onClose={() => setShowFieldworkComplete(false)} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 13, background: "#fff" };
const btnPri: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSec: React.CSSProperties = { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const filterBtn: React.CSSProperties = { padding: "5px 12px", borderRadius: 20, border: "1px solid", fontSize: 12, fontWeight: 500, cursor: "pointer" };
