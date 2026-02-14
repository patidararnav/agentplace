import type { VendorData, VendorQuote, PlannedJob, AgentStep } from '@/types';

/* ── Default location (Palo Alto) ── */
export const defaultUserLocation = { lat: 37.4419, lng: -122.143 };

/* ── Vendors ── */
export const mockVendors: VendorData[] = [
  {
    vendor_id: 1,
    name: 'QuickFix Plumbing',
    weekly_availability: {
      monday: ['09:00', '17:00'],
      tuesday: ['09:00', '17:00'],
      wednesday: ['09:00', '17:00'],
      thursday: ['09:00', '17:00'],
      friday: ['09:00', '15:00'],
    },
    max_distance_miles: 25,
    home_location: { lat: 37.452, lng: -122.12 },
    experience_years: 12,
    negotiation_aggression: 3,
    job_types: ['Plumbing', 'Pipe Repair', 'Drain Cleaning'],
    upcoming_jobs: [
      { date: '2026-02-16', type: 'Pipe Repair', client: 'Johnson' },
    ],
  },
  {
    vendor_id: 2,
    name: 'ProFlow Solutions',
    weekly_availability: {
      monday: ['10:00', '18:00'],
      tuesday: ['10:00', '18:00'],
      wednesday: ['10:00', '18:00'],
      thursday: ['10:00', '18:00'],
      friday: ['10:00', '16:00'],
    },
    max_distance_miles: 30,
    home_location: { lat: 37.438, lng: -122.16 },
    experience_years: 8,
    negotiation_aggression: 6,
    job_types: ['Plumbing', 'Installation', 'Water Heater'],
    upcoming_jobs: [],
  },
  {
    vendor_id: 3,
    name: 'Bay Area Plumbing Co',
    weekly_availability: {
      monday: ['08:00', '16:00'],
      tuesday: ['08:00', '16:00'],
      wednesday: ['08:00', '16:00'],
      thursday: ['08:00', '16:00'],
      friday: ['08:00', '14:00'],
    },
    max_distance_miles: 20,
    home_location: { lat: 37.448, lng: -122.14 },
    experience_years: 15,
    negotiation_aggression: 2,
    job_types: ['Plumbing', 'Emergency Repair', 'Renovation'],
    upcoming_jobs: [
      { date: '2026-02-17', type: 'Renovation', client: 'Martinez' },
      { date: '2026-02-19', type: 'Emergency Repair', client: 'Chen' },
    ],
  },
  {
    vendor_id: 4,
    name: 'Elite Drain Services',
    weekly_availability: {
      monday: ['07:00', '15:00'],
      tuesday: ['07:00', '15:00'],
      wednesday: ['07:00', '15:00'],
    },
    max_distance_miles: 15,
    home_location: { lat: 37.46, lng: -122.13 },
    experience_years: 5,
    negotiation_aggression: 8,
    job_types: ['Drain Cleaning', 'Plumbing'],
    upcoming_jobs: [],
  },
  {
    vendor_id: 5,
    name: 'Sunset Plumbing & Heating',
    weekly_availability: {
      tuesday: ['09:00', '17:00'],
      wednesday: ['09:00', '17:00'],
      thursday: ['09:00', '17:00'],
      friday: ['09:00', '17:00'],
      saturday: ['10:00', '14:00'],
    },
    max_distance_miles: 35,
    home_location: { lat: 37.43, lng: -122.17 },
    experience_years: 20,
    negotiation_aggression: 4,
    job_types: ['Plumbing', 'Heating', 'Water Heater', 'Pipe Repair'],
    upcoming_jobs: [
      { date: '2026-02-18', type: 'Water Heater', client: 'Park' },
    ],
  },
];

