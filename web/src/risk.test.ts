import { describe, expect, it } from 'vitest';
import {
  disruptionBand, minimumConnectionTime, minutesBetween,
  misconnectBand, misconnectProbability, scoreUploadedTrip,
} from './risk';
import type { RouteStats } from './types';

const high: RouteStats = { carrier: 'AA', origin: 'ORD', dest: 'LAX', flights: 306, on_time_pct: 64.0, avg_arr_delay_min: 28.4, cancelled_pct: 2.61 };
const low: RouteStats = { carrier: 'UA', origin: 'ORD', dest: 'LAX', flights: 328, on_time_pct: 79.9, avg_arr_delay_min: 6.6, cancelled_pct: 1.52 };

describe('disruptionBand', () => {
  it('matches the Python engine bands on real route stats', () => {
    expect(disruptionBand(high)).toBe('HIGH');
    expect(disruptionBand(low)).toBe('ELEVATED');
  });
  it('returns UNKNOWN without data or thin samples', () => {
    expect(disruptionBand(null)).toBe('UNKNOWN');
    expect(disruptionBand({ ...high, flights: 5 })).toBe('UNKNOWN');
  });
  it('is LOW for a reliable route', () => {
    expect(disruptionBand({ ...low, on_time_pct: 88, cancelled_pct: 0.3, avg_arr_delay_min: 5 })).toBe('LOW');
  });
});

describe('minimumConnectionTime', () => {
  it('gives mega-hubs 60 and others 45', () => {
    expect(minimumConnectionTime('ORD')).toBe(60);
    expect(minimumConnectionTime('BOS')).toBe(45);
  });
});

describe('minutesBetween', () => {
  it('handles overnight layovers', () => {
    expect(minutesBetween('23:40', '00:55')).toBe(75);
    expect(minutesBetween('09:10', '09:55')).toBe(45);
  });
});

describe('misconnectProbability', () => {
  it('is certain for an illegal connection', () => {
    expect(misconnectProbability(30, 45, low)).toBe(1);
  });
  it('is low for generous layovers', () => {
    const p = misconnectProbability(240, 45, low);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(0.15);
  });
  it('is high for a tight layover after a bad route', () => {
    const p = misconnectProbability(50, 45, high);
    expect(p).toBeGreaterThanOrEqual(0.35);
  });
  it('is deterministic', () => {
    expect(misconnectProbability(70, 45, high)).toBe(misconnectProbability(70, 45, high));
  });
  it('returns -1 without data and maps to UNKNOWN', () => {
    expect(misconnectBand(misconnectProbability(90, 45, null))).toBe('UNKNOWN');
  });
});

describe('scoreUploadedTrip', () => {
  const routes = new Map<string, RouteStats>([
    ['UA|BOS|ORD', { carrier: 'UA', origin: 'BOS', dest: 'ORD', flights: 303, on_time_pct: 74.6, avg_arr_delay_min: 21.9, cancelled_pct: 2.31 }],
    ['AA|ORD|LAX', high],
  ]);
  it('scores legs, flags the tight ORD connection, and surfaces alerts', () => {
    const res = scoreUploadedTrip('Test trip', [
      { flight: 'UA 1522', carrier: 'UA', origin: 'BOS', dest: 'ORD', date: '2026-10-20', dep: '07:00', arr: '08:45' },
      { flight: 'AA 1254', carrier: 'AA', origin: 'ORD', dest: 'LAX', date: '2026-10-20', dep: '09:30', arr: '11:40' },
    ], routes);
    expect(res.legs.map((l) => l.band)).toEqual(['ELEVATED', 'HIGH']);
    expect(res.connections[0].tight).toBe(true);
    expect(res.tripBand).toBe('HIGH');
    expect(res.alerts.length).toBeGreaterThanOrEqual(3);
    expect(res.alerts[0].severity).toBe('HIGH');
  });
  it('handles a direct flight with no connections', () => {
    const res = scoreUploadedTrip('Direct', [
      { flight: 'AS 402', carrier: 'AS', origin: 'SEA', dest: 'SFO', date: '2026-10-22', dep: '06:30', arr: '08:45' },
    ], routes);
    expect(res.connections).toEqual([]);
    expect(res.legs[0].band).toBe('UNKNOWN');
    expect(res.alerts.some((a) => a.text.includes('no recent BTS'))).toBe(true);
  });
});
