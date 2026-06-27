import { useRef, useEffect, useState } from "react";
import { Scan, Download, Plus, Trash2, X, Check } from "lucide-react";
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
};

const PALETTE = [
  { name: "Red",    hex: "#E74C3C" },
  { name: "Orange", hex: "#F39C12" },
  { name: "Green",  hex: "#27AE60" },
  { name: "Blue",   hex: "#2E86DE" },
  { name: "Purple", hex: "#8E44AD" },
  { name: "Teal",   hex: "#1ABC9C" },
];

function randomId() {
  return Math.random().toString(36).slice(2, 9);
}

interface Props {
  pbcItemId: string;
  fileName: string;
  onClose: () => void;
}

export default function ScreenshotAnnotator({ pbcItemId, fileName, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [boxes, setBoxes] = useState<AnnotationBox[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeColor, setActiveColor] = useState(PALETTE[0].hex);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // tRPC mutation to get AI annotations
  const annotate = trpc.workpapers.agentAnnotateScreenshot.useMutation({
    onSuccess: (data) => {
      // Load the image from base64 returned by server
      const src = `data:${data.mediaType};base64,${data.imageBase64}`;
      loadImage(src);
      // Map AI boxes to local state with priority-based colors
      const aiBoxes: AnnotationBox[] = data.boxes.map((b: { x: number; y: number; w: number; h: number; label: string; reason: string; priority: string }) => ({
        id: randomId(),
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        label: b.label,
        reason: b.reason,
        color: b.priority === "high" ? PALETTE[0].hex : b.priority === "medium" ? PALETTE[1].hex : PALETTE[3].hex,
      }));
      setBoxes(aiBoxes);
    },
  });

  // Auto-trigger AI annotation immediately on open — zero clicks required
  useEffect(() => {
    annotate.mutate({ pbcItemId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadImage(src: string) {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
    };
    img.src = src;
  }

  // Redraw canvas whenever boxes or image change
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

      ctx.strokeStyle = box.color;
      ctx.lineWidth = box.id === selectedId ? 4 : 2.5;
      ctx.setLineDash(box.id === selectedId ? [6, 3] : []);
      ctx.strokeRect(px, py, pw, ph);

      // Label background
      const labelText = box.label;
      ctx.font = "bold 13px Arial";
      const textW = ctx.measureText(labelText).width + 10;
      ctx.fillStyle = box.color;
      ctx.fillRect(px, py - 22, textW, 20);
      ctx.fillStyle = "#fff";
      ctx.fillText(labelText, px + 5, py - 7);
    }
  }, [boxes, selectedId, imageLoaded]);

  // Canvas mouse events for drawing new boxes
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
    if (w < 0.01 || h < 0.01) { setDrawStart(null); return; } // too small
    const newBox: AnnotationBox = { id: randomId(), x, y, w, h, label: "Note", reason: "", color: activeColor };
    setBoxes(prev => [...prev, newBox]);
    setSelectedId(newBox.id);
    setEditingId(newBox.id);
    setLabelInput("Note");
    setDrawStart(null);
  }

  function removeBox(id: string) {
    setBoxes(prev => prev.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function saveLabel(id: string) {
    setBoxes(prev => prev.map(b => b.id === id ? { ...b, label: labelInput || b.label } : b));
    setEditingId(null);
  }

  function exportAnnotated() {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `annotated_${fileName.replace(/\.[^.]+$/, "")}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  const isAnalyzing = annotate.isPending;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "95vw", maxWidth: 1140, maxHeight: "94vh", overflow: "hidden", boxShadow: "0 30px 90px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2A4F7C 100%)", padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Scan size={15} color="#fff" />
            </div>
            <div>
              <h2 style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: 0 }}>Screenshot Annotator</h2>
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, margin: 0 }}>{fileName}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {imageLoaded && (
              <button onClick={exportAnnotated} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 7, color: "#fff", padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <Download size={13} /> Export PNG
              </button>
            )}
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, color: "#fff", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ background: "#F5F6FA", borderBottom: "1px solid #E5E7EB", padding: "10px 18px", display: "flex", alignItems: "center", gap: 18, flexShrink: 0, flexWrap: "wrap" }}>
          {/* AI status + re-analyze */}
          <button
            onClick={() => { setBoxes([]); annotate.mutate({ pbcItemId }); }}
            disabled={isAnalyzing}
            style={{ background: isAnalyzing ? "#6B7280" : "#2E86DE", color: "#fff", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: isAnalyzing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Scan size={13} />
            {isAnalyzing ? "AI Analyzing..." : "Re-Analyze"}
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 26, background: "#D1D5DB" }} />

          {/* Color picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280" }}>Box color:</span>
            <div style={{ display: "flex", gap: 5 }}>
              {PALETTE.map(c => (
                <button
                  key={c.hex}
                  title={c.name}
                  onClick={() => setActiveColor(c.hex)}
                  style={{ width: 20, height: 20, borderRadius: 4, background: c.hex, border: activeColor === c.hex ? "2.5px solid #111" : "2.5px solid transparent", cursor: "pointer", padding: 0 }}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 26, background: "#D1D5DB" }} />

          <span style={{ fontSize: 11, color: "#6B7280" }}>
            {isAnalyzing ? "AI is analyzing..." : imageLoaded ? "Drag to draw a box. Double-click label to rename." : "Ready."}
          </span>
        </div>

        {/* Body: canvas + sidebar */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Canvas area */}
          <div style={{ flex: 1, overflow: "auto", background: "#1a1a2e", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
            {!imageLoaded && !isAnalyzing && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.5)", gap: 12 }}>
                <Scan size={36} />
                <p style={{ fontSize: 14, margin: 0 }}>Click "AI: Suggest Annotations" to load the screenshot</p>
              </div>
            )}
            {isAnalyzing && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.7)", gap: 12 }}>
                <div style={{ width: 36, height: 36, border: "3px solid rgba(255,255,255,0.3)", borderTop: "3px solid #2E86DE", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
                <p style={{ fontSize: 14, margin: 0 }}>AI is analyzing the screenshot...</p>
              </div>
            )}
            {imageLoaded && (
              <canvas
                ref={canvasRef}
                style={{ maxWidth: "100%", cursor: "crosshair", borderRadius: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
              />
            )}
          </div>

          {/* Sidebar: box list */}
          <div style={{ width: 260, borderLeft: "1px solid #E5E7EB", display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Annotations ({boxes.length})
              </p>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {boxes.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>
                  <Plus size={20} style={{ margin: "0 auto 8px", display: "block" }} />
                  No annotations yet. Use AI or draw boxes manually.
                </div>
              )}
              {boxes.map(box => (
                <div
                  key={box.id}
                  onClick={() => setSelectedId(box.id)}
                  style={{ padding: "10px 12px", borderBottom: "1px solid #F3F4F6", cursor: "pointer", background: selectedId === box.id ? "#EBF3FB" : "transparent", display: "flex", alignItems: "flex-start", gap: 8 }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: box.color, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === box.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          autoFocus
                          value={labelInput}
                          onChange={e => setLabelInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveLabel(box.id); if (e.key === "Escape") setEditingId(null); }}
                          style={{ flex: 1, fontSize: 12, border: "1px solid #2E86DE", borderRadius: 4, padding: "2px 5px" }}
                        />
                        <button onClick={() => saveLabel(box.id)} style={{ background: "#27AE60", border: "none", borderRadius: 4, color: "#fff", width: 22, height: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Check size={11} />
                        </button>
                      </div>
                    ) : (
                      <p
                        style={{ fontSize: 12, fontWeight: 600, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        onDoubleClick={() => { setEditingId(box.id); setLabelInput(box.label); }}
                        title="Double-click to rename"
                      >{box.label}</p>
                    )}
                    {box.reason && (
                      <p style={{ fontSize: 11, color: "#6B7280", margin: "3px 0 0", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{box.reason}</p>
                    )}
                    <p style={{ fontSize: 10, color: "#9CA3AF", margin: "4px 0 0" }}>
                      {Math.round(box.x * 100)}%, {Math.round(box.y * 100)}% · {Math.round(box.w * 100)}×{Math.round(box.h * 100)}%
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); removeBox(box.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 2, flexShrink: 0 }}
                    title="Remove box"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
