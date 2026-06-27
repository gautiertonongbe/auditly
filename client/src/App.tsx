import { useState, createContext, useContext } from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import {
  LayoutDashboard, Briefcase, ClipboardList, FileText,
  AlertTriangle, Database, Shield, BarChart2,
  Settings, LogOut, FileCheck2, GitMerge, Activity,
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

// ── Auth Context ────────────────────────────────────────────────────────────

type User = { id: string; name: string; email: string; role: string; firmName?: string | null };
type AuthCtx = { user: User | null; token: string | null; login: (token: string, user: User) => void; logout: () => void };

const AuthContext = createContext<AuthCtx>({ user: null, token: null, login: () => {}, logout: () => {} });
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auditly_token"));
  const [user, setUser] = useState<User | null>(() => {
    const u = localStorage.getItem("auditly_user");
    return u ? JSON.parse(u) : null;
  });
  const login = (t: string, u: User) => { setToken(t); setUser(u); localStorage.setItem("auditly_token", t); localStorage.setItem("auditly_user", JSON.stringify(u)); };
  const logout = () => { setToken(null); setUser(null); localStorage.removeItem("auditly_token"); localStorage.removeItem("auditly_user"); };
  return <AuthContext.Provider value={{ token, user, login, logout }}>{children}</AuthContext.Provider>;
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

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

  // Extract engagement ID from current URL if on an engagement sub-page
  const engMatch = location.match(/^\/engagements\/([^/]+)/);
  const activeEngId = engMatch?.[1] ?? null;

  return (
    <aside style={{
      width: "var(--sidebar-width)", minHeight: "100vh", background: "var(--navy)",
      display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={18} color="#1E3A5F" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", letterSpacing: "-0.3px" }}>Auditly</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>SOX Audit Platform</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
        {NAV.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", padding: "8px 16px 4px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {section}
            </div>
            {items.map((item) => {
              const href = "path" in item
                ? item.path
                : activeEngId
                  ? `/engagements/${activeEngId}/${item.pathKey}`
                  : "/engagements";
              const active = location === href || (href !== "/" && location.startsWith(href));
              const Icon = item.icon;
              return (
                <Link key={item.label} href={href}>
                  <a style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
                    color: active ? "#fff" : "rgba(255,255,255,0.6)",
                    background: active ? "rgba(255,255,255,0.1)" : "transparent",
                    borderLeft: active ? "3px solid var(--gold)" : "3px solid transparent",
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    transition: "all 0.15s", cursor: "pointer", textDecoration: "none",
                  }}>
                    <Icon size={15} />
                    {item.label}
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
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--navy)", flexShrink: 0 }}>
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

// ── Layout ──────────────────────────────────────────────────────────────────

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main style={{ marginLeft: "var(--sidebar-width)", flex: 1, minHeight: "100vh", background: "var(--surface-alt)" }}>
        {children}
      </main>
    </div>
  );
}

// ── Pages (stubs — each will be a full component) ───────────────────────────

function Dashboard() {
  const { data: engagements } = trpc.engagements.list.useQuery();
  const active = engagements?.filter(e => e.status === "fieldwork" || e.status === "review") ?? [];
  const recent = engagements?.slice(0, 5) ?? [];

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-strong)", marginBottom: 24 }}>Dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
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
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>Recent Engagements</div>
        {recent.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No engagements yet. <Link href="/engagements"><a style={{ color: "var(--accent)", textDecoration: "none" }}>Create your first engagement</a></Link>
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
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => login(data.token, data.user),
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy)" }}>
      <div style={{ width: 400, background: "var(--surface)", borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ background: "linear-gradient(135deg, var(--navy) 0%, #2A4F7C 100%)", padding: "32px 32px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Shield size={20} color="var(--navy)" />
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Auditly</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Sign in</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>AI-native SOX audit platform</p>
        </div>
        <div style={{ padding: 32 }}>
          {loginMutation.error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>
              Invalid credentials
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@firm.com"
              style={{ width: "100%", height: 42, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 6 }}>Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••"
              style={{ width: "100%", height: 42, border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", fontSize: 14 }} />
          </div>
          <button
            onClick={() => loginMutation.mutate({ email, password })}
            disabled={loginMutation.isPending}
            style={{ width: "100%", height: 42, background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, opacity: loginMutation.isPending ? 0.7 : 1 }}
          >
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
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
        <Route path="/engagements/:id/workpapers/:wpId" component={WorkpaperDetailPage} />
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
