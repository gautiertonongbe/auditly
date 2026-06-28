import { useRoute, Link } from "wouter";
import { ArrowLeft, FileText, ChevronRight, CheckCircle, Clock, AlertTriangle, Circle, PenLine } from "lucide-react";
import { trpc } from "@/lib/trpc";

const DOMAIN_COLORS: Record<string, { bg: string; color: string }> = {
  CM:         { bg: "#EBF3FB", color: "#2E86DE" },
  AM:         { bg: "#FFF8E6", color: "#F39C12" },
  CO:         { bg: "#EAFAF1", color: "#27AE60" },
  PD:         { bg: "#F5EEF8", color: "#8E44AD" },
  Input:      { bg: "#EBF3FB", color: "#2E86DE" },
  Processing: { bg: "#FFF8E6", color: "#F39C12" },
  Output:     { bg: "#EAFAF1", color: "#27AE60" },
  Interface:  { bg: "#F5EEF8", color: "#8E44AD" },
};

const TYPE_LABELS: Record<string, string> = {
  CM: "Change Management", AM: "Access Management",
  CO: "Computer Operations", PD: "Program Development",
  Input: "Input Controls", Processing: "Processing Controls",
  Output: "Output Controls", Interface: "Interface Controls",
};

const WP_STATUS: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  Draft:          { label: "Draft",           color: "#64748B", bg: "#F8FAFC",  icon: PenLine },
  InProgress:     { label: "In Progress",     color: "#D97706", bg: "#FFF7ED",  icon: Clock },
  PendingReview:  { label: "Pending Review",  color: "#7C3AED", bg: "#F5F3FF",  icon: Clock },
  ReviewComplete: { label: "Review Complete", color: "#059669", bg: "#ECFDF5",  icon: CheckCircle },
  Signed:         { label: "Signed Off",      color: "#1E40AF", bg: "#EFF6FF",  icon: CheckCircle },
  Exception:      { label: "Exception",       color: "#DC2626", bg: "#FEF2F2",  icon: AlertTriangle },
};

const CTRL_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  NotStarted:  { label: "Not Started",  color: "#64748B", bg: "#F8FAFC" },
  InProgress:  { label: "In Progress",  color: "#D97706", bg: "#FFF7ED" },
  UnderReview: { label: "Under Review", color: "#7C3AED", bg: "#F5F3FF" },
  Complete:    { label: "Complete",     color: "#059669", bg: "#ECFDF5" },
  Exception:   { label: "Exception",    color: "#DC2626", bg: "#FEF2F2" },
};

const ORDER = ["CM", "AM", "CO", "PD", "Input", "Processing", "Output", "Interface"];

function deriveWpStatus(wp: { preparedAt: string | Date | null; reviewedAt: string | Date | null; approvedAt: string | Date | null; conclusion: string; procedureDraft: string | null; resultsDraft: string | null }): string {
  if (wp.conclusion === "ExceptionNoted") return "Exception";
  if (wp.approvedAt) return "Signed";
  if (wp.reviewedAt) return "ReviewComplete";
  if (wp.preparedAt) return "PendingReview";
  if (wp.procedureDraft || wp.resultsDraft) return "InProgress";
  return "Draft";
}

