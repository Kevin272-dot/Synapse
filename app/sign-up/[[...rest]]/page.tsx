"use client";

import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

function SynapseMark({ className = "h-4 w-4" }: { className?: string }) {
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

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Link href="/" className="flex items-center gap-2.5 text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <SynapseMark className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Synapse</span>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Create your account
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Start writing, learning, and connecting ideas.
            </p>
          </div>
        </div>
        <SignUp
          key="sign-up"
          appearance={{
            elements: {
              rootBox: "mx-auto w-full",
              card: "rounded-xl border border-slate-900/10 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900",
            },
          }}
        />
      </div>
    </div>
  );
}
