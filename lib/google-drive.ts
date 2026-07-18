// Server-only helpers for the Google Drive backup: OAuth token exchange and a
// minimal Drive REST client (find/create folders, upload files). Uses the
// drive.file scope, so TekScribe can only see folders and files it created,
// never the rest of the tech's Drive.

export const isGoogleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const DRIVE_SCOPE =
  "openid email https://www.googleapis.com/auth/drive.file";
export const ROOT_FOLDER_NAME = "TekScribe Records";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** The exact origin of the incoming request, for the OAuth redirect URI
 *  (must match a URI registered in the Google Cloud console). */
export function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent", // always issue a refresh token
    state,
  });
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
};

export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  return (await res.json()) as TokenResponse;
}

/** Trade a stored refresh token for a short-lived access token.
 *  Returns { revoked: true } when the tech withdrew access on Google's side. */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken?: string; revoked?: boolean }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (data.access_token) return { accessToken: data.access_token };
  return { revoked: data.error === "invalid_grant" };
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
  } catch {
    // best effort
  }
}

/** The email inside a Google id_token (came straight from Google over TLS,
 *  so decoding without signature verification is fine here). */
export function emailFromIdToken(idToken: string | undefined): string {
  if (!idToken) return "";
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")
    );
    return typeof payload.email === "string" ? payload.email : "";
  } catch {
    return "";
  }
}

// --- Drive calls -----------------------------------------------------------

function escapeQ(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveList(
  accessToken: string,
  q: string
): Promise<{ id: string; name: string }[]> {
  const p = new URLSearchParams({
    q,
    fields: "files(id,name)",
    pageSize: "10",
    spaces: "drive",
  });
  const res = await fetch(`${FILES_URL}?${p}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
  const data = await res.json();
  return data.files ?? [];
}

/** Find a folder by name (optionally inside a parent), or create it. */
export async function ensureFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string> {
  const parentClause = parentId ? ` and '${escapeQ(parentId)}' in parents` : "";
  const found = await driveList(
    accessToken,
    `name = '${escapeQ(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false${parentClause}`
  );
  if (found[0]) return found[0].id;

  const res = await fetch(FILES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    }),
  });
  if (!res.ok) throw new Error(`Drive folder create failed (${res.status})`);
  return (await res.json()).id as string;
}

/** Find a file by exact name inside a folder; returns its id, or null. */
export async function findFileInFolder(
  accessToken: string,
  name: string,
  parentId: string
): Promise<string | null> {
  const found = await driveList(
    accessToken,
    `name = '${escapeQ(name)}' and '${escapeQ(parentId)}' in parents and trashed = false`
  );
  return found[0]?.id ?? null;
}

/** Replace the content of an existing Drive file, keeping its name and id. */
export async function updateFileContent(
  accessToken: string,
  fileId: string,
  mimeType: string,
  data: ArrayBuffer
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimeType,
      },
      body: Buffer.from(data),
    }
  );
  if (!res.ok) throw new Error(`Drive update failed (${res.status})`);
}

export async function uploadFile(
  accessToken: string,
  opts: { name: string; mimeType: string; parentId: string; data: ArrayBuffer }
): Promise<void> {
  const boundary = `tt${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: opts.name, parents: [opts.parentId] });
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
    "utf8"
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([head, Buffer.from(opts.data), tail]);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed (${res.status})`);
}
