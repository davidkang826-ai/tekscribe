"use client";

import { useEffect, useRef, useState } from "react";

export type ClientFields = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

/**
 * Small mic button for the step-2 Client card. The tech speaks the customer's
 * details and the AI fills name, phone, email, and address. Records,
 * transcribes, sends the transcript plus the current field values to
 * /api/extract-client, and hands the filled fields back via onApply. One of
 * three ways to fill the card, alongside typing and importing from contacts.
 */
export default function ClientVoiceFill({
  current,
  onApply,
}: {
  current: ClientFields;
  onApply: (fields: ClientFields) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Read the freshest field values at process time. Synced in an effect so we
  // never write a ref during render.
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  async function process(blob: Blob) {
    setState("busy");
    try {
      if (blob.size < 1200) {
        setError("Didn't catch anything.");
        return;
      }
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `memo.${ext}`);
      const tr = await fetch("/api/transcribe", {
        method: "POST",
        body: fd,
        signal: AbortSignal.timeout(45000),
      });
      const td = await tr.json();
      if (!tr.ok) throw new Error(td.error || "Could not transcribe.");
      const said = (td.text || "").trim();
      if (said.replace(/[^a-z0-9]/gi, "").length < 3) {
        setError("Didn't catch anything.");
        return;
      }
      const er = await fetch("/api/extract-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: said, current: currentRef.current }),
        signal: AbortSignal.timeout(45000),
      });
      const ed = await er.json();
      if (!er.ok) throw new Error(ed.error || "Couldn't read that.");
      const cur = currentRef.current;
      const s = (v: unknown, fallback: string) =>
        typeof v === "string" ? v : fallback;
      onApply({
        name: s(ed.name, cur.name),
        phone: s(ed.phone, cur.phone),
        email: s(ed.email, cur.email),
        address: s(ed.address, cur.address),
      });
    } catch (e) {
      const timedOut = e instanceof Error && e.name === "TimeoutError";
      setError(
        timedOut
          ? "That took too long. Try again."
          : e instanceof Error
            ? e.message
            : "Something went wrong."
      );
    } finally {
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
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={state === "recording" ? stop : start}
        disabled={state === "busy"}
        className={`tt-pop inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium ring-1 transition ${
          state === "recording"
            ? "bg-danger text-white ring-danger tt-pulse"
            : "bg-surface text-brand ring-border hover:bg-brand-50 disabled:opacity-60"
        }`}
      >
        {state === "recording"
          ? "Stop"
          : state === "busy"
            ? "Filling…"
            : "🎙 Say it"}
      </button>
      {error && <span className="text-[13px] text-danger">{error}</span>}
    </div>
  );
}
