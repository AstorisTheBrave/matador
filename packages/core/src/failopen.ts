/**
 * Run fn; if it throws, report via onError and swallow. Never rethrow into user
 * code (invariant I3: fail-open). Error reporting is itself guarded.
 */
export function safe<T>(fn: () => T, onError: () => void): T | undefined {
  try {
    return fn();
  } catch {
    try {
      onError();
    } catch {
      /* never let error reporting throw */
    }
    return undefined;
  }
}
