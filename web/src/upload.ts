// Itinerary CSV parser for the upload panel. Same schema as services/ingest.py:
// trip_id,trip_name,leg_no,flight,carrier,origin,dest,date,dep,arr,confirmation
// Date/time formats are normalized; invalid rows raise with a readable message.
import type { UploadLeg } from './risk';

export interface ParsedItinerary {
  tripName: string;
  legs: UploadLeg[];
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ''));
}

function normDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`bad date "${s}" — expected YYYY-MM-DD`);
  return s.trim();
}

function normTime(s: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`bad time "${s}" — expected HH:MM`);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function parseItineraryCsv(text: string): ParsedItinerary[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV needs a header row and at least one leg row.');
  const header = splitLine(lines[0]);
  const required = ['trip_id', 'flight', 'carrier', 'origin', 'dest', 'date', 'dep', 'arr'];
  for (const c of required) {
    if (!header.includes(c)) throw new Error(`missing required column "${c}"`);
  }
  const idx = (c: string) => header.indexOf(c);
  const rows = lines.slice(1).map(splitLine);
  const byTrip = new Map<string, { name: string; legs: Array<{ leg: UploadLeg; legNo: number }> }>();
  for (const r of rows) {
    const tid = r[idx('trip_id')];
    if (!tid) throw new Error('every row needs a trip_id');
    if (!byTrip.has(tid)) byTrip.set(tid, { name: r[idx('trip_name')] || tid, legs: [] });
    const g = byTrip.get(tid)!;
    if (r[idx('trip_name')]) g.name = r[idx('trip_name')];
    g.legs.push({
      leg: {
        flight: r[idx('flight')], carrier: r[idx('carrier')].toUpperCase(),
        origin: r[idx('origin')].toUpperCase(), dest: r[idx('dest')].toUpperCase(),
        date: normDate(r[idx('date')]), dep: normTime(r[idx('dep')]), arr: normTime(r[idx('arr')]),
      },
      legNo: r[idx('leg_no')] ? parseInt(r[idx('leg_no')], 10) : 0,
    });
  }
  return [...byTrip.values()].map((t) => ({
    tripName: t.name,
    legs: t.legs.sort((a, b) => a.legNo - b.legNo).map((x) => x.leg),
  }));
}
