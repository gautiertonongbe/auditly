import { useState } from "react";
import { User, Building2, Bell, Shield, Key, Save, Users, Plus, Trash2, Crown, ChevronDown, Smartphone, Copy, CheckCircle, AlertTriangle, Loader2, Zap, Cloud, RefreshCw, Unplug, Link2, X, HardDrive, FolderOpen, Palette } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ACCENT_PRESETS, saveAccentPreference, ACCENT_STORAGE_KEY } from "../App";

type Tab = "profile" | "firm" | "team" | "notifications" | "security" | "integrations" | "cloud";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const { data: me } = trpc.users.me.useQuery();

  const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: "profile",       label: "Profile",       icon: User },
    { id: "firm",          label: "Firm",           icon: Building2 },
    { id: "team",          label: "Team",           icon: Users },
    { id: "notifications", label: "Notifications",  icon: Bell },
    { id: "security",      label: "Security",       icon: Shield },
    { id: "integrations",  label: "API Integrations", icon: Zap },
    { id: "cloud",         label: "Cloud Storage",  icon: Cloud },
  ];

  return (
    <div style={{ padding: 32, maxWidth: 820 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Manage your account and firm preferences</p>
      </div>

      <div style={{ display: "flex", gap: 24 }}>
        {/* Sidebar nav */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8,
                  border: "none", background: active ? "var(--accent-light)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text)", fontSize: 13, fontWeight: active ? 600 : 400,
                  cursor: "pointer", textAlign: "left", width: "100%",
                }}>
                  <Icon size={15} /> {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {activeTab === "profile" && <ProfileTab me={me} />}
          {activeTab === "firm" && <FirmTab />}
          {activeTab === "team" && <TeamTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "integrations" && <IntegrationsTab />}
          {activeTab === "cloud" && <CloudTab userId={me?.id ?? ""} />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ me }: { me?: { id: string; name: string; email: string; role: string } | null }) {
  const [form, setForm] = useState({ name: me?.name ?? "", email: me?.email ?? "", title: "", firm: "" });
  const update = trpc.users.updateProfile.useMutation();
  const [activeAccent, setActiveAccent] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
      if (stored) return (JSON.parse(stored) as { value: string }).value;
    } catch { /* ignore */ }
    return "#2E86DE";
  });

  return (
    <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 20px" }}>Profile</h2>

      {/* Avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff" }}>
          {(me?.name ?? "U").charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-strong)" }}>{me?.name ?? "User"}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{me?.email}</div>
          <div style={{ fontSize: 11, background: "var(--accent-light)", color: "var(--accent)", padding: "2px 8px", borderRadius: 10, display: "inline-block", marginTop: 5, fontWeight: 600 }}>
            {me?.role ?? "Auditor"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div>
          <label style={lbl}>Full Name</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} />
        </div>
        <div>
          <label style={lbl}>Email Address</label>
          <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={{ ...inp, background: "#f8f8f8", color: "var(--text-muted)" }} disabled />
        </div>
        <div>
          <label style={lbl}>Job Title</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Senior IT Auditor" style={inp} />
        </div>
        <div>
          <label style={lbl}>Firm / Organization</label>
          <input value={form.firm} onChange={e => setForm(f => ({ ...f, firm: e.target.value }))} placeholder="e.g. Deloitte" style={inp} />
        </div>
      </div>

      {/* Theme Color */}
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Palette size={14} color="var(--accent)" />
          <label style={{ ...lbl, margin: 0, color: "var(--text-strong)", fontWeight: 600 }}>Theme Color</label>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Choose your preferred accent color across the app.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ACCENT_PRESETS.map(preset => {
            const isActive = activeAccent === preset.value;
            return (
              <button
                key={preset.value}
                title={preset.name}
                onClick={() => {
                  saveAccentPreference(preset);
                  setActiveAccent(preset.value);
                }}
                style={{
                  width: 32, height: 32, borderRadius: "50%", border: isActive ? `3px solid ${preset.value}` : "3px solid transparent",
                  background: preset.value, cursor: "pointer", padding: 0,
                  outline: isActive ? `2px solid white` : "none",
                  outlineOffset: isActive ? -5 : 0,
                  boxShadow: isActive ? `0 0 0 2px ${preset.value}` : "0 1px 3px rgba(0,0,0,0.15)",
                  transform: isActive ? "scale(1.15)" : "scale(1)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
              />
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
          Active: <span style={{ color: "var(--accent)", fontWeight: 600 }}>
            {ACCENT_PRESETS.find(p => p.value === activeAccent)?.name ?? "Blue"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => update.mutate({ name: form.name })} disabled={update.isPending} style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6 }}>
          <Save size={13} /> {update.isPending ? "Saving..." : "Save Changes"}
        </button>
        {update.isSuccess && <span style={{ fontSize: 12, color: "var(--green)", display: "flex", alignItems: "center", gap: 4, paddingLeft: 4 }}>Saved</span>}
      </div>
    </div>
  );
}

function FirmTab() {
  const [form, setForm] = useState({ firmName: "", primaryContact: "", pcaobId: "", defaultFramework: "PCAOB" });

  return (
    <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 20px" }}>Firm Settings</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
        <div>
          <label style={lbl}>Firm Name</label>
          <input value={form.firmName} onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))} placeholder="e.g. PricewaterhouseCoopers LLP" style={inp} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={lbl}>Primary Contact</label>
            <input value={form.primaryContact} onChange={e => setForm(f => ({ ...f, primaryContact: e.target.value }))} placeholder="Engagement Partner name" style={inp} />
          </div>
          <div>
            <label style={lbl}>PCAOB Firm ID</label>
            <input value={form.pcaobId} onChange={e => setForm(f => ({ ...f, pcaobId: e.target.value }))} placeholder="e.g. 238" style={inp} />
          </div>
        </div>
        <div>
          <label style={lbl}>Default Audit Framework</label>
          <select value={form.defaultFramework} onChange={e => setForm(f => ({ ...f, defaultFramework: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
            <option value="PCAOB">PCAOB (AS 2201 / AS 2315)</option>
            <option value="AICPA">AICPA (AU-C 315)</option>
            <option value="ISAE3402">ISAE 3402 / SOC 1</option>
          </select>
        </div>
      </div>

      <div style={{ background: "#EBF3FB", borderRadius: 8, padding: "12px 14px", marginBottom: 20, fontSize: 12, color: "#2E86DE", lineHeight: 1.6 }}>
        <strong>Note:</strong> Firm settings apply to all engagements and workpaper headers. PCAOB ID is printed on exported workbooks for regulatory traceability.
      </div>

      <button style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6 }}>
        <Save size={13} /> Save Firm Settings
      </button>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    exceptionRaised: true,
    workpaperSignOff: true,
    pbcOverdue: true,
    aiComplete: true,
    exceptionRemediated: false,
    weeklyDigest: true,
  });

  const rows: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: "exceptionRaised",      label: "Exception Raised",           desc: "When a new exception is noted during testing" },
    { key: "workpaperSignOff",     label: "Workpaper Sign-Off",         desc: "When a preparer or reviewer signs off" },
    { key: "pbcOverdue",           label: "PBC Overdue Alert",          desc: "When a PBC item passes its due date" },
    { key: "aiComplete",           label: "AI Generation Complete",     desc: "When an AI writeup or assessment finishes" },
    { key: "exceptionRemediated",  label: "Exception Remediated",       desc: "When an exception is marked as remediated" },
    { key: "weeklyDigest",         label: "Weekly Digest",              desc: "Weekly summary of engagement activity" },
  ];

  return (
    <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 20px" }}>Notification Preferences</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {rows.map((row, i) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>{row.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{row.desc}</div>
            </div>
            <label style={{ position: "relative", width: 40, height: 22, flexShrink: 0, cursor: "pointer" }}>
              <input type="checkbox" checked={prefs[row.key]} onChange={e => setPrefs(p => ({ ...p, [row.key]: e.target.checked }))} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{
                position: "absolute", inset: 0, borderRadius: 11, transition: "0.2s",
                background: prefs[row.key] ? "var(--navy)" : "#CBD5E0",
              }}>
                <span style={{
                  position: "absolute", top: 3, left: prefs[row.key] ? 21 : 3, width: 16, height: 16,
                  borderRadius: "50%", background: "#fff", transition: "left 0.2s",
                }} />
              </span>
            </label>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        <button style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6 }}>
          <Save size={13} /> Save Preferences
        </button>
      </div>
    </div>
  );
}

