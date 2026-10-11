import { embed } from "ai";
import { google } from "@ai-sdk/google";

/**
 * Generate a 768-dim embedding via Gemini text-embedding-004 (free tier).
 * Falls back gracefully if the key is missing.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY.startsWith("AIza")) {
    return null;
  }
  try {
    const { embedding } = await embed({
      model: google.textEmbeddingModel("text-embedding-004"),
      value: text.slice(0, 8000),
    });
    return embedding;
  } catch {
    return null;
  }
}

/** Cosine similarity between two vectors (no pgvector dependency). */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
