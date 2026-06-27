import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Sparkles, CheckCircle, AlertTriangle, Save, UserCheck, Edit3, Eye } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

type Tab = "procedure" | "results" | "conclusion";

export default function WorkpaperDetailPage() {
  const [, params] = useRoute("/engagements/:engId/controls/:controlId");
  const engId = params?.engId ?? "";
  const controlId = params?.controlId ?? "";

  const [tab, setTab] = useState<Tab>("procedure");
  const [editing, setEditing] = useState<Tab | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: wp, refetch } = trpc.workpapers.getByControl.useQuery({ controlId }, { enabled: !!controlId });
  const { data: controls } = trpc.controls.listByEngagement.useQuery({ engagementId: engId }, { enabled: !!engId });
  const control = controls?.find(c => c.id === controlId);

  const generateAi = trpc.workpapers.generateAi.useMutation({ onSuccess: () => refetch() });
  const upsert = trpc.workpapers.upsert.useMutation({ onSuccess: () => { refetch(); setEditing(null); } });
  const signOff = trpc.workpapers.signOff.useMutation({ onSuccess: () => refetch() });
  const createException = trpc.exceptions.create.useMutation({ onSuccess: () => refetch() });

  const [exceptionDesc, setExceptionDesc] = useState("");
  const [showExcModal, setShowExcModal] = useState(false);

  const save = (field: Tab) => {
    const map: Record<Tab, string> = { procedure: "procedureFinal", results: "resultsFinal", conclusion: "conclusionFinal" };
    upsert.mutate({ controlId, engagementId: engId, [map[field]]: drafts[field] ?? getContent(field, true) });
  };

  const getContent = (field: Tab, raw = false): string => {
    if (!wp) return "";
    if (field === "procedure") return raw ? (wp.procedureFinal ?? wp.procedureDraft ?? "") : (wp.procedureFinal ?? wp.procedureDraft ?? "");
    if (field === "results") return raw ? (wp.resultsFinal ?? wp.resultsDraft ?? "") : (wp.resultsFinal ?? wp.resultsDraft ?? "");
    return raw ? (wp.conclusionFinal ?? wp.conclusionDraft ?? "") : (wp.conclusionFinal ?? wp.conclusionDraft ?? "");
  };

  const hasAiContent = !!(wp?.procedureDraft || wp?.procedureFinal);

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <Link href={`/engagements/${engId}/controls`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Controls
        </a>
      </Link>

      {/* Header */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", marginBottom: 20 }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>
                {control?.domain} · {control?.itgcType ?? control?.itacType} · {control?.frequency} · {control?.riskLevel} Risk
              </div>
              <h1 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 }}>{control?.controlRef}</h1>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 6, maxWidth: 600 }}>{control?.objective}</p>
            </div>
            <button
              onClick={() => generateAi.mutate({ controlId })}
              disabled={generateAi.isPending}
              style={{ display: "flex", alignItems: "center", gap: 7, background: "#D4AF37", color: "#1E3A5F", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, opacity: generateAi.isPending ? 0.7 : 1 }}>
              <Sparkles size={14} />
              {generateAi.isPending ? "Generating..." : hasAiContent ? "Regenerate AI" : "Generate AI Writeup"}
            </button>
          </div>
        </div>

        {/* Population row */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[
            { label: "Population", value: wp?.populationDescription ?? "Not set" },
            { label: "Population Count", value: wp?.populationCount ? wp.populationCount.toLocaleString() : "—" },
            { label: "Sample Size", value: wp?.sampleSize ? String(wp.sampleSize) : "—" },
            { label: "Sampling Method", value: wp?.samplingMethod ?? "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{value}</div>
            </div>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {wp?.preparedAt && (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Prepared {format(new Date(wp.preparedAt), "MMM d, yyyy")}
              </div>
            )}
            {wp?.reviewedAt && (
              <div style={{ fontSize: 11, color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle size={11} /> Reviewed {format(new Date(wp.reviewedAt), "MMM d")}
              </div>
            )}
          </div>
        </div>

        {/* Conclusion badge */}
        {wp?.conclusion && wp.conclusion !== "InProgress" && (
          <div style={{ padding: "10px 24px", background: wp.conclusion === "Pass" ? "#EAFAF1" : "#FDEDEC", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: wp.conclusion === "Pass" ? "var(--green)" : "var(--red)", display: "flex", alignItems: "center", gap: 6 }}>
              {wp.conclusion === "Pass" ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              {wp.conclusion === "Pass" ? "No exceptions noted" : "Exception noted"}
            </span>
          </div>
        )}
      </div>

      {!hasAiContent ? (
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "2px dashed var(--border)", padding: "50px 40px", textAlign: "center" }}>
          <Sparkles size={32} color="var(--border)" style={{ margin: "0 auto 14px" }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-strong)", margin: "0 0 8px" }}>No writeup yet</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px" }}>Click "Generate AI Writeup" to auto-draft the procedure, results, and conclusion based on the control objective.</p>
          <button onClick={() => generateAi.mutate({ controlId })} disabled={generateAi.isPending}
            style={{ background: "#D4AF37", color: "#1E3A5F", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <Sparkles size={13} style={{ marginRight: 6 }} /> Generate AI Writeup
          </button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
            {(["procedure", "results", "conclusion"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: "10px 20px", border: "none", borderBottom: tab === t ? "2px solid var(--navy)" : "2px solid transparent", background: "none", fontSize: 13, fontWeight: tab === t ? 700 : 500, color: tab === t ? "var(--navy)" : "var(--text-muted)", cursor: "pointer", textTransform: "capitalize" }}>
                {t === "procedure" ? "Procedure Performed" : t === "results" ? "Results" : "Conclusion"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-alt)" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {["draft", "final"].map(mode => (
                  <span key={mode} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: mode === "final" && getContent(tab) !== (tab === "procedure" ? wp?.procedureDraft : tab === "results" ? wp?.resultsDraft : wp?.conclusionDraft) ? "#EAFAF1" : "var(--border)", color: mode === "final" && getContent(tab) !== (tab === "procedure" ? wp?.procedureDraft : tab === "results" ? wp?.resultsDraft : wp?.conclusionDraft) ? "var(--green)" : "var(--text-muted)", fontWeight: 600 }}>
                    {mode === "draft" ? "AI Draft" : "Final"}
                  </span>
                ))}
              </div>
              <button onClick={() => { setEditing(editing === tab ? null : tab); setDrafts(d => ({ ...d, [tab]: getContent(tab) })); }}
                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--text)" }}>
                {editing === tab ? <Eye size={12} /> : <Edit3 size={12} />}
                {editing === tab ? "Preview" : "Edit"}
              </button>
            </div>
            <div style={{ padding: 20 }}>
              {editing === tab ? (
                <textarea
                  value={drafts[tab] ?? getContent(tab)}
                  onChange={e => setDrafts(d => ({ ...d, [tab]: e.target.value }))}
                  style={{ width: "100%", minHeight: 180, border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.7, resize: "vertical", fontFamily: "inherit" }}
                />
              ) : (
                <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text)", margin: 0, whiteSpace: "pre-wrap" }}>{getContent(tab) || <span style={{ color: "var(--text-muted)" }}>No content yet.</span>}</p>
              )}
            </div>
            {editing === tab && (
              <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setEditing(null)} style={btnSec}>Discard</button>
                <button onClick={() => save(tab)} disabled={upsert.isPending} style={btnPri}>
                  <Save size={12} /> {upsert.isPending ? "Saving..." : "Save Final"}
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!wp?.preparedAt && (
              <button onClick={() => signOff.mutate({ workpaperId: wp?.id ?? "", level: "preparer" })} disabled={!wp?.id || signOff.isPending}
                style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6 }}>
                <UserCheck size={14} /> Sign off as Preparer
              </button>
            )}
            {wp?.preparedAt && !wp?.reviewedAt && (
              <button onClick={() => signOff.mutate({ workpaperId: wp.id, level: "reviewer" })} disabled={signOff.isPending}
                style={{ ...btnPri, background: "#8E44AD", display: "flex", alignItems: "center", gap: 6 }}>
                <UserCheck size={14} /> Sign off as Reviewer
              </button>
            )}
            {wp?.reviewedAt && !wp?.approvedAt && (
              <button onClick={() => signOff.mutate({ workpaperId: wp.id, level: "approver" })} disabled={signOff.isPending}
                style={{ ...btnPri, background: "var(--green)", display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle size={14} /> Approve
              </button>
            )}
            <button onClick={() => setShowExcModal(true)}
              style={{ ...btnSec, display: "flex", alignItems: "center", gap: 6, color: "var(--red)", borderColor: "#FECACA" }}>
              <AlertTriangle size={13} /> Note Exception
            </button>
            <button onClick={() => upsert.mutate({ controlId, engagementId: engId, conclusion: "Pass" })}
              style={{ ...btnSec, display: "flex", alignItems: "center", gap: 6, color: "var(--green)", borderColor: "#A9DFBF" }}>
              <CheckCircle size={13} /> Mark as Pass
            </button>
          </div>
        </>
      )}

      {/* Exception modal */}
      {showExcModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, width: 500, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 16px" }}>Note Exception</h3>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Exception Description *</label>
            <textarea value={exceptionDesc} onChange={e => setExceptionDesc(e.target.value)} rows={4} placeholder="Describe the exception found during testing..."
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 13, resize: "vertical", fontFamily: "inherit", marginBottom: 16 }} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>AI will auto-draft the root cause analysis, management response template, and management letter comment.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowExcModal(false)} style={btnSec}>Cancel</button>
              <button onClick={() => {
                if (!wp?.id) return;
                createException.mutate({ workpaperId: wp.id, controlId, engagementId: engId, description: exceptionDesc });
                setShowExcModal(false);
                setExceptionDesc("");
              }} disabled={!exceptionDesc || createException.isPending || !wp?.id}
                style={{ ...btnPri, background: "var(--red)", opacity: !exceptionDesc ? 0.5 : 1 }}>
                {createException.isPending ? "Raising..." : "Raise Exception"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPri: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 };
const btnSec: React.CSSProperties = { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
