/**
 * Map an input string/number-like value to a stable integer in [min, max].
 *
 * - Numeric strings are mapped directly with modulo.
 * - Other strings use FNV-1a 32-bit hash for deterministic mapping.
 */
export function mapToStableRange(input: string, min: number, max: number): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
    throw new Error('Invalid range');
  }

  const range = max - min + 1;
  const normalized = input.trim();

  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    if (Number.isSafeInteger(numeric) && numeric > 0) {
      return min + (numeric % range);
    }
  }

  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return min + ((hash >>> 0) % range);
}

