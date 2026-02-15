import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

import type { UserLocation, VendorData, CustomerData, JobData, VendorQuote } from '@/types';
import { fetchVendors, fetchCustomers, fetchJobs } from '@/lib/supabase-data';
import type { NegotiateParams } from '@/lib/api';

/** Vendor that was service-matched but had no schedule overlap */
export interface UnavailableVendor {
  name: string;
  reason: string;
}

/** Negotiation results stored after the agent orchestration completes */
export interface NegotiationResults {
  quotes: VendorQuote[];
  unavailableVendors: UnavailableVendor[];
  stats: { vendorsSearched: number; vendorsNegotiated: number; avgSavings: number };
  outcome: string;
  winner: string;
  winnerPrice: number;
}

interface AppState {
  userLocation: UserLocation | null;
  setUserLocation: (loc: UserLocation) => void;
  lastPrompt: string;
  setLastPrompt: (p: string) => void;
  vendors: VendorData[];
  customers: CustomerData[];
  jobs: JobData[];
  dataLoading: boolean;
  
  /** Set when fetch fails (e.g. RLS, wrong table name). Empty string when OK. */
  dataError: { vendors?: string; customers?: string; jobs?: string };
  refetchVendors: () => Promise<void>;
  refetchCustomers: () => Promise<void>;
  refetchJobs: () => Promise<void>;
  refetchAll: () => Promise<void>;
  selectedVendor: VendorData | null;
  setSelectedVendor: (v: VendorData | null) => void;
  selectedCustomer: CustomerData | null;
  setSelectedCustomer: (c: CustomerData | null) => void;
  /** Parameters for the current negotiation (set from PromptPage) */
  negotiateParams: NegotiateParams | null;
  setNegotiateParams: (p: NegotiateParams | null) => void;
  /** Results from the completed negotiation (set from AgentMatchingPage) */
  negotiationResults: NegotiationResults | null;
  setNegotiationResults: (r: NegotiationResults | null) => void;
}

const STORAGE_KEY_VENDOR = 'agentplace_selected_vendor_id';
const STORAGE_KEY_CUSTOMER = 'agentplace_selected_customer_name';

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [lastPrompt, setLastPrompt] = useState('');
  const [vendors, setVendors] = useState<VendorData[]>([]);
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<{ vendors?: string; customers?: string; jobs?: string }>({});
  const [selectedVendor, setSelectedVendorState] = useState<VendorData | null>(null);
  const [selectedCustomer, setSelectedCustomerState] = useState<CustomerData | null>(null);
  const [negotiateParams, setNegotiateParams] = useState<NegotiateParams | null>(null);
  const [negotiationResults, setNegotiationResults] = useState<NegotiationResults | null>(null);

  const setSelectedVendor = useCallback((v: VendorData | null) => {
    setSelectedVendorState(v);
    try {
      localStorage.setItem(STORAGE_KEY_VENDOR, String(v?.vendor_id ?? ''));
    } catch (_) {}
  }, []);
  const setSelectedCustomer = useCallback((c: CustomerData | null) => {
    setSelectedCustomerState(c);
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOMER, c?.consumer_name ?? '');
    } catch (_) {}
  }, []);

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
  const refetchCustomers = useCallback(async () => {
    const result = await fetchCustomers();
    if (result.error) {
      setDataError((e) => ({ ...e, customers: result.error }));
      setCustomers([]);
    } else {
      setDataError((e) => ({ ...e, customers: undefined }));
      setCustomers(result.data ?? []);
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
    await Promise.all([refetchVendors(), refetchCustomers(), refetchJobs()]);
    setDataLoading(false);
  }, [refetchVendors, refetchCustomers, refetchJobs]);

  useEffect(() => {
    refetchAll();
  }, [refetchAll]);

  // Persist selection to localStorage (done in setters). Restore after load and re-sync when lists change.
  useEffect(() => {
    if (vendors.length === 0 && customers.length === 0) return;
    const savedVendorId = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_VENDOR) : null;
    const savedCustomerName = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_CUSTOMER) : null;
    if (vendors.length > 0) {
      if (selectedVendor?.vendor_id != null) {
        const found = vendors.find((v) => v.vendor_id === selectedVendor.vendor_id);
        if (found && found !== selectedVendor) setSelectedVendorState(found);
      } else if (savedVendorId && String(savedVendorId).trim() !== '') {
        const id = Number(savedVendorId);
        if (!Number.isNaN(id)) {
          const found = vendors.find((v) => v.vendor_id === id);
          if (found) setSelectedVendorState(found);
        }
      }
    }
    if (customers.length > 0) {
      if (selectedCustomer?.consumer_name != null) {
        const found = customers.find((c) => c.consumer_name === selectedCustomer.consumer_name);
        if (found && found !== selectedCustomer) setSelectedCustomerState(found);
      } else if (savedCustomerName) {
        const found = customers.find((c) => c.consumer_name === savedCustomerName);
        if (found) setSelectedCustomerState(found);
      }
    }
  }, [vendors, customers, selectedVendor?.vendor_id, selectedCustomer?.consumer_name]);

  return (
    <AppContext.Provider
      value={{
        userLocation,
        setUserLocation,
        lastPrompt,
        setLastPrompt,
        vendors,
        customers,
        jobs,
        dataLoading,
        dataError,
        refetchVendors,
        refetchCustomers,
        refetchJobs,
        refetchAll,
        selectedVendor,
        setSelectedVendor,
        selectedCustomer,
        setSelectedCustomer,
        negotiateParams,
        setNegotiateParams,
        negotiationResults,
        setNegotiationResults,
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
