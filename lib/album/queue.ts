export type QueuedPhoto = { id: string; albumId: string; guestId: string; file: File; createdAt: number };
function openQueue() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("aa-album-queue", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openQueue();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("files", mode);
      const request = operation(tx.objectStore("files"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("No pudimos guardar la foto en este dispositivo."));
    });
  } finally {
    db.close();
  }
}
export const queuePut = (item: QueuedPhoto) => transact("readwrite", (store) => store.put(item));
export const queueRemove = (id: string) => transact("readwrite", (store) => store.delete(id));
export async function queueList(albumId: string, guestId: string) {
  const files = await transact<QueuedPhoto[]>("readonly", (store) => store.getAll());
  return files
    .filter((item) => item.albumId === albumId && item.guestId === guestId)
    .sort((a, b) => a.createdAt - b.createdAt);
}
