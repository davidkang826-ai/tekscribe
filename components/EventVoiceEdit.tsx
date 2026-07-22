"use client";

import { useEffect, useRef, useState } from "react";

export type EventFields = {
  customer: string;
  kind: "visit" | "call";
  address: string;
  todo: string;
};

/**
 * Mic button for the calendar event form. The tech speaks a change and the AI
 * applies it across the whole event (customer, on-site vs call, address, and
 * the note), not just appending to the note. Records, transcribes, sends the
 * transcript plus the event's current fields to /api/edit-event, and hands the
 * updated fields back via onApply.
 */
export default function EventVoiceEdit({
  current,
  onApply,
}: {
  current: EventFields;
  onApply: (fields: EventFields) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Read the freshest form values at process time, not whatever they were when
  // recording started. Synced in an effect so we never write a ref during render.
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
      const er = await fetch("/api/edit-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: said, current: currentRef.current }),
        signal: AbortSignal.timeout(45000),
      });
      const ed = await er.json();
      if (!er.ok) throw new Error(ed.error || "Couldn't apply that.");
      onApply({
        customer:
          typeof ed.customer === "string"
            ? ed.customer
            : currentRef.current.customer,
        kind: ed.kind === "call" ? "call" : "visit",
        address:
          typeof ed.address === "string"
            ? ed.address
            : currentRef.current.address,
        todo: typeof ed.todo === "string" ? ed.todo : currentRef.current.todo,
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
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={state === "recording" ? stop : start}
        disabled={state === "busy"}
        className={`tt-pop inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[15px] font-medium ring-1 transition ${
          state === "recording"
            ? "bg-danger text-white ring-danger tt-pulse"
            : "bg-surface text-brand ring-border hover:bg-brand-50 disabled:opacity-60"
        }`}
      >
        {state === "recording"
          ? "Stop"
          : state === "busy"
            ? "Updating the event…"
            : "🎙 Say it"}
      </button>
      {error && <span className="text-[13px] text-danger">{error}</span>}
    </div>
  );
}
