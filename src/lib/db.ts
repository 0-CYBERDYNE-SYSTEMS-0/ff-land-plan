export type DbStore = 'runs' | 'seasons' | 'ensembles' | 'observations' | 'calibrations';

export interface StorageFailureDetail {
  operation: string;
  message: string;
}

const DB_NAME = 'ff-pro-data';
const DB_VERSION = 3;
const STORE_NAMES: DbStore[] = ['runs', 'seasons', 'ensembles', 'observations', 'calibrations'];

let databasePromise: Promise<IDBDatabase> | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function dispatchStorageFailed(operation: string, error: unknown): void {
  if (typeof window === 'undefined') return;
  const detail: StorageFailureDetail = { operation, message: errorMessage(error) };
  window.dispatchEvent(new CustomEvent<StorageFailureDetail>('storage-failed', { detail }));
}

function database(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        databasePromise = null;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open IndexedDB.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('IndexedDB upgrade is blocked by another open tab.'));
    };
  });
  return databasePromise;
}

async function withStore<T>(
  name: DbStore,
  mode: IDBTransactionMode,
  operation: string,
  requestFor: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  try {
    const db = await database();
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(name, mode);
      let result: T;
      let request: IDBRequest<T>;
      try {
        request = requestFor(transaction.objectStore(name));
      } catch (error) {
        transaction.abort();
        reject(error);
        return;
      }
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error(`IndexedDB ${operation} failed.`));
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error(`IndexedDB ${operation} was aborted.`));
    });
  } catch (error) {
    dispatchStorageFailed(`IndexedDB ${operation}`, error);
    throw error;
  }
}

export function getRecord<T>(name: DbStore, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T | undefined>(name, 'readonly', 'read', (store) => store.get(key));
}

export function getAllRecords<T>(name: DbStore): Promise<T[]> {
  return withStore<T[]>(name, 'readonly', 'read', (store) => store.getAll());
}

export function putRecord<T>(name: DbStore, key: IDBValidKey, value: T): Promise<void> {
  return withStore(name, 'readwrite', 'write', (store) => store.put(value, key)).then(() => undefined);
}

/** Insert only when absent so an interrupted legacy migration never overwrites a newer run. */
export async function putRecordIfAbsent<T>(name: DbStore, key: IDBValidKey, value: T): Promise<boolean> {
  try {
    const db = await database();
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(name, 'readwrite');
      const store = transaction.objectStore(name);
      let inserted = false;
      const read = store.get(key);
      read.onsuccess = () => {
        if (read.result === undefined) {
          inserted = true;
          store.put(value, key);
        }
      };
      transaction.oncomplete = () => resolve(inserted);
      transaction.onerror = () => reject(transaction.error ?? read.error ?? new Error('IndexedDB migration write failed.'));
      transaction.onabort = () => reject(transaction.error ?? read.error ?? new Error('IndexedDB migration write was aborted.'));
    });
  } catch (error) {
    dispatchStorageFailed(`IndexedDB migrate ${name}`, error);
    throw error;
  }
}

export function deleteRecord(name: DbStore, key: IDBValidKey): Promise<void> {
  return withStore(name, 'readwrite', 'delete', (store) => store.delete(key)).then(() => undefined);
}

export function clearRecords(name: DbStore): Promise<void> {
  return withStore(name, 'readwrite', 'clear', (store) => store.clear()).then(() => undefined);
}
