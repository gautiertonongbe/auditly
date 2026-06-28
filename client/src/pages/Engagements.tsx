import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Briefcase, Plus, ChevronRight, Calendar, RefreshCw, Clock, CheckCircle, AlertCircle, Archive, Search, Filter, Building2 } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const { data: engagements, refetch } = trpc.engagements.list.useQuery();

  const all = engagements ?? [];
  const frameworks = useMemo(() => [...new Set(all.map(e => e.framework).filter(Boolean))], [all]);

  const filtered = useMemo(() => all.filter(e => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (frameworkFilter !== "all" && e.framework !== frameworkFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.clientName.toLowerCase().includes(q) || (e.clientIndustry ?? "").toLowerCase().includes(q);
    }
    return true;
  }), [all, statusFilter, frameworkFilter, search]);

  const counts = useMemo(() => ({
    total: all.length,
    planning: all.filter(e => e.status === "planning").length,
    fieldwork: all.filter(e => e.status === "fieldwork").length,
    review: all.filter(e => e.status === "review").length,
    complete: all.filter(e => e.status === "complete").length,
  }), [all]);

  const STATUS_TABS = [
    { key: "all",      label: "All",          count: counts.total },
    { key: "planning", label: "Planning",      count: counts.planning },
    { key: "fieldwork",label: "Fieldwork",     count: counts.fieldwork },
    { key: "review",   label: "Under Review",  count: counts.review },
    { key: "complete", label: "Complete",       count: counts.complete },
  ];

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0, letterSpacing: "-0.3px" }}>Engagements</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            {counts.total} engagement{counts.total !== 1 ? "s" : ""}
            {filtered.length !== all.length && ` · ${filtered.length} matching`}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ ...btnBase, background: "var(--navy)", color: "#fff", display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "8px 16px" }}>
          <Plus size={14} /> New Engagement
        </button>
      </div>

      {/* Stats summary */}
      {counts.total > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Planning",    value: counts.planning,  color: "#F39C12", bg: "#FFF8E6" },
            { label: "Fieldwork",   value: counts.fieldwork, color: "var(--accent)", bg: "var(--accent-light)" },
            { label: "Under Review",value: counts.review,    color: "#8E44AD", bg: "#F5EEF8" },
            { label: "Complete",    value: counts.complete,  color: "#27AE60", bg: "#EAFAF1" },
          ].map(({ label, value, color, bg }) => (
            <button key={label} onClick={() => setStatusFilter(statusFilter === label.replace(" ", "").toLowerCase() ? "all" : STATUS_TABS.find(t => t.label === label)?.key ?? "all")}
              style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", textAlign: "left", cursor: "pointer", transition: "box-shadow 0.15s", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Briefcase size={14} color={color} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client or industry..."
            style={{ paddingLeft: 30, paddingRight: 12, height: 34, border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, outline: "none", width: 220, background: "#F8FAFC", color: "var(--text)" }} />
        </div>

        <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

        {/* Status tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {STATUS_TABS.map(t => (
            <button key={t.key} onClick={() => setStatusFilter(t.key)}
              style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.12s",
                background: statusFilter === t.key ? "var(--navy)" : "transparent",
                color: statusFilter === t.key ? "#fff" : "var(--text-muted)",
                borderColor: statusFilter === t.key ? "var(--navy)" : "transparent" }}>
              {t.label}
              {t.count > 0 && <span style={{ marginLeft: 5, opacity: 0.65, fontSize: 11 }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {frameworks.length > 1 && (
          <>
            <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />
            <select value={frameworkFilter} onChange={e => setFrameworkFilter(e.target.value)}
              style={{ height: 34, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 12, background: "#F8FAFC", color: "var(--text)", outline: "none" }}>
              <option value="all">All frameworks</option>
              {frameworks.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </>
        )}

        {(search || statusFilter !== "all" || frameworkFilter !== "all") && (
          <button onClick={() => { setSearch(""); setStatusFilter("all"); setFrameworkFilter("all"); }}
            style={{ marginLeft: "auto", fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {all.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--border)", padding: "64px 40px", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Briefcase size={22} color="#CBD5E1" />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 8px" }}>No engagements yet</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px" }}>Create your first SOX audit engagement to get started.</p>
          <button onClick={() => setShowCreate(true)} style={{ ...btnBase, background: "var(--navy)", color: "#fff", padding: "8px 18px" }}>Create Engagement</button>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 120px 80px 110px 120px 36px", padding: "8px 18px", background: "#F8FAFC", borderBottom: "1px solid var(--border)" }}>
            {["Client", "Framework", "Year", "Status", "Period", ""].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No engagements match your filters.{" "}
              <button onClick={() => { setSearch(""); setStatusFilter("all"); setFrameworkFilter("all"); }} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Clear</button>
            </div>
          ) : (
            filtered.map((eng, i) => (
              <Link key={eng.id} href={`/engagements/${eng.id}`}>
                <a style={{ display: "grid", gridTemplateColumns: "2fr 120px 80px 110px 120px 36px", alignItems: "center", padding: "13px 18px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none", transition: "background 0.1s", cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  {/* Client */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Building2 size={14} color="var(--accent)" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eng.clientName}</div>
                      {eng.clientIndustry && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{eng.clientIndustry}</div>}
                    </div>
                  </div>
                  {/* Framework */}
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{eng.framework}</div>
                  {/* Year */}
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>FY{eng.fiscalYear}</div>
                  {/* Status */}
                  <div><StatusBadge status={eng.status} /></div>
                  {/* Period */}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                    <Calendar size={10} />
                    {eng.periodStart ? new Date(eng.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}&nbsp;&ndash;&nbsp;
                    {eng.periodEnd ? new Date(eng.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                  </div>
                  {/* Arrow */}
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <ChevronRight size={14} color="#CBD5E1" />
                  </div>
                </a>
              </Link>
            ))
          )}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", height: 40, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 13, background: "#fff", outline: "none" };
const btnBase: React.CSSProperties = { border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
