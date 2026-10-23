"use client";

/**
 * Offline queue: persists the pending document text snapshot in IndexedDB
 * while the socket is down, so edits survive a tab crash or reload.
 *
 * Design note: we store the EDITED TEXT (snapshot), not raw OT ops.
 * Raw ops are pinned to the version they were based on; after a reload that
 * base is gone. A snapshot has no version coupling — the editor diffs it
 * against whatever text the server currently has and ships the delta as one
 * ordinary OT op through the normal pipeline.
 */

const DB_NAME = "synapse-offline";
const STORE = "snapshots";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface OfflineSnapshot {
  text: string;
  updatedAt: number;
}

/** Persist the current edited text for a document (best-effort). */
export async function saveOfflineSnapshot(docId: string, text: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ text, updatedAt: Date.now() } satisfies OfflineSnapshot, docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB unavailable (private mode etc.) — offline sync degrades to
    // in-memory only. Never block editing.
  }
}

/** Read the persisted snapshot for a document, or null. */
export async function loadOfflineSnapshot(docId: string): Promise<OfflineSnapshot | null> {
  try {
    const db = await openDb();
    const result = await new Promise<OfflineSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(docId);
      req.onsuccess = () => resolve((req.result as OfflineSnapshot) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

/** Remove the snapshot once its changes are synced. */
export async function clearOfflineSnapshot(docId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // nowhere to delete from; ignore.
  }
}
