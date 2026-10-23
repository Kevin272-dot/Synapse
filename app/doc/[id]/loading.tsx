import { LoadingScreen } from "@/components/loading-screen";

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa] dark:bg-slate-950">
      <LoadingScreen label="Opening document" />
    </div>
  );
}
