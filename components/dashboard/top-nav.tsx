"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Menu, Search, LayoutGrid } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { SynapseMark } from "@/components/synapse-mark";
import ThemeToggle from "@/components/theme-toggle";

/** Google-Docs-style top bar: hamburger, colored logo, pill search, avatar. */
export default function TopNav() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  function onSearch(value: string) {
    setQuery(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#dadce0] bg-white dark:border-white/10 dark:bg-slate-900">
      <div className="flex h-16 items-center gap-2 px-2 sm:gap-3 sm:px-4">
        {/* Hamburger: toggles the left sidebar */}
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("synapse:toggle-sidebar"))
          }
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-black/[0.06] dark:text-slate-300 dark:hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Colored logo mark + wordmark */}
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a73e8] text-white">
            <SynapseMark className="h-5 w-5" />
          </span>
          <span className="hidden text-[22px] font-normal tracking-tight text-[#5f6368] dark:text-slate-200 sm:block">
            Synapse
          </span>
        </Link>

        {/* Pill search */}
        <div className="relative mx-auto w-full max-w-2xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6368]" />
          <input
            type="text"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search documents"
            aria-label="Search documents"
            className="h-11 w-full rounded-full border border-transparent bg-[#f1f3f4] pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-[#dadce0] focus:bg-white focus:shadow-sm dark:bg-white/10 dark:text-slate-100 dark:focus:bg-slate-800"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Link
            href="/dashboard?view=grid"
            aria-label="Grid view"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-black/[0.06] dark:text-slate-300 dark:hover:bg-white/10 sm:flex"
          >
            <LayoutGrid className="h-5 w-5" />
          </Link>
          <ThemeToggle />
          <UserButton
            appearance={{ elements: { avatarBox: "h-8 w-8" } }}
          />
        </div>
      </div>
    </header>
  );
}
