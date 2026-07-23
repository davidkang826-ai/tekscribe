"use client";

import { useRef, useState } from "react";

type Field = "name" | "phone" | "email" | "address";

/**
 * A compact mic button that sits to the right of one client field. Tap to
 * record just that field, and the spoken value is transcribed, cleaned for the
 * field type, and handed back via onResult. One of three ways to fill the
 * client card, alongside typing and importing from contacts.
 */
export default function FieldMic({
  field,
  label,
  onResult,
}: {
  field: Field;
  label: string;
  onResult: (value: string) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "busy">("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function process(blob: Blob) {
    setState("busy");
    try {
      if (blob.size < 1000) return;
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `memo.${ext}`);
      const tr = await fetch("/api/transcribe", {
        method: "POST",
        body: fd,
        signal: AbortSignal.timeout(45000),
      });
      const td = await tr.json();
      if (!tr.ok) return;
      const said = (td.text || "").trim();
      if (said.replace(/[^a-z0-9]/gi, "").length < 2) return;
      const pr = await fetch("/api/parse-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: said, field }),
        signal: AbortSignal.timeout(45000),
      });
      const pd = await pr.json();
      const value =
        pr.ok && typeof pd.value === "string" && pd.value ? pd.value : said;
      onResult(value);
    } catch {
      // A failed capture just leaves the field as it was.
    } finally {
      setState("idle");
    }
  }

  async function start() {
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
      setState("idle");
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
    <button
      type="button"
      onClick={state === "recording" ? stop : start}
      disabled={state === "busy"}
      aria-label={
        state === "recording" ? `Stop recording the ${label}` : `Say the ${label}`
      }
      title={`Say the ${label}`}
      className={`tt-pop flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 transition disabled:opacity-60 ${
        state === "recording"
          ? "bg-danger text-white ring-danger tt-pulse"
          : "bg-surface text-brand ring-border hover:bg-brand-50"
      }`}
    >
      {state === "busy" ? "…" : state === "recording" ? "◼" : "🎙"}
    </button>
  );
}
