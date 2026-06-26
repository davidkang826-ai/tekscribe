import OpenAI from "openai";

let client: OpenAI | null = null;

/** Lazily create the OpenAI client so the app can boot without a key set. */
export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local (see .env.example)."
    );
  }
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

export const TRANSCRIPTION_MODEL = "whisper-1";
export const SUMMARY_MODEL = "gpt-4o";
