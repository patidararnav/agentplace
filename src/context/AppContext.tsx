import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { UserLocation, VendorData, ConsumerData, JobData } from '@/types';
import { defaultUserLocation } from '@/data/mock';
import { fetchVendors, fetchConsumers, fetchJobs } from '@/lib/supabase-data';

interface AppState {
  userLocation: UserLocation | null;
  setUserLocation: (loc: UserLocation) => void;
  lastPrompt: string;
  setLastPrompt: (p: string) => void;
  vendors: VendorData[];
  consumers: ConsumerData[];
  jobs: JobData[];
  dataLoading: boolean;
  /** Set when fetch fails (e.g. RLS, wrong table name). Empty string when OK. */
  dataError: { vendors?: string; consumers?: string; jobs?: string };
  refetchVendors: () => Promise<void>;
  refetchConsumers: () => Promise<void>;
  refetchJobs: () => Promise<void>;
  refetchAll: () => Promise<void>;
  selectedVendor: VendorData | null;
  setSelectedVendor: (v: VendorData | null) => void;
  selectedConsumer: ConsumerData | null;
  setSelectedConsumer: (c: ConsumerData | null) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(defaultUserLocation);
  const [lastPrompt, setLastPrompt] = useState('');
  const [vendors, setVendors] = useState<VendorData[]>([]);
  const [consumers, setConsumers] = useState<ConsumerData[]>([]);
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<{ vendors?: string; consumers?: string; jobs?: string }>({});
  const [selectedVendor, setSelectedVendor] = useState<VendorData | null>(null);
  const [selectedConsumer, setSelectedConsumer] = useState<ConsumerData | null>(null);

  const refetchVendors = useCallback(async () => {
    const result = await fetchVendors();
    if (result.error) {
      setDataError((e) => ({ ...e, vendors: result.error }));
      setVendors([]);
    } else {
      setDataError((e) => ({ ...e, vendors: undefined }));
      setVendors(result.data ?? []);
    }
  }, []);
  const refetchConsumers = useCallback(async () => {
    const result = await fetchConsumers();
    if (result.error) {
      setDataError((e) => ({ ...e, consumers: result.error }));
      setConsumers([]);
    } else {
      setDataError((e) => ({ ...e, consumers: undefined }));
      setConsumers(result.data ?? []);
    }
  }, []);
  const refetchJobs = useCallback(async () => {
    const result = await fetchJobs();
    if (result.error) {
      setDataError((e) => ({ ...e, jobs: result.error }));
      setJobs([]);
    } else {
      setDataError((e) => ({ ...e, jobs: undefined }));
      setJobs(result.data ?? []);
    }
  }, []);
  const refetchAll = useCallback(async () => {
    setDataLoading(true);
    setDataError({});
    await Promise.all([refetchVendors(), refetchConsumers(), refetchJobs()]);
    setDataLoading(false);
  }, [refetchVendors, refetchConsumers, refetchJobs]);

  useEffect(() => {
    refetchAll();
  }, [refetchAll]);

  return (
    <AppContext.Provider
      value={{
        userLocation,
        setUserLocation,
        lastPrompt,
        setLastPrompt,
        vendors,
        consumers,
        jobs,
        dataLoading,
        dataError,
        refetchVendors,
        refetchConsumers,
        refetchJobs,
        refetchAll,
        selectedVendor,
        setSelectedVendor,
        selectedConsumer,
        setSelectedConsumer,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
