"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FileText, FolderOpen, Network, Users } from "lucide-react";

/** Google-Drive-style left navigation. */
export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    function toggle() {
      setOpen((o) => !o);
    }
    document.addEventListener("synapse:toggle-sidebar", toggle);
    return () => document.removeEventListener("synapse:toggle-sidebar", toggle);
  }, []);

  const shared = searchParams.get("owner") === "shared";
  const isGraph = pathname.startsWith("/graph");

  const items = [
    {
      label: "My documents",
      href: "/dashboard",
      icon: FolderOpen,
      active: !isGraph && !shared,
    },
    {
      label: "Shared with me",
      href: "/dashboard?owner=shared",
      icon: Users,
      active: !isGraph && shared,
    },
    {
      label: "Knowledge graph",
      href: "/graph",
      icon: Network,
      active: isGraph,
    },
  ];

  if (!open) return null;

  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#dadce0] bg-white px-2 py-3 dark:border-white/10 dark:bg-slate-900 md:block">
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex items-center gap-3 rounded-r-full py-2 pl-3 pr-4 text-sm transition ${
              item.active
                ? "bg-[#e8f0fe] font-medium text-[#1967d2] dark:bg-[#1a73e8]/20 dark:text-[#a8c7fa]"
                : "text-slate-700 hover:bg-black/[0.05] dark:text-slate-300 dark:hover:bg-white/10"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 border-t border-[#dadce0] px-3 pt-4 dark:border-white/10">
        <p className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <FileText className="h-3.5 w-3.5" />
          Synapse
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-400 dark:text-slate-500">
          Real-time collaborative documents with AI study tools.
        </p>
      </div>
    </aside>
  );
}
