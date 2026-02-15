import { supabase } from '@/lib/supabase';
import type { VendorData, CustomerData, JobData } from '@/types';

const TABLE_VENDOR = import.meta.env.VITE_SUPABASE_TABLE_VENDOR ?? 'VendorData';
const TABLE_CONSUMER = import.meta.env.VITE_SUPABASE_TABLE_CONSUMER ?? 'ConsumerData';
const TABLE_JOBS = import.meta.env.VITE_SUPABASE_TABLE_JOBS ?? 'JobsData';

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

function rowToVendor(row: Record<string, unknown>): VendorData {
  const jobTypes = (row.job_types as { type: string; price: number; duration_minutes: number }[]) ?? [];
  const jobIds = Array.isArray(row.job_ids) ? (row.job_ids as number[]) : [];
  const reviews = Array.isArray(row.reviews) ? (row.reviews as string[]) : [];
  const avg = row.average_rating != null ? Number(row.average_rating) : undefined;
  const total = row.total_ratings != null ? Number(row.total_ratings) : undefined;
  return {
    vendor_id: Number(row.vendor_id),
    name: (row.name as string) ?? '',
    weekly_availability: (row.weekly_availability as Record<string, string[] | null>) ?? {},
    max_distance_miles: Number(row.max_distance_miles) ?? 0,
    home_location: (row.home_location as { lat: number; lng: number }) ?? { lat: 0, lng: 0 },
    experience_years: Number(row.experience_years) ?? 0,
    negotiation_aggression: Number(row.negotiation_aggression) ?? 0,
    job_types: jobTypes,
    job_ids: jobIds.length ? jobIds : undefined,
    reviews: reviews.length ? reviews : undefined,
    average_rating: avg,
    total_ratings: total,
  };
}

function rowToCustomer(row: Record<string, unknown>): CustomerData {
  const jobIds = Array.isArray(row.job_ids) ? (row.job_ids as number[]) : [];
  return {
    consumer_name: (row.consumer_name as string) ?? '',
    job_count: Number(row.job_count) ?? 0,
    job_ids: jobIds.length ? jobIds : undefined,
  };
}

