"use client";

import { useCallback, useRef, useState } from "react";
import { LogoMark } from "./Logo";
import SendToCustomer from "./SendToCustomer";
import type { JobSummary } from "@/lib/types";

type Phase = "idle" | "recording" | "transcribing" | "ready" | "summarizing";

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function Recorder() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript("");
    setSummary(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopTimer();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        await transcribe(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setElapsed(0);
      setPhase("recording");
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError(
        "Couldn't access the microphone. Check your browser permissions and try again."
      );
      setPhase("idle");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      setPhase("transcribing");
      mediaRecorderRef.current.stop();
    }
  }, []);

  async function transcribe(blob: Blob) {
    try {
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("audio", blob, `note.${ext}`);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed.");
      setTranscript(data.text || "");
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed.");
      setPhase("idle");
    }
  }

  async function summarize() {
    setError(null);
    setPhase("summarizing");
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Summarization failed.");
      setSummary(data.summary as JobSummary);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarization failed.");
      setPhase("ready");
    }
  }

  const isRecording = phase === "recording";
  const isBusy = phase === "transcribing" || phase === "summarizing";

  const statusText: Record<Phase, string> = {
    idle: "Tap to record your job note",
    recording: "Listening… tap to stop",
    transcribing: "Transcribing…",
    ready: "Review your note below",
    summarizing: "Summarizing…",
  };

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto">
      {/* Record button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isBusy}
        className="relative flex items-center justify-center w-44 h-44 rounded-full disabled:opacity-60 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {isRecording && (
          <>
            <span className="absolute inset-0 rounded-full bg-brand/20 tt-ring" />
            <span className="absolute inset-2 rounded-full bg-brand/20 tt-ring [animation-delay:0.5s]" />
          </>
        )}
        <span
          className={`relative flex items-center justify-center w-36 h-36 rounded-full bg-surface shadow-lg ring-1 ring-border ${
            isRecording ? "tt-pulse" : ""
          }`}
        >
          <LogoMark size={84} />
        </span>
      </button>

      <div className="mt-5 h-6 text-center">
        {isRecording ? (
          <span className="font-mono text-lg text-brand tabular-nums">
            {formatTime(elapsed)}
          </span>
        ) : (
          <span className="text-muted text-sm">{statusText[phase]}</span>
        )}
      </div>

      {error && (
        <div className="mt-4 w-full rounded-lg bg-red-50 text-danger text-sm px-4 py-3 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {/* Transcript */}
      {(phase === "ready" || phase === "summarizing") && transcript && (
        <div className="mt-6 w-full">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Transcript
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            className="w-full rounded-xl border border-border bg-surface p-4 text-foreground text-[15px] leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={summarize}
              disabled={phase === "summarizing" || !transcript.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
            >
              {phase === "summarizing" ? "Summarizing…" : "✨ Summarize with AI"}
            </button>
            <button
              onClick={startRecording}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2.5 text-foreground font-medium text-sm ring-1 ring-border hover:bg-slate-50 transition"
            >
              ↻ Record again
            </button>
          </div>
        </div>
      )}

      {/* AI summary */}
      {summary && (
        <div className="mt-6 w-full rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
              AI Summary
            </span>
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            {summary.jobTitle}
          </h3>

          <SummarySection title="Work done" items={summary.workDone} />
          <SummarySection
            title="Parts & materials"
            items={summary.partsAndMaterials}
            accent
          />
          <SummarySection title="Next steps" items={summary.nextSteps} />

          {summary.customerMessage && (
            <div className="mt-4 rounded-xl bg-brand-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1.5">
                Customer message
              </div>
              <p className="text-[15px] leading-relaxed text-foreground">
                {summary.customerMessage}
              </p>
            </div>
          )}

          <SendToCustomer summary={summary} />
        </div>
      )}
    </div>
  );
}

function SummarySection({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <div
        className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${
          accent ? "text-accent-600" : "text-muted"
        }`}
      >
        {title}
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-[15px] text-foreground">
            <span className={accent ? "text-accent" : "text-brand"}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
