import Link from "next/link";
import {
  ArrowRight,
  Network,
  Play,
  Sparkles,
  Users,
  FileText,
  type LucideIcon,
} from "lucide-react";
import ThemeToggle from "@/components/theme-toggle";

const currentYear = new Date().getFullYear();

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

function DotGrid() {
  return (
    <svg
      aria-hidden="true"
      className="absolute -right-24 -top-10 h-[420px] w-[420px] text-slate-900/[0.06] dark:text-white/[0.06]"
    >
      <defs>
        <pattern
          id="dotgrid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r="1.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dotgrid)" />
    </svg>
  );
}

/* A static, realistic "Synapse document" used as the landing proof object. */
function EditorMock() {
  return (
    <div className="relative">
      {/* Document window */}
      <div className="overflow-hidden rounded-xl border border-slate-900/10 bg-white shadow-[0_24px_70px_-20px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-slate-950">
        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b border-slate-900/10 px-4 py-2.5 dark:border-white/10">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            <SynapseMark className="h-3 w-3" />
          </span>
          <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
            Neural Networks
          </span>
          <div className="ml-auto flex -space-x-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-500 text-[9px] font-semibold text-white ring-2 ring-white dark:bg-slate-600 dark:ring-slate-950">
              KM
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-400 text-[9px] font-semibold text-white ring-2 ring-white dark:bg-slate-500 dark:ring-slate-950">
              AJ
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-[9px] font-semibold text-slate-800 ring-2 ring-white dark:bg-slate-400 dark:ring-slate-950">
              SP
            </span>
          </div>
        </div>

        {/* Presence line */}
        <div className="flex items-center gap-2 border-b border-slate-900/5 bg-slate-50/80 px-4 py-1.5 dark:border-white/5 dark:bg-white/[0.02]">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 align-middle dark:bg-slate-500" />{" "}
            @maya is typing about backpropagation
          </span>
        </div>

        {/* Document body */}
        <div className="space-y-3 px-6 py-6 sm:px-8 sm:py-8">
          <div className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Neural Networks
          </div>
          <div className="text-[13px] font-medium text-slate-400">
            A field guide to how machines learn
          </div>

          <div className="space-y-3 pt-1 text-[15px] leading-6 text-slate-600 dark:text-slate-400">
            <p>
              A neural network is a function that learns from examples. It maps
              inputs to outputs by adjusting thousands of small weights, one
              gradient step at a time.
            </p>
            <p>
              <span className="rounded-[3px] bg-slate-200/60 px-1 py-0.5 text-slate-900 dark:bg-slate-700/60 dark:text-slate-100">
                Backpropagation
              </span>{" "}
              measures how much each weight contributed to the error, then
              nudges it in the right direction. Do this millions of times and
              patterns begin to emerge.
            </p>
          </div>

          {/* Synapse AI panel */}
          <div className="rounded-lg border border-slate-900/10 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 dark:text-slate-300">
              <Sparkles className="h-3.5 w-3.5" />
              Synapse AI
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-slate-600 dark:text-slate-400">
              Concepts in this note:{" "}
              <span className="font-medium text-slate-900 dark:text-slate-200">
                neural network
              </span>
              , gradient descent, activation function, backpropagation. Would
              you like to turn this into flashcards?
            </p>
          </div>
        </div>
      </div>

      {/* Floating presence chip */}
      <div className="absolute -right-3 top-1/2 hidden -translate-y-1/2 items-center gap-2 rounded-full border border-slate-900/10 bg-white/95 py-1.5 pl-1.5 pr-3 text-xs font-medium text-slate-700 shadow-[0_12px_30px_-12px_rgba(15,23,42,0.4)] backdrop-blur dark:border-white/10 dark:bg-slate-800/95 dark:text-slate-200 md:flex">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
          <Users className="h-3 w-3" />
        </span>
        3 editing live
      </div>
    </div>
  );
}

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const features: Feature[] = [
  {
    icon: Users,
    title: "Real-time, lossless editing",
    description:
      "Type beside teammates with live cursors and zero lost work, powered by an Operational Transformation engine we built from scratch.",
  },
  {
    icon: Sparkles,
    title: "AI that studies back",
    description:
      "Turn any note into summaries, flashcards, and quizzes. The same text that teaches you also teaches itself.",
  },
  {
    icon: Network,
    title: "A map of your thinking",
    description:
      "Synapse surfaces the concepts hiding in your notes and draws the links between them as a living knowledge graph.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create a document",
    description:
      "Start a note in the editor, just like a blank page in a notebook. Write with markdown, headings, and rich text from the start.",
  },
  {
    number: "02",
    title: "Invite your team",
    description:
      "Share a link. Teammates join the same document and edit alongside you, every cursor and keystroke kept in sync.",
  },
  {
    number: "03",
    title: "Watch the graph grow",
    description:
      "As you write, Synapse extracts the concepts and quietly builds a graph of how your ideas connect.",
  },
];

const graphNodes = [
  { label: "Operational Transform", x: "10%", y: "30%", size: "lg" },
  { label: "WebSockets", x: "68%", y: "18%", size: "md" },
  { label: "Conflict resolution", x: "40%", y: "62%", size: "md" },
  { label: "Latency", x: "82%", y: "70%", size: "sm" },
  { label: "Cursors", x: "24%", y: "80%", size: "sm" },
] as const;

