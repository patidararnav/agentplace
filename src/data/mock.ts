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
    job_types: [
      { type: 'Plumbing Repair', price: 150, duration_minutes: 90 },
      { type: 'Pipe Leak Fix', price: 220, duration_minutes: 120 },
      { type: 'Drain Cleaning', price: 180, duration_minutes: 60 },
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
    job_types: [
      { type: 'Plumbing', price: 150, duration_minutes: 90 },
      { type: 'Water Heater Install', price: 1200, duration_minutes: 240 },
    ],
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
    job_types: [
      { type: 'Plumbing', price: 150, duration_minutes: 90 },
      { type: 'Emergency Repair', price: 280, duration_minutes: 120 },
      { type: 'Renovation', price: 400, duration_minutes: 240 },
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
    job_types: [
      { type: 'Drain Cleaning', price: 180, duration_minutes: 60 },
      { type: 'Plumbing', price: 150, duration_minutes: 90 },
    ],
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
    job_types: [
      { type: 'Plumbing', price: 150, duration_minutes: 90 },
      { type: 'Heating', price: 250, duration_minutes: 120 },
      { type: 'Water Heater Install', price: 1200, duration_minutes: 240 },
      { type: 'Pipe Leak Fix', price: 220, duration_minutes: 120 },
    ],
  },
];

/* ── Agent spin-up steps — all 8 core agents ── */
export const mockAgentSteps: AgentStep[] = [
  // Phase 1: Concierge
  {
    id: 'concierge-parse',
    label: '① Concierge Agent — Parsing request',
    detail: 'Extracting intent: plumbing repair • Location: Palo Alto, CA • Timeline: this week • Budget: flexible',
    status: 'pending',
    agentType: 'system',
  },
  {
    id: 'concierge-clarify',
    label: '① Concierge Agent — Structuring job spec',
    detail: 'Category: Plumbing → Repair • Scope: kitchen sink leak • Constraints: weekday preferred • No follow-ups needed',
    status: 'pending',
    agentType: 'system',
  },
  // Phase 2: Matching
  {
    id: 'matching-search',
    label: '② Matching Agent — Searching vendors',
    detail: 'Hard filters: 847 vendors → 42 plumbing → 12 within 25mi → 5 available this week',
    status: 'pending',
    agentType: 'system',
  },
  {
    id: 'matching-rank',
    label: '② Matching Agent — Ranking candidates',
    detail: 'Soft ranking: quality (4.5+ avg) • reliability (95%+ completion) • price history • predicted acceptance: 89%',
    status: 'pending',
    agentType: 'system',
  },
  // Phase 3: Quote + Negotiation per vendor
  {
    id: 'quote-v1',
    label: '③ Quote Agent → QuickFix Plumbing',
    detail: 'Vendor has auto-pricing: $320/90min base • Requesting custom quote for scope...',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'QuickFix Plumbing',
  },
  {
    id: 'quote-v2',
    label: '③ Quote Agent → ProFlow Solutions',
    detail: 'Manual pricing vendor • Sending job spec and requesting quote...',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'ProFlow Solutions',
  },
  {
    id: 'quote-v3',
    label: '③ Quote Agent → Bay Area Plumbing Co',
    detail: 'Vendor has auto-pricing: $360/90min base • High experience premium applied',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'Bay Area Plumbing Co',
  },
  {
    id: 'negotiate-v1',
    label: '④ Negotiation Agent ↔ QuickFix',
    detail: 'Opening at $280 (12% below ask) • Vendor aggression: Low → likely to accept moderate discount',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'QuickFix Plumbing',
  },
  {
    id: 'negotiate-v2',
    label: '④ Negotiation Agent ↔ ProFlow',
    detail: 'Opening at $285 • Vendor aggression: Medium → expect counter-offer, holding firm at $310 floor',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'ProFlow Solutions',
  },
  {
    id: 'negotiate-v3',
    label: '④ Negotiation Agent ↔ Bay Area Plumbing',
    detail: 'Leveraging competing quote as anchor • Vendor aggression: Low → warranty upsell expected',
    status: 'pending',
    agentType: 'vendor',
    vendorName: 'Bay Area Plumbing Co',
  },
  // Phase 4: Scheduling
  {
    id: 'scheduling',
    label: '⑤ Scheduling Agent — Finding time slots',
    detail: 'Cross-referencing vendor availability × consumer preference • 3 slots confirmed across top vendors',
    status: 'pending',
    agentType: 'system',
  },
  // Phase 5: Payment
  {
    id: 'payment-ready',
    label: '⑥ Payment Agent — Preparing escrow',
    detail: 'Escrow accounts initialized • Cancellation policies loaded • Milestone payment: 100% on completion',
    status: 'pending',
    agentType: 'system',
  },
  // Phase 6: Fulfillment + Reputation (prepped)
  {
    id: 'fulfillment-ready',
    label: '⑦ Fulfillment Agent — Standing by',
    detail: 'Will track: arrival → in-progress → completion • Photo proof required • Dispute policy loaded',
    status: 'pending',
    agentType: 'system',
  },
  {
    id: 'reputation-ready',
    label: '⑧ Reputation Agent — Scores loaded',
    detail: 'Vendor reliability scores cached • Fraud detection active • Post-job review will be prompted',
    status: 'pending',
    agentType: 'system',
  },
  // Done
  {
    id: 'done',
    label: 'All agents ready — 3 best matches found',
    detail: 'Avg savings: 18% below asking price • Best: $285 (QuickFix) • All quotes include scheduling + escrow',
    status: 'pending',
    agentType: 'system',
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
      { role: 'customer-agent', text: 'Deal. Locking in Tuesday 9 AM at $285. Escrow will be initiated on confirmation.' },
    ],
    customerAgentThoughts: [
      { timestamp: '0:01', text: 'Concierge parsed request: kitchen sink leak, plumbing repair category', type: 'reasoning' },
      { timestamp: '0:02', text: 'Matching Agent: QuickFix has 12yr experience, low aggression, 4.8★ rating — top candidate', type: 'reasoning' },
      { timestamp: '0:03', text: 'Negotiation strategy: open at $280 (12.5% below asking). Vendor aggression=3 → moderate discount likely', type: 'action' },
      { timestamp: '0:05', text: 'Scheduling Agent: Tuesday 9 AM locked in. Calendar sync sent to both parties.', type: 'action' },
      { timestamp: '0:06', text: '$285 is $5 above target — accepting. 11% savings achieved. Escrow prepared.', type: 'result' },
    ],
    vendorAgentThoughts: [
      { timestamp: '0:01', text: 'Incoming job spec: plumbing repair, 90min est. Matches auto-pricing rule.', type: 'reasoning' },
      { timestamp: '0:02', text: 'Tuesday 9 AM slot is open. Standard rate $320/90min. Auto-quote sent.', type: 'action' },
      { timestamp: '0:04', text: 'Client offered $280 — below floor of $285. Counter-offering at floor price.', type: 'reasoning' },
      { timestamp: '0:05', text: 'Accepted at $285. Booking confirmed. Escrow receipt acknowledged.', type: 'result' },
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
      { role: 'customer-agent', text: 'That works. Holding this as option 2. Escrow prepped.' },
    ],
    customerAgentThoughts: [
      { timestamp: '0:01', text: 'Matching Agent: Bay Area Plumbing — 15yr experience, low aggression, 4.9★ highest rated', type: 'reasoning' },
      { timestamp: '0:02', text: 'Their rate is $360 — significantly higher. Using QuickFix quote as competitive anchor', type: 'reasoning' },
      { timestamp: '0:04', text: '$295 with warranty is strong value. Ranking as #2 — higher quality, +$10 premium justified', type: 'result' },
    ],
    vendorAgentThoughts: [
      { timestamp: '0:01', text: 'Request matches expertise. Feb 20 slot available. Auto-priced at $360.', type: 'reasoning' },
      { timestamp: '0:03', text: 'Competing quote at $285. Our floor is $280 but we offer warranty differentiation.', type: 'reasoning' },
      { timestamp: '0:04', text: 'Offering $295 with 30-day warranty — accepted as option 2.', type: 'result' },
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
      { timestamp: '0:01', text: 'Matching Agent: ProFlow — 8yr experience, medium aggression — harder negotiation expected', type: 'reasoning' },
      { timestamp: '0:03', text: 'Negotiation: they won\'t go below $310. High aggression = firm pricing.', type: 'reasoning' },
      { timestamp: '0:04', text: '$310 is 11% off asking. Ranking #3 — shorter duration but higher per-hour rate', type: 'result' },
    ],
    vendorAgentThoughts: [
      { timestamp: '0:01', text: 'Standard kitchen repair. Have availability. Manual pricing mode.', type: 'reasoning' },
      { timestamp: '0:03', text: 'Client wants $285 — below our premium service floor. Holding at $310.', type: 'reasoning' },
      { timestamp: '0:04', text: 'Final offer $310. Auto-accept rule: no further negotiation below floor.', type: 'result' },
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
    status: 6,
  },
  {
    id: '2',
    vendorName: 'ProFlow Solutions',
    jobType: 'Bathroom faucet install',
    price: 310,
    dateTime: '2026-02-25T14:00:00',
    durationMinutes: 60,
    vendorId: 2,
    status: 5,
  },
  {
    id: '3',
    vendorName: 'Bay Area Plumbing Co',
    jobType: 'Water heater check',
    price: 120,
    dateTime: '2026-03-02T10:00:00',
    durationMinutes: 45,
    vendorId: 3,
    status: 7,
  },
];

