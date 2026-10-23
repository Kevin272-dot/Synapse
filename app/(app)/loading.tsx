import { LoadingScreen } from "@/components/loading-screen";

// The (app) layout already renders the Synapse logo in the top nav, so this
// loading state uses a plain spinner rather than a second brand mark.
export default function Loading() {
  return <LoadingScreen label="Loading your workspace" showMark={false} />;
}
