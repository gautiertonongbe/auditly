import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Plus, Database, CheckCircle, XCircle, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";

const TEST_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  NotTested: { label: "Not Tested", color: "#95A5A6", bg: "#F2F3F4" },
  Pass:      { label: "Pass",       color: "#27AE60", bg: "#EAFAF1" },
  Fail:      { label: "Fail",       color: "#E74C3C", bg: "#FDEDEC" },
};

function CreateIpeModal({ engagementId, onClose, onCreated }: { engagementId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ reportName: "", system: "", parameters: "", runDate: "", runBy: "" });
  const create = trpc.ipe.create.useMutation({ onSuccess: () => { onCreated(); onClose(); } });
  const { data: controls } = trpc.controls.listByEngagement.useQuery({ engagementId });
  const [linkedControls, setLinkedControls] = useState<string[]>([]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ background: "linear-gradient(135deg, #16A085 0%, #1ABC9C 100%)", padding: "20px 24px", position: "sticky", top: 0 }}>
          <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0 }}>Add IPE Item</h2>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 3 }}>AI will auto-draft the completeness and accuracy testing memo</p>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Report Name *</label>
                <input value={form.reportName} onChange={e => setForm(f => ({ ...f, reportName: e.target.value }))} placeholder="e.g. Active Directory User Access Report" style={inp} />
              </div>
              <div>
                <label style={lbl}>System / Application *</label>
                <input value={form.system} onChange={e => setForm(f => ({ ...f, system: e.target.value }))} placeholder="e.g. Active Directory, SAP, Workday" style={inp} />
              </div>
              <div>
                <label style={lbl}>Run Date</label>
                <input type="date" value={form.runDate} onChange={e => setForm(f => ({ ...f, runDate: e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Report Parameters</label>
                <input value={form.parameters} onChange={e => setForm(f => ({ ...f, parameters: e.target.value }))} placeholder="e.g. All active users, as of 12/31/2024, all domains" style={inp} />
              </div>
              <div>
                <label style={lbl}>Run By (Client Contact)</label>
                <input value={form.runBy} onChange={e => setForm(f => ({ ...f, runBy: e.target.value }))} placeholder="e.g. John Smith, IT Admin" style={inp} />
              </div>
            </div>
            <div>
              <label style={lbl}>Linked Controls (select all that rely on this report)</label>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {controls?.map(c => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={linkedControls.includes(c.id)} onChange={e => setLinkedControls(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} />
                    <span style={{ fontWeight: 600, color: "var(--accent)" }}>{c.controlRef}</span>
                    <span style={{ color: "var(--text-muted)" }}>{c.objective.slice(0, 50)}...</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button onClick={onClose} style={btnSec}>Cancel</button>
            <button onClick={() => create.mutate({ engagementId, ...form, runDate: form.runDate ? new Date(form.runDate) : undefined, linkedControls })}
              disabled={!form.reportName || !form.system || create.isPending}
              style={{ ...btnPri, background: "#16A085", opacity: (!form.reportName || !form.system) ? 0.5 : 1 }}>
              {create.isPending ? "Adding..." : "Add IPE Item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IpeRegisterPage() {
  const [, params] = useRoute("/engagements/:id/ipe");
  const engagementId = params?.id ?? "";
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: items, refetch } = trpc.ipe.listByEngagement.useQuery({ engagementId });
  const updateResult = trpc.ipe.updateTestingResult.useMutation({ onSuccess: () => refetch() });

  const passCount = items?.filter(i => i.completenessStatus === "Pass" && i.accuracyStatus === "Pass").length ?? 0;
  const failCount = items?.filter(i => i.completenessStatus === "Fail" || i.accuracyStatus === "Fail").length ?? 0;

  return (
    <div style={{ padding: 32 }}>
      <Link href={`/engagements/${engagementId}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Engagement Overview
        </a>
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>IPE Register</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            {items?.length ?? 0} reports · {passCount} fully validated · {failCount > 0 ? <span style={{ color: "var(--red)" }}>{failCount} failed</span> : "none failed"}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6, background: "#16A085" }}>
          <Plus size={14} /> Add IPE Item
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items?.map(ipe => {
          const expanded = expandedId === ipe.id;
          const cStatus = TEST_COLORS[ipe.completenessStatus] ?? TEST_COLORS.NotTested;
          const aStatus = TEST_COLORS[ipe.accuracyStatus] ?? TEST_COLORS.NotTested;
          const allPass = ipe.completenessStatus === "Pass" && ipe.accuracyStatus === "Pass";
          return (
            <div key={ipe.id} style={{ background: "var(--surface)", borderRadius: 12, border: `1px solid ${allPass ? "#A9DFBF" : "var(--border)"}`, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setExpandedId(expanded ? null : ipe.id)}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: "#E8F8F5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Database size={18} color="#16A085" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>{ipe.reportName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 12 }}>
                    <span>{ipe.system}</span>
                    {ipe.parameters && <span>{ipe.parameters}</span>}
                    {(ipe.linkedControls?.length ?? 0) > 0 && <span>Used in: {ipe.linkedControls?.join(", ")}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ padding: "3px 10px", borderRadius: 20, background: cStatus.bg, color: cStatus.color, fontSize: 11, fontWeight: 600 }}>C: {cStatus.label}</span>
                  <span style={{ padding: "3px 10px", borderRadius: 20, background: aStatus.bg, color: aStatus.color, fontSize: 11, fontWeight: 600 }}>A: {aStatus.label}</span>
                </div>
              </div>

              {expanded && (
                <div style={{ borderTop: "1px solid var(--border)", padding: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {/* Completeness */}
                    <div style={{ background: "var(--surface-alt)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle size={13} color="#16A085" /> Completeness Testing
                      </div>
                      <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text)", marginBottom: 12, whiteSpace: "pre-wrap" }}>{ipe.completenessAiDraft ?? "No draft yet."}</p>
                      {ipe.completenessNotes && <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, fontStyle: "italic" }}>{ipe.completenessNotes}</p>}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => updateResult.mutate({ id: ipe.id, completenessStatus: "Pass" })} style={{ ...miniBtn, background: "#EAFAF1", color: "var(--green)", borderColor: "#A9DFBF" }}>
                          <CheckCircle size={11} /> Pass
                        </button>
                        <button onClick={() => updateResult.mutate({ id: ipe.id, completenessStatus: "Fail" })} style={{ ...miniBtn, background: "#FDEDEC", color: "var(--red)", borderColor: "#FECACA" }}>
                          <XCircle size={11} /> Fail
                        </button>
                        <button onClick={() => updateResult.mutate({ id: ipe.id, completenessStatus: "NotTested" })} style={{ ...miniBtn }}>
                          <Clock size={11} /> Reset
                        </button>
                      </div>
                    </div>

                    {/* Accuracy */}
                    <div style={{ background: "var(--surface-alt)", borderRadius: 10, padding: 16, border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle size={13} color="#2E86DE" /> Accuracy Testing
                      </div>
                      <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text)", marginBottom: 12, whiteSpace: "pre-wrap" }}>{ipe.accuracyAiDraft ?? "No draft yet."}</p>
                      {ipe.accuracyNotes && <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, fontStyle: "italic" }}>{ipe.accuracyNotes}</p>}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => updateResult.mutate({ id: ipe.id, accuracyStatus: "Pass" })} style={{ ...miniBtn, background: "#EAFAF1", color: "var(--green)", borderColor: "#A9DFBF" }}>
                          <CheckCircle size={11} /> Pass
                        </button>
                        <button onClick={() => updateResult.mutate({ id: ipe.id, accuracyStatus: "Fail" })} style={{ ...miniBtn, background: "#FDEDEC", color: "var(--red)", borderColor: "#FECACA" }}>
                          <XCircle size={11} /> Fail
                        </button>
                        <button onClick={() => updateResult.mutate({ id: ipe.id, accuracyStatus: "NotTested" })} style={{ ...miniBtn }}>
                          <Clock size={11} /> Reset
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!items?.length && (
          <div style={{ background: "var(--surface)", borderRadius: 12, border: "2px dashed var(--border)", padding: "50px 40px", textAlign: "center" }}>
            <Database size={32} color="var(--border)" style={{ margin: "0 auto 12px" }} />
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No IPE items yet. Add system-generated reports that are used as audit evidence.</p>
          </div>
        )}
      </div>
      {showCreate && <CreateIpeModal engagementId={engagementId} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 13, background: "#fff" };
const btnPri: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSec: React.CSSProperties = { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const miniBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, cursor: "pointer" };