function rowToJob(row: Record<string, unknown>): JobData {
  return {
    job_id: Number(row.job_id),
    vendor_id: Number(row.vendor_id),
    consumer_name: (row.consumer_name as string) ?? '',
    date: (row.date as string) ?? '',
    start_time: (row.start_time as string) ?? '',
    end_time: (row.end_time as string) ?? '',
    price: Number(row.price) ?? 0,
    type: (row.type as string) ?? '',
    duration_minutes: Number(row.duration_minutes) ?? 0,
    status: (Number(row.status) ?? 1) as JobData['status'],
  };
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

/** Fetches vendors from Supabase table public."VendorData". Falls back to localStorage only on error (e.g. table missing). */
export async function fetchVendors(): Promise<FetchResult<VendorData>> {
  const { data, error } = await supabase
    .from(TABLE_VENDOR)
    .select('*')
    .order('vendor_id', { ascending: false });
  if (!error) {
    return { data: (data ?? []).map((row) => rowToVendor(row as Record<string, unknown>)) };
  }
  console.warn('Supabase vendors:', error.message);
  const local = readList<VendorData>(STORAGE_KEYS.vendors).sort((a, b) => b.vendor_id - a.vendor_id);
  return { data: local };
}

/** Fetches customers, most jobs first then by name. */
export async function fetchCustomers(): Promise<FetchResult<CustomerData>> {
  const { data, error } = await supabase
    .from(TABLE_CONSUMER)
    .select('*')
    .order('job_count', { ascending: false })
    .order('consumer_name', { ascending: true });
  if (error) {
    const msg = `${error.message}${error.code ? ` [${error.code}]` : ''}`;
    console.warn('Supabase customers:', msg);
    return { error: msg };
  }
  return { data: (data ?? []).map((row) => rowToCustomer(row as Record<string, unknown>)) };
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

/** Fetches jobs for one customer: by job_ids if provided, otherwise by consumer_name. Uses JobsData then jobs_data. */
export async function fetchJobsForCustomer(
  consumerName: string,
  jobIds?: number[]
): Promise<JobData[]> {
  const tableNames = [TABLE_JOBS];
  if (TABLE_JOBS === 'JobsData') tableNames.push('jobs_data');

  for (const tableName of tableNames) {
    let query = supabase.from(tableName).select('*');
    if (jobIds && jobIds.length > 0) {
      query = query.in('job_id', jobIds);
    } else {
      query = query.eq('consumer_name', consumerName);
    }
    const { data, error } = await query.order('job_id');
    if (!error) {
      return (data ?? []).map((row) => rowToJob(row as Record<string, unknown>));
    }
    const isNotFound =
      error.code === '42P01' ||
      /does not exist|relation.*not found/i.test(error.message);
    if (!isNotFound || tableName === tableNames[tableNames.length - 1]) {
      console.warn('Supabase fetchJobsForCustomer:', error.message);
      return [];
    }
  }
  return [];
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

/** Insert new vendor into Supabase public."VendorData". Falls back to localStorage on error. */
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
  let nextId = payload.vendor_id;
  if (nextId == null) {
    const { data: existing } = await supabase
      .from(TABLE_VENDOR)
      .select('vendor_id')
      .order('vendor_id', { ascending: false })
      .limit(1)
      .maybeSingle();
    nextId = existing?.vendor_id != null ? Number(existing.vendor_id) + 1 : 1;
  }
  const row = {
    vendor_id: nextId,
    name: payload.name,
    weekly_availability: payload.weekly_availability,
    max_distance_miles: payload.max_distance_miles,
    home_location: payload.home_location,
    experience_years: payload.experience_years,
    negotiation_aggression: payload.negotiation_aggression,
    job_types: payload.job_types ?? [],
    job_ids: payload.job_ids ?? [],
    reviews: payload.reviews ?? [],
    average_rating: payload.average_rating != null ? String(payload.average_rating) : null,
    total_ratings: payload.total_ratings != null ? String(payload.total_ratings) : null,
  };
  const { data, error } = await supabase.from(TABLE_VENDOR).insert(row).select().single();
  if (!error && data) {
    return rowToVendor(data as Record<string, unknown>);
  }
  if (error) console.warn('Supabase insert vendor:', error.message);
  const vendors = readList<VendorData>(STORAGE_KEYS.vendors);
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

/** Update existing vendor by vendor_id. Returns updated VendorData or null. */
export async function updateVendor(
  vendorId: number,
  payload: {
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
  }
): Promise<VendorData | null> {
  const row: Record<string, unknown> = {
    name: payload.name,
    weekly_availability: payload.weekly_availability,
    max_distance_miles: payload.max_distance_miles,
    home_location: payload.home_location,
    experience_years: payload.experience_years,
    negotiation_aggression: payload.negotiation_aggression,
    job_types: payload.job_types,
    job_ids: payload.job_ids ?? [],
    reviews: payload.reviews ?? [],
    average_rating: payload.average_rating != null ? String(payload.average_rating) : null,
    total_ratings: payload.total_ratings != null ? String(payload.total_ratings) : null,
  };
  const { data, error } = await supabase
    .from(TABLE_VENDOR)
    .update(row)
    .eq('vendor_id', vendorId)
    .select()
    .single();
  if (error) {
    console.warn('Supabase update vendor:', error.message);
    return null;
  }
  return data ? rowToVendor(data as Record<string, unknown>) : null;
}

/** Insert new customer. Returns { data } on success or { error: string } on failure. */
export async function insertCustomer(payload: {
  consumer_name: string;
  job_count?: number;
  job_ids?: number[] | null;
}): Promise<{ data: CustomerData } | { error: string }> {
  const row = {
    consumer_name: payload.consumer_name,
    job_count: payload.job_count ?? 0,
    job_ids: payload.job_ids ?? [],
  };
  const { data, error } = await supabase.from(TABLE_CONSUMER).insert(row).select().single();
  if (error) {
    const msg = error.message + (error.hint ? ` (${error.hint})` : '') + (error.code ? ` [${error.code}]` : '');
    console.warn('Supabase insert customer:', msg);
    return { error: msg };
  }
  return data ? { data: rowToCustomer(data as Record<string, unknown>) } : { error: 'No data returned' };
}

/** Local mode status helper. */
export async function checkSupabaseAccess(): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.from(TABLE_CONSUMER).select('consumer_name').limit(1);
  if (error) {
    return { ok: false, message: `CustomerData: ${error.message} (code: ${error.code}). Enable RLS policies or disable RLS for the table.` };
  }
  return { ok: true, message: 'Connected' };
}
