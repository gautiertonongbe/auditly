import { useState, createContext, useContext, useEffect } from "react";
import { Route, Switch, Link, useLocation, useRoute } from "wouter";
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
import ClientPortalPage from "./pages/ClientPortal";
import SsoCallbackPage from "./pages/SsoCallback";

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
