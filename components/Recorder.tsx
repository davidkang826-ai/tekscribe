"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "./Logo";
import SendToCustomer from "./SendToCustomer";
import ScheduleNextVisit from "./ScheduleNextVisit";
import { saveNote, updateNote } from "@/lib/supabase/notes";
import { upsertCustomer } from "@/lib/supabase/customers";
import { contactsAvailable, pickContact } from "@/lib/contacts";
import { createClient } from "@/lib/supabase/client";
import type { JobSummary, Customer, Attachment } from "@/lib/types";
import {
  savePending,
  listPending,
  deletePending,
  countPending,
} from "@/lib/offline-queue";

// The big record button's mic. Same glyph as the tab bar, scaled up.
function MicGlyph({ size = 60 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11v1a6 6 0 0 0 12 0v-1" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8.5" y1="22" x2="15.5" y2="22" />
    </svg>
  );
}

type Phase =
  | "idle"
  | "recording"
  | "paused" // recording paused mid-visit; tap to resume, or hold to end
  | "transcribing"
  | "transcribeError" // transcription failed on the server; audio kept for retry
  | "offlineSaved" // no connection; recording queued on-device to finish later
  | "transcript" // Step 1: check the transcript, add media
  | "summarizing" // calling the AI
  | "summarized" // Steps 2-4: review the note, send, done
  | "confirmDelete";

// Steps within the "summarized" phase: review the note, send, offer to
// schedule the next visit, then done.
type ReviewStep = "confirm" | "send" | "schedule" | "done";

type Attach = Attachment & { preview?: string };

