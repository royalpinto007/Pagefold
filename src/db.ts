import type { Article } from './types.js';

/**
 * IndexedDB rather than chrome.storage.local.
 *
 * chrome.storage.local is capped at about 10MB without the unlimitedStorage
 * permission. A single long article is tens of kilobytes of text, so that cap
 * is a few hundred articles: too low for an archive, and hitting it silently
 * loses saves. IndexedDB has no such cap and needs no extra permission, which
 * also keeps the store listing's permission list shorter.
 */
const DB_NAME = 'pagefold';
const DB_VERSION = 1;
const STORE = 'articles';

let cached: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (cached) return cached;
  cached = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        // Listing is ordered by save time far more often than by anything else.
        store.createIndex('savedAt', 'savedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return cached;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export function putArticle(article: Article): Promise<unknown> {
  return tx('readwrite', (store) => store.put(article));
}

export function getArticle(id: string): Promise<Article | undefined> {
  return tx<Article | undefined>('readonly', (store) => store.get(id));
}

export function allArticles(): Promise<Article[]> {
  return tx<Article[]>('readonly', (store) => store.getAll());
}

export function deleteArticle(id: string): Promise<unknown> {
  return tx('readwrite', (store) => store.delete(id));
}

export function clearAll(): Promise<unknown> {
  return tx('readwrite', (store) => store.clear());
}

/** Replace the whole archive in one transaction, so an import cannot half-apply. */
export async function replaceAll(articles: readonly Article[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    store.clear();
    for (const article of articles) store.put(article);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Roughly how much room the archive is using, for the settings line. */
export async function usageBytes(): Promise<number> {
  if (!navigator.storage?.estimate) return 0;
  const estimate = await navigator.storage.estimate();
  return estimate.usage ?? 0;
}
