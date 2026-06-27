import { useState, useRef, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Sparkles, CheckCircle, AlertTriangle, Save, UserCheck, Edit3, Eye, MessageSquare, Send, Bot, User, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

type Tab = "procedure" | "results" | "conclusion";
type ChatMsg = { role: "user" | "assistant"; text: string; section?: string };

export default function WorkpaperDetailPage() {
  const [, params] = useRoute("/engagements/:engId/controls/:controlId");
  const engId = params?.engId ?? "";
  const controlId = params?.controlId ?? "";

  const [tab, setTab] = useState<Tab>("procedure");
  const [editing, setEditing] = useState<Tab | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsg, setChatMsg] = useState("");
  const [chatSection, setChatSection] = useState<"procedure" | "results" | "conclusion" | "all">("all");
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentSection, setCommentSection] = useState<string>("general");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const { data: wp, refetch } = trpc.workpapers.getByControl.useQuery({ controlId });
  const { data: controls } = trpc.controls.listByEngagement.useQuery({ engagementId: engId });
  const control = controls?.find(c => c.id === controlId);

  const generateAi = trpc.workpapers.generateAi.useMutation({ onSuccess: () => refetch() });
  const upsert = trpc.workpapers.upsert.useMutation({ onSuccess: () => { refetch(); setEditing(null); } });
  const signOff = trpc.workpapers.signOff.useMutation({ onSuccess: () => refetch() });
  const createException = trpc.exceptions.create.useMutation({ onSuccess: () => refetch() });
  const addComment = trpc.workpapers.addReviewComment.useMutation({ onSuccess: () => { refetch(); setCommentText(""); } });
  const chatImprove = trpc.workpapers.chatImprove.useMutation({
    onSuccess: (data) => {
      refetch();
      setChatHistory(h => [...h, { role: "assistant", text: `Done. I've updated the ${data.section} section. The changes are reflected in the workpaper above.`, section: data.section }]);
      setChatMsg("");
    },
    onError: (err) => {
      setChatHistory(h => [...h, { role: "assistant", text: `Sorry, I couldn't apply that change: ${err.message}` }]);
    },
  });

  const [exceptionDesc, setExceptionDesc] = useState("");
  const [showExcModal, setShowExcModal] = useState(false);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  const save = (field: Tab) => {
    const map: Record<Tab, string> = { procedure: "procedureFinal", results: "resultsFinal", conclusion: "conclusionFinal" };
    upsert.mutate({ controlId, engagementId: engId, [map[field]]: drafts[field] ?? getContent(field) });
  };

  const getContent = (field: Tab): string => {
    if (!wp) return "";
    if (field === "procedure") return wp.procedureFinal ?? wp.procedureDraft ?? "";
    if (field === "results") return wp.resultsFinal ?? wp.resultsDraft ?? "";
    return wp.conclusionFinal ?? wp.conclusionDraft ?? "";
  };

  const sendChat = () => {
    if (!chatMsg.trim() || !wp?.id || chatImprove.isPending) return;
    setChatHistory(h => [...h, { role: "user", text: chatMsg, section: chatSection }]);
    chatImprove.mutate({ workpaperId: wp.id, userMessage: chatMsg, section: chatSection });
  };

  const hasAiContent = !!(wp?.procedureDraft || wp?.procedureFinal);

  const reviewNoteLines: { timestamp: string; author: string; section: string; text: string }[] = (wp?.reviewNotes ?? "")
    .split("\n")
    .filter(Boolean)
    .map(line => {
      const m = line.match(/^\[([^\]]+)\] ([^:]+): (?:\[([^\]]+)\] )?(.+)$/);
      if (!m) return { timestamp: "", author: "Reviewer", section: "", text: line };
      return { timestamp: m[1], author: m[2], section: m[3] ?? "general", text: m[4] };
    });

  return (
    <div style={{ padding: 32, maxWidth: 960 }}>
      <Link href={`/engagements/${engId}/controls`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Controls
        </a>
      </Link>

      {/* Header */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", marginBottom: 20 }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>
                {control?.domain} · {control?.itgcType ?? control?.itacType} · {control?.frequency} · {control?.riskLevel} Risk
              </div>
              <h1 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 }}>{control?.controlRef}</h1>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 6, maxWidth: 600 }}>{control?.objective}</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => generateAi.mutate({ controlId })}
                disabled={generateAi.isPending}
                style={{ display: "flex", alignItems: "center", gap: 7, background: "#D4AF37", color: "#1E3A5F", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: generateAi.isPending ? 0.7 : 1 }}>
                <Sparkles size={14} />
                {generateAi.isPending ? "Generating..." : hasAiContent ? "Regenerate AI" : "Generate AI Writeup"}
              </button>
              {hasAiContent && (
                <button
                  onClick={() => setChatOpen(o => !o)}
                  style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  <MessageSquare size={13} /> {chatOpen ? "Hide AI Chat" : "Improve with AI Chat"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Population row */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[
            { label: "Population", value: wp?.populationDescription ?? "Not set" },
            { label: "Population Count", value: wp?.populationCount ? wp.populationCount.toLocaleString() : "—" },
            { label: "Sample Size", value: wp?.sampleSize ? String(wp.sampleSize) : "—" },
            { label: "Sampling Method", value: wp?.samplingMethod ?? "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{value}</div>
            </div>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            {wp?.preparedAt && (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Prepared {format(new Date(wp.preparedAt), "MMM d, yyyy")}</div>
            )}
            {wp?.reviewedAt && (
              <div style={{ fontSize: 11, color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle size={11} /> Reviewed {format(new Date(wp.reviewedAt), "MMM d")}
              </div>
            )}
            {wp?.approvedAt && (
              <div style={{ fontSize: 11, color: "#2E86DE", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle size={11} /> Approved {format(new Date(wp.approvedAt), "MMM d")}
              </div>
            )}
          </div>
        </div>

        {wp?.conclusion && wp.conclusion !== "InProgress" && (
          <div style={{ padding: "10px 24px", background: wp.conclusion === "Pass" ? "#EAFAF1" : "#FDEDEC" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: wp.conclusion === "Pass" ? "var(--green)" : "var(--red)", display: "flex", alignItems: "center", gap: 6 }}>
              {wp.conclusion === "Pass" ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              {wp.conclusion === "Pass" ? "No exceptions noted" : "Exception noted"}
            </span>
          </div>
        )}
      </div>

      {!hasAiContent ? (
        <div style={{ background: "var(--surface)", borderRadius: 12, border: "2px dashed var(--border)", padding: "50px 40px", textAlign: "center" }}>
          <Sparkles size={32} color="var(--border)" style={{ margin: "0 auto 14px" }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-strong)", margin: "0 0 8px" }}>No writeup yet</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px" }}>
            AI will auto-draft the procedure, results, and conclusion referencing each accepted PBC item by name.
          </p>
          <button onClick={() => generateAi.mutate({ controlId })} disabled={generateAi.isPending}
            style={{ background: "#D4AF37", color: "#1E3A5F", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <Sparkles size={13} style={{ marginRight: 6 }} /> Generate AI Writeup
          </button>
        </div>
      ) : (
        <>
          {/* AI Chat panel */}
          {chatOpen && (
            <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", marginBottom: 20, overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "12px 18px", display: "flex", alignItems: "center", gap: 8 }}>
                <Bot size={16} color="#D4AF37" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>AI Workpaper Assistant</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>Ask me to rewrite, clarify, or improve any section</span>
              </div>
              {/* Chat messages */}
              <div style={{ minHeight: 120, maxHeight: 320, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {chatHistory.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 12 }}>
                    <p style={{ margin: 0 }}>Examples: "Make the procedure more specific to SAP" · "Rewrite results to reference the user access review file" · "Shorten the conclusion"</p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: msg.role === "user" ? "var(--navy)" : "#D4AF37", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {msg.role === "user" ? <User size={14} color="#fff" /> : <Bot size={14} color="#1E3A5F" />}
                    </div>
                    <div style={{ maxWidth: "70%", background: msg.role === "user" ? "var(--navy)" : "var(--surface-alt)", borderRadius: 10, padding: "10px 14px", fontSize: 13, lineHeight: 1.6, color: msg.role === "user" ? "#fff" : "var(--text)" }}>
                      {msg.section && msg.role === "user" && (
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6, marginBottom: 4 }}>
                          Re: {msg.section}
                        </div>
                      )}
                      {msg.text}
                    </div>
                  </div>
                ))}
                {chatImprove.isPending && (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#D4AF37", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Bot size={14} color="#1E3A5F" />
                    </div>
                    <div style={{ background: "var(--surface-alt)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--text-muted)" }}>Rewriting...</div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
              {/* Chat input */}
              <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px", display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {(["procedure", "results", "conclusion", "all"] as const).map(s => (
                      <button key={s} onClick={() => setChatSection(s)}
                        style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: chatSection === s ? "var(--navy)" : "var(--surface)", color: chatSection === s ? "#fff" : "var(--text-muted)", cursor: "pointer" }}>
                        {s === "all" ? "All sections" : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={chatMsg}
                    onChange={e => setChatMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder={`Improve the ${chatSection} section... (Enter to send)`}
                    rows={2}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "none", fontFamily: "inherit" }}
                  />
                </div>
                <button onClick={sendChat} disabled={!chatMsg.trim() || chatImprove.isPending}
                  style={{ width: 38, height: 38, borderRadius: 8, background: "var(--navy)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: !chatMsg.trim() ? 0.5 : 1, flexShrink: 0 }}>
                  <Send size={15} color="#fff" />
                </button>
              </div>
            </div>
          )}

          {/* Section tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
            {(["procedure", "results", "conclusion"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: "10px 20px", border: "none", borderBottom: tab === t ? "2px solid var(--navy)" : "2px solid transparent", background: "none", fontSize: 13, fontWeight: tab === t ? 700 : 500, color: tab === t ? "var(--navy)" : "var(--text-muted)", cursor: "pointer", textTransform: "capitalize" }}>
                {t === "procedure" ? "Procedure Performed" : t === "results" ? "Results" : "Conclusion"}
              </button>
            ))}
          </div>

          {/* Content card */}
          <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-alt)" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                {getContent(tab) !== (tab === "procedure" ? wp?.procedureDraft : tab === "results" ? wp?.resultsDraft : wp?.conclusionDraft)
                  ? <span style={{ color: "var(--green)", fontWeight: 700 }}>Edited</span>
                  : "AI Draft"}
              </span>
              <button onClick={() => { setEditing(editing === tab ? null : tab); setDrafts(d => ({ ...d, [tab]: getContent(tab) })); }}
                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--text)" }}>
                {editing === tab ? <Eye size={12} /> : <Edit3 size={12} />}
                {editing === tab ? "Preview" : "Edit"}
              </button>
            </div>
            <div style={{ padding: 20 }}>
              {editing === tab ? (
                <textarea
                  value={drafts[tab] ?? getContent(tab)}
                  onChange={e => setDrafts(d => ({ ...d, [tab]: e.target.value }))}
                  style={{ width: "100%", minHeight: 180, border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.7, resize: "vertical", fontFamily: "inherit" }}
                />
              ) : (
                <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text)", margin: 0, whiteSpace: "pre-wrap" }}>
                  {getContent(tab) || <span style={{ color: "var(--text-muted)" }}>No content yet.</span>}
                </p>
              )}
            </div>
            {editing === tab && (
              <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setEditing(null)} style={btnSec}>Discard</button>
                <button onClick={() => save(tab)} disabled={upsert.isPending} style={btnPri}>
                  <Save size={12} /> {upsert.isPending ? "Saving..." : "Save Final"}
                </button>
              </div>
            )}
          </div>

          {/* Sign-off actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
            {!wp?.preparedAt && (
              <button onClick={() => signOff.mutate({ workpaperId: wp?.id ?? "", level: "preparer" })} disabled={!wp?.id || signOff.isPending}
                style={{ ...btnPri, gap: 6 }}>
                <UserCheck size={14} /> Sign off as Preparer
              </button>
            )}
            {wp?.preparedAt && !wp?.reviewedAt && (
              <button onClick={() => signOff.mutate({ workpaperId: wp.id, level: "reviewer" })} disabled={signOff.isPending}
                style={{ ...btnPri, background: "#8E44AD", gap: 6 }}>
                <UserCheck size={14} /> Sign off as Reviewer
              </button>
            )}
            {wp?.reviewedAt && !wp?.approvedAt && (
              <button onClick={() => signOff.mutate({ workpaperId: wp.id, level: "approver" })} disabled={signOff.isPending}
                style={{ ...btnPri, background: "var(--green)", gap: 6 }}>
                <CheckCircle size={14} /> Approve
              </button>
            )}
            <button onClick={() => setShowExcModal(true)}
              style={{ ...btnSec, gap: 6, color: "var(--red)", borderColor: "#FECACA" }}>
              <AlertTriangle size={13} /> Note Exception
            </button>
            <button onClick={() => upsert.mutate({ controlId, engagementId: engId, conclusion: "Pass" })}
              style={{ ...btnSec, gap: 6, color: "var(--green)", borderColor: "#A9DFBF" }}>
              <CheckCircle size={13} /> Mark as Pass
            </button>
          </div>

          {/* Review Comments */}
          <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <MessageSquare size={15} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>Review Comments</span>
              {reviewNoteLines.length > 0 && (
                <span style={{ fontSize: 11, background: "var(--accent-light)", color: "var(--accent)", padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>
                  {reviewNoteLines.length}
                </span>
              )}
            </div>
            {reviewNoteLines.length > 0 && (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {reviewNoteLines.map((note, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <User size={14} color="var(--accent)" />
                    </div>
                    <div style={{ flex: 1, background: "var(--surface-alt)", borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)" }}>{note.author}</span>
                        {note.section !== "general" && (
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "1px 6px", borderRadius: 4, background: "var(--border)", color: "var(--text-muted)" }}>{note.section}</span>
                        )}
                        {note.timestamp && (
                          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
                            {new Date(note.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text)", margin: 0, lineHeight: 1.6 }}>{note.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: 16, borderTop: reviewNoteLines.length > 0 ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {["general", "procedure", "results", "conclusion"].map(s => (
                  <button key={s} onClick={() => setCommentSection(s)}
                    style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: commentSection === s ? "var(--navy)" : "var(--surface)", color: commentSection === s ? "#fff" : "var(--text-muted)", cursor: "pointer" }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Add a review comment..."
                  rows={2}
                  style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "none", fontFamily: "inherit" }}
                />
                <button
                  onClick={() => {
                    if (!wp?.id || !commentText.trim()) return;
                    addComment.mutate({ workpaperId: wp.id, comment: commentText, sectionRef: commentSection === "general" ? undefined : commentSection });
                  }}
                  disabled={!commentText.trim() || addComment.isPending || !wp?.id}
                  style={{ ...btnPri, alignSelf: "flex-end", opacity: !commentText.trim() ? 0.5 : 1, gap: 6 }}>
                  <Send size={13} /> Post
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Exception modal */}
      {showExcModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, width: 500, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-strong)", margin: "0 0 16px" }}>Note Exception</h3>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Exception Description *</label>
            <textarea value={exceptionDesc} onChange={e => setExceptionDesc(e.target.value)} rows={4} placeholder="Describe the exception found during testing..."
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 13, resize: "vertical", fontFamily: "inherit", marginBottom: 16 }} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>AI will auto-draft the root cause analysis, management response template, and management letter comment.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowExcModal(false)} style={btnSec}>Cancel</button>
              <button onClick={() => {
                if (!wp?.id) return;
                createException.mutate({ workpaperId: wp.id, controlId, engagementId: engId, description: exceptionDesc });
                setShowExcModal(false);
                setExceptionDesc("");
              }} disabled={!exceptionDesc || createException.isPending || !wp?.id}
                style={{ ...btnPri, background: "var(--red)", opacity: !exceptionDesc ? 0.5 : 1 }}>
                {createException.isPending ? "Raising..." : "Raise Exception"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPri: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center" };
const btnSec: React.CSSProperties = { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center" };
