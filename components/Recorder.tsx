"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "./Logo";
import SendToCustomer from "./SendToCustomer";
import { saveNote } from "@/lib/supabase/notes";
import { upsertCustomer } from "@/lib/supabase/customers";
import { createClient } from "@/lib/supabase/client";
import type { JobSummary, Customer, Attachment } from "@/lib/types";

type Phase =
  | "idle"
  | "recording"
  | "paused" // recording paused mid-visit; tap to resume, or hold to end
  | "transcribing"
  | "transcribeError" // transcription failed; audio kept for retry
  | "transcript" // Step 1: transcript shown
  | "summarizing" // calling the AI
  | "summarized" // Steps 2-4: review → save → send
  | "confirmDelete";

// Steps within the "summarized" phase: 2 = review, 3 = save, 4 = send.
type ReviewStep = "confirm" | "archive" | "send";

type Attach = Attachment & { preview?: string };

const STEP_LABELS = ["Your memo", "Review the note", "Save it", "Send to customer"];

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Downscale a photo to a reasonable JPEG before uploading to storage. */
async function scaleImageToBlob(
  file: File,
  maxDim = 1600,
  quality = 0.82
): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });
  let { width, height } = img;
  const longest = Math.max(width, height);
  if (longest > maxDim) {
    const s = maxDim / longest;
    width = Math.round(width * s);
    height = Math.round(height * s);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b || file), "image/jpeg", quality)
  );
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

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-brand">
        Step {current} of {STEP_LABELS.length}
      </span>
      <span className="text-xs text-muted">· {STEP_LABELS[current - 1]}</span>
      <div className="ml-1 flex gap-1">
        {STEP_LABELS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${
              i < current ? "bg-brand" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function Recorder({
  canSave = false,
  customers = [],
  replyTo = "",
  userId = "",
  techName = "",
}: {
  canSave?: boolean;
  customers?: Customer[];
  replyTo?: string;
  userId?: string;
  techName?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [, setNoteId] = useState<string | null>(null);
  const [writingDone, setWritingDone] = useState(false);
  const [reviewStep, setReviewStep] = useState<ReviewStep>("confirm");
  const [archiveState, setArchiveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [returnPhase, setReturnPhase] = useState<Phase>("transcript");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [nameMatches, setNameMatches] = useState<Customer[]>([]);
  const [attachments, setAttachments] = useState<Attach[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<Attach | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Attach | null>(null);
  const [holding, setHolding] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const visitIdRef = useRef<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFiredRef = useRef(false);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const resetAll = () => {
    setTranscript("");
    setSummary(null);
    setQuestions([]);
    setAnswers({});
    setNoteId(null);
    setWritingDone(false);
    setError(null);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setNameMatches([]);
    setAttachments([]);
    setViewing(null);
    setPendingDelete(null);
    setHolding(false);
    setEndConfirm(false);
    setReviewStep("confirm");
    setArchiveState("idle");
    lastBlobRef.current = null;
  };

  // Recall a saved customer. If several share the name, let them pick by email.
  function onCustomerName(value: string) {
    setCustomerName(value);
    const matches = customers.filter(
      (c) => c.name.trim().toLowerCase() === value.trim().toLowerCase()
    );
    if (matches.length === 1) {
      setCustomerEmail(matches[0].email ?? "");
      setCustomerPhone(matches[0].phone ?? "");
      setNameMatches([]);
    } else if (matches.length > 1) {
      setNameMatches(matches);
    } else {
      setNameMatches([]);
    }
  }

  function pickMatch(c: Customer) {
    setCustomerEmail(c.email ?? "");
    setCustomerPhone(c.phone ?? "");
    setNameMatches([]);
  }

  const uniqueNames = Array.from(new Set(customers.map((c) => c.name)));

  const askDelete = (from: Phase) => {
    setReturnPhase(from);
    setPhase("confirmDelete");
  };

  const startRecording = useCallback(async () => {
    resetAll();
    visitIdRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`;
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

  const pauseRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec?.state === "recording") {
      rec.pause();
      stopTimer();
      setPhase("paused");
    }
  }, []);

  const resumeRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec?.state === "paused") {
      rec.resume();
      setPhase("recording");
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    }
  }, []);

  // End the visit recording (works whether recording or paused).
  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && (rec.state === "recording" || rec.state === "paused")) {
      setPhase("transcribing");
      rec.stop();
    }
  }, []);

  // --- Tap = pause/resume, press-and-hold 2s = end -------------------------
  const clearHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  function onRecordPointerDown() {
    if (endConfirm) return;
    if (phase !== "recording" && phase !== "paused") return;
    holdFiredRef.current = false;
    setHolding(true);
    clearHold();
    holdTimerRef.current = setTimeout(() => {
      holdFiredRef.current = true;
      setHolding(false);
      if (mediaRecorderRef.current?.state === "recording") pauseRecording();
      setEndConfirm(true);
    }, 2000);
  }

  function onRecordPointerEnd() {
    setHolding(false);
    clearHold();
  }

  function onRecordClick() {
    // The click fires right after pointerup; if a hold just ended, swallow it.
    if (holdFiredRef.current) {
      holdFiredRef.current = false;
      return;
    }
    if (endConfirm) return;
    if (phase === "idle") startRecording();
    else if (phase === "recording") pauseRecording();
    else if (phase === "paused") resumeRecording();
  }

  function openEndConfirm() {
    if (mediaRecorderRef.current?.state === "recording") pauseRecording();
    setEndConfirm(true);
  }

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
      setPhase("transcribeError");
    }
  }

  function retryTranscribe() {
    if (!lastBlobRef.current) return;
    setError(null);
    setPhase("transcribing");
    transcribe(lastBlobRef.current);
  }

  // Optional extra context (the tech's answers to clarifying questions) is
  // appended to the note the AI reads, without altering the saved transcript.
  async function handleSummarize(extraContext?: string) {
    setError(null);
    setPhase("summarizing");
    try {
      const noteForAI = extraContext
        ? `${transcript}\n\nThe technician clarified:\n${extraContext}`
        : transcript;
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: noteForAI, techName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Summarization failed.");
      setSummary(data.summary as JobSummary);
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      setAnswers({});
      setWritingDone(false);
      setReviewStep("confirm");
      setPhase("summarized");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarization failed.");
      setPhase("transcript");
    }
  }

  function submitAnswers() {
    const qa = questions
      .map((q, i) => ({ q, a: (answers[i] || "").trim() }))
      .filter((x) => x.a);
    if (!qa.length) return;
    const extra = qa.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n");
    handleSummarize(extra);
  }

  function tweakSummary() {
    setSummary(null);
    setQuestions([]);
    setWritingDone(false);
    setReviewStep("confirm");
    setPhase("transcript");
  }

  async function handleArchive() {
    setArchiveState("saving");
    setError(null);
    const result = await saveNote({
      transcript,
      summary,
      customerName,
      customerEmail,
      attachments: attachments.map(({ path, name, type }) => ({
        path,
        name,
        type,
      })),
    });
    if (result.error) {
      setError(result.error);
      setArchiveState("idle");
    } else {
      setNoteId(result.id ?? null);
      setArchiveState("saved");
    }
    if (customerName.trim()) {
      upsertCustomer({
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
      });
    }
  }

  async function addAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    if (mediaRecorderRef.current?.state === "recording") pauseRecording();
    setUploading(true);
    setError(null);
    try {
      const isImage = file.type.startsWith("image/");
      const body: Blob = isImage ? await scaleImageToBlob(file) : file;
      const contentType = isImage
        ? "image/jpeg"
        : file.type || "application/octet-stream";
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
      const path = `${userId}/${visitIdRef.current || "v"}/${Date.now()}-${safe}`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("visit-media")
        .upload(path, body, { contentType, upsert: false });
      if (upErr) throw new Error(upErr.message);
      setAttachments((prev) => [
        ...prev,
        {
          path,
          name: file.name,
          type: contentType,
          preview: isImage ? URL.createObjectURL(body) : undefined,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(att: Attach) {
    setAttachments((prev) => prev.filter((a) => a.path !== att.path));
    try {
      const supabase = createClient();
      await supabase.storage.from("visit-media").remove([att.path]);
    } catch {
      // best-effort cleanup
    }
  }

  // Click an attachment to see it: images open in a lightbox, files in a tab.
  async function viewAttachment(att: Attach) {
    if (att.type.startsWith("image/") && att.preview) {
      setViewing(att);
      return;
    }
    try {
      const supabase = createClient();
      const { data } = await supabase.storage
        .from("visit-media")
        .createSignedUrl(att.path, 60 * 60);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch {
      // ignore
    }
  }

  const isRecording = phase === "recording";
  const isPaused = phase === "paused";
  const showButton =
    phase === "idle" ||
    phase === "recording" ||
    phase === "paused" ||
    phase === "transcribing";

  const statusText: Record<string, string> = {
    idle: "Tap to record your visit",
    recording: "Recording. Tap to pause, hold to end.",
    paused: "Paused. Tap to resume, hold to end.",
    transcribing: "Transcribing…",
  };

  const stepNum =
    phase === "transcript"
      ? 1
      : phase === "summarizing"
        ? 2
        : phase === "summarized"
          ? reviewStep === "confirm"
            ? 2
            : reviewStep === "archive"
              ? 3
              : 4
          : 0;

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto">
      {showButton && (
        <>
          <button
            onClick={onRecordClick}
            onPointerDown={onRecordPointerDown}
            onPointerUp={onRecordPointerEnd}
            onPointerLeave={onRecordPointerEnd}
            onPointerCancel={onRecordPointerEnd}
            disabled={phase === "transcribing"}
            className="relative flex items-center justify-center w-44 h-44 rounded-full disabled:opacity-60 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 touch-none select-none"
            aria-label={
              isRecording
                ? "Recording. Tap to pause, press and hold to end."
                : isPaused
                  ? "Paused. Tap to resume, press and hold to end."
                  : "Start recording"
            }
          >
            {isRecording && !holding && (
              <>
                <span className="absolute inset-0 rounded-full bg-brand/20 tt-ring" />
                <span className="absolute inset-2 rounded-full bg-brand/20 tt-ring [animation-delay:0.5s]" />
              </>
            )}
            {holding && (
              <svg
                viewBox="0 0 176 176"
                className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
              >
                <circle
                  cx="88"
                  cy="88"
                  r="85"
                  fill="none"
                  stroke="var(--danger)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  className="tt-hold-arc"
                />
              </svg>
            )}
            <span
              className={`relative flex items-center justify-center w-36 h-36 rounded-full bg-surface shadow-lg ${
                isPaused ? "ring-2 ring-accent" : "ring-1 ring-border"
              } ${isRecording && !holding ? "tt-pulse" : ""}`}
            >
              <LogoMark size={84} />
            </span>
          </button>

          <div className="mt-5 text-center">
            {isRecording || isPaused ? (
              <>
                <span
                  className={`font-mono text-lg tabular-nums ${
                    isPaused ? "text-accent-600" : "text-brand"
                  }`}
                >
                  {formatTime(elapsed)}
                </span>
                <div className="text-xs text-muted mt-0.5">
                  {holding ? "Keep holding to end…" : statusText[phase]}
                </div>
              </>
            ) : (
              <span className="text-muted text-sm">{statusText[phase]}</span>
            )}
          </div>

          {/* End-recording confirm (after a 2s hold, or the fallback link) */}
          {endConfirm && (
            <div className="mt-4 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-sm text-center">
              <p className="text-foreground font-medium">End the recording?</p>
              <p className="text-sm text-muted mt-1 mb-4">
                We&apos;ll write it up. You can keep talking if you&apos;re not
                done.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => {
                    setEndConfirm(false);
                    stopRecording();
                  }}
                  className="tt-pop inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-white font-semibold text-base shadow-sm hover:bg-brand-600 transition"
                >
                  ✓ End &amp; write it up
                </button>
                <button
                  onClick={() => {
                    setEndConfirm(false);
                    resumeRecording();
                  }}
                  className="tt-pop inline-flex items-center gap-2 rounded-xl bg-surface px-6 py-3 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
                >
                  ← Keep recording
                </button>
              </div>
            </div>
          )}

          {/* Attach photos/files + a subtle end fallback, hidden mid-confirm */}
          {canSave && (isRecording || isPaused) && !endConfirm && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <label className="tt-pop inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-foreground ring-1 ring-border hover:bg-slate-50">
                  📷 Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={addAttachment}
                    className="hidden"
                  />
                </label>
                <label className="tt-pop inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-foreground ring-1 ring-border hover:bg-slate-50">
                  📎 File
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={addAttachment}
                    className="hidden"
                  />
                </label>
                {uploading ? (
                  <span className="text-xs text-brand">Uploading…</span>
                ) : (
                  attachments.length > 0 && (
                    <span className="text-xs text-muted">
                      {attachments.length} attached
                    </span>
                  )
                )}
              </div>
              <p className="max-w-xs text-center text-[11px] text-muted">
                Snap the model plate, the damage, or a before/after. Files like a
                receipt or permit work too. They stay with this visit.
              </p>
              <button
                onClick={openEndConfirm}
                className="mt-1 text-xs font-medium text-muted underline hover:text-foreground"
              >
                or tap here to end
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-4 w-full rounded-lg bg-red-50 text-danger text-sm px-4 py-3 ring-1 ring-red-100">
          {error}
        </div>
      )}

      {/* Transcription failed, the recording is kept so it can be retried */}
      {phase === "transcribeError" && (
        <div className="mt-4 w-full rounded-2xl border border-border bg-surface p-5 shadow-sm text-center">
          <p className="text-foreground font-medium">
            Transcription didn&apos;t go through
          </p>
          <p className="text-sm text-muted mt-1 mb-4">
            Your recording is safe. No need to say it again, just try once more.
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

      {/* Numbered step indicator across the review flow */}
      {stepNum > 0 && (
        <div className="mt-4 w-full">
          <StepIndicator current={stepNum} />
        </div>
      )}

      {/* Transcript, editable while reviewing, read-only after summarizing */}
      {(phase === "transcript" ||
        phase === "summarizing" ||
        phase === "summarized") && (
        <div className="w-full">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Transcript of your memo
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

          {phase === "transcript" && (
            <div className="mt-3 rounded-xl border border-border bg-surface p-3 space-y-2">
              <input
                type="text"
                list="tt-customers"
                value={customerName}
                onChange={(e) => onCustomerName(e.target.value)}
                placeholder="Customer name"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <datalist id="tt-customers">
                {uniqueNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>

              {nameMatches.length > 1 && (
                <div className="rounded-lg bg-slate-50 p-2.5 text-xs">
                  <p className="text-muted mb-1.5">
                    A few customers named {customerName}. Which one?
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {nameMatches.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => pickMatch(c)}
                        className="tt-pop rounded-md bg-surface px-2.5 py-1 font-medium text-foreground ring-1 ring-border hover:bg-white"
                      >
                        {c.email || c.phone || "no contact info"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <input
                  type="tel"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <p className="text-[11px] text-muted">
                Saved to your customer list, so next time you just pick the name.
              </p>
            </div>
          )}

          {canSave && phase === "transcript" && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="tt-pop inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-foreground ring-1 ring-border hover:bg-slate-50">
                  📷 Add photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={addAttachment}
                    className="hidden"
                  />
                </label>
                <label className="tt-pop inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-foreground ring-1 ring-border hover:bg-slate-50">
                  📎 Add file
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={addAttachment}
                    className="hidden"
                  />
                </label>
                {uploading && (
                  <span className="text-xs text-brand">Uploading…</span>
                )}
              </div>
              <p className="mb-2 text-[11px] text-muted">
                Photos (model plate, damage, before/after) and files (receipt,
                permit) attach to this visit. Tap one to view it.
              </p>
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <div key={a.path} className="relative">
                      <button
                        type="button"
                        onClick={() => viewAttachment(a)}
                        aria-label={`View ${a.name}`}
                        className="tt-pop block"
                      >
                        {a.preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.preview}
                            alt={a.name}
                            className="h-16 w-16 rounded-lg object-cover ring-1 ring-border"
                          />
                        ) : (
                          <div className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg bg-slate-50 ring-1 ring-border">
                            <span className="text-2xl">📄</span>
                            <span className="max-w-full truncate px-1 text-[9px] text-muted">
                              {a.name}
                            </span>
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(a)}
                        aria-label="Remove attachment"
                        className="tt-pop absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs text-muted ring-1 ring-border shadow-sm hover:text-danger"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 1 actions */}
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            {phase === "transcript" && (
              <>
                <button
                  onClick={() => handleSummarize()}
                  disabled={!transcript.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-3.5 text-white font-semibold text-base shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
                >
                  ✨ Summarize with AI
                </button>
                <button
                  onClick={() => askDelete("transcript")}
                  className="inline-flex items-center gap-2 rounded-xl bg-surface px-8 py-3.5 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
                >
                  🗑 Delete
                </button>
              </>
            )}

            {phase === "summarizing" && (
              <div className="inline-flex items-center gap-2 text-brand text-sm font-medium">
                <LogoMark size={20} className="tt-pulse" />
                Writing it up…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {phase === "confirmDelete" && (
        <div className="mt-4 w-full rounded-2xl border border-border bg-surface p-5 shadow-sm text-center">
          <p className="text-foreground font-medium">Delete this note?</p>
          <p className="text-sm text-muted mt-1 mb-4">This can&apos;t be undone.</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                resetAll();
                setPhase("idle");
              }}
              className="tt-pop inline-flex items-center justify-center rounded-lg bg-danger px-8 py-2.5 text-white font-medium text-sm shadow-sm hover:opacity-90 transition"
            >
              Yes
            </button>
            <button
              onClick={() => setPhase(returnPhase)}
              className="tt-pop inline-flex items-center justify-center rounded-lg bg-surface px-8 py-2.5 text-foreground font-medium text-sm ring-1 ring-border hover:bg-slate-50 transition"
            >
              No
            </button>
          </div>
        </div>
      )}

      {/* AI summary + guided review (Steps 2-4) */}
      {phase === "summarized" && summary && (
        <div className="mt-4 w-full rounded-2xl border border-border bg-surface p-5 shadow-sm">
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
            title="Parts used"
            items={summary.partsAndMaterials}
            accent
          />

          {/* Customer requests: always shown; "None" when empty */}
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1.5">
              Customer requests
            </div>
            {summary.customerRequests.length ? (
              <ul className="space-y-1">
                {summary.customerRequests.map((item, i) => (
                  <li key={i} className="flex gap-2 text-[15px] text-foreground">
                    <span className="text-brand">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted">None</p>
            )}
          </div>

          <SummarySection
            title="Next steps & things to buy"
            items={summary.nextSteps}
          />

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

          {writingDone && (
            <div className="tt-fade-in">
              {/* Step 2: review, clarify, confirm */}
              {reviewStep === "confirm" && (
                <>
                  {questions.length > 0 && (
                    <div className="mt-5 border-t border-border pt-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-accent-600 mb-1">
                        A few things to confirm
                      </div>
                      <p className="text-xs text-muted mb-3">
                        Answer what you can so nothing gets missed, then update
                        the note.
                      </p>
                      <div className="space-y-3">
                        {questions.map((q, i) => (
                          <div key={i}>
                            <label className="block text-sm text-foreground mb-1">
                              {q}
                            </label>
                            <input
                              type="text"
                              value={answers[i] || ""}
                              onChange={(e) =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [i]: e.target.value,
                                }))
                              }
                              placeholder="Your answer"
                              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={submitAnswers}
                        disabled={!Object.values(answers).some((a) => a.trim())}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
                      >
                        ↻ Update the note
                      </button>
                    </div>
                  )}

                  <div className="mt-5 border-t border-border pt-5 text-center">
                    <p className="font-medium text-foreground">Look right?</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-3">
                      <button
                        onClick={() =>
                          setReviewStep(canSave ? "archive" : "send")
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-white font-semibold text-base shadow-sm hover:bg-brand-600 transition"
                      >
                        👍 Looks good
                      </button>
                      <button
                        onClick={tweakSummary}
                        className="inline-flex items-center gap-2 rounded-xl bg-surface px-6 py-3 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
                      >
                        ✏️ Tweak it
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Step 3: save, then choose to send or finish */}
              {reviewStep === "archive" && (
                <div className="mt-5 border-t border-border pt-5 text-center">
                  {archiveState !== "saved" ? (
                    <>
                      <p className="font-medium text-foreground mb-3">
                        Save this to your archive?
                      </p>
                      <div className="flex flex-wrap justify-center gap-3">
                        <button
                          onClick={handleArchive}
                          disabled={archiveState === "saving"}
                          className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-white font-semibold text-base shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
                        >
                          {archiveState === "saving"
                            ? "Saving…"
                            : "💾 Archive it"}
                        </button>
                        <button
                          onClick={() => setReviewStep("send")}
                          className="inline-flex items-center gap-2 rounded-xl bg-surface px-6 py-3 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
                        >
                          Skip
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-success mb-1">
                        ✓ Saved to your archive
                      </p>
                      <p className="font-medium text-foreground mb-3">
                        Send it to the customer now?
                      </p>
                      <div className="flex flex-wrap justify-center gap-3">
                        <button
                          onClick={() => setReviewStep("send")}
                          className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-white font-semibold text-base shadow-sm hover:bg-brand-600 transition"
                        >
                          ✉️ Send to customer
                        </button>
                        <button
                          onClick={() => {
                            resetAll();
                            setPhase("idle");
                          }}
                          className="inline-flex items-center gap-2 rounded-xl bg-surface px-6 py-3 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
                        >
                          Done for now
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 4: send to customer */}
              {reviewStep === "send" && (
                <div className="tt-fade-in">
                  {archiveState === "saved" && canSave && (
                    <p className="mt-4 text-center text-sm font-medium text-success">
                      ✓ Saved to your archive
                    </p>
                  )}
                  <SendToCustomer
                    summary={summary}
                    defaultReplyTo={replyTo}
                    defaultCustomerEmail={customerEmail}
                    defaultCustomerPhone={customerPhone}
                  />
                  <div className="mt-5 border-t border-border pt-4 text-center">
                    <button
                      onClick={() => {
                        resetAll();
                        setPhase("idle");
                      }}
                      className="tt-pop text-sm font-medium text-brand hover:underline"
                    >
                      ＋ Start a new note
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Image lightbox */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setViewing(null)}
        >
          <div className="relative max-h-[88vh] max-w-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewing.preview}
              alt={viewing.name}
              className="max-h-[88vh] w-auto rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setViewing(null)}
              aria-label="Close"
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-foreground shadow-md"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Attachment delete confirm */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-surface p-5 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-medium text-foreground">
              Delete this attachment?
            </p>
            <p className="mt-1 mb-4 truncate text-xs text-muted">
              {pendingDelete.name}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => {
                  removeAttachment(pendingDelete);
                  setPendingDelete(null);
                }}
                className="tt-pop rounded-lg bg-danger px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition"
              >
                Delete
              </button>
              <button
                onClick={() => setPendingDelete(null)}
                className="tt-pop rounded-lg bg-surface px-6 py-2.5 text-sm font-medium text-foreground ring-1 ring-border hover:bg-slate-50 transition"
              >
                Keep
              </button>
            </div>
          </div>
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
