"use client";

import { useRef, useState } from "react";

/**
 * A small mic button that records a voice memo, transcribes it, has the AI
 * tighten it into a short note, and hands the result back via onResult. Used
 * on the calendar event form so a tech can talk through a visit or call
 * instead of typing.
 */
export default function VoiceToNote({
  onResult,
}: {
  onResult: (note: string) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function process(blob: Blob) {
    setState("busy");
    try {
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `memo.${ext}`);
      const tr = await fetch("/api/transcribe", { method: "POST", body: fd });
      const td = await tr.json();
      if (!tr.ok) throw new Error(td.error || "Could not transcribe.");
      const said = (td.text || "").trim();
      if (!said) {
        setError("Didn't catch that. Try again.");
        setState("idle");
        return;
      }
      const sr = await fetch("/api/summarize-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: said }),
      });
      const sd = await sr.json();
      onResult(sr.ok && sd.note ? sd.note : said);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setState("idle");
    }
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        await process(
          new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
        );
      };
      rec.start();
      recRef.current = rec;
      setState("recording");
    } catch {
      setError("Couldn't reach the microphone. Check permissions.");
    }
  }

  function stop() {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      setState("busy");
      rec.stop();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={state === "recording" ? stop : start}
        disabled={state === "busy"}
        className={`tt-pop inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ring-1 transition ${
          state === "recording"
            ? "bg-danger text-white ring-danger"
            : "bg-surface text-brand ring-border hover:bg-brand-50 disabled:opacity-60"
        }`}
      >
        {state === "recording" ? (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-white tt-pulse" />
            Stop &amp; add
          </>
        ) : state === "busy" ? (
          "Writing it up…"
        ) : (
          "🎙 Say it instead"
        )}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
