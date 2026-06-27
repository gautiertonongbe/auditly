import { useState } from "react";
import { Link } from "wouter";
import { Briefcase, Plus, ChevronRight, Calendar, RefreshCw, Clock, CheckCircle, AlertCircle, Archive } from "lucide-react";
import { trpc } from "@/lib/trpc";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  planning:  { label: "Planning",   color: "#F39C12", bg: "#FFF8E6", icon: Clock },
  fieldwork: { label: "Fieldwork",  color: "#2E86DE", bg: "#EBF3FB", icon: Briefcase },
  review:    { label: "Under Review",color: "#8E44AD", bg: "#F5EEF8", icon: RefreshCw },
  complete:  { label: "Complete",   color: "#27AE60", bg: "#EAFAF1", icon: CheckCircle },
  archived:  { label: "Archived",   color: "#95A5A6", bg: "#F2F3F4", icon: Archive },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.planning;
  const Icon = cfg.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 600 }}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ clientName: "", clientIndustry: "", fiscalYear: new Date().getFullYear(), periodStart: "", periodEnd: "", framework: "PCAOB" });
  const create = trpc.engagements.create.useMutation({ onSuccess: () => { onCreated(); onClose(); } });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "24px 28px" }}>
          <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 }}>New Engagement</h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 4 }}>Create a new SOX audit engagement</p>
        </div>
        <div style={{ padding: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Client Name *</label>
              <input value={form.clientName} onChange={set("clientName")} placeholder="Acme Corp" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Industry</label>
              <select value={form.clientIndustry} onChange={set("clientIndustry")} style={inputStyle}>
                <option value="">Select industry</option>
                {["Technology", "Financial Services", "Healthcare", "Manufacturing", "Retail", "Energy", "Real Estate", "Other"].map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fiscal Year *</label>
              <input type="number" value={form.fiscalYear} onChange={set("fiscalYear")} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Period Start *</label>
              <input type="date" value={form.periodStart} onChange={set("periodStart")} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Period End *</label>
              <input type="date" value={form.periodEnd} onChange={set("periodEnd")} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Framework</label>
              <select value={form.framework} onChange={set("framework")} style={inputStyle}>
                <option value="PCAOB">PCAOB (AS 2201)</option>
                <option value="AICPA">AICPA</option>
                <option value="ISAE3402">ISAE 3402</option>
              </select>
            </div>
          </div>
          {create.error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>Failed to create engagement. Please try again.</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ ...btnBase, background: "var(--surface-alt)", color: "var(--text)" }}>Cancel</button>
            <button
              onClick={() => create.mutate({ ...form, fiscalYear: Number(form.fiscalYear), periodStart: new Date(form.periodStart), periodEnd: new Date(form.periodEnd) })}
              disabled={!form.clientName || !form.periodStart || !form.periodEnd || create.isPending}
              style={{ ...btnBase, background: "var(--navy)", color: "#fff", opacity: (!form.clientName || create.isPending) ? 0.6 : 1 }}
            >
              {create.isPending ? "Creating..." : "Create Engagement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EngagementsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: engagements, refetch } = trpc.engagements.list.useQuery();

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>Engagements</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{engagements?.length ?? 0} engagement{engagements?.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ ...btnBase, background: "var(--navy)", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={15} /> New Engagement
        </button>
      </div>

      {!engagements?.length ? (
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: "60px 40px", textAlign: "center" }}>
          <Briefcase size={36} color="var(--border)" style={{ margin: "0 auto 16px" }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-strong)", margin: "0 0 8px" }}>No engagements yet</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px" }}>Create your first SOX audit engagement to get started.</p>
          <button onClick={() => setShowCreate(true)} style={{ ...btnBase, background: "var(--navy)", color: "#fff" }}>Create Engagement</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {engagements.map(eng => (
            <Link key={eng.id} href={`/engagements/${eng.id}`}>
              <a style={{ display: "block", textDecoration: "none" }}>
                <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer", transition: "box-shadow 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)")}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Briefcase size={20} color="var(--accent)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-strong)" }}>{eng.clientName}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Calendar size={11} /> FY{eng.fiscalYear}</span>
                      <span>{eng.framework}</span>
                      {eng.clientIndustry && <span>{eng.clientIndustry}</span>}
                    </div>
                  </div>
                  <StatusBadge status={eng.status} />
                  <ChevronRight size={16} color="var(--text-muted)" />
                </div>
              </a>
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", height: 40, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "#fff", outline: "none" };
const btnBase: React.CSSProperties = { border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
