/* ── Job status: 1=Concierge, 2=Matching, 3=Negotiating, 4=Ranking ── */
export type JobStatus = 1 | 2 | 3 | 4;

/* ── Jobs DB: one row per job; vendor and consumer reference by id/name ── */
export interface JobData {
  job_id: number;
  vendor_id: number;
  consumer_name: string;
  date: string;
  start_time: string;
  end_time: string;
  price: number;
  type: string;
  duration_minutes: number;
  status: JobStatus;
}

/* ── Vendor DB: no job listings; jobs live in jobs table ── */
export interface VendorData {
  vendor_id: number;
  name: string;
  weekly_availability: Record<string, string[] | null>;
  max_distance_miles: number;
  home_location: { lat: number; lng: number };
  experience_years: number;
  negotiation_aggression: number;
  job_types: { type: string; price: number; duration_minutes: number }[];
  reviews?: string[];
  average_rating?: number;
  total_ratings?: number;
  job_ids?: number[];
}

/* ── Consumer DB: identity, count, and list of job ids ── */
export interface ConsumerData {
  consumer_name: string;
  job_count: number;
  /** List of job_ids for this consumer */
  job_ids?: number[];
}

export interface UserLocation {
  lat: number;
  lng: number;
  address?: string;
}

/* ── Map view ── */
export interface MapVendor extends VendorData {
  active: boolean;
}

/* ── Agent chain-of-thought ── */
export interface AgentThought {
  timestamp: string;
  text: string;
  type: 'reasoning' | 'action' | 'result';
}

/* ── Negotiation ── */
export interface NegotiationMessage {
  role: 'customer-agent' | 'vendor-agent';
  text: string;
  timestamp?: string;
}

/* ── Vendor quote (results page) ── */
export interface VendorQuote {
  rank: number;
  name: string;
  price: number;
  originalPrice: number;
  dateTime: string;
  durationMinutes: number;
  vendorId: number;
  negotiationMessages: NegotiationMessage[];
  customerAgentThoughts: AgentThought[];
  vendorAgentThoughts: AgentThought[];
  /** Short insight tags generated from the negotiation (e.g. "Competitive anchor", "Warranty included") */
  insightTags?: string[];
}

/* ── Booked job ── */
export interface PlannedJob {
  id: string;
  vendorName: string;
  jobType: string;
  price: number;
  dateTime: string;
  durationMinutes: number;
  vendorId: number;
}

/* ── Stats ── */
export interface JobStats {
  vendorsSearched: number;
  vendorsNegotiated: number;
  avgSavings: number;
}

/* ── Agent spin-up step ── */
export interface AgentStep {
  id: string;
  label: string;
  detail: string;
  status: 'pending' | 'active' | 'done';
  agentType?: 'customer' | 'vendor' | 'system';
  vendorName?: string;
}