/* ── Vendor-side mock services ── */
export const mockVendorServices = [
  { id: 1, name: 'Standard Plumbing Repair', rate: 320, bookings: 24, active: true },
  { id: 2, name: 'Emergency Pipe Repair', rate: 450, bookings: 8, active: true },
  { id: 3, name: 'Drain Cleaning', rate: 180, bookings: 31, active: false },
];

/* ── Fulfillment tracking steps ── */
export const mockFulfillmentSteps = [
  { id: 'booked', label: 'Job Booked', detail: 'Escrow payment of $285 secured', time: '2026-02-18T08:00:00', done: true },
  { id: 'confirmed', label: 'Vendor Confirmed', detail: 'QuickFix Plumbing confirmed for 9:00 AM', time: '2026-02-18T08:15:00', done: true },
  { id: 'en-route', label: 'Vendor En Route', detail: 'Estimated arrival: 8:55 AM (12 min away)', time: '2026-02-18T08:43:00', done: true },
  { id: 'arrived', label: 'Vendor Arrived', detail: 'On-site. Work starting.', time: '2026-02-18T08:58:00', done: true },
  { id: 'in-progress', label: 'Work In Progress', detail: 'Leak identified under sink. Replacing gasket + P-trap.', time: '2026-02-18T09:10:00', done: true },
  { id: 'completed', label: 'Job Completed', detail: 'Work done. Photo proof uploaded. Awaiting your confirmation.', time: '2026-02-18T10:15:00', done: false },
  { id: 'payment', label: 'Payment Released', detail: 'Escrow released to vendor upon confirmation', time: '', done: false },
  { id: 'review', label: 'Leave a Review', detail: 'Rate your experience to help others', time: '', done: false },
];
