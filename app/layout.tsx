import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Synapse",
    template: "%s · Synapse",
  },
  description:
    "Synapse is a real-time collaborative document editor. Write with others in the same document at once, then turn your notes into flashcards, quizzes, and a knowledge graph with AI.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The theme lives in a cookie so the server renders the correct class
  // directly — no pre-paint script, no flash, no hydration warning.
  const cookieStore = await cookies();
  const theme =
    cookieStore.get("theme")?.value === "dark" ? "dark" : "light";

  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${inter.variable} ${geistMono.variable} h-full antialiased ${
          theme === "dark" ? "dark" : ""
        }`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