/* ── Agent spin-up steps (the wow-factor sequence) ── */
export const mockAgentSteps: AgentStep[] = [
  {
    id: 'parse',
    label: 'Parsing your request',
    detail: 'Extracting intent: plumbing repair • Location: Palo Alto • Urgency: this week',
    status: 'pending',
  },
  {
    id: 'spawn-customer',
    label: 'Spinning up Customer Agent',
    detail: 'Initializing negotiation strategy • Budget optimization enabled • Scheduling preferences loaded',
    status: 'pending',
    agentType: 'customer',
  },
  {
    id: 'search',
    label: 'Searching vendor database',
    detail: 'Filtering 847 vendors → 12 match job type → 5 within range → 5 available this week',
    status: 'pending',
  },
  {
    id: 'spawn-v1',
    label: 'Activating agent for QuickFix Plumbing',
    detail: 'Experience: 12yr • Aggression: Low • Rating: 4.8★ • Starting negotiation...',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'QuickFix Plumbing',
  },
  {
    id: 'spawn-v2',
    label: 'Activating agent for ProFlow Solutions',
    detail: 'Experience: 8yr • Aggression: Medium • Rating: 4.5★ • Starting negotiation...',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'ProFlow Solutions',
  },
  {
    id: 'spawn-v3',
    label: 'Activating agent for Bay Area Plumbing Co',
    detail: 'Experience: 15yr • Aggression: Low • Rating: 4.9★ • Starting negotiation...',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'Bay Area Plumbing Co',
  },
  {
    id: 'spawn-v4',
    label: 'Activating agent for Elite Drain Services',
    detail: 'Experience: 5yr • Aggression: High • Rating: 4.2★ • Starting negotiation...',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'Elite Drain Services',
  },
  {
    id: 'spawn-v5',
    label: 'Activating agent for Sunset Plumbing & Heating',
    detail: 'Experience: 20yr • Aggression: Low • Rating: 4.7★ • Starting negotiation...',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'Sunset Plumbing & Heating',
  },
  {
    id: 'negotiate',
    label: 'Agents negotiating',
    detail: '5 parallel negotiations in progress • Comparing price, availability, and reviews...',
    status: 'pending',
  },
  {
    id: 'rank',
    label: 'Ranking results',
    detail: 'Scoring by price (40%) • availability match (30%) • experience (20%) • reviews (10%)',
    status: 'pending',
  },
  {
    id: 'done',
    label: 'Found your best matches',
    detail: '3 top quotes ready • Average savings: 18% below asking price',
    status: 'pending',
  },
];

