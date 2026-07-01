"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "./Logo";
import SendToCustomer from "./SendToCustomer";
import { saveNote, updateNoteSummary } from "@/lib/supabase/notes";
import type { JobSummary, Template } from "@/lib/types";

type Phase =
  | "idle"
  | "recording"
  | "transcribing"
  | "transcribeError" // transcription failed; audio kept for retry
  | "transcript" // raw transcript shown: Save / Delete
  | "saved" // transcript saved: Summarize? / Delete
  | "summarizing" // calling the AI
  | "summarized" // AI summary (writes in live), then send options
  | "confirmDelete"; // Exit / Record again

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Types text out character-by-character with a blinking cursor. */
function Typewriter({
  text,
  speed = 14,
  onDone,
}: {
  text: string;
  speed?: number;
  onDone?: () => void;
}) {
  const [n, setN] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    setN(0);
    doneRef.current = false;
  }, [text]);

  useEffect(() => {
    if (n < text.length) {
      const id = setTimeout(() => setN((v) => v + 1), speed);
      return () => clearTimeout(id);
    }
    if (!doneRef.current && text.length > 0) {
      doneRef.current = true;
      onDone?.();
    }
  }, [n, text, speed, onDone]);

  return (
    <span>
      {text.slice(0, n)}
      {n < text.length && <span className="tt-cursor">▍</span>}
    </span>
  );
}

