/* ── Vendor DB Schema ── */
export interface VendorData {
  vendor_id: number;
  name: string;
  weekly_availability: Record<string, string[]>; // e.g. { "monday": ["09:00","17:00"], ... }
  max_distance_miles: number;
  home_location: { lat: number; lng: number };
  experience_years: number;
  negotiation_aggression: number; // 1-10
  job_types: string[];
  upcoming_jobs: { date: string; type: string; client?: string }[];
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
  agentType?: 'customer' | 'vendor';
  vendorName?: string;
}
