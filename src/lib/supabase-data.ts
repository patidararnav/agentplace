import { supabase } from '@/lib/supabase';
import type { VendorData, ConsumerData, JobData } from '@/types';

const TABLE_VENDOR = import.meta.env.VITE_SUPABASE_TABLE_VENDOR ?? 'VendorData';
const TABLE_CONSUMER = import.meta.env.VITE_SUPABASE_TABLE_CONSUMER ?? 'ConsumerData';
const TABLE_JOBS = import.meta.env.VITE_SUPABASE_TABLE_JOBS ?? 'JobsData';

function rowToVendor(row: Record<string, unknown>): VendorData {
  const jobTypes = (row.job_types as { type: string; price: number; duration_minutes: number }[]) ?? [];
  const jobIds = Array.isArray(row.job_ids) ? row.job_ids as number[] : [];
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

function rowToConsumer(row: Record<string, unknown>): ConsumerData {
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

export type FetchResult<T> = { data: T[]; error?: undefined } | { data?: undefined; error: string };

/** Fetches vendors, most recent first (highest vendor_id). Tries VendorData then vendor_data if first fails (e.g. wrong table name). */
export async function fetchVendors(): Promise<FetchResult<VendorData>> {
  const tableNames = [TABLE_VENDOR];
  if (TABLE_VENDOR === 'VendorData') tableNames.push('vendor_data');

  for (const tableName of tableNames) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('vendor_id', { ascending: false });
    if (!error) {
      return { data: (data ?? []).map((row) => rowToVendor(row as Record<string, unknown>)) };
    }
    const msg = `${error.message}${error.code ? ` [${error.code}]` : ''}`;
    const isNotFound =
      error.code === '42P01' ||
      /does not exist|relation.*not found/i.test(error.message);
    if (!isNotFound || tableName === tableNames[tableNames.length - 1]) {
      console.warn('Supabase vendors:', msg);
      return { error: msg };
    }
  }
  return { error: 'Could not load vendors' };
}

/** Fetches consumers, most jobs first then by name. */
export async function fetchConsumers(): Promise<FetchResult<ConsumerData>> {
  const { data, error } = await supabase
    .from(TABLE_CONSUMER)
    .select('*')
    .order('job_count', { ascending: false })
    .order('consumer_name', { ascending: true });
  if (error) {
    const msg = `${error.message}${error.code ? ` [${error.code}]` : ''}`;
    console.warn('Supabase consumers:', msg);
    return { error: msg };
  }
  return { data: (data ?? []).map((row) => rowToConsumer(row as Record<string, unknown>)) };
}

/** Fetches all jobs from Jobs table. Tries JobsData then jobs_data if first fails. */
export async function fetchJobs(): Promise<FetchResult<JobData>> {
  const tableNames = [TABLE_JOBS];
  if (TABLE_JOBS === 'JobsData') tableNames.push('jobs_data');

  for (const tableName of tableNames) {
    const { data, error } = await supabase.from(tableName).select('*').order('job_id');
    if (!error) {
      return { data: (data ?? []).map((row) => rowToJob(row as Record<string, unknown>)) };
    }
    const msg = `${error.message}${error.code ? ` [${error.code}]` : ''}`;
    const isNotFound =
      error.code === '42P01' ||
      /does not exist|relation.*not found/i.test(error.message);
    if (!isNotFound || tableName === tableNames[tableNames.length - 1]) {
      console.warn('Supabase jobs:', msg);
      return { error: msg };
    }
  }
  return { error: 'Could not load jobs' };
}

/** Fetches jobs for one vendor: by job_ids if provided, otherwise by vendor_id. Uses JobsData then jobs_data. */
export async function fetchJobsForVendor(
  vendorId: number,
  jobIds?: number[]
): Promise<JobData[]> {
  const tableNames = [TABLE_JOBS];
  if (TABLE_JOBS === 'JobsData') tableNames.push('jobs_data');

  for (const tableName of tableNames) {
    let query = supabase.from(tableName).select('*');
    if (jobIds && jobIds.length > 0) {
      query = query.in('job_id', jobIds);
    } else {
      query = query.eq('vendor_id', vendorId);
    }
    const { data, error } = await query.order('job_id');
    if (!error) {
      return (data ?? []).map((row) => rowToJob(row as Record<string, unknown>));
    }
    const isNotFound =
      error.code === '42P01' ||
      /does not exist|relation.*not found/i.test(error.message);
    if (!isNotFound || tableName === tableNames[tableNames.length - 1]) {
      console.warn('Supabase fetchJobsForVendor:', error.message);
      return [];
    }
  }
  return [];
}

/** Fetches jobs for one consumer: by job_ids if provided, otherwise by consumer_name. Uses JobsData then jobs_data. */
export async function fetchJobsForConsumer(
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
      console.warn('Supabase fetchJobsForConsumer:', error.message);
      return [];
    }
  }
  return [];
}

/** Updates a job's status (e.g. 5 = Booked). Tries JobsData then jobs_data. */
export async function updateJobStatus(
  jobId: number,
  status: number
): Promise<{ ok: true } | { error: string }> {
  const tableNames = [TABLE_JOBS];
  if (TABLE_JOBS === 'JobsData') tableNames.push('jobs_data');

  for (const tableName of tableNames) {
    const { error } = await supabase
      .from(tableName)
      .update({ status })
      .eq('job_id', jobId);
    if (!error) return { ok: true };
    const isNotFound =
      error.code === '42P01' ||
      /does not exist|relation.*not found/i.test(error.message);
    if (!isNotFound || tableName === tableNames[tableNames.length - 1]) {
      console.warn('Supabase updateJobStatus:', error.message);
      return { error: error.message };
    }
  }
  return { error: 'Could not update job' };
}

/** Insert new vendor; returns normalized VendorData or null. Caller must provide vendor_id if table has no default. */
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
  if (payload.vendor_id != null) row.vendor_id = payload.vendor_id;
  const { data, error } = await supabase.from(TABLE_VENDOR).insert(row).select().single();
  if (error) {
    console.warn('Supabase insert vendor:', error.message, error.details, error.hint);
    return null;
  }
  return data ? rowToVendor(data as Record<string, unknown>) : null;
}

/** Insert new consumer. Returns { data } on success or { error: string } on failure. */
export async function insertConsumer(payload: {
  consumer_name: string;
  job_count?: number;
  job_ids?: number[] | null;
}): Promise<{ data: ConsumerData } | { error: string }> {
  const row = {
    consumer_name: payload.consumer_name,
    job_count: payload.job_count ?? 0,
    job_ids: payload.job_ids ?? [],
  };
  const { data, error } = await supabase.from(TABLE_CONSUMER).insert(row).select().single();
  if (error) {
    const msg = error.message + (error.hint ? ` (${error.hint})` : '') + (error.code ? ` [${error.code}]` : '');
    console.warn('Supabase insert consumer:', msg);
    return { error: msg };
  }
  return data ? { data: rowToConsumer(data as Record<string, unknown>) } : { error: 'No data returned' };
}

/** Log Supabase connection/table errors for debugging. Call from app init if needed. */
export async function checkSupabaseAccess(): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.from(TABLE_CONSUMER).select('consumer_name').limit(1);
  if (error) {
    return { ok: false, message: `ConsumerData: ${error.message} (code: ${error.code}). Enable RLS policies or disable RLS for the table.` };
  }
  return { ok: true, message: 'Connected' };
}
