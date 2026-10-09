import { describe, expect, it } from 'vitest';
import { fmtClock, fmtDate, fmtKm, pct } from './format';
import { parseItineraryCsv } from './upload';

describe('format helpers', () => {
  it('formats clocks in 12h time', () => {
    expect(fmtClock('07:55')).toBe('7:55 AM');
    expect(fmtClock('14:05')).toBe('2:05 PM');
  });
  it('formats ISO dates readably', () => {
    expect(fmtDate('2026-10-20')).toBe('Tue, Oct 20');
  });
  it('formats distances', () => {
    expect(fmtKm(2778.4)).toBe('2,778 km');
    expect(fmtKm(undefined)).toBe('—');
  });
  it('formats probabilities', () => {
    expect(pct(0.398)).toBe('40%');
  });
});

const CSV = `trip_id,trip_name,leg_no,flight,carrier,origin,dest,date,dep,arr,confirmation
t1,Test Trip,2,AA 2,aa,bos,ord,2026-10-20,09:00,10:30,X
t1,Test Trip,1,AA 1,aa,jfk,bos,2026-10-20,07:00,08:15,X`;

describe('parseItineraryCsv', () => {
  it('groups legs by trip and orders them', () => {
    const trips = parseItineraryCsv(CSV);
    expect(trips).toHaveLength(1);
    expect(trips[0].tripName).toBe('Test Trip');
    expect(trips[0].legs.map((l) => l.flight)).toEqual(['AA 1', 'AA 2']);
  });
  it('normalizes codes to uppercase', () => {
    const trips = parseItineraryCsv(CSV);
    expect(trips[0].legs[0].carrier).toBe('AA');
    expect(trips[0].legs[0].origin).toBe('JFK');
  });
  it('rejects a missing required column', () => {
    expect(() => parseItineraryCsv('trip_id,flight\nt1,AA 1')).toThrow(/missing required column/);
  });
  it('rejects a bad date', () => {
    expect(() => parseItineraryCsv(CSV.replace('2026-10-20', '10/20/2026'))).toThrow(/bad date/);
  });
});
