import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, ClipboardList, FileText, FileCheck2, AlertTriangle, Database, GitMerge, Download, Users, RefreshCw, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

function StatCard({ label, value, icon: Icon, color, sub }: { label: string; value: string | number; icon: typeof CheckCircle; color: string; sub?: string }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} color={color} />
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-strong)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function QuickAction({ label, icon: Icon, href, color }: { label: string; icon: typeof ClipboardList; href: string; color: string }) {
  return (
    <Link href={href}>
      <a style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", textDecoration: "none", color: "var(--text)", fontSize: 13, fontWeight: 500, transition: "all 0.15s", cursor: "pointer" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = color; (e.currentTarget as HTMLElement).style.background = color + "08"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
      >
        <div style={{ width: 34, height: 34, borderRadius: 8, background: color + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={16} color={color} />
        </div>
        {label}
      </a>
    </Link>
  );
}

export default function EngagementDetailPage() {
  const [, params] = useRoute("/engagements/:id");
  const id = params?.id ?? "";
  const { data, refetch } = trpc.engagements.get.useQuery({ id });
  const updateStatus = trpc.engagements.updateStatus.useMutation({ onSuccess: () => refetch() });
  const seedControls = trpc.controls.seedStandardControls.useMutation({ onSuccess: () => refetch() });
  const exportMutation = trpc.export.exportEngagement.useMutation({
    onSuccess: (data) => {
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.base64}`;
      link.download = data.fileName;
      link.click();
    },
  });

  if (!data) return <div style={{ padding: 32, color: "var(--text-muted)" }}>Loading...</div>;

  const eng = data;
  const controls = data.controls ?? [];
  const complete = controls.filter(c => c.status === "Complete").length;
  const exceptions = controls.filter(c => c.status === "Exception").length;
  const inProgress = controls.filter(c => c.status === "InProgress").length;
  const notStarted = controls.filter(c => c.status === "NotStarted").length;

  const STATUS_FLOW = ["planning", "fieldwork", "review", "complete"];
  const currentIdx = STATUS_FLOW.indexOf(eng.status);

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/engagements">
          <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 12 }}>
            <ArrowLeft size={14} /> All Engagements
          </a>
        </Link>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>{eng.clientName}</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              FY{eng.fiscalYear} · {eng.framework} ·{" "}
              {format(new Date(eng.periodStart), "MMM d")} – {format(new Date(eng.periodEnd), "MMM d, yyyy")}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {controls.length === 0 && (
              <button onClick={() => seedControls.mutate({ engagementId: id })} disabled={seedControls.isPending}
                style={{ ...btnBase, background: "var(--accent-light)", color: "var(--accent)", border: "1px solid #c3ddf7" }}>
                {seedControls.isPending ? "Seeding..." : "Seed Standard ITGC Controls"}
              </button>
            )}
            <button onClick={() => exportMutation.mutate({ engagementId: id })} disabled={exportMutation.isPending}
              style={{ ...btnBase, background: "var(--navy)", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
              <Download size={14} /> {exportMutation.isPending ? "Exporting..." : "Export Workbook (.xlsx)"}
            </button>
          </div>
        </div>
      </div>

      {/* Progress stepper */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: "16px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 0 }}>
        {STATUS_FLOW.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const label = s.charAt(0).toUpperCase() + s.slice(1);
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <button onClick={() => updateStatus.mutate({ id, status: s as "planning" | "fieldwork" | "review" | "complete" })}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: done ? "var(--green)" : active ? "var(--accent)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {done ? <CheckCircle size={14} color="#fff" /> : <span style={{ fontSize: 11, fontWeight: 700, color: active ? "#fff" : "var(--text-muted)" }}>{i + 1}</span>}
                </div>
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "var(--text-strong)" : done ? "var(--green)" : "var(--text-muted)" }}>{label}</span>
              </button>
              {i < STATUS_FLOW.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "var(--green)" : "var(--border)", margin: "0 8px" }} />}
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Controls" value={controls.length} icon={ClipboardList} color="var(--accent)" />
        <StatCard label="Complete" value={complete} icon={CheckCircle} color="var(--green)" sub={controls.length ? `${Math.round(complete / controls.length * 100)}% done` : undefined} />
        <StatCard label="In Progress" value={inProgress} icon={Clock} color="var(--orange)" />
        <StatCard label="Exceptions" value={exceptions} icon={AlertTriangle} color="var(--red)" />
      </div>

      {/* Control progress bar */}
      {controls.length > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>Testing Progress</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{complete} of {controls.length} controls complete</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, var(--green), #52BE80)", width: `${controls.length ? (complete / controls.length) * 100 : 0}%`, transition: "width 0.5s" }} />
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            {[
              { label: "Not Started", count: notStarted, color: "var(--text-muted)" },
              { label: "In Progress", count: inProgress, color: "var(--orange)" },
              { label: "Complete", count: complete, color: "var(--green)" },
              { label: "Exception", count: exceptions, color: "var(--red)" },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                {count} {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)", marginBottom: 12 }}>Quick Navigation</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <QuickAction label="Controls" icon={ClipboardList} href={`/engagements/${id}/controls`} color="var(--accent)" />
          <QuickAction label="Workpapers" icon={FileText} href={`/engagements/${id}/workpapers`} color="#8E44AD" />
          <QuickAction label="PBC Tracker" icon={FileCheck2} href={`/engagements/${id}/pbc`} color="var(--orange)" />
          <QuickAction label="IPE Register" icon={Database} href={`/engagements/${id}/ipe`} color="#16A085" />
          <QuickAction label="SOD Analysis" icon={GitMerge} href={`/engagements/${id}/sod`} color="#2C3E50" />
          <QuickAction label="Exceptions" icon={AlertTriangle} href={`/engagements/${id}/exceptions`} color="var(--red)" />
        </div>
      </div>
    </div>
  );
}

const btnBase: React.CSSProperties = { border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
