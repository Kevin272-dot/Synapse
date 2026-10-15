"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Network, RefreshCw, Loader2 } from "lucide-react";

const ForceGraph2D = dynamic(
  () => import("react-force-graph").then((mod) => mod.ForceGraph2D),
  { ssr: false }
);

interface GraphNode {
  id: string;
  label: string;
  type: string;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relation: string;
  weight: number;
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

export default function KnowledgeGraphView() {
  const fgRef = useRef<any>(null);
  const router = useRouter();
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<GraphNode | null>(null);

  async function loadGraph() {
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
  }

  useEffect(() => {
    loadGraph();
  }, []);

  const filteredNodes = graphData.nodes.filter((n) =>
    n.label.toLowerCase().includes(filter.toLowerCase())
  );
  const filteredIds = new Set(filteredNodes.map((n) => n.id));
  const filteredLinks = graphData.links.filter(
    (l) =>
      filteredIds.has(
        typeof l.source === "object" ? (l.source as GraphNode).id : l.source
      ) && filteredIds.has(typeof l.target === "object" ? (l.target as GraphNode).id : l.target)
  );

  const graphType = filteredNodes.length === 0;

  return (
    <div className="relative h-[calc(100vh-64px)] overflow-hidden bg-slate-950">
      {/* Controls */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 p-2 backdrop-blur-md">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter nodes..."
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-slate-500"
        />
        <button
          type="button"
          onClick={() => fgRef.current?.zoomToFit(400)}
          className="rounded-md bg-[#1a73e8] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#1765cc]"
        >
          Reset View
        </button>
        <button
          type="button"
          onClick={loadGraph}
          className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
      </div>

      {/* Selected node detail */}
      {selected && (
        <div className="absolute right-4 top-4 z-10 w-60 rounded-lg border border-slate-800 bg-slate-900/90 p-4 backdrop-blur-md">
          <p className="text-sm font-semibold text-white">{selected.label}</p>
          <p className="mt-0.5 text-xs text-slate-400">{selected.type}</p>
          <div className="mt-2 space-y-1">
            {graphData.links
              .filter((l) =>
                typeof l.source === "object"
                  ? (l.source as GraphNode).id === selected.id
                  : l.source === selected.id
              )
              .map((l, i) => {
                const targetId =
                  typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
                const target = graphData.nodes.find((n) => n.id === targetId);
                return (
                  <p key={i} className="text-xs text-slate-400">
                    <span className="font-medium text-slate-300">{l.relation}</span>{" "}
                    {target?.label ?? ""}
                  </p>
                );
              })}
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mt-3 text-xs text-slate-500 hover:text-slate-300"
          >
            Close
          </button>
        </div>
      )}

      {/* Canvas or empty state */}
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
        </div>
      ) : graphType ? (
        <div className="flex h-full flex-col items-center justify-center">
          <Network className="h-10 w-10 text-slate-700" />
          <p className="mt-4 text-sm font-medium text-slate-400">
            No entities in the graph yet
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Extract concepts from a document to build your graph.
          </p>
        </div>
      ) : (
        <ForceGraph2D
          ref={fgRef}
          graphData={{ nodes: filteredNodes, links: filteredLinks }}
          nodeLabel="label"
          nodeColor={(node: any) => TYPE_COLORS[node.type] ?? "#38bdf8"}
          nodeVal={(node: any) => {
            const degree = filteredLinks.filter(
              (l) =>
                (typeof l.source === "object" ? l.source.id : l.source) === node.id ||
                (typeof l.target === "object" ? l.target.id : l.target) === node.id
            ).length;
            return 5 + degree * 3;
          }}
          nodeRelSize={6}
          linkColor={() => "#334155"}
          linkWidth={(link: any) => 1 + Math.min(3, (link.weight ?? 1) * 0.5)}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkLabel="relation"
          backgroundColor="#020617"
          onNodeClick={(node: any) => setSelected(node as GraphNode)}
          onBackgroundClick={() => setSelected(null)}
          cooldownTicks={300}
          enableNodeDrag
        />
      )}
    </div>
  );
}
