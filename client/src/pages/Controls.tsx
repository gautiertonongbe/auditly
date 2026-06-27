import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Plus, ClipboardList, ChevronRight, Zap, Filter } from "lucide-react";
import { trpc } from "@/lib/trpc";

const DOMAIN_COLORS: Record<string, { bg: string; color: string }> = {
  CM: { bg: "#EBF3FB", color: "#2E86DE" },
  AM: { bg: "#FFF8E6", color: "#F39C12" },
  CO: { bg: "#EAFAF1", color: "#27AE60" },
  PD: { bg: "#F5EEF8", color: "#8E44AD" },
  Input: { bg: "#EBF3FB", color: "#2E86DE" },
  Processing: { bg: "#FFF8E6", color: "#F39C12" },
  Output: { bg: "#EAFAF1", color: "#27AE60" },
  Interface: { bg: "#F5EEF8", color: "#8E44AD" },
};

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  NotStarted:  { color: "#95A5A6", bg: "#F2F3F4", label: "Not Started" },
  InProgress:  { color: "#F39C12", bg: "#FFF8E6", label: "In Progress" },
  UnderReview: { color: "#8E44AD", bg: "#F5EEF8", label: "Under Review" },
  Complete:    { color: "#27AE60", bg: "#EAFAF1", label: "Complete" },
  Exception:   { color: "#E74C3C", bg: "#FDEDEC", label: "Exception" },
};

const RISK_COLORS: Record<string, string> = { High: "#E74C3C", Medium: "#F39C12", Low: "#27AE60" };

