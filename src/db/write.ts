/** SQLite has one writer. Serialize local writes/transactions, keeping API requests outside the lock. */
const state = globalThis as unknown as { sqlite_write?: Promise<unknown> };

export function write_db<T>(operation: () => Promise<T>): Promise<T> {
  const result = (state.sqlite_write ?? Promise.resolve()).then(operation);
  state.sqlite_write = result.catch(() => undefined);
  return result;
}
