// Mirrors a saved note's photos/files into the tech's Google Drive:
//   TekScribe Records / <Customer name - email or phone> / <file>
// Runs after the save response via next/server's after(), using the admin
// client (no request context needed). Strictly best-effort: any failure is
// logged and never blocks or breaks saving a note.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isGoogleConfigured,
  refreshAccessToken,
  ensureFolder,
  fileExistsInFolder,
  uploadFile,
  ROOT_FOLDER_NAME,
} from "@/lib/google-drive";
import type { Attachment } from "@/lib/types";

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

export async function syncNoteToDrive(
  userId: string,
  input: {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    attachments?: Attachment[];
  }
): Promise<void> {
  try {
    if (!isGoogleConfigured) return;
    const files = input.attachments ?? [];
    if (files.length === 0) return;

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

    for (const att of files) {
      try {
        // The storage basename (timestamp-originalname) is unique and stable,
        // so re-saving a note never duplicates files in Drive.
        const driveName = att.path.split("/").pop() || att.name;
        if (await fileExistsInFolder(accessToken, driveName, folderId)) {
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
  } catch (err) {
    console.error("[drive-sync]", err);
  }
}
