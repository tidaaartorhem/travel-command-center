export const BAND_LABEL: Record<string, string> = {
  HIGH: 'High', ELEVATED: 'Elevated', LOW: 'Low', UNKNOWN: 'Unknown',
};

export function fmtKm(km: number | undefined): string {
  if (km == null) return '—';
  return `${Math.round(km).toLocaleString()} km`;
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
