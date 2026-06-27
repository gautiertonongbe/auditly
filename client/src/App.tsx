import { useState, useRef, createContext, useContext, useEffect, useLayoutEffect } from "react";
import { Route, Switch, Link, useLocation, useRoute } from "wouter";
import {
  LayoutDashboard, Briefcase, ClipboardList, FileText,
  AlertTriangle, Database, Shield, BarChart2,
  Settings, LogOut, FileCheck2, GitMerge, Activity,
  MessageCircle, X, Send, Bot, Loader2, ChevronDown,
} from "lucide-react";
import { trpc } from "./lib/trpc";
import EngagementsPage from "./pages/Engagements";
import EngagementDetailPage from "./pages/EngagementDetail";
import ControlsPage from "./pages/Controls";
import WorkpaperDetailPage from "./pages/WorkpaperDetail";
import PbcTrackerPage from "./pages/PbcTracker";
import IpeRegisterPage from "./pages/IpeRegister";
import SodAnalysisPage from "./pages/SodAnalysis";
import ExceptionsPage from "./pages/Exceptions";
import DeficiencyAssessmentPage from "./pages/DeficiencyAssessment";
import AnalyticsPage from "./pages/Analytics";
import AuditTrailPage from "./pages/AuditTrail";
import SettingsPage from "./pages/Settings";
import ClientPortalPage from "./pages/ClientPortal";
import SsoCallbackPage from "./pages/SsoCallback";

// ── Auth Context ────────────────────────────────────────────────────────────

type User = { id: string; name: string; email: string; role: string; firmName?: string | null };
type AuthCtx = { user: User | null; token: string | null; login: (token: string, user: User) => void; logout: () => void };

const AuthContext = createContext<AuthCtx>({ user: null, token: null, login: () => {}, logout: () => {} });
export const useAuth = () => useContext(AuthContext);

// SOC 2: sessions expire after 8 hours of inactivity
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const ACTIVITY_KEY = "auditly_last_activity";

