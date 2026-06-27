import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { Upload, CheckCircle, Clock, FileText, XCircle, AlertCircle, Paperclip, Shield, FlaskConical, BarChart3, Send, Lightbulb } from "lucide-react";

type PbcItem = {
  id: string; description: string; status: string; fileName?: string | null;
  fileUrl?: string | null; dueDate?: string | null; notes?: string | null; isIpe: boolean;
};

type Control = {
  id: string; controlRef: string; objective: string;
  domain: string; itgcType?: string | null; itacType?: string | null;
  riskLevel: string; status: string;
};

type PortalData = {
  portalToken: { id: string; clientName: string; engagementId: string; expiresAt: string };
  pbcItems: PbcItem[];
  controls: Control[];
};

const PBC_STATUS: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  Requested:   { label: "Requested",    color: "#F39C12", bg: "#FFF8E6", icon: Clock },
  Received:    { label: "Received",     color: "#2E86DE", bg: "#EBF3FB", icon: Upload },
  Accepted:    { label: "Accepted",     color: "#27AE60", bg: "#EAFAF1", icon: CheckCircle },
  Rejected:    { label: "Rejected",     color: "#E74C3C", bg: "#FDEDEC", icon: XCircle },
  NotRequired: { label: "Not Required", color: "#95A5A6", bg: "#F2F3F4", icon: AlertCircle },
};

// Client-friendly control status labels (no audit jargon)
const CTRL_STATUS: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  NotStarted:  { label: "Awaiting Evidence",     color: "#F39C12", bg: "#FFF8E6", desc: "We have not yet received all required documents for this area." },
  InProgress:  { label: "Testing in Progress",   color: "#2E86DE", bg: "#EBF3FB", desc: "Our team is actively reviewing and testing the provided documents." },
  UnderReview: { label: "Under Senior Review",   color: "#8B5CF6", bg: "#F5F3FF", desc: "Testing is complete and under quality review by our senior team." },
  Complete:    { label: "Testing Complete",       color: "#27AE60", bg: "#EAFAF1", desc: "Testing for this area is finished with no issues requiring follow-up." },
  Exception:   { label: "Requires Follow-Up",    color: "#E74C3C", bg: "#FDEDEC", desc: "We identified an item requiring clarification. Your auditor will be in touch." },
};

const RISK_COLOR: Record<string, string> = { High: "#E74C3C", Medium: "#F39C12", Low: "#27AE60" };