export default function Recorder({
  canSave = false,
  templates = [],
  replyTo = "",
}: {
  canSave?: boolean;
  templates?: Template[];
  replyTo?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [writingDone, setWritingDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Where to return to if the user cancels a delete.
  const [returnPhase, setReturnPhase] = useState<Phase>("transcript");

  // Template filling
  const [templateId, setTemplateId] = useState("");
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState<string | null>(null);
  const [filledCopied, setFilledCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep the last recording so a failed transcription can be retried, not lost.
  const lastBlobRef = useRef<Blob | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const resetAll = () => {
    setTranscript("");
    setSummary(null);
    setNoteId(null);
    setWritingDone(false);
    setError(null);
    setTemplateId("");
    setFilled(null);
    lastBlobRef.current = null;
  };

  const askDelete = (from: Phase) => {
    setReturnPhase(from);
    setPhase("confirmDelete");
  };

  const startRecording = useCallback(async () => {
    resetAll();
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
        lastBlobRef.current = blob;
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
      setPhase("transcript");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed.");
      // Keep the audio (lastBlobRef) so the tech can retry instead of losing it.
      setPhase("transcribeError");
    }
  }

  function retryTranscribe() {
    if (!lastBlobRef.current) return;
    setError(null);
    setPhase("transcribing");
    transcribe(lastBlobRef.current);
  }

  async function handleSave() {
    setError(null);
    setPhase("saved");
    if (canSave) {
      const result = await saveNote({ transcript, summary: null });
      if (result.error) setError(result.error);
      else setNoteId(result.id ?? null);
    }
  }

  async function handleSummarize() {
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
      setWritingDone(false);
      setPhase("summarized");
      // Attach the summary to the saved note in the background.
      if (noteId) updateNoteSummary(noteId, data.summary as JobSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarization failed.");
      setPhase("saved");
    }
  }

  async function fillTemplate() {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setFilling(true);
    setFilled(null);
    setError(null);
    try {
      const res = await fetch("/api/fill-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          summary,
          templateContent: template.content,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Template fill failed.");
      setFilled(data.filled as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template fill failed.");
    } finally {
      setFilling(false);
    }
  }

  async function copyFilled() {
    if (!filled) return;
    try {
      await navigator.clipboard.writeText(filled);
      setFilledCopied(true);
      setTimeout(() => setFilledCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  const isRecording = phase === "recording";
  const showButton =
    phase === "idle" || phase === "recording" || phase === "transcribing";

  const statusText: Record<string, string> = {
    idle: "Tap to record your job note",
    recording: "Listening… tap to stop",
    transcribing: "Transcribing…",
  };

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto">
      {/* Record button — only while idle/recording/transcribing */}
      {showButton && (
        <>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={phase === "transcribing"}
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
        </>
      )}

      {error && (
        <div className="mt-4 w-full rounded-lg bg-red-50 text-danger text-sm px-4 py-3 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {/* Transcription failed — the recording is kept so it can be retried */}
      {phase === "transcribeError" && (
        <div className="mt-4 w-full rounded-2xl border border-border bg-surface p-5 shadow-sm text-center">
          <p className="text-foreground font-medium">
            Transcription didn&apos;t go through
          </p>
          <p className="text-sm text-muted mt-1 mb-4">
            Your recording is safe — no need to say it again. Give it another
            try.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={retryTranscribe}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 transition"
            >
              ↻ Retry transcription
            </button>
            <button
              onClick={() => {
                resetAll();
                startRecording();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-5 py-2.5 text-foreground font-medium text-sm ring-1 ring-border hover:bg-slate-50 transition"
            >
              🎙 Discard &amp; re-record
            </button>
          </div>
        </div>
      )}

      {/* Transcript — editable before save, read-only after */}
      {(phase === "transcript" ||
        phase === "saved" ||
        phase === "summarizing" ||
        phase === "summarized") && (
        <div className="mt-2 w-full">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            {phase === "transcript" ? "Your note" : "Your note (saved)"}
          </label>
          {phase === "transcript" ? (
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-border bg-surface p-4 text-foreground text-[15px] leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          ) : (
            <div className="w-full rounded-xl border border-border bg-surface p-4 text-foreground text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap">
              {transcript}
            </div>
          )}

          {/* Phase-specific actions */}
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            {phase === "transcript" && (
              <>
                <button
                  onClick={handleSave}
                  disabled={!transcript.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-3.5 text-white font-semibold text-base shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
                >
                  💾 Save
                </button>
                <button
                  onClick={() => askDelete("transcript")}
                  className="inline-flex items-center gap-2 rounded-xl bg-surface px-8 py-3.5 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
                >
                  🗑 Delete
                </button>
              </>
            )}

            {phase === "saved" && (
              <>
                <button
                  onClick={handleSummarize}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-3.5 text-white font-semibold text-base shadow-sm hover:bg-brand-600 transition"
                >
                  ✨ Summarize with AI?
                </button>
                <button
                  onClick={() => askDelete("saved")}
                  className="inline-flex items-center gap-2 rounded-xl bg-surface px-8 py-3.5 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
                >
                  🗑 Delete
                </button>
              </>
            )}

            {phase === "summarizing" && (
              <div className="inline-flex items-center gap-2 text-brand text-sm font-medium">
                <LogoMark size={20} className="tt-pulse" />
                Reading your note and writing it up…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {phase === "confirmDelete" && (
        <div className="mt-4 w-full rounded-2xl border border-border bg-surface p-5 shadow-sm text-center">
          <p className="text-foreground font-medium">Delete this note?</p>
          <p className="text-sm text-muted mt-1 mb-4">
            Pressed it by accident? Just go back.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setPhase(returnPhase)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 transition"
            >
              ← Go back
            </button>
            <button
              onClick={() => {
                resetAll();
                startRecording();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-5 py-2.5 text-foreground font-medium text-sm ring-1 ring-border hover:bg-slate-50 transition"
            >
              🎙 Record again
            </button>
            <button
              onClick={() => {
                resetAll();
                setPhase("idle");
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-5 py-2.5 text-danger font-medium text-sm ring-1 ring-border hover:bg-red-50 transition"
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {/* AI summary — writes in live */}
      {phase === "summarized" && summary && (
        <div className="mt-6 w-full rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
              AI Summary
            </span>
          </div>
          <h3 className="text-lg font-semibold text-foreground tt-fade-in">
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
                <Typewriter
                  text={summary.customerMessage}
                  onDone={() => setWritingDone(true)}
                />
              </p>
            </div>
          )}

          {/* Send + templates appear once the AI finishes writing */}
          {writingDone && (
            <div className="tt-fade-in">
              <SendToCustomer summary={summary} defaultReplyTo={replyTo} />

              {templates.length > 0 && (
                <div className="mt-5 border-t border-border pt-5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-accent-600 mb-3">
                    Fill a template
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <select
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                      className="flex-1 min-w-[180px] rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
                    >
                      <option value="">Choose a template…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={fillTemplate}
                      disabled={!templateId || filling}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
                    >
                      {filling ? "Filling…" : "✨ Auto-fill"}
                    </button>
                  </div>

                  {filled && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                          Filled template
                        </span>
                        <button
                          onClick={copyFilled}
                          className="text-xs font-medium text-brand hover:underline"
                        >
                          {filledCopied ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap rounded-xl border border-border bg-slate-50 p-4 text-[14px] leading-relaxed text-foreground font-sans">
                        {filled}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 border-t border-border pt-4">
                <button
                  onClick={() => askDelete("summarized")}
                  className="text-sm font-medium text-muted hover:text-danger transition"
                >
                  🗑 Delete &amp; start over
                </button>
              </div>
            </div>
          )}
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
          <li
            key={i}
            className="flex gap-2 text-[15px] text-foreground tt-fade-in"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className={accent ? "text-accent" : "text-brand"}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
