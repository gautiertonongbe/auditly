import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, GitMerge, Play, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

const SEVERITY_CFG: Record<string, { color: string; bg: string }> = {
  High:   { color: "#E74C3C", bg: "#FDEDEC" },
  Medium: { color: "#F39C12", bg: "#FFF8E6" },
  Low:    { color: "#27AE60", bg: "#EAFAF1" },
};

export default function SodAnalysisPage() {
  const [, params] = useRoute("/engagements/:id/sod");
  const engagementId = params?.id ?? "";
  const [systemName, setSystemName] = useState("");
  const [accessData, setAccessData] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: analyses, refetch } = trpc.sod.listByEngagement.useQuery({ engagementId }, { enabled: !!engagementId });
  const analyze = trpc.sod.analyze.useMutation({ onSuccess: () => { refetch(); setAccessData(""); setSystemName(""); } });

  const totalConflicts = analyses?.reduce((sum, a) => sum + (a.totalConflictsFound ?? 0), 0) ?? 0;
  const highSeverity = analyses?.reduce((sum, a) => sum + (a.highSeverityCount ?? 0), 0) ?? 0;

  return (
    <div style={{ padding: 32 }}>
      <Link href={`/engagements/${engagementId}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Engagement Overview
        </a>
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>SOD Analysis</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            {totalConflicts} total conflicts · {highSeverity > 0 ? <span style={{ color: "var(--red)", fontWeight: 600 }}>{highSeverity} high severity</span> : "no high severity"}
          </p>
        </div>
      </div>

      {/* Run new analysis */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 7 }}>
          <GitMerge size={16} color="var(--accent)" /> Run New SOD Analysis
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>System / Application *</label>
            <input value={systemName} onChange={e => setSystemName(e.target.value)} placeholder="e.g. SAP ERP, Workday, NetSuite" style={inp} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Paste User Access Data *</label>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Paste a CSV or table export of user roles/permissions. Include headers (Username, Role, Access Level, etc.)</p>
          <textarea
            value={accessData}
            onChange={e => setAccessData(e.target.value)}
            rows={10}
            placeholder={`Username,Role,Module,Access Level\njsmith,AP Clerk,Accounts Payable,Create Invoice\njsmith,AP Manager,Accounts Payable,Approve Invoice\nbdoe,Buyer,Procurement,Create PO\nbdoe,Budget Owner,Finance,Approve PO\n...`}
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", fontSize: 12, fontFamily: "monospace", resize: "vertical", lineHeight: 1.6 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => analyze.mutate({ engagementId, systemName, userAccessData: accessData })}
            disabled={!systemName || !accessData || analyze.isPending}
            style={{ ...btnPri, display: "flex", alignItems: "center", gap: 7, opacity: (!systemName || !accessData) ? 0.5 : 1 }}>
            <Play size={13} /> {analyze.isPending ? "Analyzing with AI..." : "Run SOD Analysis"}
          </button>
          {analyze.isPending && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Claude is reviewing user access for conflicting roles...</span>}
        </div>
      </div>

      {/* Past analyses */}
      {analyses?.map(analysis => {
        const conflicts = (analysis.conflicts as { user: string; roles: string[]; risk: string; severity: string }[]) ?? [];
        const expanded = expandedId === analysis.id;
        return (
          <div key={analysis.id} style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", marginBottom: 14, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setExpandedId(expanded ? null : analysis.id)}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: "#F2F3F4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <GitMerge size={18} color="#2C3E50" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>{analysis.systemName}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  Analyzed {format(new Date(analysis.analyzedAt), "MMM d, yyyy")} · {analysis.totalUsersAnalyzed} users analyzed
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {analysis.highSeverityCount ? (
                  <span style={{ padding: "3px 10px", borderRadius: 20, background: "#FDEDEC", color: "var(--red)", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <AlertTriangle size={10} /> {analysis.highSeverityCount} High
                  </span>
                ) : null}
                <span style={{ padding: "3px 10px", borderRadius: 20, background: "var(--border)", color: "var(--text-muted)", fontSize: 11, fontWeight: 600 }}>
                  {analysis.totalConflictsFound} conflicts
                </span>
                {expanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
              </div>
            </div>

            {expanded && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                {analysis.aiSummary && (
                  <div style={{ padding: "14px 20px", background: "#F8FAFC", borderBottom: "1px solid var(--border)" }}>
                    <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7, margin: 0 }}>{analysis.aiSummary}</p>
                  </div>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--surface-alt)" }}>
                      {["User", "Conflicting Roles", "Business Risk", "Severity"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {conflicts.sort((a, b) => (a.severity === "High" ? -1 : 1)).map((conflict, i) => {
                      const sc = SEVERITY_CFG[conflict.severity] ?? SEVERITY_CFG.Low;
                      return (
                        <tr key={i} style={{ borderBottom: i < conflicts.length - 1 ? "1px solid var(--border)" : "none" }}>
                          <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{conflict.user}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {conflict.roles.map((r, ri) => (
                                <span key={ri} style={{ padding: "2px 7px", borderRadius: 4, background: "var(--accent-light)", color: "var(--accent)", fontSize: 11, fontWeight: 500 }}>{r}</span>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--text)", maxWidth: 280 }}>{conflict.risk}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ padding: "3px 10px", borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600 }}>{conflict.severity}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {!analyses?.length && (
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "2px dashed var(--border)", padding: "50px 40px", textAlign: "center" }}>
          <GitMerge size={32} color="var(--border)" style={{ margin: "0 auto 12px" }} />
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No SOD analyses yet. Paste user access data above to run your first analysis.</p>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 13, background: "#fff" };
const btnPri: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
