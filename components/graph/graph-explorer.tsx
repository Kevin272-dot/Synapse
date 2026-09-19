"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, ArrowUpRight, Network } from "lucide-react";
import ForceGraph, {
  type GraphDoc,
  type GraphEdge,
} from "@/components/graph/force-graph";

export interface GraphExplorerData {
  docs: GraphDoc[];
  edges: GraphEdge[];
  topics: { name: string; docCount: number }[];
}

/** Interactive document graph: topic filter chips + canvas + detail panel. */
export default function GraphExplorer({ data }: { data: GraphExplorerData }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);

  const selected = data.docs.find((d) => d.id === selectedId) ?? null;

  function toggleTopic(t: string) {
    setActiveTopic((cur) => (cur === t ? null : t));
    setSelectedId(null);
  }

  return (
    <div>
      {/* Topic filter chips */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-slate-400">
          <Network className="h-3.5 w-3.5" />
          Topics:
        </span>
        {data.topics.map((t) => {
          const active = activeTopic === t.name;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => toggleTopic(t.name)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? "bg-[#1a73e8] text-white"
                  : "bg-[#f1f3f4] text-[#3c4043] hover:bg-[#e8f0fe] hover:text-[#1967d2] dark:bg-white/10 dark:text-slate-300 dark:hover:bg-[#1a73e8]/25"
              }`}
            >
              {t.name}
              <span className="ml-1 opacity-60">{t.docCount}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Canvas */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-[#dadce0] bg-white dark:border-white/10 dark:bg-slate-900/40">
          <ForceGraph
            data={{ docs: data.docs, edges: data.edges }}
            selectedId={selectedId}
            onSelectDoc={setSelectedId}
            activeTopic={activeTopic}
          />
        </div>

        {/* Detail panel */}
        <aside className="w-full shrink-0 lg:w-72">
          {selected ? (
            <div className="rounded-xl border border-[#dadce0] bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {selected.title}
              </h3>
              <div className="mt-2.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Topics ({selected.topics.length})
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {selected.topics.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTopic(t)}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                        activeTopic === t
                          ? "bg-[#1a73e8] text-white"
                          : "bg-[#e8f0fe] text-[#1967d2] hover:bg-[#d2e3fc] dark:bg-[#1a73e8]/20 dark:text-[#a8c7fa]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <Link
                href={`/doc/${selected.id}`}
                className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-[#1a73e8] px-4 text-sm font-medium text-white transition hover:bg-[#1765cc]"
              >
                <FileText className="h-4 w-4" />
                Open document
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#dadce0] p-4 dark:border-white/10">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Explore the map
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400 dark:text-slate-500">
                Click a document to see its topics and open it. Click a topic
                chip to highlight every document about it. Documents that share
                topics are pulled together — the closer two documents are, the
                more they overlap.
              </p>
              {activeTopic && (
                <p className="mt-2 rounded-lg bg-[#e8f0fe] px-2.5 py-1.5 text-xs font-medium text-[#1967d2] dark:bg-[#1a73e8]/20 dark:text-[#a8c7fa]">
                  Showing documents about “{activeTopic}”
                </p>
              )}
            </div>
          )}

          {/* Connected docs for the selection */}
          {selected && (
            <div className="mt-3 rounded-xl border border-[#dadce0] bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Connected documents
              </p>
              <ul className="mt-2 space-y-1.5">
                {data.edges
                  .filter((e) => e.from === selected.id || e.to === selected.id)
                  .sort((a, b) => b.weight - a.weight)
                  .map((e) => {
                    const otherId = e.from === selected.id ? e.to : e.from;
                    const other = data.docs.find((d) => d.id === otherId);
                    if (!other) return null;
                    return (
                      <li key={otherId}>
                        <Link
                          href={`/doc/${otherId}`}
                          className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition hover:bg-black/[0.04] dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          <span className="min-w-0 truncate">
                            {other.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {e.weight} shared
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