function GraphNode({
  label,
  x,
  y,
  size,
}: {
  label: string;
  x: string;
  y: string;
  size: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg"
      ? "px-4 py-2 text-sm"
      : size === "md"
        ? "px-3 py-1.5 text-[13px]"
        : "px-2.5 py-1 text-xs";
  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/10 text-slate-100 backdrop-blur-sm ${sizeClass}`}
      style={{ left: x, top: y }}
    >
      {label}
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip">
      {/* Background plane: subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[26rem] bg-[linear-gradient(to_right,rgb(15_23_42/0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_23_42/0.03)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(60%_60%_at_50%_0%,black,transparent)] dark:bg-[linear-gradient(to_right,rgb(255_255_255/0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.03)_1px,transparent_1px)]"
      />

      {/* Header */}
      <header className="relative z-10 border-b border-slate-900/5 dark:border-white/10">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <SynapseMark />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              Synapse
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="rounded-full px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-16 sm:pt-24 lg:pb-24 lg:pt-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            {/* Claim */}
            <div className="max-w-xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-slate-900/[0.03] px-3 py-1 text-xs font-medium tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                Real-time collaborative documents
              </div>
              <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Write together. Learn faster.
              </h1>
              <p className="mt-5 max-w-lg text-pretty text-lg leading-8 text-slate-600 dark:text-slate-400">
                Synapse is a real-time collaborative document editor that turns
                your notes into flashcards, quizzes, and a map of how your
                ideas connect.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/sign-up"
                  className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-900 px-6 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Start writing free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-900/10 px-6 text-sm font-medium text-foreground transition hover:bg-slate-900/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:border-white/15 dark:hover:bg-white/5"
                >
                  Sign in
                </Link>
              </div>
              <div className="mt-8 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <div className="flex -space-x-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-500 text-[9px] font-semibold text-white ring-2 ring-white dark:bg-slate-600 dark:ring-slate-950">
                    KM
                  </span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-400 text-[9px] font-semibold text-white ring-2 ring-white dark:bg-slate-500 dark:ring-slate-950">
                    AJ
                  </span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-[9px] font-semibold text-slate-800 ring-2 ring-white dark:bg-slate-400 dark:ring-slate-950">
                    SP
                  </span>
                </div>
                <span className="text-slate-500 dark:text-slate-400">
                  Trusted by 3 collaborators in your head
                </span>
              </div>
            </div>

            {/* Product proof */}
            <div className="relative">
              <DotGrid />
              <EditorMock />
            </div>
          </div>
        </section>

        {/* Social proof band */}
        <section className="border-y border-slate-900/5 bg-slate-900/[0.015] py-10 dark:border-white/5 dark:bg-white/[0.02]">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
              Built for how teams actually write
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Docs · Notes · Brainstorms · Study guides
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Why Synapse
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              A thinking tool, not just a text box
            </h2>
          </div>
          <div className="mt-14 grid gap-x-8 gap-y-12 md:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="border-t border-slate-900/10 pt-6 dark:border-white/10">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900/[0.04] text-slate-700 dark:bg-white/5 dark:text-slate-200">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-foreground">
                  {title}
                </h3>
                <p className="mt-2 text-[15px] leading-7 text-slate-600 dark:text-slate-400">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-20 sm:pb-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              How it works
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              From blank page to connected knowledge in three steps
            </h2>
          </div>
          <div className="mt-14 grid gap-x-8 gap-y-12 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="border-t border-slate-900/10 pt-6 dark:border-white/10">
                <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {step.number}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-[15px] leading-7 text-slate-600 dark:text-slate-400">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Network / knowledge graph band */}
        <section className="border-y border-white/10 bg-slate-950 py-20 dark:border-white/5">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">
                Knowledge graph
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Watch your notes become a network
              </h2>
              <p className="mt-4 max-w-md text-pretty text-[15px] leading-7 text-slate-300">
                Every note is a node. As you write, Synapse connects related
                concepts into a living map of what you're learning, then lets
                you explore the links between them.
              </p>
              <Link
                href="/sign-up"
                className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
              >
                Explore your graph
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Stylized graph visualization */}
            <div className="relative h-72 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] sm:h-80">
              <div
                aria-hidden
                className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px]"
              />
              {graphNodes.map((node) => (
                <GraphNode key={node.label} {...node} />
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative mx-auto w-full max-w-6xl px-6 py-20 text-center sm:py-28">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
            Your best ideas deserve a synapse.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-slate-600 dark:text-slate-400">
            Start writing together today. It's free.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/sign-up"
              className="group inline-flex h-11 items-center gap-2 rounded-full bg-slate-900 px-6 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <Play className="h-4 w-4" />
              Get started free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900/5 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-slate-500 dark:text-slate-400 sm:flex-row">
          <p>© {currentYear} Synapse</p>
          <p className="hidden sm:block">
            Operational Transformation · WebSockets · Prisma
          </p>
        </div>
      </footer>
    </div>
  );
}
