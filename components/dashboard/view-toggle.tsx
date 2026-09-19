"use client";

import { LayoutGrid, List } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/** Grid/list toggle that persists the choice in the URL (?view=grid|list). */
export function ViewToggle({ view }: { view: "grid" | "list" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setView(next: "grid" | "list") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center rounded-full border border-[#dadce0] dark:border-white/15">
      <button
        type="button"
        aria-label="Grid view"
        title="Grid view"
        onClick={() => setView("grid")}
        className={`flex h-8 w-9 items-center justify-center rounded-l-full transition ${
          view === "grid"
            ? "bg-[#e8f0fe] text-[#1967d2] dark:bg-[#1a73e8]/25 dark:text-[#a8c7fa]"
            : "text-[#5f6368] hover:bg-black/[0.05] dark:text-slate-400 dark:hover:bg-white/10"
        }`}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="List view"
        title="List view"
        onClick={() => setView("list")}
        className={`flex h-8 w-9 items-center justify-center rounded-r-full transition ${
          view === "list"
            ? "bg-[#e8f0fe] text-[#1967d2] dark:bg-[#1a73e8]/25 dark:text-[#a8c7fa]"
            : "text-[#5f6368] hover:bg-black/[0.05] dark:text-slate-400 dark:hover:bg-white/10"
        }`}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