function CreateControlModal({ engagementId, onClose, onCreated }: { engagementId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ domain: "ITGC", itgcType: "CM", itacType: "", controlRef: "", objective: "", frequency: "Quarterly", riskLevel: "Medium" });
  const create = trpc.controls.create.useMutation({ onSuccess: () => { onCreated(); onClose(); } });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 540, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "22px 28px", position: "sticky", top: 0 }}>
          <h2 style={{ color: "#fff", fontSize: 17, fontWeight: 700, margin: 0 }}>Add Control</h2>
        </div>
        <div style={{ padding: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Domain</label>
              <select value={form.domain} onChange={set("domain")} style={inp}>
                <option value="ITGC">ITGC</option>
                <option value="ITAC">ITAC</option>
              </select>
            </div>
            <div>
              {form.domain === "ITGC" ? (
                <>
                  <label style={lbl}>Type</label>
                  <select value={form.itgcType} onChange={set("itgcType")} style={inp}>
                    <option value="CM">Change Management (CM)</option>
                    <option value="AM">Access Management (AM)</option>
                    <option value="CO">Computer Operations (CO)</option>
                    <option value="PD">Program Development (PD)</option>
                  </select>
                </>
              ) : (
                <>
                  <label style={lbl}>Type</label>
                  <select value={form.itacType} onChange={set("itacType")} style={inp}>
                    <option value="Input">Input</option>
                    <option value="Processing">Processing</option>
                    <option value="Output">Output</option>
                    <option value="Interface">Interface</option>
                  </select>
                </>
              )}
            </div>
            <div>
              <label style={lbl}>Control Ref *</label>
              <input value={form.controlRef} onChange={set("controlRef")} placeholder="e.g. CM-01" style={inp} />
            </div>
            <div>
              <label style={lbl}>Risk Level</label>
              <select value={form.riskLevel} onChange={set("riskLevel")} style={inp}>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Frequency</label>
              <select value={form.frequency} onChange={set("frequency")} style={inp}>
                {["Annual", "SemiAnnual", "Quarterly", "Monthly", "Daily", "Continuous"].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Control Objective *</label>
              <textarea value={form.objective} onChange={set("objective")} rows={3} placeholder="Describe the control objective..." style={{ ...inp, height: "auto", padding: "10px 12px", resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={btnSecondary}>Cancel</button>
            <button onClick={() => create.mutate({ engagementId, ...form, domain: form.domain as "ITGC" | "ITAC", itgcType: form.domain === "ITGC" ? form.itgcType as "CM" | "AM" | "CO" | "PD" : undefined, itacType: form.domain === "ITAC" ? form.itacType as "Input" | "Processing" | "Output" | "Interface" : undefined, frequency: form.frequency as "Annual" | "SemiAnnual" | "Quarterly" | "Monthly" | "Daily" | "Continuous", riskLevel: form.riskLevel as "High" | "Medium" | "Low" })}
              disabled={!form.controlRef || !form.objective || create.isPending}
              style={{ ...btnPrimary, opacity: (!form.controlRef || !form.objective || create.isPending) ? 0.6 : 1 }}>
              {create.isPending ? "Adding..." : "Add Control"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ControlsPage() {
  const [, params] = useRoute("/engagements/:id/controls");
  const engagementId = params?.id ?? "";
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "ITGC" | "ITAC">("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: controls, refetch } = trpc.controls.listByEngagement.useQuery({ engagementId }, { enabled: !!engagementId });
  const seedControls = trpc.controls.seedStandardControls.useMutation({ onSuccess: () => refetch() });

  const filtered = (controls ?? []).filter(c => {
    if (filter !== "all" && c.domain !== filter) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  const itgcCount = controls?.filter(c => c.domain === "ITGC").length ?? 0;
  const itacCount = controls?.filter(c => c.domain === "ITAC").length ?? 0;

  return (
    <div style={{ padding: 32 }}>
      <Link href={`/engagements/${engagementId}`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Engagement Overview
        </a>
      </Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>Controls</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>{itgcCount} ITGC · {itacCount} ITAC</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!controls?.length && (
            <button onClick={() => seedControls.mutate({ engagementId })} disabled={seedControls.isPending}
              style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)" }}>
              <Zap size={13} /> {seedControls.isPending ? "Seeding..." : "Seed Standard Controls"}
            </button>
          )}
          <button onClick={() => setShowCreate(true)} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> Add Control
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {["all", "ITGC", "ITAC"].map(f => (
          <button key={f} onClick={() => setFilter(f as "all" | "ITGC" | "ITAC")}
            style={{ padding: "5px 14px", borderRadius: 20, border: "1px solid", fontSize: 12, fontWeight: 500, cursor: "pointer", background: filter === f ? "var(--navy)" : "var(--surface)", color: filter === f ? "#fff" : "var(--text)", borderColor: filter === f ? "var(--navy)" : "var(--border)" }}>
            {f === "all" ? "All domains" : f}
          </button>
        ))}
        <div style={{ width: 1, background: "var(--border)", margin: "0 4px" }} />
        {["all", "NotStarted", "InProgress", "Complete", "Exception"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ padding: "5px 14px", borderRadius: 20, border: "1px solid", fontSize: 12, fontWeight: 500, cursor: "pointer", background: statusFilter === s ? "var(--navy)" : "var(--surface)", color: statusFilter === s ? "#fff" : "var(--text)", borderColor: statusFilter === s ? "var(--navy)" : "var(--border)" }}>
            {s === "all" ? "All statuses" : STATUS_COLORS[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Group by type */}
      {["CM", "AM", "CO", "PD", "Input", "Processing", "Output", "Interface"].map(type => {
        const group = filtered.filter(c => (c.itgcType ?? c.itacType) === type);
        if (!group.length) return null;
        const typeLabel: Record<string, string> = { CM: "Change Management", AM: "Access Management", CO: "Computer Operations", PD: "Program Development", Input: "Input Controls", Processing: "Processing Controls", Output: "Output Controls", Interface: "Interface Controls" };
        const dc = DOMAIN_COLORS[type] ?? DOMAIN_COLORS.CM;
        return (
          <div key={type} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ padding: "3px 10px", borderRadius: 6, background: dc.bg, color: dc.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em" }}>{type}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{typeLabel[type]}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>({group.length})</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {group.map(ctrl => {
                const sc = STATUS_COLORS[ctrl.status] ?? STATUS_COLORS.NotStarted;
                return (
                  <Link key={ctrl.id} href={`/engagements/${engagementId}/controls/${ctrl.id}`}>
                    <a style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", padding: "14px 18px", textDecoration: "none", cursor: "pointer", transition: "box-shadow 0.15s" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 10px rgba(0,0,0,0.07)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "none"}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: dc.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: dc.color }}>{ctrl.controlRef}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)", marginBottom: 2 }}>{ctrl.controlRef} — {ctrl.objective.slice(0, 80)}{ctrl.objective.length > 80 ? "..." : ""}</div>
                        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
                          <span>{ctrl.frequency}</span>
                          <span style={{ color: RISK_COLORS[ctrl.riskLevel] ?? "#888", fontWeight: 600 }}>{ctrl.riskLevel} risk</span>
                          {ctrl.elevatedSample && <span style={{ color: "#E74C3C", fontWeight: 600 }}>Elevated sample</span>}
                        </div>
                      </div>
                      <span style={{ padding: "3px 10px", borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{sc.label}</span>
                      <ChevronRight size={14} color="var(--text-muted)" />
                    </a>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}

      {!filtered.length && (
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: "50px 40px", textAlign: "center" }}>
          <ClipboardList size={32} color="var(--border)" style={{ margin: "0 auto 12px" }} />
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No controls yet. Add controls manually or seed the standard ITGC set.</p>
        </div>
      )}

      {showCreate && <CreateControlModal engagementId={engagementId} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 13, background: "#fff" };
const btnPrimary: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
