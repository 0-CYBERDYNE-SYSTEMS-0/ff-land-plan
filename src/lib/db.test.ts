import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('IndexedDB durable writes', () => {
  it('rejects when a write request succeeds but its transaction aborts', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = key === undefined
        ? originalPut.call(this, value)
        : originalPut.call(this, value, key);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });

    const { putRecord } = await import('@/lib/db');
    await expect(putRecord('runs', 'run-aborted', { id: 'run-aborted' }))
      .rejects.toThrow(/abort/i);
  });

  it('clears a matching IndexedDB failure only after a later transaction completes', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    const windowTarget = new EventTarget();
    vi.stubGlobal('window', windowTarget);
    const savedOperations: string[] = [];
    windowTarget.addEventListener('storage-saved', (event) => {
      savedOperations.push((event as CustomEvent<{ operation: string }>).detail.operation);
    });
    const originalPut = IDBObjectStore.prototype.put;
    let abortNextTransaction = true;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = key === undefined
        ? originalPut.call(this, value)
        : originalPut.call(this, value, key);
      if (abortNextTransaction) {
        abortNextTransaction = false;
        request.addEventListener('success', () => this.transaction.abort());
      }
      return request;
    });

    const db = await import('@/lib/db');
    await expect(db.putRecord('runs', 'run-retry', { id: 'run-retry' })).rejects.toThrow(/abort/i);
    expect(db.getLastStorageFailure()).toMatchObject({ operation: 'IndexedDB write' });
    expect(savedOperations).toEqual([]);

    await db.putRecord('runs', 'run-retry', { id: 'run-retry' });

    expect(savedOperations).toEqual(['IndexedDB write']);
    expect(db.getLastStorageFailure()).toBeNull();
  });
});
