import { useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Shield, Sparkles, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

const SEVERITY_CFG: Record<string, { label: string; color: string; bg: string; description: string }> = {
  ControlDeficiency:     { label: "Control Deficiency",      color: "#F39C12", bg: "#FFF8E6", description: "A deficiency exists when the design or operation of a control does not allow management or employees, in the normal course of performing their assigned functions, to prevent or detect misstatements on a timely basis." },
  SignificantDeficiency: { label: "Significant Deficiency",  color: "#E67E22", bg: "#FEF0E7", description: "A significant deficiency is a deficiency, or a combination of deficiencies, in internal control over financial reporting that is less severe than a material weakness, yet important enough to merit attention by those responsible for oversight of the company's financial reporting." },
  MaterialWeakness:      { label: "Material Weakness",       color: "#E74C3C", bg: "#FDEDEC", description: "A material weakness is a deficiency, or a combination of deficiencies, in internal control over financial reporting, such that there is a reasonable possibility that a material misstatement of the company's annual or interim financial statements will not be prevented or detected on a timely basis." },
};

export default function DeficiencyAssessmentPage() {
  const [, params] = useRoute("/engagements/:id/deficiency");
  const engagementId = params?.id ?? "";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [result, setResult] = useState<{ assessment: string; finalSeverity: string } | null>(null);

  const { data: exceptions } = trpc.exceptions.listByEngagement.useQuery({ engagementId });
  const { data: controls } = trpc.controls.listByEngagement.useQuery({ engagementId });
  const { data: engagement } = trpc.engagements.get.useQuery({ id: engagementId });

  const assess = trpc.ai.assessDeficiency.useMutation({ onSuccess: setResult });

  const openExceptions = exceptions?.filter(e => e.status === "Open") ?? [];
  const toggleId = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const selected = openExceptions.filter(e => selectedIds.includes(e.id));

  return (
    <div style={{ padding: 32, maxWidth: 860 }}>
      <Link href={`/engagements/${engagementId}/exceptions`}>
        <a style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Exception Log
        </a>
      </Link>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-strong)", margin: 0 }}>Deficiency Assessment</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Select exceptions to assess individually or in aggregation per PCAOB AS 2201</p>
      </div>

      {/* PCAOB reference */}
      <div style={{ background: "#EBF3FB", border: "1px solid #C3DDF7", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: "#2E86DE", margin: 0, lineHeight: 1.6 }}>
          <strong>PCAOB AS 2201.69:</strong> When evaluating the severity of a deficiency, the auditor should consider the potential for misstatement and the likelihood that controls could fail. Multiple control deficiencies that affect the same financial statement account or assertion increase the likelihood of misstatement and may, in combination, constitute a significant deficiency or material weakness.
        </p>
      </div>

      {/* Exception selector */}
      <div style={{ background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", marginBottom: 14 }}>
          Select exceptions to assess ({selectedIds.length} selected)
        </div>
        {openExceptions.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--green)", fontWeight: 600 }}>No open exceptions to assess.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
              <input type="checkbox" checked={selectedIds.length === openExceptions.length} onChange={e => setSelectedIds(e.target.checked ? openExceptions.map(e => e.id) : [])} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Select all ({openExceptions.length})</span>
            </label>
            {openExceptions.map(exc => {
              const ctrl = controls?.find(c => c.id === exc.controlId);
              const checked = selectedIds.includes(exc.id);
              return (
                <label key={exc.id} onClick={() => toggleId(exc.id)} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, background: checked ? "var(--accent-light)" : "var(--surface-alt)", border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`, cursor: "pointer", transition: "all 0.1s" }}>
                  <input type="checkbox" checked={checked} onChange={() => {}} style={{ marginTop: 2 }} />
                  <div>
                    {ctrl && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginRight: 6 }}>{ctrl.controlRef}</span>}
                    <span style={{ fontSize: 13, color: "var(--text-strong)" }}>{exc.description}</span>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>Initial severity: {exc.severity.replace(/([A-Z])/g, ' $1').trim()}</div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <button
          onClick={() => assess.mutate({ engagementId, exceptionIds: selectedIds })}
          disabled={assess.isPending}
          style={{ ...btnPri, display: "flex", alignItems: "center", gap: 7, marginBottom: 24, background: "#8E44AD" }}>
          <Sparkles size={14} />
          {assess.isPending ? "Claude is assessing..." : `Assess ${selectedIds.length} Exception${selectedIds.length > 1 ? "s" : ""} with AI`}
        </button>
      )}

      {/* Result */}
      {result && (
        <div style={{ background: "var(--surface)", borderRadius: 12, border: `2px solid ${SEVERITY_CFG[result.finalSeverity]?.color ?? "var(--border)"}`, overflow: "hidden" }}>
          <div style={{ background: SEVERITY_CFG[result.finalSeverity]?.bg ?? "var(--surface-alt)", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Shield size={20} color={SEVERITY_CFG[result.finalSeverity]?.color} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>AI Assessment Result</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: SEVERITY_CFG[result.finalSeverity]?.color }}>
                  {SEVERITY_CFG[result.finalSeverity]?.label ?? result.finalSeverity}
                </div>
              </div>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>Assessment Memo</div>
            <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text)", margin: "0 0 16px", whiteSpace: "pre-wrap" }}>{result.assessment}</p>
            <div style={{ background: SEVERITY_CFG[result.finalSeverity]?.bg ?? "#F8FAFC", borderRadius: 8, padding: "12px 14px", border: `1px solid ${SEVERITY_CFG[result.finalSeverity]?.color ?? "var(--border)"}20` }}>
              <p style={{ fontSize: 12, color: SEVERITY_CFG[result.finalSeverity]?.color ?? "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                <strong>Definition:</strong> {SEVERITY_CFG[result.finalSeverity]?.description}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPri: React.CSSProperties = { background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
