import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { Upload, CheckCircle, Clock, FileText, XCircle, AlertCircle, Paperclip, ChevronDown, ChevronRight } from "lucide-react";

type PbcItem = {
  id: string; description: string; status: string; fileName?: string | null;
  fileUrl?: string | null; dueDate?: string | null; notes?: string | null; isIpe: boolean;
};

type PortalData = {
  portalToken: { clientName: string; engagementId: string; expiresAt: string };
  pbcItems: PbcItem[];
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  Requested:   { label: "Requested",    color: "#F39C12", bg: "#FFF8E6", icon: Clock },
  Received:    { label: "Received",     color: "#2E86DE", bg: "#EBF3FB", icon: Upload },
  Accepted:    { label: "Accepted",     color: "#27AE60", bg: "#EAFAF1", icon: CheckCircle },
  Rejected:    { label: "Rejected",     color: "#E74C3C", bg: "#FDEDEC", icon: XCircle },
  NotRequired: { label: "Not Required", color: "#95A5A6", bg: "#F2F3F4", icon: AlertCircle },
};

export default function ClientPortalPage() {
  const [, params] = useRoute("/portal/:token");
  const token = params?.token ?? "";

  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadResults, setUploadResults] = useState<Record<string, "success" | "error">>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  const requested = data?.pbcItems.filter(p => ["Requested", "Rejected"].includes(p.status)) ?? [];
  const received = data?.pbcItems.filter(p => p.status === "Received") ?? [];
  const accepted = data?.pbcItems.filter(p => p.status === "Accepted") ?? [];
  const pct = data ? Math.round(((received.length + accepted.length) / (data.pbcItems.length || 1)) * 100) : 0;

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

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "0 32px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "#D4AF37", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#1E3A5F", fontSize: 14 }}>A</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Auditly Client Portal</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>Secure document request</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#D4AF37" }}>{data.portalToken.clientName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
              Link expires {new Date(data.portalToken.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
        {/* Progress */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Document Upload Progress</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                {received.length + accepted.length} of {data.pbcItems.length} items submitted
              </div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: pct === 100 ? "#27AE60" : "#2E86DE" }}>{pct}%</div>
          </div>
          <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#27AE60" : "linear-gradient(90deg, #2E86DE, #1E3A5F)", borderRadius: 4, transition: "width 0.5s" }} />
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 14, fontSize: 12 }}>
            <span style={{ color: "#F39C12", fontWeight: 600 }}>{requested.length} Pending</span>
            <span style={{ color: "#2E86DE", fontWeight: 600 }}>{received.length} Submitted</span>
            <span style={{ color: "#27AE60", fontWeight: 600 }}>{accepted.length} Accepted</span>
          </div>
        </div>

        {/* Instructions */}
        <div style={{ background: "#EBF3FB", borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#2E86DE", lineHeight: 1.6, border: "1px solid #BFDBFE" }}>
          <strong>Instructions:</strong> Your auditor has requested the documents listed below. Click "Upload" next to each item to submit your file. Supported formats: Excel (multiple sheets), PDF, images, Word, CSV, and most other file types.
        </div>

        {/* Pending items */}
        {requested.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>
              Documents Needed ({requested.length})
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {requested.map(item => {
                const result = uploadResults[item.id];
                const isUploading = uploadingId === item.id;
                const isExpanded = expanded === item.id;
                const sc = STATUS_CFG[item.status] ?? STATUS_CFG.Requested;
                return (
                  <div key={item.id} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${result === "success" ? "#A7F3D0" : result === "error" ? "#FECACA" : "#E5E7EB"}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: sc.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                        <FileText size={16} color={sc.color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", lineHeight: 1.4 }}>{item.description}</div>
                        <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, background: sc.bg, color: sc.color, padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{sc.label}</span>
                          {item.isIpe && <span style={{ fontSize: 11, background: "#EFF6FF", color: "#3B82F6", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>IPE</span>}
                          {item.dueDate && (
                            <span style={{ fontSize: 11, color: new Date(item.dueDate) < new Date() ? "#E74C3C" : "#6B7280" }}>
                              Due {new Date(item.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280", background: "#F9FAFB", borderRadius: 6, padding: "6px 10px" }}>{item.notes}</div>
                        )}
                        {item.status === "Rejected" && (
                          <div style={{ marginTop: 6, fontSize: 12, color: "#E74C3C", fontWeight: 500 }}>Please resubmit: file was rejected by the auditor.</div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        {result === "success" && (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#27AE60", fontWeight: 600 }}>
                            <CheckCircle size={14} /> Submitted
                          </div>
                        )}
                        {result === "error" && (
                          <span style={{ fontSize: 12, color: "#E74C3C" }}>Upload failed — try again</span>
                        )}
                        <input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} style={{ display: "none" }}
                          onChange={e => { if (e.target.files?.[0]) handleUpload(item.id, e.target.files[0]); }} />
                        <button
                          onClick={() => fileInputRefs.current[item.id]?.click()}
                          disabled={isUploading}
                          style={{ display: "flex", alignItems: "center", gap: 6, background: "#1E3A5F", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: isUploading ? "not-allowed" : "pointer", opacity: isUploading ? 0.7 : 1, flexShrink: 0 }}>
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

        {/* Submitted / accepted items */}
        {(received.length + accepted.length) > 0 && (
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px" }}>
              Submitted ({received.length + accepted.length})
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...received, ...accepted].map(item => {
                const sc = STATUS_CFG[item.status] ?? STATUS_CFG.Received;
                const StatusIcon = sc.icon;
                return (
                  <div key={item.id} style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                    <StatusIcon size={16} color={sc.color} />
                    <div style={{ flex: 1, fontSize: 13, color: "#374151" }}>{item.description}</div>
                    {item.fileName && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6B7280" }}>
                        <Paperclip size={11} /> {item.fileName}
                      </div>
                    )}
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
            <p style={{ fontSize: 14, color: "#6B7280" }}>Thank you. Your auditor will review the files and contact you if anything is needed.</p>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 40, fontSize: 11, color: "#9CA3AF" }}>
          Secured by Auditly · Files are encrypted in transit and at rest
        </div>
      </div>
    </div>
  );
}
