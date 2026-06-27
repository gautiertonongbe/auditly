import { useState } from "react";
import { User, Building2, Bell, Shield, Key, Save, Users, Plus, Trash2, Crown, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Tab = "profile" | "firm" | "team" | "notifications" | "security";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const { data: me } = trpc.users.me.useQuery();

  const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: "profile",       label: "Profile",       icon: User },
    { id: "firm",          label: "Firm",           icon: Building2 },
    { id: "team",          label: "Team",           icon: Users },
    { id: "notifications", label: "Notifications",  icon: Bell },
    { id: "security",      label: "Security",       icon: Shield },
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
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ me }: { me?: { id: string; name: string; email: string; role: string } | null }) {
  const [form, setForm] = useState({ name: me?.name ?? "", email: me?.email ?? "", title: "", firm: "" });
  const update = trpc.users.updateProfile.useMutation();

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
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const strong = newPw.length >= 12 && /[A-Z]/.test(newPw) && /[0-9]/.test(newPw) && /[^A-Za-z0-9]/.test(newPw);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <Key size={15} /> Change Password
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          <div>
            <label style={lbl}>Current Password</label>
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>New Password</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 12 characters" style={inp} />
            {newPw.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, display: "flex", gap: 6 }}>
                {["12+ chars", "Uppercase", "Number", "Symbol"].map((req, i) => {
                  const met = [newPw.length >= 12, /[A-Z]/.test(newPw), /[0-9]/.test(newPw), /[^A-Za-z0-9]/.test(newPw)][i];
                  return <span key={req} style={{ padding: "2px 7px", borderRadius: 4, background: met ? "#EAFAF1" : "#F2F3F4", color: met ? "#27AE60" : "#95A5A6", fontWeight: 600 }}>{req}</span>;
                })}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>Confirm New Password</label>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} style={{ ...inp, borderColor: confirmPw && confirmPw !== newPw ? "#E74C3C" : "" }} />
            {confirmPw && confirmPw !== newPw && <p style={{ fontSize: 11, color: "#E74C3C", marginTop: 4 }}>Passwords do not match</p>}
          </div>
        </div>
        <button disabled={!strong || newPw !== confirmPw || !currentPw} style={{ ...btnPri, opacity: (!strong || newPw !== confirmPw || !currentPw) ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}>
          <Shield size={13} /> Update Password
        </button>
      </div>

      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 4px" }}>Session & Access</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Manage active sessions and API access</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "var(--surface-alt)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>Current Session</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Active now · JWT authenticated</div>
            </div>
            <span style={{ fontSize: 11, background: "#EAFAF1", color: "#27AE60", padding: "3px 10px", borderRadius: 10, fontWeight: 600 }}>Active</span>
          </div>
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

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 5 };
const inp: React.CSSProperties = { width: "100%", height: 38, border: "1px solid var(--border)", borderRadius: 7, padding: "0 10px", fontSize: 13, background: "#fff", boxSizing: "border-box" };
const btnPri: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
