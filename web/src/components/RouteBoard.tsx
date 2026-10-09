import { useMemo, useState } from 'react';
import type { RiskBand, RouteStats } from '../types';
import { disruptionBand } from '../risk';

const SEV: Record<RiskBand, number> = { HIGH: 0, ELEVATED: 1, LOW: 2, UNKNOWN: 3 };

export function RouteBoard({ routes }: { routes: RouteStats[] }) {
  const [query, setQuery] = useState('');
  const [bandFilter, setBandFilter] = useState<'ALL' | RiskBand>('ALL');

  const ranked = useMemo(() => {
    const scored = routes.map((r) => ({ r, band: disruptionBand(r) }));
    const q = query.trim().toUpperCase();
    return scored
      .filter(({ r, band }) =>
        (bandFilter === 'ALL' || band === bandFilter) &&
        (!q || `${r.carrier} ${r.origin} ${r.dest}`.includes(q)))
      .sort((a, b) => SEV[a.band] - SEV[b.band] || b.r.flights - a.r.flights)
      .slice(0, 120);
  }, [routes, query, bandFilter]);

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter: carrier, origin or dest…"
          className="mono"
          style={{ padding: '9px 14px', borderRadius: 999, border: '1px solid var(--line)', background: 'rgba(255,255,255,.85)', fontSize: 13, minWidth: 240 }}
        />
        {(['ALL', 'HIGH', 'ELEVATED', 'LOW'] as const).map((b) => (
          <button key={b} className={`tab${bandFilter === b ? ' on' : ''}`} onClick={() => setBandFilter(b)}>
            {b === 'ALL' ? 'All' : b}
          </button>
        ))}
      </div>
      <div className="sub" style={{ marginBottom: 10 }}>
        Showing {ranked.length} of {routes.length.toLocaleString()} scored routes, ranked by disruption risk.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="board">
          <thead>
            <tr><th>Route</th><th>Band</th><th>On-time</th><th>Avg delay</th><th>Cancelled</th><th>Flights</th></tr>
          </thead>
          <tbody>
            {ranked.map(({ r, band }) => (
              <tr key={`${r.carrier}${r.origin}${r.dest}`}>
                <td className="mono"><b>{r.carrier}</b> {r.origin}→{r.dest}</td>
                <td><span className={`band ${band}`}>{band}</span></td>
                <td className="mono">{r.on_time_pct}%</td>
                <td className="mono">{r.avg_arr_delay_min} min</td>
                <td className="mono">{r.cancelled_pct}%</td>
                <td className="mono">{r.flights.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
