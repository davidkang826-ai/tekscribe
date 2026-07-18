// Mirrors a saved note into the tech's Google Drive:
//   TekScribe Records / <Customer name - email or phone> /
//     Visit note <date> (<id>).txt   ← summary + transcript, updated in place
//     <photo/file attachments>       ← copied once, never duplicated
// Runs after the save response via next/server's after(), using the admin
// client (no request context needed). Strictly best-effort: any failure is
// logged and never blocks or breaks saving a note. On success it stamps
// drive_folder_id / drive_synced_at onto the note so the Archive can show a
// "View in Drive" link (tolerated when those columns don't exist yet).

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isGoogleConfigured,
  refreshAccessToken,
  ensureFolder,
  findFileInFolder,
  uploadFile,
  updateFileContent,
  ROOT_FOLDER_NAME,
} from "@/lib/google-drive";
import type { Attachment, JobSummary } from "@/lib/types";

type SyncInput = {
  transcript?: string;
  summary?: JobSummary | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  attachments?: Attachment[];
};

/** "Maria Alvarez - maria@example.com", falling back to phone, then name. */
export function clientFolderName(
  name?: string,
  email?: string,
  phone?: string
): string {
  const clean = (s?: string) => (s ?? "").replace(/[\\/]/g, "-").trim();
  const who = clean(name) || "No customer";
  const contact = clean(email) || clean(phone);
  return (contact ? `${who} - ${contact}` : who).slice(0, 120);
}

/** The note itself as a plain-text document, so the backup is complete even
 *  when a visit has no photos or files. */
function noteDocument(input: SyncInput): string {
  const s = input.summary;
  const lines: string[] = [];
  lines.push(s?.jobTitle || "Service visit");
  if (input.customerName) lines.push(`Customer: ${input.customerName}`);
  lines.push("");

  const section = (title: string, items?: string[]) => {
    if (!items?.length) return;
    lines.push(title.toUpperCase());
    for (const item of items) lines.push(`  • ${item}`);
    lines.push("");
  };
  section("Work done", s?.workDone);
  section("Parts & materials", s?.partsAndMaterials);
  section("Customer requests", s?.customerRequests);
  section("Next steps", s?.nextSteps);

  if (s?.customerMessage) {
    lines.push("CUSTOMER MESSAGE");
    lines.push(s.customerMessage);
    lines.push("");
  }
  if (input.transcript?.trim()) {
    lines.push("ORIGINAL TRANSCRIPT");
    lines.push(input.transcript.trim());
  }
  return lines.join("\n");
}

export async function syncNoteToDrive(
  userId: string,
  noteId: string | null,
  input: SyncInput
): Promise<void> {
  try {
    if (!isGoogleConfigured) return;

    const admin = createAdminClient();
    const { data: prof } = await admin
      .from("profiles")
      .select("google_refresh_token, google_drive_folder_id")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.google_refresh_token) return; // Drive not connected

    const { accessToken, revoked } = await refreshAccessToken(
      prof.google_refresh_token
    );
    if (!accessToken) {
      if (revoked) {
        // They withdrew access on Google's side; reflect that in Settings.
        await admin
          .from("profiles")
          .update({
            google_refresh_token: null,
            google_drive_email: null,
            google_drive_folder_id: null,
          })
          .eq("id", userId);
      }
      return;
    }

    // Root folder: reuse the stored one, or find/create and remember it.
    let rootId = prof.google_drive_folder_id as string | null;
    if (!rootId) {
      rootId = await ensureFolder(accessToken, ROOT_FOLDER_NAME);
      await admin
        .from("profiles")
        .update({ google_drive_folder_id: rootId })
        .eq("id", userId);
    }

    const folderId = await ensureFolder(
      accessToken,
      clientFolderName(
        input.customerName,
        input.customerEmail,
        input.customerPhone
      ),
      rootId
    );

    // The note document: created once per note, updated in place on re-saves
    // (the note id in the name keeps it stable and unique).
    if (noteId && input.transcript?.trim()) {
      try {
        const day = new Date().toISOString().slice(0, 10);
        const docName = `Visit note ${day} (${noteId.slice(0, 8)}).txt`;
        const body = new TextEncoder().encode(noteDocument(input))
          .buffer as ArrayBuffer;
        const existingId = await findFileInFolder(
          accessToken,
          docName,
          folderId
        );
        if (existingId) {
          await updateFileContent(accessToken, existingId, "text/plain", body);
        } else {
          await uploadFile(accessToken, {
            name: docName,
            mimeType: "text/plain",
            parentId: folderId,
            data: body,
          });
        }
      } catch (err) {
        console.error("[drive-sync] note doc", err);
      }
    }

    for (const att of input.attachments ?? []) {
      try {
        // The storage basename (timestamp-originalname) is unique and stable,
        // so re-saving a note never duplicates files in Drive.
        const driveName = att.path.split("/").pop() || att.name;
        if (await findFileInFolder(accessToken, driveName, folderId)) {
          continue;
        }
        const { data: blob } = await admin.storage
          .from("visit-media")
          .download(att.path);
        if (!blob) continue;
        await uploadFile(accessToken, {
          name: driveName,
          mimeType: att.type || "application/octet-stream",
          parentId: folderId,
          data: await blob.arrayBuffer(),
        });
      } catch (err) {
        console.error("[drive-sync] file", att.path, err);
      }
    }

    // Remember where this note landed so the Archive can link straight to the
    // customer's Drive folder. Tolerated if the columns don't exist yet.
    if (noteId) {
      try {
        await admin
          .from("voice_notes")
          .update({
            drive_folder_id: folderId,
            drive_synced_at: new Date().toISOString(),
          })
          .eq("id", noteId);
      } catch (err) {
        console.error("[drive-sync] status", err);
      }
    }
  } catch (err) {
    console.error("[drive-sync]", err);
  }
}
