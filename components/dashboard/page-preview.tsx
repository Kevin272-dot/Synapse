import { Plus } from "lucide-react";

/**
 * A miniature white "page" used for template tiles and document cards.
 * `variant="blank"` shows a blue plus (new blank doc); otherwise it renders
 * a colored header block and gray content lines to suggest a real document.
 */
export function PagePreview({
  variant = "lines",
  accent,
  className = "",
}: {
  variant?: "blank" | "lines";
  accent?: string;
  className?: string;
}) {
  return (
    <div
      className={`w-full overflow-hidden rounded-[3px] border border-[#dadce0] bg-white shadow-[0_1px_3px_rgba(60,64,67,0.15)] dark:border-white/10 ${className}`}
    >
      {variant === "blank" ? (
        <div className="flex h-full w-full items-center justify-center">
          <Plus className="h-10 w-10 text-[#1a73e8]" strokeWidth={2.5} />
        </div>
      ) : (
        <div className="flex h-full w-full flex-col p-3">
          {accent && (
            <div
              className="mb-2 h-6 w-3/5 rounded-[2px]"
              style={{ background: accent }}
            />
          )}
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-[#e8eaed]" />
            <div className="h-1.5 w-11/12 rounded-full bg-[#e8eaed]" />
            <div className="h-1.5 w-4/5 rounded-full bg-[#e8eaed]" />
            <div className="h-1.5 w-9/12 rounded-full bg-[#e8eaed]" />
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="h-1.5 w-10/12 rounded-full bg-[#f1f3f4]" />
            <div className="h-1.5 w-7/12 rounded-full bg-[#f1f3f4]" />
          </div>
        </div>
      )}
    </div>
  );
}
