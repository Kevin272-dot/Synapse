import type { Metadata } from "next";
import TopNav from "@/components/dashboard/top-nav";
import Sidebar from "@/components/dashboard/sidebar";

export const metadata: Metadata = {
  title: {
    default: "Home",
    template: "%s · Synapse",
  },
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-white dark:bg-slate-950">
      <TopNav />
      <div className="flex flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
