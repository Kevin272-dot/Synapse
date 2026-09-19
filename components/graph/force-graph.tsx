"use client";

import { useEffect, useRef, useState } from "react";

export interface GraphDoc {
  id: string;
  title: string;
  topics: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  /** How many topics the two documents share. */
  weight: number;
}

/**
 * Document-centric force graph: every node is a DOCUMENT; two docs are
 * connected when they share topics (weight = number of shared topics).
 * The document-concept relation is projected down to doc-doc, which keeps
 * the map readable and answers "which docs are about the same things?".
 */
export default function ForceGraph({
  data,
  selectedId,
  onSelectDoc,
  activeTopic,
}: {
  data: { docs: GraphDoc[]; edges: GraphEdge[] };
  selectedId: string | null;
  onSelectDoc: (id: string | null) => void;
  activeTopic: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const nodesRef = useRef(
    new Map<string, { x: number; y: number; vx: number; vy: number }>()
  );
  // Mirror latest React state for the draw closure.
  const stateRef = useRef({ data, selectedId, activeTopic, hoverId });
  stateRef.current = { data, selectedId, activeTopic, hoverId };

  const radiusFor = (doc: GraphDoc) =>
    Math.min(40, 24 + doc.topics.length * 2.5);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = ctx; // non-null inside closures
    const cv = canvas; // non-null inside event closures

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const byId = new Map(data.docs.map((d) => [d.id, d]));
    const nodeMap = nodesRef.current;
    for (const d of data.docs) {
      if (!nodeMap.has(d.id)) {
        nodeMap.set(d.id, {
          x: width / 2 + (Math.random() - 0.5) * width * 0.5,
          y: height / 2 + (Math.random() - 0.5) * height * 0.5,
          vx: 0,
          vy: 0,
        });
      }
    }
    for (const id of [...nodeMap.keys()]) {
      if (!byId.has(id)) nodeMap.delete(id);
    }

    let raf = 0;
    let tick = 0;
    const maxTicks = 500;

    function step() {
      // Repulsion between all pairs (rects approximated by radius).
      for (let i = 0; i < data.docs.length; i++) {
        for (let j = i + 1; j < data.docs.length; j++) {
          const a = nodeMap.get(data.docs[i].id);
          const b = nodeMap.get(data.docs[j].id);
          if (!a || !b) continue;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 1;
          const d = Math.sqrt(d2);
          const force = Math.min(6, 9000 / d2);
          dx = (dx / d) * force;
          dy = (dy / d) * force;
          a.vx += dx;
          a.vy += dy;
          b.vx -= dx;
          b.vy -= dy;
        }
      }

      // Springs: shared-topic edges pull docs together; higher weight
      // (more shared topics) = shorter target distance = tighter cluster.
      for (const e of data.edges) {
        const a = nodeMap.get(e.from);
        const b = nodeMap.get(e.to);
        if (!a || !b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 150 - Math.min(60, e.weight * 12);
        const force = (d - target) * 0.015;
        dx = (dx / d) * force;
        dy = (dy / d) * force;
        a.vx += dx;
        a.vy += dy;
        b.vx -= dx;
        b.vy -= dy;
      }

      // Centering + integration.
      for (const n of nodeMap.values()) {
        n.vx += (width / 2 - n.x) * 0.002;
        n.vy += (height / 2 - n.y) * 0.002;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(60, Math.min(width - 60, n.x));
        n.y = Math.max(45, Math.min(height - 45, n.y));
      }

      draw();
      tick++;
      if (tick < maxTicks) raf = requestAnimationFrame(step);
    }

    function nodeAt(mx: number, my: number): string | null {
      for (let i = data.docs.length - 1; i >= 0; i--) {
        const d = data.docs[i];
        const n = nodeMap.get(d.id);
        if (!n) continue;
        const r = 24 + d.topics.length * 2.5 + 6;
        if ((mx - n.x) ** 2 + (my - n.y) ** 2 <= r * r) return d.id;
      }
      return null;
    }

    function onMouseMove(e: MouseEvent) {
      const rect = cv.getBoundingClientRect();
      const id = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (id !== hoverRef.current) {
        hoverRef.current = id;
        setHoverId(id);
        cv.style.cursor = id ? "pointer" : "default";
      }
    }

    function onClick(e: MouseEvent) {
      const rect = cv.getBoundingClientRect();
      const id = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
      onSelectDoc(id);
    }

    cv.addEventListener("mousemove", onMouseMove);
    cv.addEventListener("click", onClick);

    step();
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("mousemove", onMouseMove);
      cv.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function truncate(s: string, n = 16) {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = ctx;
    const dpr = window.devicePixelRatio || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    c.clearRect(0, 0, width, height);

    const { data: d, selectedId, activeTopic, hoverId: hover } = stateRef.current;

    // Edges.
    for (const e of d.edges) {
      const a = nodesRef.current.get(e.from);
      const b = nodesRef.current.get(e.to);
      if (!a || !b) continue;
      const highlighted =
        selectedId && (e.from === selectedId || e.to === selectedId);
      c.lineWidth = 1 + Math.min(4, e.weight);
      c.strokeStyle = highlighted
        ? "rgba(26,115,232,0.55)"
        : "rgba(100,116,139,0.28)";
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }

    // Doc nodes.
    for (const doc of d.docs) {
      const n = nodesRef.current.get(doc.id);
      if (!n) continue;
      const r = 24 + doc.topics.length * 2.5;
      const hovered = hover === doc.id;
      const selected = selectedId === doc.id;
      const dimmedByTopic = activeTopic && !doc.topics.includes(activeTopic);
      const weaklyConnected =
        selectedId && !isConnected(doc.id, selectedId, d.edges) && !selected;

      c.globalAlpha = dimmedByTopic ? 0.22 : weaklyConnected ? 0.45 : 1;

      const w = r * 1.9;
      const h = r * 1.15;
      roundRect(c, n.x - w / 2, n.y - h / 2, w, h, 8);
      c.fillStyle = selected ? "#1a73e8" : hovered ? "#33619e" : "#0f172a";
      c.fill();
      if (selected) {
        c.lineWidth = 2.5;
        c.strokeStyle = "#a8c7fa";
        c.stroke();
      }

      c.fillStyle = "#ffffff";
      c.font = "600 10px Inter, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(truncate(doc.title, 14), n.x, n.y);

      // Topic-count badge
      c.fillStyle = "#1a73e8";
      c.beginPath();
      c.arc(n.x + w / 2 - 2, n.y - h / 2 + 2, 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#ffffff";
      c.font = "600 9px Inter, sans-serif";
      c.fillText(String(doc.topics.length), n.x + w / 2 - 2, n.y - h / 2 + 2.5);

      c.globalAlpha = 1;
    }
  }

  function isConnected(id: string, selectedId: string, edges: GraphEdge[]) {
    if (id === selectedId) return true;
    return edges.some(
      (e) =>
        (e.from === selectedId && e.to === id) ||
        (e.to === selectedId && e.from === id)
    );
  }

  function roundRect(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="h-[68vh] w-full"
        aria-label="Document knowledge graph"
      />
      {hoverId &&
        (() => {
          const doc = data.docs.find((d) => d.id === hoverId);
          if (!doc) return null;
          return (
            <div className="pointer-events-none absolute right-3 top-3 w-60 rounded-lg border border-slate-900/10 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-800/95">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {doc.title}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {doc.topics.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[11px] font-medium text-[#1967d2] dark:bg-[#1a73e8]/20 dark:text-[#a8c7fa]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-slate-400 dark:text-slate-500">
        Documents connect when they share topics. Click a document for details.
      </div>
    </div>
  );
}
