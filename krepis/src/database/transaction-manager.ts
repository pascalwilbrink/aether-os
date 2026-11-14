/**
 * Runs work atomically. Repositories that support it join the active
 * transaction automatically, so callers don't pass a handle around.
 */
export abstract class TransactionManager {
  abstract run<T>(work: () => Promise<T>): Promise<T>;
}
