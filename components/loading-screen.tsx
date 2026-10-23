import { Loader2 } from "lucide-react";
import { SynapseMark } from "@/components/synapse-mark";

/**
 * Centered loading state used by the route-level loading.tsx files and by the
 * sign-in / sign-up pages while Clerk's client bundle loads.
 *
 * showMark={false} renders a plain spinner instead of the brand mark - use that
 * inside the (app) shell, where the top nav already shows the Synapse logo.
 */
export function LoadingScreen({
  label = "Loading",
  showMark = true,
}: {
  label?: string;
  showMark?: boolean;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="flex flex-col items-center gap-3 text-center">
        {showMark ? (
          <span className="flex h-10 w-10 animate-pulse items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            <SynapseMark className="h-5 w-5" />
          </span>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-slate-300 dark:text-slate-600" />
        )}
        <p className="text-sm text-[#5f6368] dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}
