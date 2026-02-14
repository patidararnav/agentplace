import { createContext, useContext, useState, type ReactNode } from 'react';
import type { UserLocation } from '@/types';
import { defaultUserLocation } from '@/data/mock';

interface AppState {
  userLocation: UserLocation | null;
  setUserLocation: (loc: UserLocation) => void;
  lastPrompt: string;
  setLastPrompt: (p: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(defaultUserLocation);
  const [lastPrompt, setLastPrompt] = useState('');

  return (
    <AppContext.Provider
      value={{
        userLocation,
        setUserLocation,
        lastPrompt,
        setLastPrompt,
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
