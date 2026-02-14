import type { VendorData, ConsumerData, JobData } from '@/types';

const STORAGE_KEYS = {
  vendors: 'agentplace_vendors',
  consumers: 'agentplace_consumers',
  jobs: 'agentplace_jobs',
} as const;
const STORAGE_VERSION_KEY = 'agentplace_storage_version';
const STORAGE_VERSION = 'local-v1';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function ensureInitialized(): void {
  const storage = getStorage();
  if (!storage) return;
  if (storage.getItem(STORAGE_VERSION_KEY) === STORAGE_VERSION) return;
  storage.setItem(STORAGE_KEYS.vendors, '[]');
  storage.setItem(STORAGE_KEYS.consumers, '[]');
  storage.setItem(STORAGE_KEYS.jobs, '[]');
  storage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
}

function readList<T>(key: string): T[] {
  ensureInitialized();
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, value: T[]): void {
  ensureInitialized();
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

export type FetchResult<T> = { data: T[]; error?: undefined } | { data?: undefined; error: string };

/** Fetches vendors from browser localStorage, newest first (highest vendor_id). */
export async function fetchVendors(): Promise<FetchResult<VendorData>> {
  const data = readList<VendorData>(STORAGE_KEYS.vendors).sort((a, b) => b.vendor_id - a.vendor_id);
  return { data };
}

/** Fetches consumers from browser localStorage, most jobs first then by name. */
export async function fetchConsumers(): Promise<FetchResult<ConsumerData>> {
  const data = readList<ConsumerData>(STORAGE_KEYS.consumers).sort(
    (a, b) => b.job_count - a.job_count || a.consumer_name.localeCompare(b.consumer_name)
  );
  return { data };
}

/** Fetches all jobs from browser localStorage. */
export async function fetchJobs(): Promise<FetchResult<JobData>> {
  const data = readList<JobData>(STORAGE_KEYS.jobs).sort((a, b) => a.job_id - b.job_id);
  return { data };
}

/** Fetches jobs for one vendor from browser localStorage. */
export async function fetchJobsForVendor(
  vendorId: number,
  jobIds?: number[]
): Promise<JobData[]> {
  const jobs = readList<JobData>(STORAGE_KEYS.jobs);
  const filtered = jobIds && jobIds.length > 0
    ? jobs.filter((j) => jobIds.includes(j.job_id))
    : jobs.filter((j) => j.vendor_id === vendorId);
  return filtered.sort((a, b) => a.job_id - b.job_id);
}

/** Fetches jobs for one consumer from browser localStorage. */
export async function fetchJobsForConsumer(
  consumerName: string,
  jobIds?: number[]
): Promise<JobData[]> {
  const jobs = readList<JobData>(STORAGE_KEYS.jobs);
  const filtered = jobIds && jobIds.length > 0
    ? jobs.filter((j) => jobIds.includes(j.job_id))
    : jobs.filter((j) => j.consumer_name === consumerName);
  return filtered.sort((a, b) => a.job_id - b.job_id);
}

/** Updates a job's status (e.g. 5 = Booked) in browser localStorage. */
export async function updateJobStatus(
  jobId: number,
  status: number
): Promise<{ ok: true } | { error: string }> {
  const jobs = readList<JobData>(STORAGE_KEYS.jobs);
  const idx = jobs.findIndex((j) => j.job_id === jobId);
  if (idx === -1) {
    return { error: `Job ${jobId} not found` };
  }
  jobs[idx] = { ...jobs[idx], status: status as JobData['status'] };
  writeList(STORAGE_KEYS.jobs, jobs);
  return { ok: true };
}

/** Insert new vendor into browser localStorage. */
export async function insertVendor(payload: {
  vendor_id?: number;
  name: string;
  weekly_availability: Record<string, string[] | null>;
  max_distance_miles: number;
  home_location: { lat: number; lng: number };
  experience_years: number;
  negotiation_aggression: number;
  job_types: { type: string; price: number; duration_minutes: number }[];
  job_ids?: number[] | null;
  reviews?: string[] | null;
  average_rating?: string | number | null;
  total_ratings?: string | number | null;
}): Promise<VendorData | null> {
  const vendors = readList<VendorData>(STORAGE_KEYS.vendors);
  const nextId = payload.vendor_id != null
    ? payload.vendor_id
    : (vendors.reduce((max, v) => Math.max(max, v.vendor_id), 0) + 1);
  const created: VendorData = {
    vendor_id: nextId,
    name: payload.name,
    weekly_availability: payload.weekly_availability,
    max_distance_miles: payload.max_distance_miles,
    home_location: payload.home_location,
    experience_years: payload.experience_years,
    negotiation_aggression: payload.negotiation_aggression,
    job_types: payload.job_types,
    job_ids: payload.job_ids ?? [],
    reviews: payload.reviews ?? [],
    average_rating: payload.average_rating != null ? Number(payload.average_rating) : undefined,
    total_ratings: payload.total_ratings != null ? Number(payload.total_ratings) : undefined,
  };
  vendors.push(created);
  writeList(STORAGE_KEYS.vendors, vendors);
  return created;
}

/** Insert new consumer into browser localStorage. */
export async function insertConsumer(payload: {
  consumer_name: string;
  job_count?: number;
  job_ids?: number[] | null;
}): Promise<{ data: ConsumerData } | { error: string }> {
  const consumers = readList<ConsumerData>(STORAGE_KEYS.consumers);
  const exists = consumers.some(
    (c) => c.consumer_name.trim().toLowerCase() === payload.consumer_name.trim().toLowerCase()
  );
  if (exists) {
    return { error: 'Consumer already exists' };
  }
  const created: ConsumerData = {
    consumer_name: payload.consumer_name,
    job_count: payload.job_count ?? 0,
    job_ids: payload.job_ids ?? [],
  };
  consumers.push(created);
  writeList(STORAGE_KEYS.consumers, consumers);
  return { data: created };
}

/** Local mode status helper. */
export async function checkSupabaseAccess(): Promise<{ ok: boolean; message: string }> {
  return { ok: true, message: 'Using browser localStorage mode' };
}
