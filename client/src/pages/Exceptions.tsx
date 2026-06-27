import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronRight, Edit3, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

const SEVERITY_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ControlDeficiency:      { label: "Control Deficiency",       color: "#F39C12", bg: "#FFF8E6", border: "#FDEAA7" },
  SignificantDeficiency:  { label: "Significant Deficiency",   color: "#E67E22", bg: "#FEF0E7", border: "#FAC98A" },
  MaterialWeakness:       { label: "Material Weakness",        color: "#E74C3C", bg: "#FDEDEC", border: "#FECACA" },
};

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  Open:          { label: "Open",           color: "#E74C3C" },
  Remediated:    { label: "Remediated",     color: "#27AE60" },
  AcceptedRisk:  { label: "Accepted Risk",  color: "#95A5A6" },
  PendingRetest: { label: "Pending Retest", color: "#8E44AD" },
};

export default function ExceptionsPage() {
  const [, params] = useRoute("/engagements/:id/exceptions");
  const engagementId = params?.id ?? "";
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});

  const { data: exceptions, refetch } = trpc.exceptions.listByEngagement.useQuery({ engagementId }, { enabled: !!engagementId });
  const { data: controls } = trpc.controls.listByEngagement.useQuery({ engagementId }, { enabled: !!engagementId });
  const update = trpc.exceptions.update.useMutation({ onSuccess: () => { refetch(); setEditing(null); } });

  const openCount = exceptions?.filter(e => e.status === "Open").length ?? 0;
  const mwCount = exceptions?.filter(e => e.severity === "MaterialWeakness").length ?? 0;

  return (
    <div style={{ padding: 32 }}>
      <Link href={`/engagements/${engagementId}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Engagement Overview
        </a>
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>Exception Log</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            {exceptions?.length ?? 0} exceptions · {openCount} open
            {mwCount > 0 && <span style={{ color: "var(--red)", fontWeight: 700 }}> · {mwCount} Material Weakness</span>}
          </p>
        </div>
        {(exceptions?.length ?? 0) > 1 && (
          <Link href={`/engagements/${engagementId}/deficiency`}>
            <a style={{ ...btnPri, background: "#E74C3C", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <AlertTriangle size={13} /> Run Deficiency Assessment
            </a>
          </Link>
        )}
      </div>

      {/* Summary by severity */}
      {(exceptions?.length ?? 0) > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 22 }}>
          {Object.entries(SEVERITY_CFG).map(([sev, cfg]) => {
            const count = exceptions?.filter(e => e.severity === sev).length ?? 0;
            return (
              <div key={sev} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: cfg.color, marginBottom: 4 }}>{cfg.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: cfg.color }}>{count}</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {exceptions?.map(exc => {
          const sc = SEVERITY_CFG[exc.severity] ?? SEVERITY_CFG.ControlDeficiency;
          const stc = STATUS_CFG[exc.status] ?? STATUS_CFG.Open;
          const ctrl = controls?.find(c => c.id === exc.controlId);
          const expanded = expandedId === exc.id;
          const isEditing = editing === exc.id;

          return (
            <div key={exc.id} style={{ background: "var(--surface)", borderRadius: 12, border: `1px solid ${exc.status === "Open" ? sc.border : "var(--border)"}`, overflow: "hidden" }}>
              {/* Header row */}
              <div style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer" }} onClick={() => setExpandedId(expanded ? null : exc.id)}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: sc.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                  <AlertTriangle size={16} color={sc.color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {ctrl && <span style={{ fontSize: 11, fontWeight: 700, background: "var(--accent-light)", color: "var(--accent)", padding: "1px 6px", borderRadius: 4 }}>{ctrl.controlRef}</span>}
                    <span style={{ padding: "2px 8px", borderRadius: 10, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600 }}>{sc.label}</span>
                    <span style={{ fontSize: 11, color: stc.color, fontWeight: 600 }}>{stc.label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-strong)", fontWeight: 500 }}>{exc.description}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Raised {format(new Date(exc.raisedAt), "MMM d, yyyy")}</div>
                </div>
                {expanded ? <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 4 }} /> : <ChevronRight size={14} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 4 }} />}
              </div>

              {/* Expanded detail */}
              {expanded && (
                <div style={{ borderTop: "1px solid var(--border)", padding: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <Section title="Root Cause Analysis" content={exc.rootCause ?? "Not assessed yet."} />
                    <Section title="Management Letter Comment" content={exc.managementLetterComment ?? "Not drafted yet."} />
                  </div>

                  {/* Editable fields */}
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={lbl}>Management Response</label>
                        <textarea value={editDraft.managementResponse ?? exc.managementResponse ?? ""} onChange={e => setEditDraft(d => ({ ...d, managementResponse: e.target.value }))} rows={3} style={{ ...tarea }} />
                      </div>
                      <div>
                        <label style={lbl}>Remediation Plan</label>
                        <textarea value={editDraft.remediationPlan ?? exc.remediationPlan ?? ""} onChange={e => setEditDraft(d => ({ ...d, remediationPlan: e.target.value }))} rows={3} style={{ ...tarea }} />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <label style={{ ...lbl, marginBottom: 0 }}>Remediation Due Date</label>
                        <input type="date" value={editDraft.remediationDueDate ?? ""} onChange={e => setEditDraft(d => ({ ...d, remediationDueDate: e.target.value }))} style={{ height: 34, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 13 }} />
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => setEditing(null)} style={btnSec}>Cancel</button>
                        <button onClick={() => update.mutate({ id: exc.id, managementResponse: editDraft.managementResponse, remediationPlan: editDraft.remediationPlan })} style={{ ...btnPri, display: "flex", alignItems: "center", gap: 5 }}>
                          <Save size={12} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <Section title="Management Response" content={exc.managementResponse ?? "Pending from client."} />
                      <Section title="Remediation Plan" content={exc.remediationPlan ?? "Not yet documented."} />
                    </div>
                  )}

                  {/* Action bar */}
                  {!isEditing && (
                    <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                      <button onClick={() => { setEditing(exc.id); setEditDraft({}); }} style={{ ...btnSec, display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                        <Edit3 size={11} /> Edit Response
                      </button>
                      {exc.status === "Open" && (
                        <button onClick={() => update.mutate({ id: exc.id, status: "PendingRetest" })} style={{ ...btnSec, fontSize: 12, color: "#8E44AD", borderColor: "#D7BDE2" }}>Mark Pending Retest</button>
                      )}
                      {exc.status === "PendingRetest" && (
                        <button onClick={() => update.mutate({ id: exc.id, status: "Remediated" })} style={{ ...btnSec, fontSize: 12, color: "var(--green)", borderColor: "#A9DFBF" }}>Mark Remediated</button>
                      )}
                      {exc.status === "Open" && (
                        <button onClick={() => update.mutate({ id: exc.id, status: "AcceptedRisk" })} style={{ ...btnSec, fontSize: 12 }}>Accept Risk</button>
                      )}
                      <select onChange={e => update.mutate({ id: exc.id, severity: e.target.value as "ControlDeficiency" | "SignificantDeficiency" | "MaterialWeakness" })} value={exc.severity}
                        style={{ height: 34, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 12, cursor: "pointer", background: "#fff" }}>
                        <option value="ControlDeficiency">Control Deficiency</option>
                        <option value="SignificantDeficiency">Significant Deficiency</option>
                        <option value="MaterialWeakness">Material Weakness</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!exceptions?.length && (
          <div style={{ background: "var(--surface)", borderRadius: 12, border: "2px dashed var(--border)", padding: "50px 40px", textAlign: "center" }}>
            <AlertTriangle size={32} color="var(--border)" style={{ margin: "0 auto 12px" }} />
            <p style={{ color: "var(--green)", fontSize: 13, fontWeight: 600 }}>No exceptions noted. All controls tested clean.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div style={{ background: "var(--surface-alt)", borderRadius: 8, padding: "12px 14px", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
      <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text)", margin: 0 }}>{content}</p>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 5 };
const tarea: React.CSSProperties = { width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", resize: "vertical", lineHeight: 1.6 };
const btnPri: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSec: React.CSSProperties = { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
