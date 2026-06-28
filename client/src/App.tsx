import { useState, useRef, createContext, useContext, useEffect, useLayoutEffect } from "react";
import { Route, Switch, Link, useLocation, useRoute } from "wouter";
import {
  LayoutDashboard, Briefcase, ClipboardList, FileText,
  AlertTriangle, Database, Shield, BarChart2,
  Settings, LogOut, FileCheck2, GitMerge, Activity,
  MessageCircle, X, Send, Bot, Loader2, ChevronDown,
  Mail, Lock, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight,
  TrendingUp, Clock, CheckSquare, Bell,
} from "lucide-react";
import { trpc } from "./lib/trpc";
import EngagementsPage from "./pages/Engagements";
import EngagementDetailPage from "./pages/EngagementDetail";
import ControlsPage from "./pages/Controls";
import WorkpapersPage from "./pages/Workpapers";
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

// ── Sidebar collapse context ─────────────────────────────────────────────────
const SidebarCtx = createContext({ collapsed: false, toggle: () => {} });
const useSidebar = () => useContext(SidebarCtx);

function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("auditly_sidebar_collapsed") === "1");
  const toggle = () => setCollapsed(c => {
    const next = !c;
    localStorage.setItem("auditly_sidebar_collapsed", next ? "1" : "0");
    return next;
  });
  const width = collapsed ? 64 : 240;
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  }, [width]);
  return <SidebarCtx.Provider value={{ collapsed, toggle }}>{children}</SidebarCtx.Provider>;
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
  const { collapsed, toggle } = useSidebar();

  // Apply stored color preference on mount
  useLayoutEffect(() => { loadAccentPreference(); }, []);

  // Extract engagement ID from current URL if on an engagement sub-page
  const engMatch = location.match(/^\/engagements\/([^/]+)/);
  const activeEngId = engMatch?.[1] ?? null;

  // Fetch name of active engagement for context display
  const { data: activeEng } = trpc.engagements.get.useQuery({ id: activeEngId ?? "" });


  const w = collapsed ? 64 : 240;

  return (
    <aside style={{
      width: w, minHeight: "100vh", background: "#fff",
      display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, zIndex: 100,
      borderRight: "1px solid var(--border)", transition: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
    }}>
      {/* Logo + collapse toggle */}
      <div style={{ padding: collapsed ? "16px 0 14px" : "18px 16px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", gap: 8, flexShrink: 0 }}>
        {!collapsed && (
          <Link href="/"><a style={{ display: "block", textDecoration: "none", lineHeight: 0 }}>
            <img src="https://res.cloudinary.com/dl6zdpgsk/image/upload/v1782585701/Logo_wjai7x.png" alt="Auditly" style={{ height: 36, width: "auto", objectFit: "contain", display: "block" }} />
          </a></Link>
        )}
        {collapsed && (
          <button onClick={toggle} title="Expand sidebar" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <img src="https://res.cloudinary.com/dl6zdpgsk/image/upload/v1782585706/Favicon_s5gfcs.png" alt="Auditly" style={{ width: 26, height: 26, objectFit: "contain", display: "block" }} />
            <ChevronRight size={11} color="#94A3B8" />
          </button>
        )}
        {!collapsed && (
          <button onClick={toggle} title="Collapse sidebar" style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "#94A3B8", cursor: "pointer", padding: "3px 5px", display: "flex", flexShrink: 0, transition: "border-color 0.12s, color 0.12s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#94A3B8"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
          >
            <ChevronLeft size={13} />
          </button>
        )}
      </div>

      {/* Active engagement context pill */}
      {!collapsed && activeEngId && activeEng && (
        <div style={{ margin: "10px 10px 0", padding: "8px 10px", borderRadius: 8, background: "var(--accent-light)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 2 }}>Active Engagement</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeEng.clientName}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{activeEng.fiscalYear} · {activeEng.framework}</div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: collapsed ? "10px 0 8px" : "8px 0 8px" }}>
        {NAV.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: collapsed ? 8 : 2 }}>
            {!collapsed && (
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", padding: "8px 16px 3px", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                {section}
              </div>
            )}
            {collapsed && <div style={{ height: 4 }} />}
            {items.map((item) => {
              // Without an engagement, route to the base path so each page can show its own empty state
              const hrefFinal = "path" in item
                ? item.path
                : activeEngId
                  ? `/engagements/${activeEngId}/${item.pathKey}`
                  : `/${item.pathKey}`;
              const active = location === hrefFinal || (hrefFinal !== "/" && location.startsWith(hrefFinal));
              const Icon = item.icon;
              return (
                <Link key={item.label} href={hrefFinal}>
                  <a
                    title={collapsed ? item.label : undefined}
                    style={{
                      display: "flex", alignItems: "center",
                      gap: collapsed ? 0 : 10,
                      justifyContent: collapsed ? "center" : "flex-start",
                      padding: collapsed ? "9px 0" : "8px 16px 8px 13px",
                      margin: "1px 0",
                      borderLeft: active && !collapsed ? "3px solid var(--accent)" : "3px solid transparent",
                      borderRadius: 0,
                      color: active ? "var(--accent)" : "#4A5568",
                      background: active ? "var(--accent-light)" : "transparent",
                      fontSize: 13, fontWeight: active ? 600 : 400,
                      transition: "background 0.12s, color 0.12s",
                      cursor: "pointer",
                      textDecoration: "none", whiteSpace: "nowrap",
                    }}
                    onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; } }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                    {!collapsed && <span>{item.label}</span>}
                  </a>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom: Settings + User */}
      <div style={{ padding: collapsed ? "8px 0 12px" : "8px 8px 12px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <Link href="/settings">
          <a title={collapsed ? "Settings" : undefined} style={{
            display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start",
            gap: collapsed ? 0 : 9, padding: collapsed ? "9px 0" : "7px 12px",
            margin: collapsed ? "0 8px 4px" : "0 0 6px", borderRadius: 7, color: "#4A5568",
            fontSize: 13, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap",
            transition: "background 0.12s",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <Settings size={15} strokeWidth={1.8} />
            {!collapsed && <span>Settings</span>}
          </a>
        </Link>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start",
          gap: 9, padding: collapsed ? "6px 0" : "8px 10px",
          margin: collapsed ? "0 8px" : "0",
          borderRadius: 8, background: collapsed ? "transparent" : "#F8FAFC",
          border: collapsed ? "none" : "1px solid var(--border)",
        }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {user?.name?.[0]?.toUpperCase() ?? "A"}
          </div>
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name ?? "User"}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "capitalize" }}>{user?.role ?? ""}</div>
              </div>
              <button onClick={logout} title="Sign out" style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", padding: 2, display: "flex" }}>
                <LogOut size={13} />
              </button>
            </>
          )}
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

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const w = collapsed ? 64 : 240;
  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main style={{ marginLeft: w, flex: 1, minHeight: "100vh", background: "var(--surface-alt)", minWidth: 0, transition: "margin-left 0.2s cubic-bezier(0.4,0,0.2,1)" }}>
        {children}
      </main>
      <HelpChat />
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}

// ── Pages (stubs — each will be a full component) ───────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  planning:  { bg: "var(--accent-light)", text: "var(--accent)", label: "Planning" },
  fieldwork: { bg: "#FFF7ED", text: "#D97706", label: "Fieldwork" },
  review:    { bg: "#F5F3FF", text: "#7C3AED", label: "Review" },
  complete:  { bg: "#ECFDF5", text: "#059669", label: "Complete" },
};

const QUICK_ACTIONS = [
  { label: "New Engagement", icon: Briefcase, href: "/engagements", color: "var(--accent)", bg: "var(--accent-light)" },
  { label: "Controls", icon: ClipboardList, href: "/engagements", color: "#7C3AED", bg: "#F5F3FF" },
  { label: "Workpapers", icon: FileText, href: "/engagements", color: "#0891B2", bg: "#CFFAFE" },
  { label: "Approvals", icon: CheckSquare, href: "/engagements", color: "#059669", bg: "#ECFDF5" },
];

function Dashboard() {
  const { user } = useAuth();
  const { data: engagements } = trpc.engagements.list.useQuery();
  const active = engagements?.filter(e => e.status === "fieldwork" || e.status === "review") ?? [];
  const recent = engagements?.slice(0, 6) ?? [];
  const complete = engagements?.filter(e => e.status === "complete").length ?? 0;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const kpis = [
    { label: "Total Engagements", value: String(engagements?.length ?? 0), sub: "all time", icon: Briefcase, color: "var(--accent)", bg: "var(--accent-light)" },
    { label: "Active", value: String(active.length), sub: "fieldwork + review", icon: TrendingUp, color: "#0891B2", bg: "#CFFAFE" },
    { label: "Completed", value: String(complete), sub: "this year", icon: CheckSquare, color: "#059669", bg: "#ECFDF5" },
    { label: "Pending Review", value: String(engagements?.filter(e => e.status === "review").length ?? 0), sub: "need attention", icon: Clock, color: "#7C3AED", bg: "#F5F3FF" },
  ];

  return (
    <div style={{ padding: "32px 32px 48px" }}>

      {/* Page header */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 4px", letterSpacing: "-0.3px" }}>
            <span style={{ color: "var(--accent)" }}>{user?.name?.split(" ")[0] ?? "Auditor"}</span>, welcome back.
          </h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
            {today}
            {active.length > 0 && (
              <>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />
                <span style={{ color: "#EF4444", fontWeight: 500 }}>{active.length} active engagement{active.length !== 1 ? "s" : ""}</span>
              </>
            )}
          </div>
        </div>
        <Link href="/engagements">
          <a style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", background: "var(--accent)", color: "#fff", borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: "none", boxShadow: "0 2px 8px rgba(37,99,235,0.25)", transition: "opacity 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.88"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            <Briefcase size={14} /> New Engagement
          </a>
        </Link>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {kpis.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} style={{ background: "#fff", borderRadius: 12, padding: "18px 20px 16px", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={16} color={color} strokeWidth={2} />
              </div>
              <ChevronRight size={13} color="#CBD5E1" />
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-strong)", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {QUICK_ACTIONS.map(({ label, icon: Icon, href, color, bg }) => (
          <Link key={label} href={href}>
            <a style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fff", borderRadius: 10, border: "1px solid var(--border)", textDecoration: "none", transition: "border-color 0.15s, box-shadow 0.15s" }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = color; el.style.boxShadow = `0 2px 8px ${color}18`; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.boxShadow = "none"; }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={14} color={color} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>{label}</span>
            </a>
          </Link>
        ))}
      </div>

      {/* Recent Engagements */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>Recent Engagements</span>
            {engagements !== undefined && <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{engagements.length} total</span>}
          </div>
          <Link href="/engagements"><a style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 500, display: "flex", alignItems: "center", gap: 3 }}>View all <ArrowRight size={12} /></a></Link>
        </div>

        {/* Table header */}
        {recent.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 100px", padding: "8px 20px", background: "#F8FAFC", borderBottom: "1px solid var(--border)" }}>
            {["Client", "Framework", "Year", "Status"].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
        )}

        {recent.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "#F8FAFC", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Briefcase size={22} color="#CBD5E1" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)", marginBottom: 6 }}>No engagements yet</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>Create your first SOX engagement to get started.</div>
            <Link href="/engagements">
              <a style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--accent)", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                <Briefcase size={13} /> New Engagement
              </a>
            </Link>
          </div>
        ) : (
          recent.map((eng, i) => {
            const s = STATUS_COLORS[eng.status] ?? { bg: "#F8FAFC", text: "#64748B", label: eng.status };
            return (
              <Link key={eng.id} href={`/engagements/${eng.id}`}>
                <a style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 100px", alignItems: "center", padding: "13px 20px", borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none", transition: "background 0.1s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eng.clientName}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{eng.framework}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{eng.fiscalYear}</div>
                  <div>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.text, fontWeight: 600, whiteSpace: "nowrap" }}>{s.label}</span>
                  </div>
                </a>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}


// ── Login sub-components (defined outside LoginPage to prevent remount on re-render) ──

function LoginLeftPanel() {
  return (
    <div className="login-left-panel" style={{
      width: "44%", flexShrink: 0, background: "linear-gradient(145deg, #0B1E38 0%, #0E2748 55%, #0B1E38 100%)",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: "48px 52px", position: "relative", overflow: "hidden",
    }}>
      {/* Static decorative accents */}
      <div style={{ position: "absolute", top: -100, right: -100, width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -80, left: -80, width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.09) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />

      {/* Logo — invert to white so it renders cleanly on dark background */}
      <div style={{ position: "relative" }}>
        <img src="https://res.cloudinary.com/dl6zdpgsk/image/upload/v1782585701/Logo_wjai7x.png" alt="Auditly" style={{ height: 34, width: "auto", objectFit: "contain", display: "block", filter: "brightness(0) invert(1)" }} />
      </div>

      {/* Headline + features */}
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "#60A5FA", textTransform: "uppercase", marginBottom: 18 }}>
          AI-Native Audit Platform
        </div>
        <h1 style={{ fontSize: 38, fontWeight: 700, color: "#fff", lineHeight: 1.15, margin: "0 0 20px", letterSpacing: "-0.5px" }}>
          SOX audit work,<br />done faster.
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.75, margin: "0 0 40px", maxWidth: 300 }}>
          Purpose-built for audit professionals who need PCAOB-ready workpapers, real-time deficiency tracking, and AI assistance at every step.
        </p>
        {[
          { icon: FileCheck2, label: "PCAOB & SOX compliant workpapers", color: "#34D399" },
          { icon: Shield,     label: "SOC 2 Type II certified infrastructure", color: "#60A5FA" },
          { icon: Bot,        label: "AI-powered exception detection", color: "#A78BFA" },
          { icon: Activity,   label: "Real-time audit trail & analytics", color: "#22D3EE" },
        ].map(({ icon: Icon, label, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={15} color={color} />
            </div>
            <span style={{ fontSize: 13.5, color: "rgba(255,255,255,0.72)", lineHeight: 1.4 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Bottom trust strip */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 24, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        {[
          { icon: Lock, text: "AES-256 Encrypted" },
          { icon: CheckCircle2, text: "SOC 2 Type II" },
          { icon: FileCheck2, text: "PCAOB Ready" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            <Icon size={12} /> {text}
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginFormPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 48px", position: "relative" }}>
      {/* Subtle top-right corner accent */}
      <div style={{ position: "absolute", top: 0, right: 0, width: 280, height: 280, background: "radial-gradient(circle at top right, rgba(37,99,235,0.04) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div className="login-card-anim" style={{ width: "100%", maxWidth: 400, position: "relative" }}>
        {children}
      </div>
      {/* Bottom copyright */}
      <div style={{ position: "absolute", bottom: 28, fontSize: 11, color: "#CBD5E1" }}>
        &copy; {new Date().getFullYear()} Auditly. All rights reserved.
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

  if (mfaStep) return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <LoginLeftPanel />
      <LoginFormPanel>
        <div style={{ marginBottom: 40 }}>
          <div style={{ width: 36, height: 3, background: "linear-gradient(90deg, #1E3A5F, var(--accent))", borderRadius: 2, marginBottom: 20 }} />
          <h2 style={{ fontSize: 30, fontWeight: 700, color: "#0F172A", margin: "0 0 10px", letterSpacing: "-0.6px", lineHeight: 1.2 }}>Two-Factor Auth</h2>
          <p style={{ fontSize: 14, color: "#64748B", margin: 0, lineHeight: 1.6 }}>Enter the 6-digit code from your authenticator app.</p>
        </div>
        {errorMsg && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={14} /> {errorMsg}
          </div>
        )}
        <div style={{ marginBottom: 28 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Authentication Code</label>
          <input value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000 000" maxLength={6} autoFocus className="login-input-styled"
            style={{ textAlign: "center", fontSize: 26, letterSpacing: "0.35em", fontWeight: 700, padding: "0 12px" }} />
        </div>
        <button onClick={() => verifyMfa.mutate({ preAuthToken, code: mfaCode })}
          disabled={mfaCode.length !== 6 || verifyMfa.isPending}
          className="login-btn-primary">
          {verifyMfa.isPending ? <><Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> Verifying...</> : <><CheckCircle2 size={15} /> Verify Code</>}
        </button>
        <p style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", marginTop: 20 }}>
          Lost access?{" "}
          <button onClick={() => setMfaStep(false)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, padding: 0, fontWeight: 600 }}>Go back</button>
        </p>
      </LoginFormPanel>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <LoginLeftPanel />
      <LoginFormPanel>
        <div style={{ marginBottom: 40 }}>
          <div style={{ width: 36, height: 3, background: "linear-gradient(90deg, #1E3A5F, var(--accent))", borderRadius: 2, marginBottom: 20 }} />
          <h2 style={{ fontSize: 30, fontWeight: 700, color: "#0F172A", margin: "0 0 10px", letterSpacing: "-0.6px", lineHeight: 1.2 }}>Welcome back</h2>
          <p style={{ fontSize: 14, color: "#64748B", margin: 0, lineHeight: 1.6 }}>Sign in to your Auditly workspace to continue your audit engagements.</p>
        </div>

        {(providers?.google || providers?.microsoft || providers?.saml) && (
          <div style={{ marginBottom: 28 }}>
            {providers.google && (
              <a href={`${API}/api/auth/sso/google`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", height: 46, borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", textDecoration: "none", marginBottom: 10, boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </a>
            )}
            {providers.microsoft && (
              <a href={`${API}/api/auth/sso/microsoft`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", height: 46, borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", textDecoration: "none", marginBottom: 10, boxSizing: "border-box" }}>
                <svg width="18" height="18" viewBox="0 0 21 21"><path fill="#F25022" d="M0 0h10v10H0z"/><path fill="#7FBA00" d="M11 0h10v10H11z"/><path fill="#00A4EF" d="M0 11h10v10H0z"/><path fill="#FFB900" d="M11 11h10v10H11z"/></svg>
                Continue with Microsoft
              </a>
            )}
            {providers.saml && (
              <a href={`${API}/api/auth/sso/saml`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", height: 46, borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", textDecoration: "none", boxSizing: "border-box" }}>
                <Shield size={16} color="#1E3A5F" /> Continue with SSO / SAML
              </a>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 0" }}>
              <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
              <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, letterSpacing: "0.06em" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
            </div>
          </div>
        )}

        {errorMsg && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={14} /> {errorMsg}
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 7 }}>Work Email</label>
          <div style={{ position: "relative" }}>
            <Mail size={15} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@firm.com" className="login-input-styled" />
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 7 }}>Password</label>
          <div style={{ position: "relative" }}>
            <Lock size={15} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••"
              onKeyDown={e => e.key === "Enter" && loginMutation.mutate({ email, password })} className="login-input-styled" />
          </div>
        </div>

        <button onClick={() => loginMutation.mutate({ email, password })}
          disabled={loginMutation.isPending || !email || !password}
          className="login-btn-primary">
          {loginMutation.isPending
            ? <><Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> Signing in...</>
            : <>Sign in <ArrowRight size={15} /></>}
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginTop: 28, paddingTop: 24, borderTop: "1px solid #F1F5F9" }}>
          {[
            { icon: Lock, label: "AES-256" },
            { icon: CheckCircle2, label: "SOC 2 II" },
            { icon: FileCheck2, label: "PCAOB Ready" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#CBD5E1" }}>
              <Icon size={12} color="#94A3B8" /> {label}
            </div>
          ))}
        </div>
      </LoginFormPanel>
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

// ── No-engagement empty state ─────────────────────────────────────────────
const PAGE_LABELS: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  controls:   { label: "Controls",            icon: ClipboardList, description: "Define and manage in-scope controls across ITGC and ITAC domains." },
  workpapers: { label: "Workpapers",          icon: FileText,      description: "Document testing procedures, results, and conclusions per control." },
  pbc:        { label: "PBC Tracker",         icon: FileCheck2,    description: "Track client-provided documentation requests and status." },
  ipe:        { label: "IPE Register",        icon: Database,      description: "Test the completeness and accuracy of information produced by the entity." },
  sod:        { label: "SOD Analysis",        icon: GitMerge,      description: "Identify segregation of duties conflicts from system access data." },
  exceptions: { label: "Exceptions",          icon: AlertTriangle, description: "Log and track control exceptions and deviation findings." },
  deficiency: { label: "Deficiency Assessment", icon: Shield,      description: "Assess aggregated exceptions as control deficiencies, significant deficiencies, or material weaknesses." },
  analytics:  { label: "Analytics",           icon: BarChart2,     description: "View engagement-level metrics, completion rates, and risk indicators." },
  "audit-trail": { label: "Audit Trail",      icon: Activity,      description: "Immutable chronological log of all actions taken on this engagement." },
};

function NoEngagementPage({ pathKey }: { pathKey: string }) {
  const cfg = PAGE_LABELS[pathKey] ?? { label: pathKey, icon: LayoutDashboard, description: "Select an engagement to access this section." };
  const Icon = cfg.icon;
  const { data: engagements } = trpc.engagements.list.useQuery();
  const all = engagements ?? [];

  const STATUS_C: Record<string, { label: string; color: string; bg: string }> = {
    planning:  { label: "Planning",  color: "var(--accent)", bg: "var(--accent-light)" },
    fieldwork: { label: "Fieldwork", color: "#D97706", bg: "#FFF7ED" },
    review:    { label: "Review",    color: "#7C3AED", bg: "#F5F3FF" },
    complete:  { label: "Complete",  color: "#059669", bg: "#ECFDF5" },
  };

  return (
    <div style={{ padding: "32px 32px 48px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={18} color="var(--accent)" strokeWidth={1.8} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>{cfg.label}</h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, marginTop: 1 }}>{cfg.description}</p>
          </div>
        </div>
        <Link href="/engagements">
          <a style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--accent)", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            <Briefcase size={13} /> All Engagements
          </a>
        </Link>
      </div>

      {/* Slim inline notice */}
      <div style={{ background: "var(--accent-light)", border: "1px solid var(--accent)", borderRadius: 8, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, opacity: 0.9 }}>
        <Briefcase size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "var(--accent)" }}>
          Select an engagement below to open <strong>{cfg.label}</strong> for that client.
        </span>
      </div>

      {/* Engagements table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>Engagements</span>
          {all.length > 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{all.length} total</span>}
        </div>

        {all.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 110px 36px", padding: "8px 20px", background: "#F8FAFC", borderBottom: "1px solid var(--border)" }}>
            {["Client", "Framework", "Year", "Status", ""].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
        )}

        {all.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, background: "#F8FAFC", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <Briefcase size={20} color="#CBD5E1" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)", marginBottom: 4 }}>No engagements yet</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>Create your first engagement to get started.</div>
            <Link href="/engagements"><a style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "var(--accent)", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}><Briefcase size={13} /> New Engagement</a></Link>
          </div>
        ) : (
          all.map((eng, i) => {
            const s = STATUS_C[eng.status] ?? { label: eng.status, color: "#64748B", bg: "#F8FAFC" };
            return (
              <Link key={eng.id} href={`/engagements/${eng.id}/${pathKey}`}>
                <a style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 110px 36px", alignItems: "center", padding: "13px 20px", borderBottom: i < all.length - 1 ? "1px solid var(--border)" : "none", textDecoration: "none", transition: "background 0.1s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{eng.clientName}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{eng.clientIndustry}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{eng.framework}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{eng.fiscalYear}</div>
                  <div>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color, fontWeight: 600 }}>{s.label}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <ChevronRight size={14} color="#CBD5E1" />
                  </div>
                </a>
              </Link>
            );
          })
        )}
      </div>
    </div>
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
        <Route path="/engagements/:id/workpapers" component={WorkpapersPage} />
        <Route path="/engagements/:engId/controls/:controlId" component={WorkpaperDetailPage} />
        <Route path="/engagements/:id/pbc" component={PbcTrackerPage} />
        <Route path="/engagements/:id/ipe" component={IpeRegisterPage} />
        <Route path="/engagements/:id/sod" component={SodAnalysisPage} />
        <Route path="/engagements/:id/exceptions" component={ExceptionsPage} />
        <Route path="/engagements/:id/deficiency" component={DeficiencyAssessmentPage} />
        <Route path="/engagements/:id/analytics" component={AnalyticsPage} />
        <Route path="/engagements/:id/audit-trail" component={AuditTrailPage} />
        {/* Base paths (no engagement) — show select-engagement empty state */}
        <Route path="/controls">{() => <NoEngagementPage pathKey="controls" />}</Route>
        <Route path="/workpapers">{() => <NoEngagementPage pathKey="workpapers" />}</Route>
        <Route path="/pbc">{() => <NoEngagementPage pathKey="pbc" />}</Route>
        <Route path="/ipe">{() => <NoEngagementPage pathKey="ipe" />}</Route>
        <Route path="/sod">{() => <NoEngagementPage pathKey="sod" />}</Route>
        <Route path="/exceptions">{() => <NoEngagementPage pathKey="exceptions" />}</Route>
        <Route path="/deficiency">{() => <NoEngagementPage pathKey="deficiency" />}</Route>
        <Route path="/analytics">{() => <NoEngagementPage pathKey="analytics" />}</Route>
        <Route path="/audit-trail">{() => <NoEngagementPage pathKey="audit-trail" />}</Route>
        {/* Global settings */}
        <Route path="/settings" component={SettingsPage} />
        {/* Fallback */}
        <Route><div style={{ padding: 32, color: "var(--text-muted)" }}>Page not found.</div></Route>
      </Switch>
    </Layout>
  );
}