const STEP_LABELS = [
  "Check the transcript",
  "Review the note",
  "Send to customer",
  "Schedule next visit",
];

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
  techPhone = "",
}: {
  canSave?: boolean;
  customers?: Customer[];
  replyTo?: string;
  userId?: string;
  techName?: string;
  techPhone?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [reviewStep, setReviewStep] = useState<ReviewStep>("confirm");
  const [archiveState, setArchiveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [returnPhase, setReturnPhase] = useState<Phase>("summarized");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [nameMatches, setNameMatches] = useState<Customer[]>([]);
  // Native-only: offer to pull the client from the phone's address book.
  const [canUseContacts, setCanUseContacts] = useState(false);
  useEffect(() => setCanUseContacts(contactsAvailable()), []);

  async function fillFromContacts() {
    const c = await pickContact();
    if (!c) return;
    if (c.name) setCustomerName(c.name);
    if (c.phone) setCustomerPhone(c.phone);
    if (c.email) setCustomerEmail(c.email);
    if (c.address) setCustomerAddress(c.address);
    setNameMatches([]);
  }
  const [attachments, setAttachments] = useState<Attach[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<Attach | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Attach | null>(null);
  const [holding, setHolding] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [refreshingMsg, setRefreshingMsg] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  // "Forgot something?" voice additions on the review screen.
  const [detailRec, setDetailRec] = useState<"idle" | "recording" | "busy">(
    "idle"
  );
  // True once the tech hand-edits the customer message, so AI reruns leave it.
  const [messageDirty, setMessageDirty] = useState(false);
  const visitIdRef = useRef<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFiredRef = useRef(false);
  const audioUrlRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const editSnapshotRef = useRef<string>("");
  const detailRecRef = useRef<MediaRecorder | null>(null);
  const detailChunksRef = useRef<Blob[]>([]);
  const detailStreamRef = useRef<MediaStream | null>(null);
  const detailCancelledRef = useRef(false);
  const summaryLiveRef = useRef<JobSummary | null>(null);
  summaryLiveRef.current = summary;
  const messageDirtyRef = useRef(false);
  messageDirtyRef.current = messageDirty;

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const resetAll = () => {
    setTranscript("");
    setSummary(null);
    setNoteId(null);
    setError(null);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setCustomerAddress("");
    setNameMatches([]);
    setAttachments([]);
    setViewing(null);
    setPendingDelete(null);
    setHolding(false);
    setEndConfirm(false);
    setEditing(false);
    setRefreshingMsg(false);
    setMessageDirty(false);
    detailCancelledRef.current = true;
    try {
      if (detailRecRef.current && detailRecRef.current.state !== "inactive")
        detailRecRef.current.stop();
    } catch {
      // ignore
    }
    detailStreamRef.current?.getTracks().forEach((t) => t.stop());
    setDetailRec("idle");
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    setReviewStep("confirm");
    setArchiveState("idle");
    lastBlobRef.current = null;
  };

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Offline queue: surface any saved recordings and auto-finish them online.
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const goOnline = () => {
      setIsOnline(true);
      if (phaseRef.current === "idle" || phaseRef.current === "offlineSaved") {
        processNextPending();
      }
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    (async () => {
      try {
        const n = await countPending();
        setPendingCount(n);
        if (n > 0 && navigator.onLine && phaseRef.current === "idle") {
          processNextPending();
        }
      } catch {
        // IndexedDB unavailable; skip the queue entirely.
      }
    })();

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recall a saved customer. If several share the name, let them pick by email.
  function onCustomerName(value: string) {
    setCustomerName(value);
    const matches = customers.filter(
      (c) => c.name.trim().toLowerCase() === value.trim().toLowerCase()
    );
    if (matches.length === 1) {
      // Known customer: pull their saved contact so the tech doesn't retype it.
      setCustomerEmail(matches[0].email ?? "");
      setCustomerPhone(matches[0].phone ?? "");
      setCustomerAddress(matches[0].address ?? "");
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
    setCustomerAddress(c.address ?? "");
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
        await runTranscription(blob);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && (rec.state === "recording" || rec.state === "paused")) {
      setPhase("transcribing");
      rec.stop();
    }
  }, []);

  // --- Tap = pause/resume, press-and-hold 0.75s = end ----------------------
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
    }, 750);
  }

  function onRecordPointerEnd() {
    setHolding(false);
    clearHold();
  }

  function onRecordClick() {
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

  function setAudio(blob: Blob) {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    setAudioUrl(url);
  }

  async function refreshPending() {
    try {
      setPendingCount(await countPending());
    } catch {
      // IndexedDB unavailable; leave the count as-is.
    }
  }

  async function transcribeNetwork(blob: Blob): Promise<string> {
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const form = new FormData();
    form.append("audio", blob, `note.${ext}`);
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(
        (data as { error?: string }).error || "Transcription failed."
      ) as Error & { server?: boolean };
      e.server = true;
      throw e;
    }
    return (data as { text?: string }).text || "";
  }

  // Transcribe a recording, then land on the transcript step (no AI yet). If
  // the network is down, keep the audio in an on-device queue for later.
  async function runTranscription(blob: Blob, queueId?: string) {
    lastBlobRef.current = blob;
    setPhase("transcribing");
    try {
      const text = await transcribeNetwork(blob);
      setTranscript(text);
      setAudio(blob);
      if (queueId) {
        try {
          await deletePending(queueId);
        } catch {
          // ignore
        }
      }
      await refreshPending();
      setPhase("transcript");
    } catch (err) {
      const isServer = (err as { server?: boolean })?.server === true;
      const offline =
        !navigator.onLine || (!isServer && err instanceof TypeError);
      if (offline) {
        if (!queueId) {
          try {
            await savePending(blob);
          } catch {
            setError(
              "You appear to be offline, and this device can't save the recording. Try again when you have signal."
            );
            setPhase("transcribeError");
            return;
          }
        }
        setError(null);
        await refreshPending();
        setPhase("offlineSaved");
      } else {
        setError(err instanceof Error ? err.message : "Transcription failed.");
        setPhase("transcribeError");
      }
    }
  }

  async function processNextPending() {
    let items;
    try {
      items = await listPending();
    } catch {
      return;
    }
    if (!items.length) {
      await refreshPending();
      if (phaseRef.current === "offlineSaved") setPhase("idle");
      return;
    }
    await runTranscription(items[0].blob, items[0].id);
  }

  function retryTranscribe() {
    if (!lastBlobRef.current) return;
    setError(null);
    runTranscription(lastBlobRef.current);
  }

  async function summarizeText(text: string) {
    if (!text.trim()) {
      setError("Didn't catch anything. Try recording again.");
      setPhase("idle");
      return;
    }
    setError(null);
    setPhase("summarizing");
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, techName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Summarization failed.");
      const sum = data.summary as JobSummary;
      setSummary(sum);
      setEditing(false);
      setMessageDirty(false);
      setReviewStep("confirm");
      setPhase("summarized");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarization failed.");
      setPhase("transcript");
    }
  }

  // Go back to the transcript from the note; the summary is kept so returning
  // needs no new AI call.
  function toTranscript() {
    setEditing(false);
    setPhase("transcript");
  }

  // "Forgot something?": speak an addition on the review screen; the AI files
  // it into the right sections. A hand-edited customer message is preserved.
  async function processDetail(blob: Blob) {
    try {
      if (detailCancelledRef.current) return;
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `add.${ext}`);
      const tr = await fetch("/api/transcribe", { method: "POST", body: fd });
      const td = await tr.json();
      if (!tr.ok) throw new Error(td.error || "Could not transcribe.");
      const said = (td.text || "").trim();
      if (!said) {
        setError("Didn't catch that. Try again.");
        return;
      }
      const res = await fetch("/api/merge-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: summaryLiveRef.current,
          techName,
          text: said,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.summary)
        throw new Error(data.error || "Couldn't add that to the note.");
      if (detailCancelledRef.current) return;
      const merged = data.summary as JobSummary;
      if (messageDirtyRef.current && summaryLiveRef.current) {
        merged.customerMessage = summaryLiveRef.current.customerMessage;
      }
      setSummary(merged);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't add that to the note."
      );
    } finally {
      setDetailRec("idle");
    }
  }

  async function startDetailVoice() {
    setError(null);
    detailCancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      detailStreamRef.current = stream;
      const rec = new MediaRecorder(stream);
      detailChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) detailChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        detailStreamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(detailChunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        await processDetail(blob);
      };
      rec.start();
      detailRecRef.current = rec;
      setDetailRec("recording");
    } catch {
      setError(
        "Couldn't reach the microphone. Check permissions and try again."
      );
    }
  }

  function stopDetailVoice() {
    const rec = detailRecRef.current;
    if (rec && rec.state !== "inactive") {
      setDetailRec("busy");
      rec.stop();
    }
  }

  // After "Done editing": rewrite the customer message from the edits, unless
  // the tech hand-wrote the message (then their wording wins).
  async function maybeRefreshMessage(edited: JobSummary) {
    if (messageDirty) return;
    let before: JobSummary | null = null;
    try {
      before = JSON.parse(editSnapshotRef.current || "null");
    } catch {
      before = null;
    }
    if (!before) return;

    const sectionsOf = (s: JobSummary) =>
      JSON.stringify([
        s.jobTitle,
        s.workDone,
        s.partsAndMaterials,
        s.customerRequests,
        s.nextSteps,
      ]);
    if (sectionsOf(before) === sectionsOf(edited)) return;

    setRefreshingMsg(true);
    try {
      const res = await fetch("/api/rewrite-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: edited, techName }),
      });
      const data = await res.json();
      if (
        res.ok &&
        typeof data.customerMessage === "string" &&
        data.customerMessage.trim()
      ) {
        setSummary((s) =>
          s ? { ...s, customerMessage: data.customerMessage.trim() } : s
        );
      } else {
        setError(
          "Couldn't refresh the customer message, so it may not reflect your edits yet. You can edit it by hand."
        );
      }
    } catch {
      setError(
        "Couldn't refresh the customer message, so it may not reflect your edits yet. You can edit it by hand."
      );
    } finally {
      setRefreshingMsg(false);
    }
  }

  // "Looks good": archive the note, then move on to sending. Returning here
  // and continuing again updates the same note in place.
  async function saveAndContinue() {
    if (!canSave) {
      setReviewStep("send");
      return;
    }
    setArchiveState("saving");
    setError(null);
    const payload = {
      transcript,
      summary,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      attachments: attachments.map(({ path, name, type }) => ({
        path,
        name,
        type,
      })),
    };
    const result = noteId
      ? await updateNote(noteId, payload)
      : await saveNote(payload);
    if (result.error) {
      setError(result.error);
      setArchiveState(noteId ? "saved" : "idle");
      return;
    }
    setNoteId(result.id ?? noteId);
    setArchiveState("saved");
    setReviewStep("send");
    if (customerName.trim()) {
      upsertCustomer({
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        address: customerAddress,
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
    phase === "idle" || phase === "recording" || phase === "paused";

  const statusText: Record<string, string> = {
    idle: "30 seconds is plenty",
    recording: "Tap to pause · Hold to finish",
    paused: "Tap to resume · Hold to finish",
  };

  const stepNum =
    phase === "transcript"
      ? 1
      : phase === "summarized"
        ? reviewStep === "confirm"
          ? 2
          : reviewStep === "send"
            ? 3
            : reviewStep === "schedule"
              ? 4
              : 0
        : 0;

  // One button covers it: photos and files go through the same upload path.
  function mediaButtons() {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <label className="tt-pop inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-foreground ring-1 ring-border hover:bg-slate-50">
          📎 Upload Photo or File
          <input
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            onChange={addAttachment}
            className="hidden"
          />
        </label>
        {uploading && <span className="text-xs text-brand">Uploading…</span>}
      </div>
    );
  }

  function attachmentGrid() {
    if (attachments.length === 0) return null;
    return (
      <div className="mt-3 flex flex-wrap justify-center gap-2">
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
    );
  }

  const firstName = techName.trim().split(/\s+/)[0] || "";

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto">
      {/* The greeting belongs to the recording moment; once a note is in
          flight the flow's own steps take over the screen. */}
      {showButton && (
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {canSave && firstName ? `Hi ${firstName}.` : "Ready when you are."}
          </h1>
          <p className="mt-2 text-muted max-w-lg mx-auto">
            Tap the mic and tell me about your visit.
          </p>
        </div>
      )}

      {/* Recordings saved offline, waiting to be finished */}
      {pendingCount > 0 && phase === "idle" && (
        <div className="mb-6 w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
          <p className="text-sm font-medium text-amber-900">
            ⏳ {pendingCount} recording{pendingCount > 1 ? "s" : ""} saved on your
            phone
          </p>
          <p className="mt-0.5 text-xs text-amber-900/80">
            {isOnline
              ? "Ready to finish now."
              : "We'll finish the moment you're back online."}
          </p>
          {isOnline && (
            <button
              onClick={processNextPending}
              className="tt-pop mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 transition"
            >
              ▶ Finish {pendingCount > 1 ? "the next one" : "it"} now
            </button>
          )}
        </div>
      )}

      {showButton && (
        <>
          <button
            onClick={onRecordClick}
            onPointerDown={onRecordPointerDown}
            onPointerUp={onRecordPointerEnd}
            onPointerLeave={onRecordPointerEnd}
            onPointerCancel={onRecordPointerEnd}
            className="relative flex items-center justify-center w-44 h-44 rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 touch-none select-none"
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
                  stroke="var(--brand)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  className="tt-hold-arc"
                />
              </svg>
            )}
            <span
              className={`relative flex items-center justify-center w-36 h-36 rounded-full shadow-lg transition-colors ${
                isPaused
                  ? "bg-surface text-brand ring-2 ring-brand"
                  : "bg-brand text-white"
              } ${isRecording && !holding ? "tt-pulse" : ""} ${
                phase === "idle" ? "tt-idle-breathe" : ""
              }`}
            >
              <MicGlyph size={60} />
            </span>
          </button>

          <div className="mt-5 text-center">
            {isRecording || isPaused ? (
              <>
                <span className="font-mono text-lg tabular-nums text-brand">
                  {formatTime(elapsed)}
                </span>
                <div className="text-xs text-muted mt-0.5">
                  {holding ? "Keep holding to finish…" : statusText[phase]}
                </div>
              </>
            ) : (
              <span className="text-muted text-sm">{statusText[phase]}</span>
            )}
          </div>

          {endConfirm && (
            <div className="mt-4 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-sm text-center">
              <p className="text-foreground font-medium">End the recording?</p>
              <p className="text-sm text-muted mt-1 mb-4">
                We&apos;ll write it up. Keep talking if you&apos;re not done.
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
                  Keep recording
                </button>
              </div>
            </div>
          )}

          {/* Add photos/files (signed in), plus an end fallback for everyone */}
          {(isRecording || isPaused) && !endConfirm && (
            <div className="mt-4 flex flex-col items-center gap-2">
              {canSave && (
                <>
                  {mediaButtons()}
                  {attachments.length > 0 && (
                    <span className="text-xs text-muted">
                      {attachments.length} attached
                    </span>
                  )}
                </>
              )}
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

      {/* One combined progress screen: transcribe, then (later) summarize */}
      {(phase === "transcribing" || phase === "summarizing") && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <LogoMark size={64} className="tt-logo-load" />
          <p className="text-brand font-medium">
            {phase === "transcribing" ? "Listening back…" : "Writing it up…"}
          </p>
        </div>
      )}

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

      {phase === "offlineSaved" && (
        <div className="mt-4 w-full rounded-2xl border border-border bg-surface p-5 shadow-sm text-center">
          <div className="text-2xl mb-1">📴</div>
          <p className="text-foreground font-medium">Saved on your phone</p>
          <p className="text-sm text-muted mt-1 mb-4">
            {isOnline
              ? "Your recording is safe. Let's turn it into a note."
              : "You're offline, so we saved your recording here. We'll finish it automatically the moment you're back online. It's safe to close the app."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={processNextPending}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-white font-medium text-sm shadow-sm hover:bg-brand-600 transition"
            >
              {isOnline ? "▶ Finish it now" : "↻ Try now"}
            </button>
            <button
              onClick={() => {
                resetAll();
                setPhase("idle");
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-5 py-2.5 text-foreground font-medium text-sm ring-1 ring-border hover:bg-slate-50 transition"
            >
              Done for now
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

      {/* Step 1: check the transcript, add media, then write the summary */}
      {phase === "transcript" && (
        <div className="w-full">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            What you said
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-border bg-surface p-4 text-foreground text-[15px] leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {audioUrl && (
            <div className="mt-2">
              <audio src={audioUrl} controls className="w-full" />
            </div>
          )}

          {canSave && (
            <div className="mt-4">
              {mediaButtons()}
              <p className="mt-1.5 text-center text-[11px] text-muted">
                Add photos or files from the visit. Tap one to view.
              </p>
              {attachmentGrid()}
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => summarizeText(transcript)}
              disabled={!transcript.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-white font-semibold text-base shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
            >
              {summary ? "✨ Redo the summary" : "Looks good"}
            </button>
            {summary && (
              <button
                onClick={() => setPhase("summarized")}
                className="inline-flex items-center gap-2 rounded-xl bg-surface px-6 py-3.5 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
              >
                Back to the note
              </button>
            )}
            <button
              onClick={() => askDelete("transcript")}
              className="inline-flex items-center gap-2 rounded-xl bg-surface px-6 py-3.5 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
            >
              🗑 Delete
            </button>
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

      {/* Steps 2-4: review the note, send, done */}
      {phase === "summarized" && summary && (
        <div className="mt-2 w-full">
          {reviewStep === "done" ? (
            <div className="tt-fade-in rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
              <div className="text-4xl mb-2">🎉</div>
              <h3 className="text-xl font-bold text-foreground">
                Another job well done.
              </h3>
              <p className="mt-2 text-muted">
                It&apos;s written up, saved to your archive, and off your plate.
                Nice work.
              </p>
              <button
                onClick={() => {
                  resetAll();
                  setPhase("idle");
                }}
                className="tt-pop mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-white font-semibold text-base shadow-sm hover:bg-brand-600 transition"
              >
                ＋ Start a new note
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              {/* Client details lead the review: name, phone, email, address */}
              {reviewStep === "confirm" && !editing && (
                <div className="mb-4 rounded-xl bg-brand-50/60 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-brand">
                      Client
                    </div>
                    {canUseContacts && (
                      <button
                        type="button"
                        onClick={fillFromContacts}
                        className="tt-pop rounded-full bg-surface px-3 py-1 text-xs font-medium text-brand ring-1 ring-border hover:bg-white transition"
                      >
                        📇 From Contacts
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      list="tt-customers"
                      value={customerName}
                      onChange={(e) => onCustomerName(e.target.value)}
                      placeholder="Client name"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                    <datalist id="tt-customers">
                      {uniqueNames.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>

                    {nameMatches.length > 1 && (
                      <div className="rounded-lg bg-surface p-2.5 text-xs ring-1 ring-border">
                        <p className="text-muted mb-1.5">
                          A few named {customerName}. Which one?
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

                    <input
                      type="tel"
                      inputMode="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
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
                      type="text"
                      autoCapitalize="words"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="Address"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                    <p className="text-[11px] text-muted">
                      Saved with this client, so it fills in next time.
                    </p>
                  </div>
                </div>
              )}

              {reviewStep !== "send" && (
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent-600">
                    AI Summary
                  </span>
                  {reviewStep === "confirm" && editing && (
                    <button
                      onClick={() => {
                        const cleaned = cleanSummary(summary);
                        setSummary(cleaned);
                        setEditing(false);
                        maybeRefreshMessage(cleaned);
                      }}
                      className="tt-pop text-xs font-medium text-brand hover:underline"
                    >
                      ✓ Done editing
                    </button>
                  )}
                </div>
              )}

              {editing ? (
                <SummaryEditor
                  summary={summary}
                  onChange={setSummary}
                  techName={techName}
                  messageDirty={messageDirty}
                  onMessageManualEdit={() => setMessageDirty(true)}
                />
              ) : reviewStep === "send" ? // Step 3 is purely about sending; the note itself is edited on
              // step 2 (the back link below returns there).
              null : (
                <>
                  <h3 className="text-lg font-semibold text-foreground tt-fade-in">
                    {summary.jobTitle}
                  </h3>

                  <SummarySection title="Work done" items={summary.workDone} />
                  <SummarySection
                    title="Parts used"
                    items={summary.partsAndMaterials}
                    accent
                  />

                  <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1.5">
                      Customer requests
                    </div>
                    {summary.customerRequests.length ? (
                      <ul className="space-y-1">
                        {summary.customerRequests.map((item, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-[15px] text-foreground"
                          >
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

                </>
              )}

              {!editing && (
                <div className="tt-fade-in">
                  {/* Step 2: review, add anything missed, confirm */}
                  {reviewStep === "confirm" && (
                    <>
                      {/* Forgot something? Say it or type it — side by side
                          so both ways to fix the note are equally obvious. */}
                      <div className="mt-5 flex flex-col items-center gap-1.5 border-t border-border pt-5">
                        <p className="text-sm font-medium text-foreground">
                          Forgot something? Add or fix it:
                        </p>
                        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={
                              detailRec === "recording"
                                ? stopDetailVoice
                                : startDetailVoice
                            }
                            disabled={detailRec === "busy"}
                            className={`tt-pop inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
                              detailRec === "recording"
                                ? "bg-danger text-white ring-danger"
                                : "bg-surface text-brand ring-border hover:bg-brand-50 disabled:opacity-60"
                            }`}
                          >
                            {detailRec === "recording" ? (
                              <>
                                <span className="inline-block h-2 w-2 rounded-full bg-white tt-pulse" />
                                Stop &amp; add it
                              </>
                            ) : detailRec === "busy" ? (
                              "Adding it in…"
                            ) : (
                              "🎙 Say it"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              editSnapshotRef.current = JSON.stringify(summary);
                              setEditing(true);
                            }}
                            disabled={detailRec !== "idle"}
                            className="tt-pop inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm font-medium text-brand ring-1 ring-border hover:bg-brand-50 disabled:opacity-60 transition"
                          >
                            ✏️ Type it
                          </button>
                        </div>
                        <p className="text-[11px] text-muted">
                          Parts, customer requests, next steps, any detail. We
                          file each in the right spot.
                        </p>
                      </div>

                      {/* Step 2 actions */}
                      <div className="mt-5 border-t border-border pt-5 text-center">
                        <p className="font-medium text-foreground mb-3">
                          Look right?
                        </p>
                        <div className="flex flex-wrap justify-center gap-3">
                          <button
                            onClick={saveAndContinue}
                            disabled={
                              refreshingMsg ||
                              archiveState === "saving" ||
                              detailRec !== "idle"
                            }
                            className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-white font-semibold text-base shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
                          >
                            {archiveState === "saving"
                              ? "Saving…"
                              : refreshingMsg
                                ? "Updating…"
                                : "Looks good"}
                          </button>
                          <button
                            onClick={() => askDelete("summarized")}
                            className="inline-flex items-center gap-2 rounded-xl bg-surface px-6 py-3 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
                          >
                            🗑 Delete
                          </button>
                        </div>
                        <button
                          onClick={toTranscript}
                          className="mt-3 text-xs font-medium text-muted hover:text-foreground transition-colors"
                        >
                          Fix the transcript
                        </button>
                      </div>
                    </>
                  )}

                  {/* Step 3: send to customer */}
                  {reviewStep === "send" && (
                    <div className="tt-fade-in">
                      <div className="mt-4">
                        <button
                          onClick={() => setReviewStep("confirm")}
                          className="tt-pop text-xs font-medium text-muted hover:text-foreground transition-colors"
                        >
                          Back to the note
                        </button>
                      </div>
                      {archiveState === "saved" && canSave && (
                        <p className="mt-2 text-center text-sm font-medium text-success">
                          ✓ Saved to your archive
                        </p>
                      )}
                      <SendToCustomer
                        summary={summary}
                        defaultReplyTo={replyTo}
                        defaultCustomerEmail={customerEmail}
                        defaultCustomerPhone={customerPhone}
                        techName={techName}
                        techPhone={techPhone}
                      />
                      <div className="mt-5 border-t border-border pt-4 text-center">
                        <button
                          onClick={() => setReviewStep("schedule")}
                          className="tt-pop inline-flex items-center gap-2 rounded-xl bg-surface px-6 py-3 text-foreground font-semibold text-base ring-1 ring-border hover:bg-slate-50 transition"
                        >
                          I&apos;m done
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 4: offer to put the next visit on the calendar */}
                  {reviewStep === "schedule" && (
                    <ScheduleNextVisit
                      customerName={customerName}
                      jobTitle={summary.jobTitle}
                      nextSteps={summary.nextSteps}
                      noteId={noteId}
                      onDone={() => setReviewStep("done")}
                    />
                  )}
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

type ListKey = "workDone" | "partsAndMaterials" | "customerRequests" | "nextSteps";

/** Trim edited fields and drop blank bullet lines before saving/sending. */
function cleanSummary(s: JobSummary): JobSummary {
  const clean = (arr: string[]) => arr.map((x) => x.trim()).filter(Boolean);
  return {
    ...s,
    jobTitle: s.jobTitle.trim() || "Service visit",
    workDone: clean(s.workDone),
    partsAndMaterials: clean(s.partsAndMaterials),
    nextSteps: clean(s.nextSteps),
    customerRequests: clean(s.customerRequests),
    customerMessage: s.customerMessage.trim(),
  };
}

/** Tap-to-fix editor for the whole summary: title, every bullet, the message.
 *  One "add what's missing" box (typed or spoken) files new facts into the
 *  right section. Hand-typed content is never removed by the AI on a rerun. */
function SummaryEditor({
  summary,
  onChange,
  techName = "",
  messageDirty = false,
  onMessageManualEdit,
}: {
  summary: JobSummary;
  onChange: (s: JobSummary) => void;
  techName?: string;
  messageDirty?: boolean;
  onMessageManualEdit?: () => void;
}) {
  const fields: [ListKey, string][] = [
    ["workDone", "Work done"],
    ["partsAndMaterials", "Parts used"],
    ["customerRequests", "Customer requests"],
    ["nextSteps", "Next steps & things to buy"],
  ];
  const setList = (key: ListKey, list: string[]) =>
    onChange({ ...summary, [key]: list });

  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const dirtyRef = useRef(messageDirty);
  dirtyRef.current = messageDirty;

  const [addText, setAddText] = useState("");
  const [addRec, setAddRec] = useState<"idle" | "recording" | "busy">("idle");
  const [addError, setAddError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      try {
        if (recRef.current && recRef.current.state !== "inactive")
          recRef.current.stop();
      } catch {
        // ignore
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function mergeIn(text: string) {
    setAddRec("busy");
    setAddError(null);
    try {
      const res = await fetch("/api/merge-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: summaryRef.current,
          techName,
          text,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.summary)
        throw new Error(data.error || "Couldn't add that to the note.");
      const merged = data.summary as JobSummary;
      // Never overwrite a message the tech wrote by hand.
      if (dirtyRef.current) merged.customerMessage = summaryRef.current.customerMessage;
      onChange(merged);
      setAddText("");
    } catch (e) {
      setAddError(
        e instanceof Error ? e.message : "Something went wrong adding that."
      );
    } finally {
      setAddRec("idle");
    }
  }

  async function processVoice(blob: Blob) {
    try {
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const fd = new FormData();
      fd.append("audio", blob, `add.${ext}`);
      const tr = await fetch("/api/transcribe", { method: "POST", body: fd });
      const td = await tr.json();
      if (!tr.ok) throw new Error(td.error || "Could not transcribe.");
      const said = (td.text || "").trim();
      if (!said) {
        setAddError("Didn't catch that. Try again.");
        setAddRec("idle");
        return;
      }
      await mergeIn(said);
    } catch (e) {
      setAddError(
        e instanceof Error ? e.message : "Something went wrong adding that."
      );
      setAddRec("idle");
    }
  }

  async function startVoice() {
    setAddError(null);
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
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        await processVoice(blob);
      };
      rec.start();
      recRef.current = rec;
      setAddRec("recording");
    } catch {
      setAddError(
        "Couldn't reach the microphone. Check permissions and try again."
      );
    }
  }

  function stopVoice() {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      setAddRec("busy");
      rec.stop();
    }
  }

  return (
    <div className="mt-2 space-y-4">
      {/* First thing they see: just say or type what's missing and the AI
          files it — hunting for the right section by hand is the fallback. */}
      <div className="rounded-xl border border-dashed border-brand/40 bg-brand-50/50 p-3">
        <p className="text-sm font-semibold text-foreground">
          Add what&apos;s missing
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          Say or type it in one go: work done, parts used, customer requests,
          next steps. We file each in the right spot.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && addText.trim() && addRec === "idle")
                mergeIn(addText.trim());
            }}
            placeholder="Type what's missing…"
            disabled={addRec !== "idle"}
            className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => addText.trim() && mergeIn(addText.trim())}
            disabled={!addText.trim() || addRec !== "idle"}
            className="tt-pop shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-60 transition"
          >
            Add
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={addRec === "recording" ? stopVoice : startVoice}
            disabled={addRec === "busy"}
            className={`tt-pop inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
              addRec === "recording"
                ? "bg-danger text-white ring-danger"
                : "bg-surface text-brand ring-border hover:bg-white disabled:opacity-60"
            }`}
          >
            {addRec === "recording" ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-white tt-pulse" />
                Stop &amp; add
              </>
            ) : addRec === "busy" ? (
              "Adding it in…"
            ) : (
              "🎙 Or say it instead"
            )}
          </button>
          {addRec === "recording" && (
            <span className="text-xs text-danger">Listening…</span>
          )}
        </div>
        {addError && <p className="mt-1.5 text-xs text-danger">{addError}</p>}
      </div>

      <p className="text-xs text-muted">
        ✏️ Or tap any line below to fix it, ✕ to remove it. Anything you type
        stays put.
      </p>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
          Title
        </label>
        <input
          value={summary.jobTitle}
          onChange={(e) => onChange({ ...summary, jobTitle: e.target.value })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      {fields.map(([key, label]) => (
        <div key={key}>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
            {label}
          </label>
          <div className="space-y-2">
            {summary[key].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={item}
                  onChange={(e) =>
                    setList(
                      key,
                      summary[key].map((b, idx) =>
                        idx === i ? e.target.value : b
                      )
                    )
                  }
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <button
                  type="button"
                  onClick={() =>
                    setList(
                      key,
                      summary[key].filter((_, idx) => idx !== i)
                    )
                  }
                  aria-label="Remove line"
                  className="tt-pop flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted ring-1 ring-border hover:text-danger"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setList(key, [...summary[key], ""])}
              className="tt-pop text-xs font-medium text-brand hover:underline"
            >
              ✏️ Add by typing
            </button>
          </div>
        </div>
      ))}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
          Customer message
        </label>
        <textarea
          value={summary.customerMessage}
          onChange={(e) => {
            onChange({ ...summary, customerMessage: e.target.value });
            onMessageManualEdit?.();
          }}
          rows={4}
          className="w-full rounded-lg border border-border bg-surface p-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
    </div>
  );
}
