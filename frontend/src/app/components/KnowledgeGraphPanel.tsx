import { useMemo, useRef, useState } from "react";
import { KG_CAT_COLORS, KG_CAT_LABELS, KnowledgeGraphData, KnowledgeGraphEdge, KnowledgeGraphNode } from "../lib/knowledgeGraph";

// Interactive SVG render of buildKnowledgeGraphData's node/edge model — mouse drag to pan,
// wheel to zoom, click a node to select it. Ported from mobile's KnowledgeGraph component
// (touch pan/zoom there, mouse here); the node/edge markup itself is unchanged.
export function KnowledgeGraphPanel({
  graphData,
  onSelectNode,
}: {
  graphData: KnowledgeGraphData;
  onSelectNode?: (node: KnowledgeGraphNode | null) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState("all");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, panStart: { x: 0, y: 0 }, moved: 0 });

  const nodeMap = useMemo(() => new Map(graphData.nodes.map((node) => [node.id, node])), [graphData.nodes]);
  const selectedNode = selectedId ? nodeMap.get(selectedId) || null : null;

  const clampZoom = (value: number) => Math.max(0.6, Math.min(2.5, Number(value.toFixed(2))));

  const selectNode = (node: KnowledgeGraphNode | null) => {
    if (dragRef.current.moved > 4) return;
    setSelectedId(node?.id ?? null);
    onSelectNode?.(node);
  };

  const onMouseDown = (event: React.MouseEvent) => {
    dragRef.current = { dragging: true, startX: event.clientX, startY: event.clientY, panStart: { ...pan }, moved: 0 };
  };
  const onMouseMove = (event: React.MouseEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    dragRef.current.moved = Math.sqrt(dx * dx + dy * dy);
    setPan({ x: dragRef.current.panStart.x + dx, y: dragRef.current.panStart.y + dy });
  };
  const endDrag = () => {
    dragRef.current.dragging = false;
  };

  const edgeStyle = (strength: KnowledgeGraphEdge["str"]) =>
    strength === "strong" ? { opacity: 0.5, width: 1.2 } : strength === "med" ? { opacity: 0.28, width: 0.8 } : { opacity: 0.12, width: 0.5 };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 overflow-x-auto px-2 py-1.5 border-b border-white/5">
        {["all", ...Object.keys(KG_CAT_COLORS)].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`px-2 py-0.5 rounded-full border text-[9px] font-semibold whitespace-nowrap transition-colors ${
              activeCat === cat ? "text-white" : "text-slate-500 border-white/10 hover:text-slate-300"
            }`}
            style={activeCat === cat ? { background: cat === "all" ? "#14B8A6" : `${KG_CAT_COLORS[cat]}55`, borderColor: cat === "all" ? "#14B8A6" : KG_CAT_COLORS[cat] } : undefined}
          >
            {cat === "all" ? "Tümü" : KG_CAT_LABELS[cat]}
          </button>
        ))}
      </div>

      <div
        className="relative h-56 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) => clampZoom(value + (event.deltaY > 0 ? -0.12 : 0.12)));
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: dragRef.current.dragging ? "none" : "transform 140ms ease-out",
          }}
        >
          <svg viewBox="0 0 360 280" width="100%" height="100%">
            <rect width="360" height="280" fill="#0A0A12" onClick={() => selectNode(null)} />
            {graphData.edges.map((edge) => {
              const source = nodeMap.get(edge.s);
              const target = nodeMap.get(edge.t);
              if (!source || !target) return null;
              const style = edgeStyle(edge.str);
              const dimmed = activeCat !== "all" && source.cat !== activeCat && target.cat !== activeCat;
              return (
                <line
                  key={`${edge.s}-${edge.t}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={KG_CAT_COLORS[source.cat]}
                  strokeWidth={style.width}
                  opacity={dimmed ? 0.04 : style.opacity}
                />
              );
            })}
            {graphData.nodes.map((node) => {
              const color = KG_CAT_COLORS[node.cat];
              const isSelected = selectedId === node.id;
              const dimmed = activeCat !== "all" && node.cat !== activeCat;
              return (
                <g key={node.id} onClick={() => selectNode(node)} style={{ opacity: dimmed ? 0.2 : 1, cursor: "pointer" }}>
                  <circle cx={node.x} cy={node.y} r={node.r + 3} fill={color} opacity={0.12} />
                  <circle cx={node.x} cy={node.y} r={node.r} fill={`${color}22`} stroke={color} strokeWidth={isSelected ? 2 : 1} strokeOpacity={isSelected ? 1 : 0.7} />
                  {isSelected && <circle cx={node.x} cy={node.y} r={node.r + 5} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.5} />}
                  {(node.r >= 9 || isSelected) && (
                    <text x={node.x} y={node.y + node.r + 8} textAnchor="middle" fill={color} fontSize={6} fontFamily="JetBrains Mono, monospace">
                      {node.shortLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        {!graphData.dynamic && (
          <div className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400">Örnek graf</div>
        )}
      </div>

      {selectedNode && (
        <div className="px-3 py-2 border-t border-white/5 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: KG_CAT_COLORS[selectedNode.cat] }} />
            <p className="text-[11px] font-semibold text-slate-200 truncate">{selectedNode.label}</p>
          </div>
          <p className="text-[10px] text-slate-500">{selectedNode.desc}</p>
          <div className="flex items-center gap-2 text-[9px] text-slate-600">
            <span>{selectedNode.owner}</span>
            <span>·</span>
            <span>{selectedNode.version}</span>
            <span>·</span>
            <span>{selectedNode.date}</span>
          </div>
        </div>
      )}
    </div>
  );
}