function SecurityTab() {
  // ── Change Password ───────────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");

  const strong = newPw.length >= 12 && /[A-Z]/.test(newPw) && /[0-9]/.test(newPw) && /[^A-Za-z0-9]/.test(newPw);
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => { setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwError(""); },
    onError: (err) => setPwError(err.message),
  });

  // ── MFA Setup ─────────────────────────────────────────────────────────────
  const { data: me, refetch: refetchMe } = trpc.auth.me.useQuery();
  const [mfaStep, setMfaStep] = useState<"idle" | "setup" | "backup">("idle");
  const [mfaQr, setMfaQr] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [mfaCodeError, setMfaCodeError] = useState("");
  const [disablePw, setDisablePw] = useState("");
  const [disableError, setDisableError] = useState("");
  const [copied, setCopied] = useState(false);

  const mfaSetup = trpc.auth.mfaSetup.useMutation({
    onSuccess: (data) => { setMfaQr(data); setMfaStep("setup"); setMfaCode(""); setMfaCodeError(""); },
  });
  const mfaEnable = trpc.auth.mfaEnable.useMutation({
    onSuccess: (data) => { setBackupCodes(data.backupCodes); setMfaStep("backup"); refetchMe(); },
    onError: (err) => setMfaCodeError(err.message),
  });
  const mfaDisable = trpc.auth.mfaDisable.useMutation({
    onSuccess: () => { setDisablePw(""); setDisableError(""); refetchMe(); },
    onError: (err) => setDisableError(err.message),
  });

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Change Password */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <Key size={15} /> Change Password
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          <div>
            <label style={lbl}>Current Password</label>
            <input type="password" value={currentPw} onChange={e => { setCurrentPw(e.target.value); setPwError(""); }} style={inp} />
          </div>
          <div>
            <label style={lbl}>New Password</label>
            <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setPwError(""); }} placeholder="Min. 12 characters" style={inp} />
            {newPw.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["12+ chars", "Uppercase", "Number", "Symbol"].map((req, i) => {
                  const met = [newPw.length >= 12, /[A-Z]/.test(newPw), /[0-9]/.test(newPw), /[^A-Za-z0-9]/.test(newPw)][i];
                  return <span key={req} style={{ padding: "2px 7px", borderRadius: 4, background: met ? "#EAFAF1" : "#F2F3F4", color: met ? "#27AE60" : "#95A5A6", fontWeight: 600 }}>{req}</span>;
                })}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>Confirm New Password</label>
            <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setPwError(""); }} style={{ ...inp, borderColor: confirmPw && confirmPw !== newPw ? "#E74C3C" : "" }} />
            {confirmPw && confirmPw !== newPw && <p style={{ fontSize: 11, color: "#E74C3C", marginTop: 4 }}>Passwords do not match</p>}
          </div>
        </div>
        {pwError && (
          <div style={{ fontSize: 12, color: "var(--red)", background: "#FEE2E2", borderRadius: 6, padding: "8px 12px", marginBottom: 14 }}>{pwError}</div>
        )}
        {changePassword.isSuccess && (
          <div style={{ fontSize: 12, color: "#16A34A", background: "#F0FDF4", borderRadius: 6, padding: "8px 12px", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle size={12} /> Password updated successfully.
          </div>
        )}
        <button
          onClick={() => changePassword.mutate({ currentPassword: currentPw, newPassword: newPw })}
          disabled={!strong || newPw !== confirmPw || !currentPw || changePassword.isPending}
          style={{ ...btnPri, opacity: (!strong || newPw !== confirmPw || !currentPw) ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}>
          {changePassword.isPending ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Shield size={13} />}
          {changePassword.isPending ? "Updating..." : "Update Password"}
        </button>
      </div>

      {/* Two-Factor Authentication */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
              <Smartphone size={15} /> Two-Factor Authentication
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Add an extra layer of security using an authenticator app (Google Authenticator, Authy, etc.)
            </p>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10,
            background: me?.mfaEnabled ? "#DCFCE7" : "#F3F4F6",
            color: me?.mfaEnabled ? "#16A34A" : "var(--text-muted)",
          }}>
            {me?.mfaEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {/* Not yet enabled — setup flow */}
        {!me?.mfaEnabled && mfaStep === "idle" && (
          <button
            onClick={() => mfaSetup.mutate()}
            disabled={mfaSetup.isPending}
            style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6 }}>
            {mfaSetup.isPending ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Smartphone size={13} />}
            Set Up Two-Factor Authentication
          </button>
        )}

        {/* Step 1: QR code + verify */}
        {mfaStep === "setup" && mfaQr && (
          <div>
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 20 }}>
              <img src={mfaQr.qrDataUrl} alt="MFA QR code" style={{ width: 160, height: 160, borderRadius: 8, border: "1px solid var(--border)" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)", marginBottom: 8 }}>1. Scan this QR code</div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 12 }}>
                  Open your authenticator app and scan the QR code. Or enter the secret key manually:
                </p>
                <code style={{ fontSize: 11, background: "var(--surface-alt)", padding: "6px 10px", borderRadius: 6, display: "block", letterSpacing: "0.1em", wordBreak: "break-all", color: "var(--text-strong)", border: "1px solid var(--border)" }}>
                  {mfaQr.secret}
                </code>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)", marginBottom: 8 }}>2. Enter the 6-digit code to verify</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={e => { setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setMfaCodeError(""); }}
                  placeholder="000000"
                  style={{ ...inp, letterSpacing: "0.2em", fontWeight: 700, fontSize: 18, textAlign: "center" }}
                />
                {mfaCodeError && <p style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{mfaCodeError}</p>}
              </div>
              <button
                onClick={() => mfaEnable.mutate({ code: mfaCode })}
                disabled={mfaCode.length !== 6 || mfaEnable.isPending}
                style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6, marginTop: 0, opacity: mfaCode.length !== 6 ? 0.5 : 1 }}>
                {mfaEnable.isPending ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle size={13} />}
                Verify
              </button>
            </div>
            <button onClick={() => { setMfaStep("idle"); setMfaQr(null); }} style={{ marginTop: 12, background: "none", border: "none", fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
              Cancel setup
            </button>
          </div>
        )}

        {/* Step 2: Backup codes */}
        {mfaStep === "backup" && backupCodes.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <CheckCircle size={16} color="#16A34A" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>Two-factor authentication enabled!</span>
            </div>
            <div style={{ background: "#FFF7ED", border: "1px solid #FDBA74", borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <AlertTriangle size={13} color="#EA580C" />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#EA580C" }}>Save these backup codes now. They won't be shown again.</span>
              </div>
              <p style={{ fontSize: 11, color: "#92400E", margin: "0 0 10px", lineHeight: 1.5 }}>
                Each code can be used once to access your account if you lose your authenticator device.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {backupCodes.map(c => (
                  <code key={c} style={{ fontSize: 12, fontWeight: 700, background: "#fff", padding: "4px 8px", borderRadius: 4, border: "1px solid #FDBA74", letterSpacing: "0.05em" }}>{c}</code>
                ))}
              </div>
              <button onClick={copyBackupCodes} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #FDBA74", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#EA580C", cursor: "pointer" }}>
                {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
                {copied ? "Copied!" : "Copy all codes"}
              </button>
            </div>
            <button onClick={() => setMfaStep("idle")} style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle size={13} /> Done
            </button>
          </div>
        )}

        {/* Enabled: show disable option */}
        {me?.mfaEnabled && mfaStep === "idle" && (
          <div>
            <div style={{ background: "#DCFCE7", border: "1px solid #A7F3D0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle size={13} color="#16A34A" />
              <span style={{ fontSize: 12, color: "#15803D" }}>Your account is protected with two-factor authentication.</span>
            </div>
            <div>
              <label style={lbl}>Disable Two-Factor Authentication (requires current password)</label>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="password"
                  value={disablePw}
                  onChange={e => { setDisablePw(e.target.value); setDisableError(""); }}
                  placeholder="Enter your password to disable MFA"
                  style={{ ...inp, flex: 1 }}
                />
                <button
                  onClick={() => mfaDisable.mutate({ password: disablePw })}
                  disabled={!disablePw || mfaDisable.isPending}
                  style={{ background: "#FEE2E2", color: "var(--red)", border: "1px solid #FECACA", borderRadius: 8, padding: "0 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0, opacity: !disablePw ? 0.5 : 1 }}>
                  {mfaDisable.isPending ? "Disabling..." : "Disable 2FA"}
                </button>
              </div>
              {disableError && <p style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{disableError}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Session info */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 4px" }}>Session</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Sessions expire after 8 hours of activity (SOC 2 compliant).</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "var(--surface-alt)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>Current Session</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Active now · JWT authenticated · 8h expiry</div>
          </div>
          <span style={{ fontSize: 11, background: "#EAFAF1", color: "#27AE60", padding: "3px 10px", borderRadius: 10, fontWeight: 600 }}>Active</span>
        </div>
      </div>
    </div>
  );
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:    { bg: "#FEF3C7", color: "#D97706" },
  partner:  { bg: "#EDE9FE", color: "#7C3AED" },
  manager:  { bg: "#DBEAFE", color: "#1D4ED8" },
  senior:   { bg: "#D1FAE5", color: "#065F46" },
  preparer: { bg: "#F3F4F6", color: "#374151" },
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", partner: "Partner", manager: "Manager", senior: "Senior", preparer: "Preparer",
};

function TeamTab() {
  const { data: allUsers, refetch } = trpc.users.listAll.useQuery();
  const { data: engagements } = trpc.engagements.list.useQuery();
  const [selectedEngId, setSelectedEngId] = useState<string>("");
  const { data: team, refetch: refetchTeam } = trpc.users.listEngagementTeam.useQuery(
    { engagementId: selectedEngId },
  );
  const updateRole = trpc.users.updateMemberRole.useMutation({ onSuccess: () => refetchTeam() });
  const addMember = trpc.users.addToEngagement.useMutation({ onSuccess: () => refetchTeam() });
  const removeMember = trpc.users.removeFromEngagement.useMutation({ onSuccess: () => refetchTeam() });

  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<"preparer" | "senior" | "manager" | "partner" | "admin">("preparer");

  const teamUserIds = new Set(team?.map(m => m.userId) ?? []);
  const availableUsers = allUsers?.filter(u => !teamUserIds.has(u.id)) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Engagement picker */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={16} /> Team Management
        </h2>
        <div>
          <label style={lbl}>Select Engagement</label>
          <select value={selectedEngId} onChange={e => setSelectedEngId(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
            <option value="">Choose an engagement...</option>
            {engagements?.map(e => (
              <option key={e.id} value={e.id}>{e.clientName} — FY{e.fiscalYear}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedEngId && (
        <>
          {/* Current team */}
          <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface-alt)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>Current Team ({team?.length ?? 0})</div>
            </div>
            {team?.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>No team members yet.</div>
            )}
            {team?.map(member => {
              const rc = ROLE_COLORS[member.role] ?? ROLE_COLORS.preparer;
              return (
                <div key={member.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {member.user?.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>{member.user?.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{member.user?.email}</div>
                  </div>
                  <select
                    value={member.role}
                    onChange={e => updateRole.mutate({ memberId: member.id, role: e.target.value as "preparer" | "senior" | "manager" | "partner" | "admin" })}
                    style={{ height: 32, border: `1px solid ${rc.color}40`, borderRadius: 20, padding: "0 10px", fontSize: 12, fontWeight: 600, background: rc.bg, color: rc.color, cursor: "pointer" }}>
                    {Object.keys(ROLE_LABELS).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button onClick={() => removeMember.mutate({ memberId: member.id })}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add member */}
          <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> Add Team Member
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <label style={lbl}>User</label>
                <select value={addUserId} onChange={e => setAddUserId(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                  <option value="">Select a user...</option>
                  {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Role</label>
                <select value={addRole} onChange={e => setAddRole(e.target.value as "preparer" | "senior" | "manager" | "partner" | "admin")} style={{ ...inp, cursor: "pointer" }}>
                  {Object.keys(ROLE_LABELS).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <button
                onClick={() => { if (addUserId) { addMember.mutate({ engagementId: selectedEngId, userId: addUserId, role: addRole }); setAddUserId(""); } }}
                disabled={!addUserId || addMember.isPending}
                style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6, opacity: !addUserId ? 0.5 : 1 }}>
                <Plus size={13} /> Add
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── API Integrations Tab ─────────────────────────────────────────────────────

function IntegrationsTab() {
  const { data: engagements } = trpc.engagements.list.useQuery();
  const [selectedEngId, setSelectedEngId] = useState<string>("");
  const { data: connections, refetch } = trpc.connections.list.useQuery({ engagementId: selectedEngId });
  const testConn = trpc.connections.test.useMutation({ onSuccess: () => refetch() });
  const deleteConn = trpc.connections.delete.useMutation({ onSuccess: () => refetch() });

  const [showAddForm, setShowAddForm] = useState(false);
  const [provider, setProvider] = useState<"servicenow" | "azure_ad" | "jira" | "github">("servicenow");
  const [connName, setConnName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const createConn = trpc.connections.create.useMutation({
    onSuccess: () => { refetch(); setShowAddForm(false); setConnName(""); setBaseUrl(""); setCreds({}); },
  });

  const PROVIDER_LABELS: Record<string, string> = {
    servicenow: "ServiceNow", azure_ad: "Azure AD / Entra", jira: "Jira", github: "GitHub",
    okta: "Okta", splunk: "Splunk", salesforce: "Salesforce",
  };

  const PROVIDER_CRED_FIELDS: Record<string, { key: string; label: string; type?: string }[]> = {
    servicenow: [{ key: "username", label: "Username" }, { key: "password", label: "Password / Token", type: "password" }],
    azure_ad:   [{ key: "tenantId", label: "Tenant ID" }, { key: "clientId", label: "Client ID" }, { key: "clientSecret", label: "Client Secret", type: "password" }],
    jira:       [{ key: "email", label: "Email" }, { key: "apiToken", label: "API Token", type: "password" }],
    github:     [{ key: "token", label: "Personal Access Token", type: "password" }],
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={15} /> API Integrations
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 20px" }}>
          Connect enterprise systems to pull audit evidence directly into PBC items. Supports ServiceNow, Azure AD, Jira, GitHub, Okta, Splunk.
        </p>
        <div>
          <label style={lbl}>Engagement</label>
          <select value={selectedEngId} onChange={e => setSelectedEngId(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
            <option value="">Select an engagement...</option>
            {engagements?.map(e => <option key={e.id} value={e.id}>{e.clientName} — FY{e.fiscalYear}</option>)}
          </select>
        </div>
      </div>

      {selectedEngId && (
        <>
          {/* Existing connections */}
          <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>Connections ({connections?.length ?? 0})</span>
              <button onClick={() => setShowAddForm(true)} style={{ ...btnPri, display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 12px" }}>
                <Plus size={12} /> Add Connection
              </button>
            </div>

            {(connections?.length ?? 0) === 0 && (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                <Zap size={24} style={{ display: "block", margin: "0 auto 10px", opacity: 0.3 }} />
                No connections yet. Add one to start pulling audit evidence automatically.
              </div>
            )}

            {connections?.map(conn => (
              <div key={conn.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #1E3A5F, #2A4F7C)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Link2 size={16} color="#D4AF37" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>{conn.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {PROVIDER_LABELS[conn.provider] ?? conn.provider}
                    {conn.baseUrl ? ` · ${conn.baseUrl}` : ""}
                    {conn.lastTestedAt ? ` · Tested ${new Date(conn.lastTestedAt).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                  background: conn.lastTestResult === "ok" ? "#DCFCE7" : conn.lastTestResult ? "#FEE2E2" : "#F3F4F6",
                  color: conn.lastTestResult === "ok" ? "#16A34A" : conn.lastTestResult ? "var(--red)" : "var(--text-muted)",
                }}>
                  {conn.lastTestResult === "ok" ? "Connected" : conn.lastTestResult ? "Error" : "Not tested"}
                </span>
                <button
                  onClick={() => testConn.mutate({ id: conn.id })}
                  disabled={testConn.isPending}
                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center", gap: 4 }}>
                  {testConn.isPending ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={11} />}
                  Test
                </button>
                <button onClick={() => deleteConn.mutate({ id: conn.id, engagementId: selectedEngId })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Add connection form */}
          {showAddForm && (
            <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Add API Connection</h3>
                <button onClick={() => setShowAddForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}><X size={16} /></button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Provider</label>
                  <select value={provider} onChange={e => { setProvider(e.target.value as "servicenow" | "azure_ad" | "jira" | "github"); setCreds({}); }} style={{ ...inp, cursor: "pointer" }}>
                    {Object.entries(PROVIDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Connection Name</label>
                  <input value={connName} onChange={e => setConnName(e.target.value)} placeholder="e.g. Acme ServiceNow Prod" style={inp} />
                </div>
                {(provider === "servicenow" || provider === "jira") && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Instance URL</label>
                    <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder={provider === "servicenow" ? "https://company.service-now.com" : "https://company.atlassian.net"} style={inp} />
                  </div>
                )}
                {(PROVIDER_CRED_FIELDS[provider] ?? []).map(field => (
                  <div key={field.key}>
                    <label style={lbl}>{field.label}</label>
                    <input
                      type={field.type ?? "text"}
                      value={creds[field.key] ?? ""}
                      onChange={e => setCreds(c => ({ ...c, [field.key]: e.target.value }))}
                      style={inp}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => createConn.mutate({ engagementId: selectedEngId, provider, name: connName, baseUrl: baseUrl || undefined, credentials: creds })}
                  disabled={!connName || createConn.isPending}
                  style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6, opacity: !connName ? 0.5 : 1 }}>
                  {createConn.isPending ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />}
                  Add Connection
                </button>
                <button onClick={() => setShowAddForm(false)} style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
              {createConn.isError && (
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--red)", background: "#FEF2F2", borderRadius: 6, padding: "8px 12px" }}>{createConn.error.message}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Cloud Storage Tab ────────────────────────────────────────────────────────

function CloudTab({ userId }: { userId: string }) {
  const { data: connections, refetch } = trpc.cloud.listConnections.useQuery();
  const disconnect = trpc.cloud.disconnect.useMutation({ onSuccess: () => refetch() });

  const handleConnect = (provider: "google_drive" | "onedrive") => {
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";
    window.location.href = `${apiBase}/api/cloud/${provider === "google_drive" ? "google-drive" : "onedrive"}/connect?userId=${encodeURIComponent(userId)}`;
  };

  const PROVIDERS = [
    {
      id: "google_drive" as const,
      name: "Google Drive",
      description: "Connect your Google Drive to sync evidence files from specific folders into PBC items.",
      icon: HardDrive,
      color: "#4285F4",
    },
    {
      id: "onedrive" as const,
      name: "Microsoft OneDrive",
      description: "Connect OneDrive / SharePoint to pull audit evidence directly from client-shared folders.",
      icon: Cloud,
      color: "#0078D4",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 8 }}>
          <FolderOpen size={15} /> Cloud Storage
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Connect Google Drive or OneDrive to let Auditly sync evidence files directly from client folders into PBC items. Files are downloaded, text-extracted, and AI-classified automatically.
        </p>
      </div>

      {PROVIDERS.map(p => {
        const Icon = p.icon;
        const conn = connections?.find(c => c.provider === p.id);

        return (
          <div key={p.id} style={{ background: "var(--surface)", borderRadius: 12, border: `1px solid ${conn ? "#A7F3D0" : "var(--border)"}`, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: `${p.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={22} color={p.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>{p.name}</span>
                  {conn && (
                    <span style={{ fontSize: 10, background: "#DCFCE7", color: "#16A34A", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>Connected</span>
                  )}
                </div>
                {conn ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {conn.displayName ?? conn.email} · Connected {new Date(conn.createdAt).toLocaleDateString()}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.description}</div>
                )}
              </div>
              {conn ? (
                <button
                  onClick={() => disconnect.mutate({ id: conn.id })}
                  style={{ background: "#FEE2E2", color: "var(--red)", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  <Unplug size={12} /> Disconnect
                </button>
              ) : (
                <button
                  onClick={() => handleConnect(p.id)}
                  style={{ ...btnPri, display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "8px 14px", background: p.color }}>
                  <Link2 size={12} /> Connect
                </button>
              )}
            </div>

            {conn && (
              <div style={{ marginTop: 14, padding: "12px 14px", background: "#F0FDF4", borderRadius: 8, fontSize: 12, color: "#065F46", lineHeight: 1.6 }}>
                To sync evidence: open a control in your workpapers, open the "Pull Evidence from System" panel, then link a folder to that control. Auditly will download all files from that folder and create PBC items automatically.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 13, background: "#fff", boxSizing: "border-box" };
const btnPri: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };

if (typeof document !== "undefined" && !document.getElementById("settings-spin")) {
  const s = document.createElement("style");
  s.id = "settings-spin";
  s.textContent = "@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }";
  document.head.appendChild(s);
}