function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const t = localStorage.getItem("auditly_token");
    if (!t || isJwtExpired(t)) { localStorage.removeItem("auditly_token"); localStorage.removeItem("auditly_user"); return null; }
    return t;
  });
  const [user, setUser] = useState<User | null>(() => {
    const u = localStorage.getItem("auditly_user");
    return u ? JSON.parse(u) : null;
  });

  const login = (t: string, u: User) => {
    setToken(t); setUser(u);
    localStorage.setItem("auditly_token", t);
    localStorage.setItem("auditly_user", JSON.stringify(u));
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  };
  const logout = () => {
    setToken(null); setUser(null);
    localStorage.removeItem("auditly_token");
    localStorage.removeItem("auditly_user");
    localStorage.removeItem(ACTIVITY_KEY);
  };

  // SOC 2 session timeout: check inactivity every 60s, log out if inactive too long or JWT expired
  useEffect(() => {
    const recordActivity = () => localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, recordActivity, { passive: true }));

    const interval = setInterval(() => {
      const storedToken = localStorage.getItem("auditly_token");
      if (!storedToken) return;
      if (isJwtExpired(storedToken)) { logout(); return; }
      const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY) ?? "0");
      if (lastActivity && Date.now() - lastActivity > SESSION_TIMEOUT_MS) { logout(); }
    }, 60_000);

    return () => {
      events.forEach(e => window.removeEventListener(e, recordActivity));
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AuthContext.Provider value={{ token, user, login, logout }}>{children}</AuthContext.Provider>;
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

// ── User color preference ────────────────────────────────────────────────────

export const ACCENT_PRESETS = [
  { name: "Blue",       value: "#2E86DE", light: "#EBF3FB" },
  { name: "Indigo",     value: "#4F46E5", light: "#EEF2FF" },
  { name: "Teal",       value: "#0D9488", light: "#CCFBF1" },
  { name: "Violet",     value: "#7C3AED", light: "#EDE9FE" },
  { name: "Rose",       value: "#E11D48", light: "#FFE4E6" },
  { name: "Emerald",    value: "#059669", light: "#D1FAE5" },
  { name: "Amber",      value: "#D97706", light: "#FEF3C7" },
];

export const ACCENT_STORAGE_KEY = "auditly_accent";

function applyAccent(value: string, light: string) {
  document.documentElement.style.setProperty("--user-accent", value);
  document.documentElement.style.setProperty("--user-accent-light", light);
  document.documentElement.style.setProperty("--accent", value);
  document.documentElement.style.setProperty("--accent-light", light);
}

export function loadAccentPreference() {
  try {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (stored) {
      const { value, light } = JSON.parse(stored) as { value: string; light: string };
      applyAccent(value, light);
    }
  } catch { /* ignore */ }
}

export function saveAccentPreference(preset: typeof ACCENT_PRESETS[0]) {
  localStorage.setItem(ACCENT_STORAGE_KEY, JSON.stringify({ value: preset.value, light: preset.light }));
  applyAccent(preset.value, preset.light);
}

// NAV is engagement-context-aware: if an engagement is active, sub-links go to /engagements/:id/...
// When no engagement selected, they link to /engagements to prompt selection
const NAV = [
  { section: "Overview", items: [
    { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { label: "Engagements", icon: Briefcase, path: "/engagements" },
  ]},
  { section: "Testing", items: [
    { label: "Controls", icon: ClipboardList, pathKey: "controls" },
    { label: "Workpapers", icon: FileText, pathKey: "workpapers" },
    { label: "PBC Tracker", icon: FileCheck2, pathKey: "pbc" },
    { label: "IPE Register", icon: Database, pathKey: "ipe" },
    { label: "SOD Analysis", icon: GitMerge, pathKey: "sod" },
  ]},
  { section: "Findings", items: [
    { label: "Exceptions", icon: AlertTriangle, pathKey: "exceptions" },
    { label: "Deficiency Assessment", icon: Shield, pathKey: "deficiency" },
  ]},
  { section: "Reports", items: [
    { label: "Analytics", icon: BarChart2, pathKey: "analytics" },
    { label: "Audit Trail", icon: Activity, pathKey: "audit-trail" },
  ]},
];

function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  // Apply stored color preference on mount
  useLayoutEffect(() => { loadAccentPreference(); }, []);

  // Extract engagement ID from current URL if on an engagement sub-page
  const engMatch = location.match(/^\/engagements\/([^/]+)/);
  const activeEngId = engMatch?.[1] ?? null;

  // Fetch name of active engagement for context display (empty string returns null from server)
  const { data: activeEng } = trpc.engagements.get.useQuery({ id: activeEngId ?? "" });

  const needsEng = !activeEngId;

  return (
    <aside style={{
      width: "var(--sidebar-width)", minHeight: "100vh", background: "var(--navy)",
      display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.25)" }}>
            <Shield size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", letterSpacing: "-0.3px" }}>Auditly</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>SOX Audit Platform</div>
          </div>
        </div>
      </div>

      {/* Active engagement context pill */}
      {activeEngId && activeEng && (
        <div style={{ margin: "10px 12px 0", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3 }}>Active engagement</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeEng.clientName}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{activeEng.fiscalYear} · {activeEng.framework}</div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
        {NAV.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", padding: "8px 16px 4px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {section}
            </div>
            {items.map((item) => {
              const requiresEng = "pathKey" in item;
              const href = "path" in item
                ? item.path
                : activeEngId
                  ? `/engagements/${activeEngId}/${item.pathKey}`
                  : "/engagements";
              const active = location === href || (href !== "/" && location.startsWith(href));
              const locked = requiresEng && needsEng;
              const Icon = item.icon;
              return (
                <Link key={item.label} href={href}>
                  <a title={locked ? "Select an engagement first" : undefined} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
                    color: active ? "#fff" : locked ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)",
                    background: active ? "rgba(255,255,255,0.12)" : "transparent",
                    borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    transition: "all 0.15s", cursor: "pointer", textDecoration: "none",
                  }}>
                    <Icon size={15} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {locked && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>select eng.</span>}
                  </a>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom: Settings + User */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 0" }}>
        <Link href="/settings">
          <a style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer", textDecoration: "none" }}>
            <Settings size={15} /> Settings
          </a>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {user?.name?.[0]?.toUpperCase() ?? "A"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name ?? "User"}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.role ?? ""}</div>
          </div>
          <button onClick={logout} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: 2 }}>
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── AI Help Chat ─────────────────────────────────────────────────────────────

type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTED = [
  "How do I add controls to an engagement?",
  "What sample size should I use for monthly controls?",
  "How do I assess an exception as a Material Weakness?",
  "Walk me through the PBC tracker workflow",
];

function HelpChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const { user } = useAuth();

  // Extract engagement/control context from URL
  const engMatch = location.match(/\/engagements\/([^/]+)/);
  const ctrlMatch = location.match(/\/controls\/([^/]+)/);
  const engagementId = engMatch?.[1];
  const controlId = ctrlMatch?.[1];

  const sendMutation = trpc.ai.helpChat.useMutation();

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: msg };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);
    try {
      const res = await sendMutation.mutateAsync({
        message: msg,
        history: messages.slice(-10),
        context: { page: location, engagementId, controlId },
      });
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry, I ran into an error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function renderContent(text: string) {
    // Simple markdown-lite: bold **text**, line breaks, bullet points
    return text.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g).map((p, j) =>
        j % 2 === 1 ? <strong key={j}>{p}</strong> : p
      );
      const isBullet = line.trimStart().startsWith("- ") || line.trimStart().startsWith("• ");
      return (
        <div key={i} style={{ marginBottom: isBullet ? 2 : 4, paddingLeft: isBullet ? 12 : 0, position: "relative" }}>
          {isBullet && <span style={{ position: "absolute", left: 0, color: "var(--accent)" }}>•</span>}
          {isBullet ? parts.map((p, j) => typeof p === "string" ? p.replace(/^[-•]\s+/, "") : p) : parts}
        </div>
      );
    });
  }

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Auditly Assistant"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 1000,
          width: 52, height: 52, borderRadius: "50%",
          background: "var(--accent)", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
      >
        {open ? <ChevronDown size={22} color="#fff" /> : <MessageCircle size={22} color="#fff" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 88, right: 24, zIndex: 1000,
          width: 380, height: 520, borderRadius: 16,
          background: "var(--surface)", border: "1px solid var(--border)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.16)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            background: "var(--navy)", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bot size={17} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Auditly Assistant</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>AI audit expert</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4, display: "flex" }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && (
              <div>
                <div style={{ textAlign: "center", padding: "20px 0 12px" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
                    <Bot size={22} color="var(--accent)" />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>Hi, {user.name.split(" ")[0]}!</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>I can answer audit questions, explain platform features, and help with your engagements.</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {SUGGESTED.map(s => (
                    <button key={s} onClick={() => send(s)} style={{
                      textAlign: "left", padding: "8px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", background: "var(--surface-alt)",
                      fontSize: 12, color: "var(--text)", cursor: "pointer",
                    }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                {m.role === "assistant" && (
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Bot size={13} color="var(--accent)" />
                  </div>
                )}
                <div style={{
                  maxWidth: "82%", padding: "8px 12px", borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                  background: m.role === "user" ? "var(--accent)" : "var(--surface-alt)",
                  color: m.role === "user" ? "#fff" : "var(--text)",
                  fontSize: 12.5, lineHeight: 1.55,
                }}>
                  {m.role === "assistant" ? renderContent(m.content) : m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bot size={13} color="var(--accent)" />
                </div>
                <div style={{ padding: "8px 12px", borderRadius: "12px 12px 12px 4px", background: "var(--surface-alt)", display: "flex", gap: 4, alignItems: "center" }}>
                  <Loader2 size={13} color="var(--text-muted)" style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask anything about your audit..."
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)",
                fontSize: 12.5, outline: "none", background: "var(--surface-alt)", color: "var(--text)",
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                padding: "8px 12px", borderRadius: 8, border: "none",
                background: input.trim() && !loading ? "var(--accent)" : "var(--border)",
                color: "#fff", cursor: input.trim() && !loading ? "pointer" : "default",
                display: "flex", alignItems: "center",
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Layout ──────────────────────────────────────────────────────────────────

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main style={{ marginLeft: "var(--sidebar-width)", flex: 1, minHeight: "100vh", background: "var(--surface-alt)" }}>
        {children}
      </main>
      <HelpChat />
    </div>
  );
}

// ── Pages (stubs — each will be a full component) ───────────────────────────

const STEPS = [
  { n: 1, title: "Create an engagement", desc: "Set up a new SOX audit engagement with your client, fiscal year, and framework.", href: "/engagements", cta: "Go to Engagements" },
  { n: 2, title: "Add controls", desc: "Use PCAOB templates to add ITGC and ITAC controls to your engagement.", href: "/engagements", cta: "Add Controls" },
  { n: 3, title: "Request PBC items", desc: "Request evidence from your client through the PBC Tracker.", href: "/engagements", cta: "Open PBC Tracker" },
  { n: 4, title: "Generate workpapers", desc: "Let AI draft your workpaper procedures, results, and conclusions from uploaded evidence.", href: "/engagements", cta: "View Workpapers" },
];

function Dashboard() {
  const { user } = useAuth();
  const { data: engagements } = trpc.engagements.list.useQuery();
  const active = engagements?.filter(e => e.status === "fieldwork" || e.status === "review") ?? [];
  const recent = engagements?.slice(0, 5) ?? [];
  const isNew = engagements !== undefined && engagements.length === 0;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>
          Welcome back, {user?.name?.split(" ")[0] ?? "Auditor"}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Here's an overview of your active audit work.</p>
      </div>

      {/* Getting started guide for new users */}
      {isNew && (
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24, marginBottom: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", marginBottom: 4 }}>Get started with Auditly</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Follow these steps to complete your first SOX audit engagement.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {STEPS.map(s => (
              <Link key={s.n} href={s.href}>
                <a style={{ display: "block", padding: 16, borderRadius: 10, border: "1px solid var(--border)", textDecoration: "none", background: "var(--surface-alt)", transition: "border-color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{s.n}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-strong)", marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{s.desc}</div>
                </a>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "Total Engagements", value: String(engagements?.length ?? 0), color: "var(--accent)" },
          { label: "Active (Fieldwork / Review)", value: String(active.length), color: "var(--navy)" },
          { label: "Complete", value: String(engagements?.filter(e => e.status === "complete").length ?? 0), color: "#27AE60" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "var(--surface)", borderRadius: 12, padding: 20, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>Recent Engagements</span>
          <Link href="/engagements"><a style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>View all</a></Link>
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Briefcase size={32} color="var(--border)" style={{ margin: "0 auto 12px", display: "block" }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>No engagements yet</div>
            <Link href="/engagements"><a style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>Create your first engagement</a></Link>
          </div>
        ) : (
          recent.map((eng, i) => (
            <Link key={eng.id} href={`/engagements/${eng.id}`}>
              <a style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none", background: i % 2 === 0 ? "#fff" : "var(--surface-alt)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>{eng.clientName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{eng.fiscalYear} · {eng.framework}</div>
                </div>
                <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 10, background: eng.status === "fieldwork" ? "#EBF3FB" : eng.status === "complete" ? "#EAFAF1" : "var(--surface-alt)", color: eng.status === "fieldwork" ? "#2E86DE" : eng.status === "complete" ? "#27AE60" : "var(--text-muted)", fontWeight: 600 }}>
                  {eng.status}
                </span>
              </a>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}


function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaStep, setMfaStep] = useState(false);
  const [preAuthToken, setPreAuthToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: providers } = trpc.auth.ssoProviders.useQuery();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if (data.mfaRequired && "preAuthToken" in data) {
        setPreAuthToken(data.preAuthToken);
        setMfaStep(true);
      } else if (!data.mfaRequired && "token" in data) {
        login(data.token, data.user);
      }
    },
    onError: (e) => setErrorMsg(e.message),
  });

  const verifyMfa = trpc.auth.verifyMfa.useMutation({
    onSuccess: (data) => login(data.token, data.user),
    onError: (e) => setErrorMsg(e.message),
  });

  const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

  useEffect(() => { setErrorMsg(""); }, [email, password, mfaCode]);

  const inputStyle: React.CSSProperties = { width: "100%", height: 42, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 14, boxSizing: "border-box" };

  if (mfaStep) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy)" }}>
      <div style={{ width: 400, background: "var(--surface)", borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ background: "linear-gradient(135deg, var(--navy) 0%, #2A4F7C 100%)", padding: "28px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Shield size={20} color="var(--navy)" />
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>Auditly</span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 }}>Two-Factor Authentication</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>Enter the 6-digit code from your authenticator app</p>
        </div>
        <div style={{ padding: 32 }}>
          {errorMsg && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>{errorMsg}</div>}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>Authentication Code</label>
            <input value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000" maxLength={6} autoFocus
              style={{ ...inputStyle, fontSize: 22, letterSpacing: "0.3em", textAlign: "center", fontWeight: 700 }} />
          </div>
          <button onClick={() => verifyMfa.mutate({ preAuthToken, code: mfaCode })}
            disabled={mfaCode.length !== 6 || verifyMfa.isPending}
            style={{ width: "100%", height: 42, background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, opacity: mfaCode.length !== 6 ? 0.5 : 1, cursor: mfaCode.length !== 6 ? "not-allowed" : "pointer" }}>
            {verifyMfa.isPending ? "Verifying..." : "Verify"}
          </button>
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 16 }}>
            Lost access? Use a backup code above, or{" "}
            <button onClick={() => setMfaStep(false)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, padding: 0 }}>go back</button>.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy)" }}>
      <div style={{ width: 420, background: "var(--surface)", borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ background: "linear-gradient(135deg, var(--navy) 0%, #2A4F7C 100%)", padding: "32px 32px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Shield size={20} color="var(--navy)" />
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Auditly</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Sign in</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>AI-native SOX audit platform for Big 4</p>
        </div>

        <div style={{ padding: 32 }}>
          {/* SSO Buttons */}
          {(providers?.google || providers?.microsoft || providers?.saml) && (
            <div style={{ marginBottom: 24 }}>
              {providers.google && (
                <a href={`${API}/api/auth/sso/google`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", height: 42, borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontSize: 13, fontWeight: 600, color: "var(--text-strong)", textDecoration: "none", marginBottom: 10, cursor: "pointer", boxSizing: "border-box" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </a>
              )}
              {providers.microsoft && (
                <a href={`${API}/api/auth/sso/microsoft`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", height: 42, borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontSize: 13, fontWeight: 600, color: "var(--text-strong)", textDecoration: "none", marginBottom: 10, cursor: "pointer", boxSizing: "border-box" }}>
                  <svg width="18" height="18" viewBox="0 0 21 21"><path fill="#F25022" d="M0 0h10v10H0z"/><path fill="#7FBA00" d="M11 0h10v10H11z"/><path fill="#00A4EF" d="M0 11h10v10H0z"/><path fill="#FFB900" d="M11 11h10v10H11z"/></svg>
                  Continue with Microsoft
                </a>
              )}
              {providers.saml && (
                <a href={`${API}/api/auth/sso/saml`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", height: 42, borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontSize: 13, fontWeight: 600, color: "var(--text-strong)", textDecoration: "none", cursor: "pointer", boxSizing: "border-box" }}>
                  <Shield size={16} color="#1E3A5F" />
                  Continue with SSO / SAML
                </a>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>OR</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
            </div>
          )}

          {errorMsg && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>{errorMsg}</div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>Work Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@firm.com" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••"
              onKeyDown={e => e.key === "Enter" && loginMutation.mutate({ email, password })} style={inputStyle} />
          </div>
          <button onClick={() => loginMutation.mutate({ email, password })} disabled={loginMutation.isPending || !email || !password}
            style={{ width: "100%", height: 42, background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, opacity: (!email || !password) ? 0.6 : 1, cursor: (!email || !password) ? "not-allowed" : "pointer" }}>
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </button>
          <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", marginTop: 20, lineHeight: 1.6 }}>
            Protected by enterprise-grade encryption · SOC 2 Type II
          </p>
        </div>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // Public routes — render before auth wrapper
  const [isPortal] = useRoute("/portal/:token");
  const [isSsoCallback] = useRoute("/sso-callback");
  if (isPortal) return <ClientPortalPage />;
  if (isSsoCallback) return (
    <AuthProvider>
      <SsoCallbackPage />
    </AuthProvider>
  );

  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

function AppInner() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        {/* Engagements */}
        <Route path="/engagements" component={EngagementsPage} />
        <Route path="/engagements/:id" component={EngagementDetailPage} />
        {/* Per-engagement sub-pages */}
        <Route path="/engagements/:id/controls" component={ControlsPage} />
        <Route path="/engagements/:engId/controls/:controlId" component={WorkpaperDetailPage} />
        <Route path="/engagements/:id/pbc" component={PbcTrackerPage} />
        <Route path="/engagements/:id/ipe" component={IpeRegisterPage} />
        <Route path="/engagements/:id/sod" component={SodAnalysisPage} />
        <Route path="/engagements/:id/exceptions" component={ExceptionsPage} />
        <Route path="/engagements/:id/deficiency" component={DeficiencyAssessmentPage} />
        <Route path="/engagements/:id/analytics" component={AnalyticsPage} />
        <Route path="/engagements/:id/audit-trail" component={AuditTrailPage} />
        {/* Global settings */}
        <Route path="/settings" component={SettingsPage} />
        {/* Fallback */}
        <Route><div style={{ padding: 32, color: "var(--text-muted)" }}>Page not found.</div></Route>
      </Switch>
    </Layout>
  );
}
