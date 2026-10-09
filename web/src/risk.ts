// Client-side risk engine: the same deterministic rules as services/risk.py,
// applied to itineraries the traveler uploads in the browser. Route statistics
// come from the bundled BTS-derived route table; no network, no LLM.
import type { Connection, RiskBand, RouteStats, ScoredLeg, TripAlert } from './types';

export const MEGA_HUBS = new Set([
  'ATL', 'DFW', 'ORD', 'DEN', 'LAX', 'JFK', 'EWR', 'SFO', 'MIA', 'CLT', 'PHX', 'IAH', 'SEA',
]);

export function minimumConnectionTime(airport: string): number {
  return MEGA_HUBS.has(airport.toUpperCase()) ? 60 : 45;
}

export function disruptionBand(stats: RouteStats | null): RiskBand {
  if (!stats || stats.flights < 30) return 'UNKNOWN';
  let score = 0;
  if (stats.cancelled_pct >= 2.0) score += 2;
  else if (stats.cancelled_pct >= 1.0) score += 1;
  if (stats.on_time_pct < 70) score += 2;
  else if (stats.on_time_pct < 80) score += 1;
  if (stats.avg_arr_delay_min >= 25) score += 1;
  if (stats.avg_arr_delay_min >= 40) score += 1;
  if (score >= 4) return 'HIGH';
  if (score >= 2) return 'ELEVATED';
  return 'LOW';
}

export function minutesBetween(dep: string, arr: string): number {
  const dh = parseInt(dep.slice(0, 2), 10);
  const dm = parseInt(dep.slice(3), 10);
  const ah = parseInt(arr.slice(0, 2), 10);
  const am = parseInt(arr.slice(3), 10);
  let d = ah * 60 + am - (dh * 60 + dm);
  if (d <= 0) d += 24 * 60;
  return d;
}

export function misconnectProbability(
  layoverMin: number,
  mctMin: number,
  inbound: RouteStats | null,
): number {
  if (!inbound || inbound.flights < 30) return -1;
  if (layoverMin < mctMin) return 1;
  const lateShare = Math.max(0, 1 - inbound.on_time_pct / 100);
  const badDelay = Math.max(45, inbound.avg_arr_delay_min * 2.2);
  const residual = layoverMin - badDelay;
  if (residual >= mctMin + 15) return round3(lateShare * 0.15);
  if (residual >= mctMin) return round3(lateShare * 0.45);
  return round3(Math.min(0.95, lateShare * 0.9 + 0.1));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function misconnectBand(prob: number): RiskBand {
  if (prob < 0) return 'UNKNOWN';
  if (prob >= 0.35) return 'HIGH';
  if (prob >= 0.15) return 'ELEVATED';
  return 'LOW';
}

const SEVERITY: Record<RiskBand, number> = { HIGH: 0, ELEVATED: 1, LOW: 2, UNKNOWN: 3 };

export interface UploadLeg {
  flight: string;
  carrier: string;
  origin: string;
  dest: string;
  date: string;
  dep: string;
  arr: string;
}

export interface UploadedTripResult {
  name: string;
  legs: ScoredLeg[];
  connections: Connection[];
  alerts: TripAlert[];
  tripBand: RiskBand;
}

export function scoreUploadedTrip(
  name: string,
  legs: UploadLeg[],
  routes: Map<string, RouteStats>,
): UploadedTripResult {
  const scored: ScoredLeg[] = legs.map((l) => {
    const stats = routes.get(`${l.carrier}|${l.origin}|${l.dest}`) ?? null;
    const band = disruptionBand(stats);
    return {
      flight: l.flight, carrier: l.carrier, origin: l.origin, dest: l.dest,
      route: `${l.origin}-${l.dest}`, date: l.date, dep: l.dep, arr: l.arr,
      confirmation: '', band, stats,
    };
  });

  const connections: Connection[] = [];
  for (let i = 0; i < legs.length - 1; i++) {
    const prev = scored[i];
    const next = scored[i + 1];
    const minutes = minutesBetween(prev.arr, next.dep);
    const mct = minimumConnectionTime(prev.dest);
    const prob = misconnectProbability(minutes, mct, prev.stats);
    const band = misconnectBand(prob);
    connections.push({
      airport: prev.dest, from_flight: prev.flight, to_flight: next.flight,
      layover_min: minutes, mct_min: mct,
      misconnect_prob: prob >= 0 ? prob : null, band,
      tight: minutes < mct, short: minutes < mct + 15,
    });
  }

  const alerts: TripAlert[] = [];
  for (const l of scored) {
    if (l.band === 'HIGH' || l.band === 'ELEVATED') {
      const s = l.stats!;
      alerts.push({
        severity: l.band,
        text: `${l.flight} ${l.route}: disruption risk ${l.band} — on-time ${s.on_time_pct}%, avg delay ${s.avg_arr_delay_min} min, cancelled ${s.cancelled_pct}%.`,
      });
    } else if (l.band === 'UNKNOWN') {
      alerts.push({ severity: 'LOW', text: `${l.flight} ${l.route}: no recent BTS observations — risk not scored.` });
    }
  }
  for (const c of connections) {
    if (c.tight) {
      alerts.push({
        severity: 'HIGH',
        text: `${c.airport}: ${c.layover_min} min layover ${c.from_flight} → ${c.to_flight} is under the ${c.mct_min} min minimum connection time.`,
      });
    } else if (c.band === 'HIGH' || c.band === 'ELEVATED') {
      alerts.push({
        severity: c.band,
        text: `${c.airport}: ${c.layover_min} min layover ${c.from_flight} → ${c.to_flight} — estimated misconnect probability ${Math.round((c.misconnect_prob ?? 0) * 100)}%.`,
      });
    }
  }
  alerts.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]);

  const bands = [...scored.map((l) => l.band), ...connections.map((c) => c.band)];
  const tripBand = bands.reduce<RiskBand>(
    (worst, b) => (SEVERITY[b] < SEVERITY[worst] ? b : worst),
    bands[0] ?? 'UNKNOWN',
  );

  return { name, legs: scored, connections, alerts, tripBand };
}