export default function ClientPortalPage() {
  const [, params] = useRoute("/portal/:token");
  const token = params?.token ?? "";

  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadResults, setUploadResults] = useState<Record<string, "success" | "error">>({});
  const [activeTab, setActiveTab] = useState<"documents" | "testing" | "suggest">("documents");
  const [expandedCtrl, setExpandedCtrl] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Suggest form state
  const [suggest, setSuggest] = useState({ processName: "", systemName: "", description: "", contactName: "" });
  const [suggestionSent, setSuggestionSent] = useState(false);
  const [submittingSuggest, setSubmittingSuggest] = useState(false);

  const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/portal/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d as PortalData);
      })
      .catch(() => setError("Failed to load portal. Please check your link."));
  }, [token]);

  const handleUpload = async (itemId: string, file: File) => {
    setUploadingId(itemId);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/api/portal/${token}/upload/${itemId}`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Upload failed");
      setUploadResults(r => ({ ...r, [itemId]: "success" }));
      setData(prev => {
        if (!prev) return prev;
        return { ...prev, pbcItems: prev.pbcItems.map(p => p.id === itemId ? { ...p, status: "Received", fileName: file.name } : p) };
      });
    } catch {
      setUploadResults(r => ({ ...r, [itemId]: "error" }));
    } finally {
      setUploadingId(null);
    }
  };

  const handleSuggest = async () => {
    if (!suggest.processName || !suggest.description) return;
    setSubmittingSuggest(true);
    try {
      await fetch(`${API}/api/portal/${token}/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(suggest),
      });
      setSuggestionSent(true);
      setSuggest({ processName: "", systemName: "", description: "", contactName: "" });
    } finally {
      setSubmittingSuggest(false);
    }
  };

  const requested = data?.pbcItems.filter(p => ["Requested", "Rejected"].includes(p.status)) ?? [];
  const received  = data?.pbcItems.filter(p => p.status === "Received") ?? [];
  const accepted  = data?.pbcItems.filter(p => p.status === "Accepted") ?? [];
  const total     = data?.pbcItems.length ?? 0;
  const pct       = total ? Math.round(((received.length + accepted.length) / total) * 100) : 0;

  const ctrlByStatus = (data?.controls ?? []).reduce<Record<string, Control[]>>((acc, c) => {
    acc[c.status] = [...(acc[c.status] ?? []), c];
    return acc;
  }, {});
  const totalControls = data?.controls.length ?? 0;
  const completeControls = ctrlByStatus["Complete"]?.length ?? 0;
  const auditPct = totalControls ? Math.round((completeControls / totalControls) * 100) : 0;

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "48px 40px", maxWidth: 420, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid #E5E7EB" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <XCircle size={28} color="#E74C3C" />
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Link Unavailable</h1>
        <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>{error}</p>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 14, color: "#6B7280" }}>Loading your portal...</div>
    </div>
  );

  const tabs = [
    { id: "documents" as const, label: "Documents", icon: FileText, badge: requested.length > 0 ? requested.length : null },
    { id: "testing" as const, label: "Audit Progress", icon: BarChart3, badge: null },
    { id: "suggest" as const, label: "Suggest a Control", icon: Lightbulb, badge: null },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "#D4AF37", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#1E3A5F", fontSize: 16 }}>A</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Auditly Client Portal</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>Secure audit collaboration</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#D4AF37" }}>{data.portalToken.clientName}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>
                Expires {new Date(data.portalToken.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            </div>
          </div>

          {/* Summary stats in header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Documents Pending", value: requested.length, color: "#F39C12" },
              { label: "Documents Submitted", value: received.length + accepted.length, color: "#27AE60" },
              { label: "Controls in Scope", value: totalControls, color: "#D4AF37" },
              { label: "Testing Complete", value: `${auditPct}%`, color: auditPct === 100 ? "#27AE60" : "#2E86DE" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 16px", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {tabs.map(t => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none", background: active ? "#fff" : "rgba(255,255,255,0.1)", color: active ? "#1E3A5F" : "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer", position: "relative" }}>
                  <Icon size={14} />
                  {t.label}
                  {t.badge !== null && (
                    <span style={{ background: "#E74C3C", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 6px", marginLeft: 2 }}>{t.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── DOCUMENTS TAB ── */}
        {activeTab === "documents" && (
          <>
            {/* Progress bar */}
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "18px 22px", marginBottom: 22, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Document Upload Progress</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{received.length + accepted.length} of {total} items submitted</div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: pct === 100 ? "#27AE60" : "#2E86DE" }}>{pct}%</div>
              </div>
              <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#27AE60" : "linear-gradient(90deg, #2E86DE, #1E3A5F)", borderRadius: 4, transition: "width 0.5s" }} />
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 12 }}>
                <span style={{ color: "#F39C12", fontWeight: 600 }}>{requested.length} Pending</span>
                <span style={{ color: "#2E86DE", fontWeight: 600 }}>{received.length} Under Review</span>
                <span style={{ color: "#27AE60", fontWeight: 600 }}>{accepted.length} Accepted</span>
              </div>
            </div>

            <div style={{ background: "#EBF3FB", borderRadius: 10, padding: "11px 15px", marginBottom: 20, fontSize: 13, color: "#2E86DE", lineHeight: 1.6, border: "1px solid #BFDBFE" }}>
              <strong>Instructions:</strong> Click Upload next to each item to submit the requested file. Supported: Excel (all tabs), PDF, Word, images, CSV, and more. Files are encrypted in transit and at rest.
            </div>

            {/* Pending */}
            {requested.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>Documents Needed ({requested.length})</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {requested.map(item => {
                    const result = uploadResults[item.id];
                    const isUploading = uploadingId === item.id;
                    const sc = PBC_STATUS[item.status] ?? PBC_STATUS.Requested;
                    return (
                      <div key={item.id} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${result === "success" ? "#A7F3D0" : result === "error" ? "#FECACA" : "#E5E7EB"}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", overflow: "hidden" }}>
                        <div style={{ padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 14 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: sc.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                            <FileText size={16} color={sc.color} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", lineHeight: 1.4 }}>{item.description}</div>
                            <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                              {item.isIpe && <span style={{ fontSize: 11, background: "#EFF6FF", color: "#3B82F6", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>IPE</span>}
                              {item.dueDate && (
                                <span style={{ fontSize: 11, color: new Date(item.dueDate) < new Date() ? "#E74C3C" : "#6B7280" }}>
                                  Due {new Date(item.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              )}
                            </div>
                            {item.notes && <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280", background: "#F9FAFB", borderRadius: 6, padding: "6px 10px" }}>{item.notes}</div>}
                            {item.status === "Rejected" && <div style={{ marginTop: 6, fontSize: 12, color: "#E74C3C", fontWeight: 500 }}>Please resubmit: file was rejected by the auditor.</div>}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                            {result === "success" && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#27AE60", fontWeight: 600 }}><CheckCircle size={14} /> Submitted</div>}
                            {result === "error" && <span style={{ fontSize: 12, color: "#E74C3C" }}>Upload failed</span>}
                            <input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} style={{ display: "none" }}
                              onChange={e => { if (e.target.files?.[0]) handleUpload(item.id, e.target.files[0]); }} />
                            <button onClick={() => fileInputRefs.current[item.id]?.click()} disabled={isUploading}
                              style={{ display: "flex", alignItems: "center", gap: 6, background: "#1E3A5F", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: isUploading ? "not-allowed" : "pointer", opacity: isUploading ? 0.7 : 1 }}>
                              <Upload size={13} /> {isUploading ? "Uploading..." : "Upload"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Submitted */}
            {(received.length + accepted.length) > 0 && (
              <div>
                <h2 style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>Submitted ({received.length + accepted.length})</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[...received, ...accepted].map(item => {
                    const sc = PBC_STATUS[item.status] ?? PBC_STATUS.Received;
                    const StatusIcon = sc.icon;
                    return (
                      <div key={item.id} style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                        <StatusIcon size={16} color={sc.color} />
                        <div style={{ flex: 1, fontSize: 13, color: "#374151" }}>{item.description}</div>
                        {item.fileName && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6B7280" }}><Paperclip size={11} /> {item.fileName}</div>}
                        <span style={{ fontSize: 11, background: sc.bg, color: sc.color, padding: "2px 8px", borderRadius: 10, fontWeight: 600, flexShrink: 0 }}>{sc.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {requested.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 32px", background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB" }}>
                <CheckCircle size={40} color="#27AE60" style={{ margin: "0 auto 16px" }} />
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>All documents submitted!</h2>
                <p style={{ fontSize: 14, color: "#6B7280" }}>Thank you. Your auditor will review the files and be in touch if anything further is needed.</p>
              </div>
            )}
          </>
        )}

        {/* ── AUDIT PROGRESS TAB ── */}
        {activeTab === "testing" && (
          <>
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "18px 22px", marginBottom: 22, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Overall Audit Progress</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{completeControls} of {totalControls} control areas complete</div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: auditPct === 100 ? "#27AE60" : "#2E86DE" }}>{auditPct}%</div>
              </div>
              <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${auditPct}%`, background: auditPct === 100 ? "#27AE60" : "linear-gradient(90deg, #8B5CF6, #1E3A5F)", borderRadius: 4, transition: "width 0.5s" }} />
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                {Object.entries(CTRL_STATUS).map(([key, cfg]) => {
                  const count = ctrlByStatus[key]?.length ?? 0;
                  if (!count) return null;
                  return <span key={key} style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>{count} {cfg.label}</span>;
                })}
              </div>
            </div>

            <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "11px 15px", marginBottom: 20, fontSize: 13, color: "#16A34A", lineHeight: 1.6, border: "1px solid #BBF7D0" }}>
              <strong>Note:</strong> This view shows the status of each control area under audit. Your auditor manages testing details. Click any row for more information.
            </div>

            {totalControls === 0 ? (
              <div style={{ textAlign: "center", padding: 48, background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB" }}>
                <FlaskConical size={32} color="#9CA3AF" style={{ margin: "0 auto 12px" }} />
                <p style={{ color: "#6B7280", fontSize: 14 }}>No controls in scope yet. Your auditor is setting up the engagement.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(data?.controls ?? []).map(ctrl => {
                  const cfg = CTRL_STATUS[ctrl.status] ?? CTRL_STATUS.NotStarted;
                  const isExpanded = expandedCtrl === ctrl.id;
                  const typeLabel = ctrl.domain === "ITGC" ? ctrl.itgcType : ctrl.itacType;
                  return (
                    <div key={ctrl.id} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${isExpanded ? "#2E86DE" : "#E5E7EB"}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", overflow: "hidden" }}>
                      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setExpandedCtrl(isExpanded ? null : ctrl.id)}>
                        <div style={{ width: 40, height: 40, borderRadius: 9, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Shield size={18} color={cfg.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#1E3A5F", background: "#EBF3FB", padding: "1px 7px", borderRadius: 4 }}>{ctrl.controlRef}</span>
                            {typeLabel && <span style={{ fontSize: 11, color: "#6B7280" }}>{ctrl.domain} · {typeLabel}</span>}
                            <span style={{ fontSize: 11, color: RISK_COLOR[ctrl.riskLevel] ?? "#6B7280", fontWeight: 600 }}>{ctrl.riskLevel} Risk</span>
                          </div>
                          <div style={{ fontSize: 13, color: "#374151", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctrl.objective}</div>
                        </div>
                        <span style={{ fontSize: 11, background: cfg.bg, color: cfg.color, padding: "4px 10px", borderRadius: 20, fontWeight: 600, flexShrink: 0 }}>{cfg.label}</span>
                      </div>
                      {isExpanded && (
                        <div style={{ borderTop: "1px solid #F3F4F6", padding: "14px 18px", background: "#FAFAFA" }}>
                          <p style={{ fontSize: 13, color: "#374151", margin: "0 0 10px", lineHeight: 1.6 }}><strong>Objective:</strong> {ctrl.objective}</p>
                          <div style={{ background: cfg.bg, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: cfg.color, lineHeight: 1.6 }}>
                            <strong>Status:</strong> {cfg.desc}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── SUGGEST A CONTROL TAB ── */}
        {activeTab === "suggest" && (
          <div>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #F3F4F6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: "#FFF8E6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Lightbulb size={18} color="#D4AF37" />
                  </div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>Suggest an Additional Control Area</h2>
                </div>
                <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.6 }}>
                  If you believe there are processes or controls relevant to this audit that have not been included, let your audit team know here. Your input helps us ensure complete coverage.
                </p>
              </div>

              {suggestionSent ? (
                <div style={{ padding: "48px 32px", textAlign: "center" }}>
                  <div style={{ width: 52, height: 52, borderRadius: 26, background: "#EAFAF1", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                    <CheckCircle size={24} color="#27AE60" />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Suggestion Submitted</h3>
                  <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 20px" }}>Your audit team will review this and be in touch if they need more information.</p>
                  <button onClick={() => setSuggestionSent(false)} style={{ background: "#1E3A5F", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Submit Another
                  </button>
                </div>
              ) : (
                <div style={{ padding: 24 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <label style={lbl}>Process / Control Name *</label>
                        <input value={suggest.processName} onChange={e => setSuggest(s => ({ ...s, processName: e.target.value }))}
                          placeholder="e.g. Vendor Payment Approval" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>System / Application</label>
                        <input value={suggest.systemName} onChange={e => setSuggest(s => ({ ...s, systemName: e.target.value }))}
                          placeholder="e.g. SAP, Oracle, NetSuite" style={inp} />
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Description *</label>
                      <textarea value={suggest.description} onChange={e => setSuggest(s => ({ ...s, description: e.target.value }))}
                        placeholder="Briefly describe the process, who owns it, what controls exist, and why you think it should be in scope..."
                        style={{ ...inp, height: 100, resize: "vertical", padding: "10px" }} />
                    </div>
                    <div>
                      <label style={lbl}>Your Name / Contact (optional)</label>
                      <input value={suggest.contactName} onChange={e => setSuggest(s => ({ ...s, contactName: e.target.value }))}
                        placeholder="Jane Smith, IT Controls Manager" style={inp} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                    <button onClick={handleSuggest} disabled={!suggest.processName || !suggest.description || submittingSuggest}
                      style={{ display: "flex", alignItems: "center", gap: 7, background: "#1E3A5F", color: "#fff", border: "none", borderRadius: 9, padding: "10px 22px", fontSize: 14, fontWeight: 600, cursor: (!suggest.processName || !suggest.description) ? "not-allowed" : "pointer", opacity: (!suggest.processName || !suggest.description) ? 0.5 : 1 }}>
                      <Send size={14} /> {submittingSuggest ? "Submitting..." : "Submit Suggestion"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", padding: "24px 0 32px", fontSize: 11, color: "#9CA3AF" }}>
        Secured by Auditly · Files encrypted in transit and at rest · SOC 2 Type II Compliant
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", height: 38, border: "1px solid #E5E7EB", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "#fff", boxSizing: "border-box", outline: "none" };
