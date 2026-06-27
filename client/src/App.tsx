import { useState, createContext, useContext, useEffect } from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import {
  LayoutDashboard, Briefcase, ClipboardList, FileText,
  AlertTriangle, Database, Users, Shield, BarChart2,
  Settings, LogOut, ChevronRight, FileCheck2, GitMerge,
  Activity, Bell
} from "lucide-react";
import { trpc } from "./lib/trpc";

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

const NAV = [
  { section: "Overview", items: [
    { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { label: "Engagements", icon: Briefcase, path: "/engagements" },
  ]},
  { section: "Testing", items: [
    { label: "Controls", icon: ClipboardList, path: "/controls" },
    { label: "Workpapers", icon: FileText, path: "/workpapers" },
    { label: "PBC Tracker", icon: FileCheck2, path: "/pbc" },
    { label: "IPE Register", icon: Database, path: "/ipe" },
    { label: "SOD Analysis", icon: GitMerge, path: "/sod" },
  ]},
  { section: "Findings", items: [
    { label: "Exceptions", icon: AlertTriangle, path: "/exceptions" },
    { label: "Deficiency Assessment", icon: Shield, path: "/deficiency" },
  ]},
  { section: "Reports", items: [
    { label: "Analytics", icon: BarChart2, path: "/analytics" },
    { label: "Audit Trail", icon: Activity, path: "/audit-trail" },
  ]},
];

function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

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
            {items.map(({ label, icon: Icon, path }) => {
              const active = location === path || (path !== "/" && location.startsWith(path));
              return (
                <Link key={path} href={path}>
                  <a style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
                    color: active ? "#fff" : "rgba(255,255,255,0.6)",
                    background: active ? "rgba(255,255,255,0.1)" : "transparent",
                    borderLeft: active ? "3px solid var(--gold)" : "3px solid transparent",
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    transition: "all 0.15s", cursor: "pointer", textDecoration: "none",
                  }}>
                    <Icon size={15} />
                    {label}
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
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-strong)", marginBottom: 24 }}>Dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {[
          { label: "Active Engagements", value: "—", color: "var(--accent)" },
          { label: "Controls In Progress", value: "—", color: "var(--orange)" },
          { label: "Open Exceptions", value: "—", color: "var(--red)" },
          { label: "PBC Items Outstanding", value: "—", color: "var(--navy)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "var(--surface)", borderRadius: 12, padding: 20, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, border: "1px solid var(--border)" }}>
        <p style={{ color: "var(--text-muted)" }}>Select an engagement from the Engagements page to get started.</p>
      </div>
    </div>
  );
}

function Engagements() {
  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-strong)" }}>Engagements</h1>
        <button style={{ background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600 }}>
          + New Engagement
        </button>
      </div>
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 40, textAlign: "center" }}>
        <Briefcase size={32} color="var(--border)" />
        <p style={{ color: "var(--text-muted)", marginTop: 12 }}>No engagements yet. Create your first SOX engagement.</p>
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
        <Route path="/engagements" component={Engagements} />
        <Route path="/controls"><div style={{ padding: 32 }}><h1>Controls</h1></div></Route>
        <Route path="/workpapers"><div style={{ padding: 32 }}><h1>Workpapers</h1></div></Route>
        <Route path="/pbc"><div style={{ padding: 32 }}><h1>PBC Tracker</h1></div></Route>
        <Route path="/ipe"><div style={{ padding: 32 }}><h1>IPE Register</h1></div></Route>
        <Route path="/sod"><div style={{ padding: 32 }}><h1>SOD Analysis</h1></div></Route>
        <Route path="/exceptions"><div style={{ padding: 32 }}><h1>Exceptions</h1></div></Route>
        <Route path="/deficiency"><div style={{ padding: 32 }}><h1>Deficiency Assessment</h1></div></Route>
        <Route path="/analytics"><div style={{ padding: 32 }}><h1>Analytics</h1></div></Route>
        <Route path="/audit-trail"><div style={{ padding: 32 }}><h1>Audit Trail</h1></div></Route>
        <Route path="/settings"><div style={{ padding: 32 }}><h1>Settings</h1></div></Route>
      </Switch>
    </Layout>
  );
}