/* ── Top 3 quotes with chain-of-thought ── */
export const mockQuotes: VendorQuote[] = [
  {
    rank: 1,
    name: 'QuickFix Plumbing',
    price: 285,
    originalPrice: 320,
    dateTime: '2026-02-18T09:00:00',
    durationMinutes: 90,
    vendorId: 1,
    negotiationMessages: [
      { role: 'customer-agent', text: 'Hi, my client needs a plumber for a kitchen sink leak. Available the week of Feb 16. Looking for the best rate for a ~90 min job.' },
      { role: 'vendor-agent', text: 'We can do Tuesday 9 AM or Wednesday afternoon. Standard rate is $320 for the first 90 minutes.' },
      { role: 'customer-agent', text: 'Could you do $280? My client is flexible on timing and happy to book a 2-hour window to make scheduling easier.' },
      { role: 'vendor-agent', text: '$285 for 90 minutes is the lowest we can go. That includes parts inspection.' },
      { role: 'customer-agent', text: 'Deal. Locking in Tuesday 9 AM at $285.' },
    ],
    customerAgentThoughts: [
      { timestamp: '0:01', text: 'Parsed request: kitchen sink leak, plumbing repair needed', type: 'reasoning' },
      { timestamp: '0:02', text: 'QuickFix has 12yr experience and low aggression — likely to negotiate fairly', type: 'reasoning' },
      { timestamp: '0:03', text: 'Opening at $280 (12.5% below asking) — vendor has low aggression so moderate discount should work', type: 'reasoning' },
      { timestamp: '0:05', text: '$285 is only $5 above target — accepting. 11% savings achieved.', type: 'result' },
    ],
    vendorAgentThoughts: [
      { timestamp: '0:01', text: 'Incoming request: plumbing repair, 90min estimated', type: 'reasoning' },
      { timestamp: '0:02', text: 'Tuesday 9 AM slot is open. Standard rate $320/90min.', type: 'reasoning' },
      { timestamp: '0:04', text: 'Client offered $280 — below our floor of $285. Counter at floor price.', type: 'reasoning' },
      { timestamp: '0:05', text: 'Accepted at $285. Booking confirmed.', type: 'result' },
    ],
  },
  {
    rank: 2,
    name: 'Bay Area Plumbing Co',
    price: 295,
    originalPrice: 360,
    dateTime: '2026-02-20T10:00:00',
    durationMinutes: 90,
    vendorId: 3,
    negotiationMessages: [
      { role: 'customer-agent', text: 'Looking for plumbing repair — kitchen sink leak. Available Feb 18–20.' },
      { role: 'vendor-agent', text: 'We have Feb 20 at 10 AM. Rate is $360 for 90 min.' },
      { role: 'customer-agent', text: 'I have a competing quote at $285. Can you get closer to that range?' },
      { role: 'vendor-agent', text: 'We can do $295 — we include a 30-day warranty on all work.' },
      { role: 'customer-agent', text: 'That works. Holding this as option 2.' },
    ],
    customerAgentThoughts: [
      { timestamp: '0:01', text: 'Bay Area Plumbing: 15yr experience, low aggression, highest rated', type: 'reasoning' },
      { timestamp: '0:02', text: 'Their rate is $360 — significantly higher. Leveraging QuickFix quote as anchor', type: 'reasoning' },
      { timestamp: '0:04', text: '$295 with warranty is competitive. Ranking as #2 — higher quality but $10 more', type: 'result' },
    ],
    vendorAgentThoughts: [
      { timestamp: '0:01', text: 'Request matches our expertise. Feb 20 slot available.', type: 'reasoning' },
      { timestamp: '0:03', text: 'Client has competing quote at $285. Our floor is $280 but we add warranty value.', type: 'reasoning' },
      { timestamp: '0:04', text: 'Offering $295 with warranty — differentiates us from competitors.', type: 'result' },
    ],
  },
  {
    rank: 3,
    name: 'ProFlow Solutions',
    price: 310,
    originalPrice: 350,
    dateTime: '2026-02-19T14:00:00',
    durationMinutes: 60,
    vendorId: 2,
    negotiationMessages: [
      { role: 'customer-agent', text: 'Need kitchen sink plumbing repair. Flexible on dates this week.' },
      { role: 'vendor-agent', text: 'Available Feb 19 at 2 PM or 4 PM. Rate is $350 for first hour.' },
      { role: 'customer-agent', text: 'Can you match $285? That\'s the best offer I have.' },
      { role: 'vendor-agent', text: 'Best I can do is $310 for the hour. We use premium parts.' },
    ],
    customerAgentThoughts: [
      { timestamp: '0:01', text: 'ProFlow: 8yr experience, medium aggression — expect harder negotiation', type: 'reasoning' },
      { timestamp: '0:03', text: 'They won\'t go below $310. Higher aggression = firmer on price.', type: 'reasoning' },
      { timestamp: '0:04', text: '$310 is 11% off asking. Ranking #3 — shorter duration but higher per-hour rate', type: 'result' },
    ],
    vendorAgentThoughts: [
      { timestamp: '0:01', text: 'Standard kitchen repair job. Have availability this week.', type: 'reasoning' },
      { timestamp: '0:03', text: 'Client wants $285 — too low for our premium service tier. Holding at $310.', type: 'reasoning' },
      { timestamp: '0:04', text: 'Final offer $310. Take it or leave it.', type: 'result' },
    ],
  },
];

/* ── Stats ── */
export const mockJobStats = {
  vendorsSearched: 847,
  vendorsNegotiated: 5,
  avgSavings: 18,
};

/* ── Planned jobs (calendar) ── */
export const mockPlannedJobs: PlannedJob[] = [
  {
    id: '1',
    vendorName: 'QuickFix Plumbing',
    jobType: 'Kitchen sink repair',
    price: 285,
    dateTime: '2026-02-18T09:00:00',
    durationMinutes: 90,
    vendorId: 1,
  },
  {
    id: '2',
    vendorName: 'ProFlow Solutions',
    jobType: 'Bathroom faucet install',
    price: 310,
    dateTime: '2026-02-25T14:00:00',
    durationMinutes: 60,
    vendorId: 2,
  },
  {
    id: '3',
    vendorName: 'Bay Area Plumbing Co',
    jobType: 'Water heater check',
    price: 120,
    dateTime: '2026-03-02T10:00:00',
    durationMinutes: 45,
    vendorId: 3,
  },
];

/* ── Vendor-side mock services (for vendor dashboard) ── */
export const mockVendorServices = [
  { id: 1, name: 'Standard Plumbing Repair', rate: 320, bookings: 24, active: true },
  { id: 2, name: 'Emergency Pipe Repair', rate: 450, bookings: 8, active: true },
  { id: 3, name: 'Drain Cleaning', rate: 180, bookings: 31, active: false },
];
