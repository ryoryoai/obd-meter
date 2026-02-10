/**
 * OBD Meter app utility helpers.
 */

export function formatValue(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '';
  const d = Math.max(0, Math.min(20, Math.trunc(decimals)));
  return value.toFixed(d);
}

export function clamp(value: number, min: number, max: number): number {
  let lo = min;
  let hi = max;
  if (lo > hi) [lo, hi] = [hi, lo];
  return Math.min(hi, Math.max(lo, value));
}

export function hexToBytes(hex: string): number[] {
  const s = (hex ?? '')
    .trim()
    .replace(/^0x/i, '')
    .replace(/\s+/g, '');

  if (s.length === 0) return [];
  if (!/^[0-9a-fA-F]+$/.test(s)) throw new Error('hexToBytes: invalid hex string');

  const normalized = s.length % 2 === 0 ? s : `0${s}`;
  const out: number[] = [];
  for (let i = 0; i < normalized.length; i += 2) {
    out.push(parseInt(normalized.slice(i, i + 2), 16));
  }
  return out;
}

export function bytesToHex(bytes: number[]): string {
  return (bytes ?? [])
    .map((b) => (b & 0xff).toString(16).padStart(2, '0'))
    .join('');
}

export function delay(ms: number): Promise<void> {
  const t = Math.max(0, Math.trunc(ms));
  return new Promise((resolve) => setTimeout(resolve, t));
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
