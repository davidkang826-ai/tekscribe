// A tiny IndexedDB-backed queue for recordings that couldn't be transcribed
// because the tech was offline. The audio blob is kept on the device until it's
// been turned into a note, so a dead zone never loses a visit. Browser-only:
// every function touches indexedDB inside its body, so importing is SSR-safe.

const DB_NAME = "tekscribe";
const STORE = "pending-recordings";
const VERSION = 1;

export type PendingRecording = {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runWrite(
  db: IDBDatabase,
  fn: (store: IDBObjectStore) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    fn(t.objectStore(STORE));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function savePending(blob: Blob): Promise<string> {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(performance.now())}`;
  const rec: PendingRecording = {
    id,
    blob,
    mimeType: blob.type || "audio/webm",
    createdAt: Date.now(),
  };
  const db = await openDb();
  try {
    await runWrite(db, (store) => store.put(rec));
  } finally {
    db.close();
  }
  return id;
}

export async function listPending(): Promise<PendingRecording[]> {
  const db = await openDb();
  try {
    const all = await new Promise<PendingRecording[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as PendingRecording[]);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } finally {
    db.close();
  }
}

export async function deletePending(id: string): Promise<void> {
  const db = await openDb();
  try {
    await runWrite(db, (store) => store.delete(id));
  } finally {
    db.close();
  }
}

export async function countPending(): Promise<number> {
  const db = await openDb();
  try {
    return await new Promise<number>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
