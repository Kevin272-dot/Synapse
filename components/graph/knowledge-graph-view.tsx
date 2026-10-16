"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Network, RefreshCw, Loader2, Search, Maximize2, X } from "lucide-react";

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((mod) => mod.default),
  { ssr: false }
);

interface GraphNode {
  id: string;
  label: string;
  type: string;
  isDoc?: boolean;
  docId?: string;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relation: string;
  weight: number;
  kind: "topic" | "folder";
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const TYPE_COLORS: Record<string, string> = {
  Concept: "#38bdf8",
  Project: "#6366f1",
  Person: "#f472b6",
  Document: "#22d3ee",
  Methodology: "#a3e635",
};

function nodeIdOf(n: string | GraphNode): string {
  return typeof n === "object" ? n.id : n;
}

export default function KnowledgeGraphView() {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [dims, setDims] = useState({ width: 800, height: 600 });
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  // ResizeObserver: canvas always fills its parent.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ width: Math.max(200, width), height: Math.max(300, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge-graph");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setGraphData(data);
    } catch {
      // empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const filteredNodes = graphData.nodes.filter((n) =>
    n.label.toLowerCase().includes(filter.toLowerCase())
  );
  const filteredIds = new Set(filteredNodes.map((n) => n.id));
  const filteredLinks = graphData.links.filter(
    (l) =>
      filteredIds.has(nodeIdOf(l.source)) && filteredIds.has(nodeIdOf(l.target))
  );

  const isEmpty = !loading && filteredNodes.length === 0;

  // Node degree for sizing.
  const degreeMap = new Map<string, number>();
  for (const l of filteredLinks) {
    const s = nodeIdOf(l.source);
    const t = nodeIdOf(l.target);
    degreeMap.set(s, (degreeMap.get(s) ?? 0) + 1);
    degreeMap.set(t, (degreeMap.get(t) ?? 0) + 1);
  }

  const selectedLinks = selected
    ? graphData.links.filter(
        (l) => nodeIdOf(l.source) === selected.id || nodeIdOf(l.target) === selected.id
      )
    : [];

  function handleNodeClick(node: any) {
    const found = graphData.nodes.find((n) => n.id === node.id);
    setSelected(found === selected ? null : found ?? null);
    // Navigate to document when a Document node is clicked.
    if (found?.isDoc && found.docId) router.push(`/doc/${found.docId}`);
  }

  // Custom canvas: document nodes drawn as rounded rectangles with title,
  // concept nodes as circles. Folder edges drawn as dashed.
  function paintNode(node: any, ctx: any, globalScale: number) {
    const label = node.label;
    const isDoc = node.type === "Document";
    const color = TYPE_COLORS[node.type] ?? "#38bdf8";

    if (isDoc) {
      // Draw as a rounded rect card.
      const w = Math.max(60, (label.length * 5.5 + 16) * (globalScale > 1.5 ? 1 / globalScale + 0.5 : 1));
      const h = 20;
      ctx.fillStyle = "#0f172a";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(node.x - w / 2, node.y - h / 2, w, h, 6);
      ctx.fill();
      ctx.stroke();
      // Label inside.
      ctx.fillStyle = color;
      ctx.font = `600 ${Math.max(10, 10 / globalScale)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, node.x, node.y);
    } else {
      // Circle for concepts.
      ctx.beginPath();
      ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      // Label below.
      ctx.fillStyle = "rgba(226,232,240,0.85)";
      ctx.font = `500 ${Math.max(9, 10 / globalScale)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, node.x, node.y + 10);
    }
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#0b1120]">
      {/* Toolbar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 border-b border-white/[0.06] bg-slate-950/80 px-4 py-2.5 backdrop-blur-md">
        <div className="relative min-w-0 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter nodes…"
            className="h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.06] pl-9 pr-3 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-[#1a73e8]/50 focus:bg-white/[0.08]"
          />
        </div>
        <button
          type="button"
          onClick={() => fgRef.current?.zoomToFit(400, 40)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.06] px-3 text-xs font-medium text-slate-300 transition hover:bg-white/[0.12] hover:text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fit
        </button>
        <button
          type="button"
          onClick={loadGraph}
          disabled={loading}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.06] px-3 text-xs font-medium text-slate-300 transition hover:bg-white/[0.12] hover:text-white disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
        {!loading && filteredNodes.length > 0 && (
          <span className="ml-auto hidden shrink-0 text-[11px] text-slate-500 sm:block">
            {filteredNodes.length} nodes · {filteredLinks.length} edges
          </span>
        )}
      </div>

      {/* Selected node panel */}
      {selected && (
        <div className="absolute right-4 top-16 z-20 w-64 rounded-xl border border-white/[0.08] bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{selected.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{selected.type}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close details"
              className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {selectedLinks.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
                Relations ({selectedLinks.length})
              </p>
              <ul className="mt-1.5 space-y-1">
                {selectedLinks.map((l, i) => {
                  const targetId =
                    nodeIdOf(l.target) === selected.id ? nodeIdOf(l.source) : nodeIdOf(l.target);
                  const target = graphData.nodes.find((n) => n.id === targetId);
                  return (
                    <li key={i} className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate-300">{l.relation}</span>
                      <span className="text-slate-600">→</span>
                      <span className="min-w-0 truncate text-slate-400">{target?.label ?? targetId}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Graph canvas / loading / empty */}
      <div ref={containerRef} className="absolute inset-0 top-[41px]">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
            <p className="text-sm text-slate-500">Loading graph…</p>
          </div>
        ) : isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Network className="h-12 w-12 text-slate-800" />
            <p className="mt-2 text-sm font-medium text-slate-400">
              No entities in the graph yet
            </p>
            <p className="max-w-xs text-center text-sm text-slate-600">
              Open a document and run{" "}
              <span className="inline-flex items-center gap-0.5 font-medium text-slate-400">
                Extract concepts
              </span>{" "}
              from the AI panel to build your graph.
            </p>
          </div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            width={dims.width}
            height={dims.height}
            graphData={{ nodes: filteredNodes, links: filteredLinks }}
            backgroundColor="rgba(0,0,0,0)"
            nodeLabel="label"
            nodeColor={(node: any) => TYPE_COLORS[node.type] ?? "#38bdf8"}
            nodeVal={(node: any) => 4 + (degreeMap.get(node.id) ?? 0) * 2}
            nodeRelSize={5}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) =>
              paintNode(node, ctx, globalScale)
            }
            linkColor={(link: any) =>
              link.kind === "folder"
                ? "rgba(100,116,139,0.15)"
                : "rgba(100,116,139,0.35)"
            }
            linkWidth={(link: any) =>
              link.kind === "folder"
                ? 1
                : 1 + Math.min(3, (link.weight ?? 1) * 0.5)
            }
            linkLineDash={(link: any) =>
              link.kind === "folder" ? [3, 4] : null
            }
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkLabel="relation"
            onNodeClick={handleNodeClick}
            onBackgroundClick={() => setSelected(null)}
            onNodeHover={(node: any) => setHovered(node ?? null)}
            cooldownTicks={300}
            enableNodeDrag
          />
        )}
      </div>

      {/* Legend */}
      {!loading && !isEmpty && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap gap-3">
          {Object.entries(TYPE_COLORS).map(([type, color]) => {
            const count = filteredNodes.filter((n) => n.type === type).length;
            if (count === 0) return null;
            return (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                {type} ({count})
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
            <span
              className="inline-block h-0 w-4 border-t border-dashed border-slate-600"
              style={{ borderTopWidth: 1.5 }}
            />
            folder link
          </span>
        </div>
      )}
    </div>
  );
}
