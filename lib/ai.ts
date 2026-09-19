import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Shared AI client with a primary + fallback provider.
 *
 * Primary:  Groq (llama-3.3-70b)  — GROQ_API_KEY
 * Fallback: Google Gemini         — GOOGLE_GENERATIVE_AI_API_KEY
 *
 * Both expose the same `generateText` interface through the AI SDK, so a
 * fallback is just: try Groq, and on any failure retry the identical prompt
 * against Gemini. Keys are read server-side only.
 */
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY ?? "",
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
});

// Model IDs are env-overridable so a provider retiring a model is a config
// change, not a code change. Defaults are current free-tier models.
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

const STRICT_JSON_SYSTEM =
  "You produce valid JSON only. No prose, no markdown fences, no commentary. " +
  "Output must exactly match the requested JSON schema.";

/**
 * Ask the LLM to produce STRICT JSON matching `schemaDescription`.
 * Tries Groq first; on any failure falls back to Gemini.
 */
export async function generateJSON<T>(
  schemaDescription: string,
  content: string,
  instruction: string
): Promise<T> {
  const prompt = `Schema: ${schemaDescription}\n\nTask: ${instruction}\n\nDocument:\n${content}`;

  const attempts: { label: string; run: () => Promise<string> }[] = [];

  if (process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.startsWith("groq-...")) {
    attempts.push({
      label: "groq",
      run: async () => {
        const { text } = await generateText({
          model: groq(GROQ_MODEL),
          system: STRICT_JSON_SYSTEM,
          prompt,
        });
        return text;
      },
    });
  }

  if (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY.startsWith("AIza")
  ) {
    attempts.push({
      label: "gemini",
      run: async () => {
        const { text } = await generateText({
          model: google(GEMINI_MODEL),
          system: STRICT_JSON_SYSTEM,
          prompt,
        });
        return text;
      },
    });
  }

  if (attempts.length === 0) {
    throw new Error("No AI provider configured (set GROQ_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY).");
  }

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const text = await attempt.run();
      const cleaned = text
        .replace(/^```(?:json)?/m, "")
        .replace(/```$/m, "")
        .trim();
      try {
        return JSON.parse(cleaned) as T;
      } catch {
        throw new Error(`[${attempt.label}] AI returned invalid JSON`);
      }
    } catch (e) {
      lastError = e;
      // Fall through to the next provider.
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All AI providers failed");
}

/** Hard cap on content sent per call to keep cost/latency sane. */
export function truncateForAI(content: string, maxChars = 12000): string {
  return content.length > maxChars ? content.slice(0, maxChars) : content;
}
