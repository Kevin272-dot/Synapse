"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type OwnerFilterValue = "anyone" | "me" | "shared";

/** "Owned by anyone" dropdown, like Google Docs' filter. */
export function OwnerFilter({ value }: { value: OwnerFilterValue }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setOwner(next: OwnerFilterValue) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "anyone") params.delete("owner");
    else params.set("owner", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={(e) => setOwner(e.target.value as OwnerFilterValue)}
      aria-label="Filter by owner"
      className="h-9 rounded-lg border border-transparent bg-[#f1f3f4] px-3 text-sm text-slate-700 outline-none transition focus:border-[#dadce0] focus:bg-white dark:bg-white/10 dark:text-slate-200"
    >
      <option value="anyone">Owned by anyone</option>
      <option value="me">Owned by me</option>
      <option value="shared">Shared with me</option>
    </select>
  );
}
