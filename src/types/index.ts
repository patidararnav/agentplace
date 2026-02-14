// Matches Supabase VendorData table
export interface VendorData {
  vendor_id: number | null;
  name: string;
  weekly_availability: Record<string, unknown> | null;
  max_distance_miles: number | null;
  home_location: { lat: number; lng: number } | null;
  experience_years: number | null;
  negotiation_aggression: number | null;
  job_types: string[] | null;
  upcoming_jobs: unknown[] | null;
}

export interface UserLocation {
  lat: number;
  lng: number;
  address?: string;
}

// Vendor with active/inactive state for map
export interface MapVendor extends VendorData {
  active: boolean; // being communicated with
}

// Top vendor quote for response page
export interface VendorQuote {
  rank: number;
  name: string;
  price: number;
  dateTime: string;
  durationMinutes: number;
  vendorId: number;
  negotiationMessages: NegotiationMessage[];
}

export interface NegotiationMessage {
  role: 'agent' | 'vendor';
  text: string;
  timestamp?: string;
}

// Accepted job for calendar
export interface PlannedJob {
  id: string;
  vendorName: string;
  jobType: string;
  price: number;
  dateTime: string;
  durationMinutes: number;
  vendorId: number;
}

// Stats for job response header
export interface JobStats {
  vendorsSearched: number;
  vendorsNegotiated: number;
}
