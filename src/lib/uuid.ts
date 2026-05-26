/**
 * Generate a v4 UUID in uppercase hex.
 *
 * Prefers crypto.randomUUID() (cryptographically secure, broadly available since
 * Safari 15.4 / Chrome 92 / Firefox 95). Falls back to a Math.random()-based
 * generator on older runtimes — matches the legacy v2 behavior exactly.
 */
export function generateRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().toUpperCase();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}
