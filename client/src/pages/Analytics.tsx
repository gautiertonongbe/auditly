import { useRoute, Link } from "wouter";
import { ArrowLeft, TrendingUp, Shield, AlertTriangle, CheckCircle, Clock, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function AnalyticsPage() {
  const [, params] = useRoute("/engagements/:id/analytics");
  const engagementId = params?.id ?? "";

  const { data: controls } = trpc.controls.listByEngagement.useQuery({ engagementId }, { enabled: !!engagementId });
  const { data: exceptions } = trpc.exceptions.listByEngagement.useQuery({ engagementId }, { enabled: !!engagementId });
  const { data: pbcItems } = trpc.pbc.listByEngagement.useQuery({ engagementId }, { enabled: !!engagementId });
  const { data: ipeItems } = trpc.ipe.listByEngagement.useQuery({ engagementId }, { enabled: !!engagementId });
  const { data: workpapers } = trpc.workpapers.listByEngagement.useQuery({ engagementId }, { enabled: !!engagementId });

  // Controls metrics
  const totalControls = controls?.length ?? 0;
  const completeControls = controls?.filter(c => c.status === "Pass" || c.status === "Exception").length ?? 0;
  const passingControls = controls?.filter(c => c.status === "Pass").length ?? 0;
  const exceptionControls = controls?.filter(c => c.status === "Exception").length ?? 0;
  const inProgressControls = controls?.filter(c => c.status === "InProgress").length ?? 0;
  const notStartedControls = controls?.filter(c => c.status === "NotStarted").length ?? 0;
  const completionPct = totalControls > 0 ? Math.round((completeControls / totalControls) * 100) : 0;
  const passRate = completeControls > 0 ? Math.round((passingControls / completeControls) * 100) : 0;

  // Controls by domain
  const itgcControls = controls?.filter(c => c.domain === "ITGC") ?? [];
  const itacControls = controls?.filter(c => c.domain === "ITAC") ?? [];

  // Controls by type
  const byType: Record<string, number> = {};
  controls?.forEach(c => {
    const key = c.itgcType ?? c.itacType ?? "Other";
    byType[key] = (byType[key] ?? 0) + 1;
  });

  // Exceptions
  const openExceptions = exceptions?.filter(e => e.status === "Open").length ?? 0;
  const remediatedExceptions = exceptions?.filter(e => e.status === "Remediated").length ?? 0;
  const mwExceptions = exceptions?.filter(e => e.severity === "MaterialWeakness").length ?? 0;
  const sdExceptions = exceptions?.filter(e => e.severity === "SignificantDeficiency").length ?? 0;
  const cdExceptions = exceptions?.filter(e => e.severity === "ControlDeficiency").length ?? 0;

  // PBC
  const totalPbc = pbcItems?.length ?? 0;
  const acceptedPbc = pbcItems?.filter(p => p.status === "Accepted").length ?? 0;
  const overduePbc = pbcItems?.filter(p => p.dueDate && p.status === "Requested" && new Date(p.dueDate) < new Date()).length ?? 0;

  // IPE
  const totalIpe = ipeItems?.length ?? 0;
  const validatedIpe = ipeItems?.filter(i => i.completenessStatus === "Pass" && i.accuracyStatus === "Pass").length ?? 0;
  const failedIpe = ipeItems?.filter(i => i.completenessStatus === "Fail" || i.accuracyStatus === "Fail").length ?? 0;

  // Workpapers
  const aiGeneratedWps = workpapers?.filter(w => w.procedureDraft).length ?? 0;
  const signedOffWps = workpapers?.filter(w => w.preparedAt).length ?? 0;
  const reviewedWps = workpapers?.filter(w => w.reviewedAt).length ?? 0;

  const DOMAIN_COLOR: Record<string, string> = {
    CM: "#2E86DE", AM: "#8E44AD", CO: "#27AE60", PD: "#E67E22",
    Input: "#E74C3C", Processing: "#F39C12", Output: "#16A085", Interface: "#2C3E50",
  };

  return (
    <div style={{ padding: 32 }}>
      <Link href={`/engagements/${engagementId}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Engagement Overview
        </a>
      </Link>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>Analytics</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Engagement-level metrics and testing progress</p>
      </div>

      {/* Top KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        <KpiCard label="Completion" value={`${completionPct}%`} sub={`${completeControls}/${totalControls} controls done`} color="#2E86DE" icon={<TrendingUp size={18} color="#2E86DE" />} />
        <KpiCard label="Pass Rate" value={`${passRate}%`} sub={`${passingControls} passing controls`} color="#27AE60" icon={<CheckCircle size={18} color="#27AE60" />} />
        <KpiCard label="Exceptions" value={String(exceptions?.length ?? 0)} sub={`${openExceptions} open`} color={openExceptions > 0 ? "#E74C3C" : "#27AE60"} icon={<AlertTriangle size={18} color={openExceptions > 0 ? "#E74C3C" : "#27AE60"} />} />
        <KpiCard label="PBC Acceptance" value={`${totalPbc > 0 ? Math.round((acceptedPbc / totalPbc) * 100) : 0}%`} sub={`${acceptedPbc}/${totalPbc} accepted`} color="#F39C12" icon={<FileText size={18} color="#F39C12" />} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* Control status breakdown */}
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <Shield size={15} color="var(--accent)" /> Control Status Breakdown
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Pass", count: passingControls, color: "#27AE60", bg: "#EAFAF1" },
              { label: "Exception", count: exceptionControls, color: "#E74C3C", bg: "#FDEDEC" },
              { label: "In Progress", count: inProgressControls, color: "#2E86DE", bg: "#EBF3FB" },
              { label: "Not Started", count: notStartedControls, color: "#95A5A6", bg: "#F2F3F4" },
            ].map(row => (
              <div key={row.label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text)" }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{row.count}</span>
                </div>
                <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${totalControls > 0 ? (row.count / totalControls) * 100 : 0}%`, background: row.color, borderRadius: 3, transition: "width 0.3s" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Exception severity */}
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={15} color="#E74C3C" /> Exception Severity
          </div>
          {(exceptions?.length ?? 0) === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <CheckCircle size={28} color="var(--green)" style={{ margin: "0 auto 8px" }} />
              <p style={{ fontSize: 13, color: "var(--green)", fontWeight: 600 }}>No exceptions noted</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Material Weakness", count: mwExceptions, color: "#E74C3C", bg: "#FDEDEC" },
                { label: "Significant Deficiency", count: sdExceptions, color: "#E67E22", bg: "#FEF0E7" },
                { label: "Control Deficiency", count: cdExceptions, color: "#F39C12", bg: "#FFF8E6" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: row.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: row.color, flexShrink: 0 }}>{row.count}</div>
                  <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{row.label}</div>
                  {row.count > 0 && <div style={{ marginLeft: "auto" }}>
                    <span style={{ fontSize: 11, background: row.bg, color: row.color, padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                      {openExceptions > 0 && row.label === "Material Weakness" && mwExceptions > 0 ? "High Risk" : ""}
                    </span>
                  </div>}
                </div>
              ))}
              <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 16, fontSize: 12 }}>
                <span style={{ color: "var(--text-muted)" }}>Open: <strong style={{ color: "#E74C3C" }}>{openExceptions}</strong></span>
                <span style={{ color: "var(--text-muted)" }}>Remediated: <strong style={{ color: "#27AE60" }}>{remediatedExceptions}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* Controls by type */}
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", marginBottom: 16 }}>Controls by Type</div>
          {Object.keys(byType).length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No controls yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(byType).map(([type, count]) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: `${DOMAIN_COLOR[type] ?? "#95A5A6"}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: DOMAIN_COLOR[type] ?? "#95A5A6", flexShrink: 0 }}>{type.slice(0, 2)}</div>
                  <span style={{ fontSize: 12, color: "var(--text)", flex: 1 }}>
                    {type === "CM" ? "Change Management" : type === "AM" ? "Access Management" : type === "CO" ? "Computer Operations" : type === "PD" ? "Program Development" : type}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)" }}>{count}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 16 }}>
            <div style={{ fontSize: 12 }}>
              <span style={{ color: "var(--text-muted)" }}>ITGC </span>
              <span style={{ fontWeight: 700, color: "var(--accent)" }}>{itgcControls.length}</span>
            </div>
            <div style={{ fontSize: 12 }}>
              <span style={{ color: "var(--text-muted)" }}>ITAC </span>
              <span style={{ fontWeight: 700, color: "#8E44AD" }}>{itacControls.length}</span>
            </div>
          </div>
        </div>

        {/* Evidence & workpaper status */}
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={15} color="var(--accent)" /> Evidence & Workpaper Status
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Section label="PBC Items" items={[
              { label: "Accepted", value: acceptedPbc, color: "#27AE60" },
              { label: "Overdue", value: overduePbc, color: "#E74C3C" },
              { label: "Total", value: totalPbc, color: "var(--text-muted)" },
            ]} />
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <Section label="IPE Items" items={[
                { label: "Fully Validated", value: validatedIpe, color: "#27AE60" },
                { label: "Failed", value: failedIpe, color: "#E74C3C" },
                { label: "Total", value: totalIpe, color: "var(--text-muted)" },
              ]} />
            </div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <Section label="Workpapers" items={[
                { label: "AI Drafted", value: aiGeneratedWps, color: "#8E44AD" },
                { label: "Preparer Signed", value: signedOffWps, color: "#2E86DE" },
                { label: "Reviewer Signed", value: reviewedWps, color: "#27AE60" },
              ]} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
        {icon}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{sub}</div>
    </div>
  );
}

function Section({ label, items }: { label: string; items: { label: string; value: number; color: string }[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 20 }}>
        {items.map(item => (
          <div key={item.label}>
            <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
