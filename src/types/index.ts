/* ── Job status: 1=Concierge, 2=Matching, 3=Negotiating, 4=Ranking, 5=Booked, 6=In progress, 7=Project completed, 8=Payment sent, 9=Payment received ── */
export type JobStatus = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type VendorPricingStrategy = 'maximize_jobs' | 'high_value_only' | 'yield_optimizer';

/* ── Jobs DB: one row per job; vendor and customer reference by id/name ── */
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
  pricing_strategy: VendorPricingStrategy;
  job_types: { type: string; price: number; duration_minutes: number }[];
  reviews?: string[];
  average_rating?: number;
  total_ratings?: number;
  job_ids?: number[];
}

/* ── Customer DB: identity, count, and list of job ids ── */
export interface CustomerData {
  consumer_name: string; // DB column name
  job_count: number;
  /** List of job_ids for this customer */
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
  /** When present, accept will update this job's status to Booked in the DB */
  job_id?: number;
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
  /** Customer name (for vendor tracking view) */
  customerName?: string;
  jobType: string;
  price: number;
  dateTime: string;
  durationMinutes: number;
  vendorId: number;
  status?: JobStatus;
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
