import { useRef, useEffect, useState } from "react";
import { Scan, Download, Plus, Trash2, X, Check, Save, Tag, Settings2, GripVertical } from "lucide-react";
import { trpc } from "@/lib/trpc";

// Normalized bounding box (coordinates 0–1 relative to image dimensions)
export type AnnotationBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  reason: string;
  color: string;
  testAttribute?: string;
};

export type TestAttribute = {
  key: string;   // e.g. "A"
  label: string; // e.g. "Completeness"
  color: string;
};

const DEFAULT_TEST_ATTRIBUTES: TestAttribute[] = [
  { key: "A", label: "Completeness",       color: "#2E86DE" },
  { key: "B", label: "Independent Review", color: "#27AE60" },
  { key: "C", label: "ICM Ticket Proof",   color: "#F39C12" },
  { key: "D", label: "Changes Addressed",  color: "#8E44AD" },
];

const PALETTE = [
  { name: "Red",    hex: "#E74C3C" },
  { name: "Orange", hex: "#F39C12" },
  { name: "Green",  hex: "#27AE60" },
  { name: "Blue",   hex: "#2E86DE" },
  { name: "Purple", hex: "#8E44AD" },
  { name: "Teal",   hex: "#1ABC9C" },
];

function randomId() { return Math.random().toString(36).slice(2, 9); }

interface Props {
  pbcItemId: string;
  fileName: string;
  existingAnnotations?: AnnotationBox[];
  existingTestAttributes?: TestAttribute[];
  onClose: () => void;
  onSaved?: () => void;
}