export default function WorkpapersPage() {
  const [, params] = useRoute("/engagements/:id/workpapers");
  const engagementId = params?.id ?? "";

  const { data: wps } = trpc.workpapers.listByEngagement.useQuery({ engagementId });
  const { data: controls } = trpc.controls.listByEngagement.useQuery({ engagementId });

  const wpMap = new Map((wps ?? []).map(w => [w.controlId, w]));

  const groups: Record<string, NonNullable<typeof controls>> = {};
  for (const ctrl of controls ?? []) {
    const key = ctrl.itgcType ?? ctrl.itacType ?? "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(ctrl);
  }

  const total = controls?.length ?? 0;
  const signed = (wps ?? []).filter(w => deriveWpStatus(w) === "Signed").length;
  const reviewComplete = (wps ?? []).filter(w => deriveWpStatus(w) === "ReviewComplete").length;
  const exceptions = (wps ?? []).filter(w => deriveWpStatus(w) === "Exception").length;

  return (
    <div style={{ padding: "32px 32px 48px" }}>
      <Link href={`/engagements/${engagementId}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Engagement Overview
        </a>
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>Workpapers</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "3px 0 0" }}>
            {(wps ?? []).length} of {total} controls documented · {signed} signed off
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Controls",  value: total,          color: "var(--accent)" },
          { label: "Signed Off",      value: signed,         color: "#059669" },
          { label: "Review Complete", value: reviewComplete, color: "#7C3AED" },
          { label: "Exceptions",      value: exceptions,     color: "#DC2626" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", padding: "14px 18px" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{label}</div>
            <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: "#F1F5F9" }}>
              <div style={{ width: total > 0 ? `${Math.round((value / total) * 100)}%` : "0%", height: "100%", borderRadius: 2, background: color, transition: "width 0.4s" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Groups */}
      {ORDER.filter(k => groups[k]?.length).map(type => {
        const dc = DOMAIN_COLORS[type] ?? DOMAIN_COLORS.CM;
        const group = groups[type] ?? [];
        return (
          <div key={type} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ padding: "3px 9px", borderRadius: 5, background: dc.bg, color: dc.color, fontSize: 10, fontWeight: 800, letterSpacing: "0.07em" }}>{type}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>{TYPE_LABELS[type]}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", background: "#F1F5F9", padding: "1px 7px", borderRadius: 10 }}>{group.length}</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 110px 130px 130px 36px", padding: "8px 18px", background: "#F8FAFC", borderBottom: "1px solid var(--border)" }}>
                {["Ref", "Objective", "Frequency", "Control Status", "Workpaper", ""].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                ))}
              </div>

              {group.map((ctrl, i) => {
                const wp = wpMap.get(ctrl.id);
                const wpStatus = wp ? deriveWpStatus(wp) : null;
                const wpCfg = wpStatus ? (WP_STATUS[wpStatus] ?? WP_STATUS.Draft) : null;
                const ctrlCfg = CTRL_STATUS[ctrl.status] ?? CTRL_STATUS.NotStarted;
                const WpIcon = wpCfg?.icon ?? Circle;
                return (
                  <Link key={ctrl.id} href={`/engagements/${engagementId}/controls/${ctrl.id}`}>
                    <a style={{ display: "grid", gridTemplateColumns: "100px 1fr 110px 130px 130px 36px", alignItems: "center", padding: "13px 18px", borderBottom: i < group.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none", transition: "background 0.1s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <div>
                        <span style={{ padding: "3px 9px", borderRadius: 5, background: dc.bg, color: dc.color, fontSize: 11, fontWeight: 700 }}>
                          {ctrl.controlRef}
                        </span>
                      </div>
                      <div style={{ minWidth: 0, paddingRight: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctrl.objective}</div>
                        <div style={{ fontSize: 11, marginTop: 1, color: ctrl.riskLevel === "High" ? "#DC2626" : ctrl.riskLevel === "Medium" ? "#D97706" : "#059669", fontWeight: 600 }}>
                          {ctrl.riskLevel} risk
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{ctrl.frequency}</div>
                      <div>
                        <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: ctrlCfg.bg, color: ctrlCfg.color, fontWeight: 600 }}>{ctrlCfg.label}</span>
                      </div>
                      <div>
                        {wpCfg ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 9px", borderRadius: 20, background: wpCfg.bg, color: wpCfg.color, fontWeight: 600 }}>
                            <WpIcon size={10} />{wpCfg.label}
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94A3B8" }}>
                            <FileText size={11} />Not started
                          </span>
                        )}
                      </div>
                      <ChevronRight size={14} color="#CBD5E1" />
                    </a>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}

      {!controls?.length && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--border)", padding: "48px 40px", textAlign: "center" }}>
          <FileText size={28} color="#CBD5E1" style={{ margin: "0 auto 12px" }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)", marginBottom: 6 }}>No controls yet</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>Add controls to this engagement first to start documenting workpapers.</div>
          <Link href={`/engagements/${engagementId}/controls`}>
            <a style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--accent)", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Go to Controls
            </a>
          </Link>
        </div>
      )}
    </div>
  );
}
