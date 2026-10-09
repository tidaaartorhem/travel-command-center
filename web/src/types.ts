export type RiskBand = 'LOW' | 'ELEVATED' | 'HIGH' | 'UNKNOWN';

export interface RouteStats {
  carrier: string;
  origin: string;
  dest: string;
  flights: number;
  on_time_pct: number;
  avg_arr_delay_min: number;
  cancelled_pct: number;
}

export interface ScoredLeg {
  flight: string;
  carrier: string;
  origin: string;
  dest: string;
  route: string;
  date: string;
  dep: string;
  arr: string;
  confirmation: string;
  band: RiskBand;
  stats: RouteStats | null;
  distance_km?: number;
}

export interface Connection {
  airport: string;
  from_flight: string;
  to_flight: string;
  layover_min: number;
  mct_min: number;
  misconnect_prob: number | null;
  band: RiskBand;
  tight: boolean;
  short: boolean;
}

export interface TripAlert {
  severity: RiskBand;
  text: string;
}

export interface ScoredTrip {
  trip_id: string;
  name: string;
  legs: ScoredLeg[];
  connections: Connection[];
  alerts: TripAlert[];
  trip_band: RiskBand;
  total_distance_km?: number;
}

export interface MorningBrief {
  headline: string;
  checkin: string;
  leave_by: string;
  watch: string[];
  alert_count: number;
}

export interface AirportInfo {
  iata: string;
  name: string;
  city: string;
  country: string;
}

export interface TripBundle {
  generated: string;
  trips: ScoredTrip[];
  briefs: Record<string, MorningBrief>;
  route_table: RouteStats[];
  airports: Record<string, AirportInfo>;
  summary: {
    trips: number;
    legs: number;
    routes_scored: number;
    bts_rows: number;
  };
}
