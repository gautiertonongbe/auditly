import { useRoute, Link } from "wouter";
import { ArrowLeft, Activity, Filter } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { useState } from "react";

const ACTION_CFG: Record<string, { color: string; bg: string }> = {
  create:      { color: "#27AE60", bg: "#EAFAF1" },
  update:      { color: "#2E86DE", bg: "#EBF3FB" },
  delete:      { color: "#E74C3C", bg: "#FDEDEC" },
  sign_off:    { color: "#8E44AD", bg: "#F4ECF7" },
  generate_ai: { color: "#F39C12", bg: "#FFF8E6" },
  export:      { color: "#16A085", bg: "#E8F8F5" },
  import:      { color: "#2980B9", bg: "#EBF5FB" },
  rollforward: { color: "#E67E22", bg: "#FEF0E7" },
};

const ENTITY_LABELS: Record<string, string> = {
  control:     "Control",
  workpaper:   "Workpaper",
  exception:   "Exception",
  pbc:         "PBC Item",
  ipe:         "IPE Item",
  sod:         "SOD Analysis",
  engagement:  "Engagement",
  deficiency:  "Deficiency Assessment",
  user:        "User",
};

export default function AuditTrailPage() {
  const [, params] = useRoute("/engagements/:id/audit-trail");
  const engagementId = params?.id ?? "";
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");

  const { data: trail } = trpc.auditTrail.listByEngagement.useQuery({ engagementId });

  const filtered = (trail ?? []).filter(entry => {
    if (filterAction !== "all" && entry.action !== filterAction) return false;
    if (filterEntity !== "all" && entry.entityType !== filterEntity) return false;
    return true;
  });

  const uniqueActions = [...new Set((trail ?? []).map(e => e.action))];
  const uniqueEntities = [...new Set((trail ?? []).map(e => e.entityType))];

  return (
    <div style={{ padding: 32 }}>
      <Link href={`/engagements/${engagementId}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Engagement Overview
        </a>
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>Audit Trail</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>{trail?.length ?? 0} events · immutable log</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
          <Activity size={13} /> Chronological, newest first
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <Filter size={13} color="var(--text-muted)" />
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={sel}>
          <option value="all">All actions</option>
          {uniqueActions.map(a => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
        </select>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={sel}>
          <option value="all">All entities</option>
          {uniqueEntities.map(e => <option key={e} value={e}>{ENTITY_LABELS[e] ?? e}</option>)}
        </select>
        {(filterAction !== "all" || filterEntity !== "all") && (
          <button onClick={() => { setFilterAction("all"); setFilterEntity("all"); }} style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Timeline */}
      <div style={{ position: "relative" }}>
        {/* Vertical line */}
        <div style={{ position: "absolute", left: 17, top: 0, bottom: 0, width: 2, background: "var(--border)" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {filtered.length === 0 && (
            <div style={{ background: "var(--surface)", borderRadius: 12, border: "2px dashed var(--border)", padding: "50px 40px", textAlign: "center", marginLeft: 36 }}>
              <Activity size={28} color="var(--border)" style={{ margin: "0 auto 12px" }} />
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No audit trail entries yet.</p>
            </div>
          )}
          {filtered.map((entry, i) => {
            const cfg = ACTION_CFG[entry.action] ?? { color: "#95A5A6", bg: "#F2F3F4" };
            return (
              <div key={entry.id} style={{ display: "flex", gap: 14, paddingBottom: 16 }}>
                {/* Dot */}
                <div style={{ width: 36, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: cfg.color, border: "2px solid #fff", marginTop: 14, zIndex: 1, flexShrink: 0 }} />
                </div>

                {/* Card */}
                <div style={{ flex: 1, background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", padding: "12px 16px", marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: cfg.bg, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {entry.action.replace(/_/g, " ")}
                        </span>
                        <span style={{ fontSize: 11, background: "var(--surface-alt)", color: "var(--text-muted)", padding: "2px 7px", borderRadius: 4, fontWeight: 500 }}>
                          {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-strong)", fontWeight: 500 }}>
                        {entry.description}
                      </div>
                      {(entry.before != null || entry.after != null) && (
                        <details style={{ marginTop: 8 }}>
                          <summary style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>Show diff</summary>
                          <pre style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--surface-alt)", padding: "8px 10px", borderRadius: 6, marginTop: 6, overflow: "auto", maxHeight: 120 }}>
                            {JSON.stringify({ before: entry.before as object, after: entry.after as object }, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{format(new Date(entry.timestamp), "MMM d, yyyy")}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{format(new Date(entry.timestamp), "h:mm a")}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const sel: React.CSSProperties = {
  height: 32, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px",
  fontSize: 12, background: "#fff", cursor: "pointer", color: "var(--text)",
};
