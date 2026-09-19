export function SynapseMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="5" cy="12" r="2.25" />
      <circle cx="19" cy="12" r="2.25" />
      <path d="M7.25 12h1.75l1.2-2 2 3.4 2-3.4 1.2 2h1.75" />
    </svg>
  );
}
