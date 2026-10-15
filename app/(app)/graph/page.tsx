import KnowledgeGraphView from "@/components/graph/knowledge-graph-view";
import GraphLive from "@/components/graph/graph-live";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Knowledge graph",
};

export default function GraphPage() {
  return (
    <>
      <GraphLive />
      <KnowledgeGraphView />
    </>
  );
}
