import type { VendorData, VendorQuote, PlannedJob } from '@/types';

// Default user location (e.g. Palo Alto) - user will set on first visit
export const defaultUserLocation = { lat: 37.4419, lng: -122.143 };

// Mock vendors matching VendorData schema (home_location for map)
export const mockVendors: VendorData[] = [
  {
    vendor_id: 1,
    name: 'QuickFix Plumbing',
    weekly_availability: null,
    max_distance_miles: 25,
    home_location: { lat: 37.452, lng: -122.12 },
    experience_years: 12,
    negotiation_aggression: 2,
    job_types: ['plumbing', 'repair'],
    upcoming_jobs: [],
  },
  {
    vendor_id: 2,
    name: 'ProFlow Solutions',
    weekly_availability: null,
    max_distance_miles: 30,
    home_location: { lat: 37.438, lng: -122.16 },
    experience_years: 8,
    negotiation_aggression: 3,
    job_types: ['plumbing', 'installation'],
    upcoming_jobs: [],
  },
  {
    vendor_id: 3,
    name: 'Bay Area Plumbing Co',
    weekly_availability: null,
    max_distance_miles: 20,
    home_location: { lat: 37.448, lng: -122.14 },
    experience_years: 15,
    negotiation_aggression: 1,
    job_types: ['plumbing', 'repair', 'emergency'],
    upcoming_jobs: [],
  },
];

// Mock top 3 quotes for job response page
export const mockQuotes: VendorQuote[] = [
  {
    rank: 1,
    name: 'QuickFix Plumbing',
    price: 285,
    dateTime: '2025-02-18T09:00:00',
    durationMinutes: 90,
    vendorId: 1,
    negotiationMessages: [
      { role: 'agent', text: 'We need a plumber for a leak under the kitchen sink, available week of Feb 18.' },
      { role: 'vendor', text: 'We can do Tuesday 9am or Wednesday afternoon. Our standard rate is $320 for first hour.' },
      { role: 'agent', text: 'Could you do $280 if we commit to a 2-hour window? We can be flexible on exact time.' },
      { role: 'vendor', text: 'We can do $285 for the first 90 minutes. Deal?' },
      { role: 'agent', text: 'Deal. Book us for Tuesday 9am.' },
    ],
  },
  {
    rank: 2,
    name: 'ProFlow Solutions',
    price: 310,
    dateTime: '2025-02-19T14:00:00',
    durationMinutes: 60,
    vendorId: 2,
    negotiationMessages: [
      { role: 'agent', text: 'Looking for plumbing repair, kitchen sink leak.' },
      { role: 'vendor', text: 'We have slots Feb 19 2pm or 4pm. Rate is $350 for first hour.' },
      { role: 'agent', text: 'Can you match $300? We have another quote at that range.' },
      { role: 'vendor', text: 'Best we can do is $310 for the first hour.' },
    ],
  },
  {
    rank: 3,
    name: 'Bay Area Plumbing Co',
    price: 340,
    dateTime: '2025-02-20T10:00:00',
    durationMinutes: 90,
    vendorId: 3,
    negotiationMessages: [
      { role: 'agent', text: 'Need a plumber for under-sink leak, Feb 18–20 preferred.' },
      { role: 'vendor', text: 'We have Feb 20 10am. Our rate is $360 for first 90 min.' },
      { role: 'agent', text: 'Any flexibility on price?' },
      { role: 'vendor', text: 'We can do $340 for that slot.' },
    ],
  },
];

// Mock job stats
export const mockJobStats = {
  vendorsSearched: 12,
  vendorsNegotiated: 5,
};

// Mock planned jobs for calendar (after user accepts one)
export const mockPlannedJobs: PlannedJob[] = [
  {
    id: '1',
    vendorName: 'QuickFix Plumbing',
    jobType: 'Kitchen sink repair',
    price: 285,
    dateTime: '2025-02-18T09:00:00',
    durationMinutes: 90,
    vendorId: 1,
  },
  {
    id: '2',
    vendorName: 'ProFlow Solutions',
    jobType: 'Bathroom faucet install',
    price: 310,
    dateTime: '2025-02-25T14:00:00',
    durationMinutes: 60,
    vendorId: 2,
  },
  {
    id: '3',
    vendorName: 'Bay Area Plumbing Co',
    jobType: 'Water heater check',
    price: 120,
    dateTime: '2025-03-02T10:00:00',
    durationMinutes: 45,
    vendorId: 3,
  },
];