export default function ScreenshotAnnotator({
  pbcItemId, fileName,
  existingAnnotations, existingTestAttributes,
  onClose, onSaved,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [boxes, setBoxes] = useState<AnnotationBox[]>(existingAnnotations ?? []);
  const [testAttributes, setTestAttributes] = useState<TestAttribute[]>(existingTestAttributes ?? DEFAULT_TEST_ATTRIBUTES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeColor, setActiveColor] = useState(PALETTE[3].hex);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [showAttrManager, setShowAttrManager] = useState(false);
  const [newAttrLabel, setNewAttrLabel] = useState("");
  const [saved, setSaved] = useState(false);

  const saveAnnotations = trpc.pbc.saveAnnotations.useMutation({
    onSuccess: () => {
      setSaved(true);
      onSaved?.();
      setTimeout(() => onClose(), 800);
    },
  });

  const annotate = trpc.workpapers.agentAnnotateScreenshot.useMutation({
    onSuccess: (data) => {
      const src = `data:${data.mediaType};base64,${data.imageBase64}`;
      loadImage(src);
      const aiBoxes: AnnotationBox[] = data.boxes.map((b: { x: number; y: number; w: number; h: number; label: string; reason: string; priority: string }) => ({
        id: randomId(), x: b.x, y: b.y, w: b.w, h: b.h,
        label: b.label, reason: b.reason,
        color: b.priority === "high" ? PALETTE[0].hex : b.priority === "medium" ? PALETTE[1].hex : PALETTE[3].hex,
      }));
      setBoxes(aiBoxes);
    },
  });

  useEffect(() => {
    annotate.mutate({ pbcItemId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadImage(src: string) {
    const img = new Image();
    img.onload = () => { imgRef.current = img; setImageLoaded(true); };
    img.src = src;
  }

  // Redraw canvas
  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);

    for (const box of boxes) {
      const px = box.x * img.naturalWidth;
      const py = box.y * img.naturalHeight;
      const pw = box.w * img.naturalWidth;
      const ph = box.h * img.naturalHeight;

      // Find test attribute for this box
      const attr = testAttributes.find(a => a.key === box.testAttribute);
      const boxColor = attr ? attr.color : box.color;
      const isSelected = box.id === selectedId;

      // Box border
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = isSelected ? 3.5 : 2.5;
      ctx.setLineDash(isSelected ? [7, 3] : []);
      ctx.strokeRect(px, py, pw, ph);

      // Key chip (top-left corner)
      const chipText = attr ? `[${attr.key}] ${box.label}` : box.label;
      ctx.font = "bold 12px Arial, sans-serif";
      const textW = ctx.measureText(chipText).width + 12;
      const chipH = 20;

      // Chip background
      ctx.fillStyle = boxColor;
      ctx.beginPath();
      ctx.roundRect(px, py - chipH - 2, textW, chipH, 3);
      ctx.fill();

      // Chip text
      ctx.fillStyle = "#fff";
      ctx.fillText(chipText, px + 6, py - chipH - 2 + 14);
    }
  }, [boxes, selectedId, imageLoaded, testAttributes]);

  function getCanvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: ((e.clientX - rect.left) * scaleX) / canvas.width,
      y: ((e.clientY - rect.top) * scaleY) / canvas.height,
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    setDrawing(true);
    setDrawStart(getCanvasCoords(e));
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing || !drawStart) return;
    setDrawing(false);
    const end = getCanvasCoords(e);
    const x = Math.min(drawStart.x, end.x);
    const y = Math.min(drawStart.y, end.y);
    const w = Math.abs(end.x - drawStart.x);
    const h = Math.abs(end.y - drawStart.y);
    if (w < 0.01 || h < 0.01) { setDrawStart(null); return; }
    const firstAttr = testAttributes[0];
    const newBox: AnnotationBox = {
      id: randomId(), x, y, w, h,
      label: firstAttr ? `[${firstAttr.key}]` : "Note",
      reason: "", color: firstAttr?.color ?? activeColor,
      testAttribute: firstAttr?.key,
    };
    setBoxes(prev => [...prev, newBox]);
    setSelectedId(newBox.id);
    setEditingId(newBox.id);
    setLabelInput(newBox.label);
    setDrawStart(null);
  }

  function removeBox(id: string) {
    setBoxes(prev => prev.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function updateBoxAttr(id: string, attrKey: string) {
    const attr = testAttributes.find(a => a.key === attrKey);
    setBoxes(prev => prev.map(b => b.id === id ? { ...b, testAttribute: attrKey, color: attr?.color ?? b.color, label: `[${attrKey}]` } : b));
  }

  function saveLabel(id: string) {
    setBoxes(prev => prev.map(b => b.id === id ? { ...b, label: labelInput || b.label } : b));
    setEditingId(null);
  }

  function addAttribute() {
    if (!newAttrLabel.trim()) return;
    const usedKeys = testAttributes.map(a => a.key);
    const nextKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find(k => !usedKeys.includes(k)) ?? String(testAttributes.length + 1);
    const colors = ["#2E86DE","#27AE60","#F39C12","#8E44AD","#E74C3C","#1ABC9C","#E91E63","#FF5722"];
    const nextColor = colors[testAttributes.length % colors.length];
    setTestAttributes(prev => [...prev, { key: nextKey, label: newAttrLabel.trim(), color: nextColor }]);
    setNewAttrLabel("");
  }

  function handleSave() {
    if (!canvasRef.current) return;
    const base64 = canvasRef.current.toDataURL("image/png").split(",")[1];
    saveAnnotations.mutate({ pbcItemId, annotations: boxes, annotatedImageBase64: base64, testAttributes });
  }

  function exportAnnotated() {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `annotated_${fileName.replace(/\.[^.]+$/, "")}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  const isAnalyzing = annotate.isPending;
  const isSaving = saveAnnotations.isPending;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "96vw", maxWidth: 1200, maxHeight: "95vh", overflow: "hidden", boxShadow: "0 30px 90px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #0F2A4A 0%, #1E3A5F 50%, #2563EB 100%)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Scan size={15} color="#fff" />
            </div>
            <div>
              <h2 style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: 0 }}>Screenshot Annotator</h2>
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, margin: 0 }}>{fileName} · {boxes.length} annotation{boxes.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {imageLoaded && (
              <button onClick={exportAnnotated} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 7, color: "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <Download size={12} /> Export PNG
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || !imageLoaded}
              style={{ background: saved ? "#27AE60" : "rgba(255,255,255,0.95)", border: "none", borderRadius: 7, color: saved ? "#fff" : "#1E3A5F", padding: "6px 16px", fontSize: 13, fontWeight: 700, cursor: isSaving || !imageLoaded ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: !imageLoaded ? 0.5 : 1 }}
            >
              {saved ? <><Check size={13} /> Saved!</> : isSaving ? "Saving..." : <><Save size={13} /> Save &amp; Close</>}
            </button>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, color: "#fff", width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ background: "#F5F6FA", borderBottom: "1px solid #E5E7EB", padding: "9px 18px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0, flexWrap: "wrap" }}>
          <button onClick={() => { setBoxes([]); annotate.mutate({ pbcItemId }); }} disabled={isAnalyzing}
            style={{ background: isAnalyzing ? "#6B7280" : "#2563EB", color: "#fff", border: "none", borderRadius: 7, padding: "6px 13px", fontSize: 12, fontWeight: 600, cursor: isAnalyzing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Scan size={12} /> {isAnalyzing ? "AI Analyzing..." : "Re-Analyze with AI"}
          </button>

          <div style={{ width: 1, height: 22, background: "#D1D5DB" }} />

          {/* Color picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", marginRight: 2 }}>Color:</span>
            {PALETTE.map(c => (
              <button key={c.hex} title={c.name} onClick={() => setActiveColor(c.hex)}
                style={{ width: 18, height: 18, borderRadius: 4, background: c.hex, border: activeColor === c.hex ? "2.5px solid #111" : "2.5px solid transparent", cursor: "pointer", padding: 0 }} />
            ))}
          </div>

          <div style={{ width: 1, height: 22, background: "#D1D5DB" }} />

          {/* Test attribute legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280" }}>Test Attrs:</span>
            {testAttributes.map(attr => (
              <span key={attr.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: attr.color + "22", border: `1px solid ${attr.color}44`, fontSize: 11, fontWeight: 600, color: attr.color }}>
                {attr.key} — {attr.label}
              </span>
            ))}
            <button onClick={() => setShowAttrManager(s => !s)}
              style={{ padding: "2px 8px", borderRadius: 6, border: "1px dashed #CBD5E1", fontSize: 11, color: "#64748B", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <Settings2 size={11} /> Customize
            </button>
          </div>

          <span style={{ marginLeft: "auto", fontSize: 11, color: "#9CA3AF" }}>
            {isAnalyzing ? "Analyzing screenshot..." : imageLoaded ? "Drag to draw a box, then assign a test attribute" : "Loading..."}
          </span>
        </div>

        {/* Attribute manager dropdown */}
        {showAttrManager && (
          <div style={{ background: "#FFFBEB", borderBottom: "1px solid #FDE68A", padding: "12px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 10 }}>Manage Test Attributes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {testAttributes.map(attr => (
                <div key={attr.key} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "5px 10px" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: attr.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{attr.key}</span>
                  <input value={attr.label} onChange={e => setTestAttributes(prev => prev.map(a => a.key === attr.key ? { ...a, label: e.target.value } : a))}
                    style={{ fontSize: 12, border: "none", outline: "none", width: 140, color: "#374151" }} />
                  {testAttributes.length > 1 && (
                    <button onClick={() => setTestAttributes(prev => prev.filter(a => a.key !== attr.key))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 0 }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newAttrLabel} onChange={e => setNewAttrLabel(e.target.value)} placeholder="New attribute label..."
                onKeyDown={e => e.key === "Enter" && addAttribute()}
                style={{ flex: 1, height: 32, border: "1px solid #E5E7EB", borderRadius: 7, padding: "0 10px", fontSize: 12, outline: "none", maxWidth: 240 }} />
              <button onClick={addAttribute} disabled={!newAttrLabel.trim()}
                style={{ background: "#1E3A5F", color: "#fff", border: "none", borderRadius: 7, padding: "0 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, opacity: !newAttrLabel.trim() ? 0.5 : 1 }}>
                <Plus size={12} /> Add
              </button>
              <button onClick={() => setShowAttrManager(false)}
                style={{ background: "#F1F5F9", border: "none", borderRadius: 7, padding: "0 12px", fontSize: 12, color: "#64748B", cursor: "pointer" }}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* Body: canvas + sidebar */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Canvas */}
          <div style={{ flex: 1, overflow: "auto", background: "#12111A", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
            {isAnalyzing && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.7)", gap: 14 }}>
                <div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #2563EB", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
                <p style={{ fontSize: 14, margin: 0, fontWeight: 500 }}>AI is analyzing the screenshot...</p>
                <p style={{ fontSize: 12, margin: 0, color: "rgba(255,255,255,0.45)" }}>Identifying key audit evidence areas</p>
              </div>
            )}
            {!imageLoaded && !isAnalyzing && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.4)", gap: 12 }}>
                <Scan size={40} />
                <p style={{ fontSize: 14, margin: 0 }}>Loading screenshot...</p>
              </div>
            )}
            {imageLoaded && (
              <canvas ref={canvasRef}
                style={{ maxWidth: "100%", cursor: "crosshair", borderRadius: 6, boxShadow: "0 6px 30px rgba(0,0,0,0.5)" }}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp} />
            )}
          </div>

          {/* Sidebar */}
          <div style={{ width: 300, borderLeft: "1px solid #E5E7EB", display: "flex", flexDirection: "column", overflow: "hidden", background: "#FAFAFA" }}>
            <div style={{ padding: "11px 14px", borderBottom: "1px solid #E5E7EB", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Annotations ({boxes.length})
              </span>
              {boxes.length > 0 && (
                <button onClick={() => { setBoxes([]); setSelectedId(null); }}
                  style={{ fontSize: 11, color: "#E74C3C", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                  Clear all
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflow: "auto" }}>
              {boxes.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>
                  <Tag size={22} style={{ margin: "0 auto 10px", display: "block", opacity: 0.4 }} />
                  <p style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>Draw a box on the screenshot to annotate evidence areas.</p>
                </div>
              ) : (
                boxes.map((box, idx) => {
                  const attr = testAttributes.find(a => a.key === box.testAttribute);
                  const isSelected = selectedId === box.id;
                  return (
                    <div key={box.id} onClick={() => setSelectedId(box.id)}
                      style={{ padding: "11px 14px", borderBottom: "1px solid #F3F4F6", cursor: "pointer", background: isSelected ? "#EFF6FF" : "#fff", borderLeft: isSelected ? "3px solid #2563EB" : "3px solid transparent", transition: "all 0.1s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", minWidth: 16 }}>#{idx + 1}</span>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: attr?.color ?? box.color, flexShrink: 0 }} />
                        {/* Label inline edit */}
                        {editingId === box.id ? (
                          <div style={{ display: "flex", gap: 4, flex: 1 }}>
                            <input autoFocus value={labelInput} onChange={e => setLabelInput(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveLabel(box.id); if (e.key === "Escape") setEditingId(null); }}
                              style={{ flex: 1, fontSize: 12, border: "1px solid #2563EB", borderRadius: 4, padding: "2px 6px", outline: "none" }} />
                            <button onClick={() => saveLabel(box.id)}
                              style={{ background: "#27AE60", border: "none", borderRadius: 4, color: "#fff", width: 22, height: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Check size={11} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#111827", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            onDoubleClick={() => { setEditingId(box.id); setLabelInput(box.label); }}
                            title="Double-click to rename">{box.label}</span>
                        )}
                        <button onClick={e => { e.stopPropagation(); removeBox(box.id); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#D1D5DB", padding: 0, marginLeft: "auto", flexShrink: 0 }}>
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Test attribute selector */}
                      <div style={{ marginLeft: 24 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>Test Attribute</label>
                        <select value={box.testAttribute ?? ""} onChange={e => updateBoxAttr(box.id, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          style={{ width: "100%", height: 28, border: "1px solid #E5E7EB", borderRadius: 6, padding: "0 8px", fontSize: 11, background: "#fff", outline: "none", color: attr?.color ?? "#374151", fontWeight: 600 }}>
                          <option value="">— None —</option>
                          {testAttributes.map(a => <option key={a.key} value={a.key}>{a.key} — {a.label}</option>)}
                        </select>
                        {attr && (
                          <span style={{ display: "inline-block", marginTop: 5, padding: "2px 8px", borderRadius: 12, background: attr.color + "18", border: `1px solid ${attr.color}44`, fontSize: 10.5, fontWeight: 600, color: attr.color }}>
                            {attr.key} — {attr.label}
                          </span>
                        )}
                      </div>

                      {box.reason && (
                        <p style={{ fontSize: 11, color: "#6B7280", margin: "6px 0 0 24px", lineHeight: 1.45 }}>{box.reason}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Save footer */}
            <div style={{ padding: "12px 14px", borderTop: "1px solid #E5E7EB", background: "#fff" }}>
              <button onClick={handleSave} disabled={isSaving || !imageLoaded || saved}
                style={{ width: "100%", height: 38, background: saved ? "#27AE60" : "#1E3A5F", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isSaving || !imageLoaded || saved ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: !imageLoaded ? 0.5 : 1 }}>
                {saved ? <><Check size={14} /> Saved!</> : isSaving ? "Saving..." : <><Save size={14} /> Save Annotations</>}
              </button>
              <p style={{ fontSize: 10.5, color: "#9CA3AF", textAlign: "center", margin: "6px 0 0", lineHeight: 1.4 }}>
                Annotations and image will be embedded in the Excel export.
              </p>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
