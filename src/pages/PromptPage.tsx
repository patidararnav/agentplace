import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Sparkles, Wrench, Calendar, Info } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { insertCustomer } from '@/lib/supabase-data';
import { fetchAvgPrice } from '@/lib/api';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Fix a leak under my kitchen sink',
  'Deep clean my 2BR apartment this weekend',
  'Install a ceiling fan in the bedroom',
  'Paint my living room walls — neutral tones',
];
const SLOT_LABELS = ['8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p'];

function nextWeekDays(): Date[] {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatAvailabilityForNotes(selected: Set<string>): string {
  if (selected.size === 0) return 'No availability provided.';

  const grouped: Record<string, string[]> = {};
  const sorted = [...selected].sort();
  for (const key of sorted) {
    const [day, slot] = key.split('|');
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(slot);
  }

  return Object.entries(grouped)
    .map(([day, slots]) => `${day}: ${slots.join(', ')}`)
    .join('\n');
}

function inferServiceFromPrompt(prompt: string, fallback = ''): string {
  const lower = prompt.toLowerCase();
  let service = fallback;
  if (lower.includes('electric')) service = 'electrical';
  else if (lower.includes('clean')) service = 'cleaning';
  else if (lower.includes('paint')) service = 'painting';
  else if (lower.includes('roof')) service = 'roofing';
  else if (lower.includes('plumb') || lower.includes('leak') || lower.includes('faucet') || lower.includes('pipe') || lower.includes('drain') || lower.includes('sink')) service = 'plumbing';
  else if (lower.includes('fan') || lower.includes('install')) service = 'electrical';
  return service;
}


export function PromptPage() {
  const [prompt, setPrompt] = useState('');
  const [urgency, setUrgency] = useState('');
  const [city, setCity] = useState('');
  const [budgetStr, setBudgetStr] = useState('');
  const [avgPrice, setAvgPrice] = useState<{ avg_price: number; job_count: number; matched_types: string[] } | null>(null);
  const [avgPriceLoading, setAvgPriceLoading] = useState(false);
  const [selectedAvailability, setSelectedAvailability] = useState<Set<string>>(new Set());
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerError, setCustomerError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const promptSelectCustomer = (location.state as { promptSelectCustomer?: boolean } | null)?.promptSelectCustomer ?? false;
  const { setLastPrompt, customers, selectedCustomer, setSelectedCustomer, refetchCustomers, dataError, setNegotiateParams } = useApp();
  const weekDays = nextWeekDays();

  useEffect(() => {
    if (!selectedCustomer) setCustomerOpen(true);
  }, [selectedCustomer]);

  // Track the last query we fetched avg price for to avoid redundant calls
  const lastFetchedQuery = useRef('');

  // Only trigger the fetch once the user has typed a meaningful description
  const trimmedPrompt = prompt.trim();
  const hasDescription = trimmedPrompt.length > 10;
  const inferredService = hasDescription ? inferServiceFromPrompt(prompt, '') : '';

  const fetchAvg = useCallback(async (query: string, service: string) => {
    if (!query || query === lastFetchedQuery.current) return;
    lastFetchedQuery.current = query;
    setAvgPriceLoading(true);
    try {
      const data = await fetchAvgPrice(query, service);
      setAvgPrice(data);
    } catch {
      setAvgPrice(null);
    } finally {
      setAvgPriceLoading(false);
    }
  }, []);

  // Debounce: fetch avg price 800ms after the user stops typing
  useEffect(() => {
    if (!hasDescription) {
      setAvgPrice(null);
      lastFetchedQuery.current = '';
      return;
    }
    const timer = setTimeout(() => fetchAvg(trimmedPrompt, inferredService), 800);
    return () => clearTimeout(timer);
  }, [trimmedPrompt, inferredService, hasDescription, fetchAvg]);

  const toggleAvailabilitySlot = (day: Date, slotLabel: string) => {
    const key = `${dateKey(day)}|${slotLabel}`;
    setSelectedAvailability((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectEntireDay = (day: Date) => {
    const dayPrefix = `${dateKey(day)}|`;
    setSelectedAvailability((prev) => {
      const next = new Set(prev);
      const allDaySlots = SLOT_LABELS.map((slotLabel) => `${dayPrefix}${slotLabel}`);
      const allSelected = allDaySlots.every((slot) => next.has(slot));
      if (allSelected) {
        allDaySlots.forEach((slot) => next.delete(slot));
      } else {
        allDaySlots.forEach((slot) => next.add(slot));
      }
      return next;
    });
  };

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    const trimmedCity = city.trim();
    if (!trimmed) return;
    if (!urgency) return;
    if (!trimmedCity) return;
    if (!selectedCustomer) {
      setCustomerOpen(true);
      return;
    }

    const inferredService = inferServiceFromPrompt(trimmed, '');
    const service = inferredService || trimmed;
    const budget = budgetStr ? parseInt(budgetStr, 10) : (avgPrice?.avg_price || 200);

    setLastPrompt(trimmed);
    const availabilityNote = formatAvailabilityForNotes(selectedAvailability);

    setNegotiateParams({
      service,
      budget,
      urgency: parseInt(urgency, 10),
      aggression: 3,
      city: trimmedCity,
      notes: `${trimmed}\n\nCUSTOMER_AVAILABILITY_NEXT_7_DAYS:\n${availabilityNote}`,
    });

    navigate('/customer/agents');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const filteredCustomers = customerSearch.trim()
    ? customers.filter((c) =>
        c.consumer_name.toLowerCase().includes(customerSearch.toLowerCase())
      )
    : customers;
  const sortedCustomers = [...filteredCustomers].sort(
    (a, b) => b.job_count - a.job_count || a.consumer_name.localeCompare(b.consumer_name)
  );

  const handleCreateCustomer = async () => {
    const name = newCustomerName.trim();
    if (!name) return;
    setCreatingCustomer(true);
    const result = await insertCustomer({ consumer_name: name, job_count: 0, job_ids: [] });
    setCreatingCustomer(false);
    if ('data' in result) {
      await refetchCustomers();
      setSelectedCustomer(result.data);
      setNewCustomerName('');
      setCustomerOpen(false);
      setCustomerError('');
    } else {
      setCustomerError(result.error);
    }
  };

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header: logo left, Vendor mode top right */}
      <header className="px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <span className="text-base font-semibold tracking-tight text-foreground">
            AgentPlace
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Customer picker */}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setCustomerOpen(true)}
          >
            {selectedCustomer ? selectedCustomer.consumer_name : 'Choose customer'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => {
              if (!selectedCustomer) {
                setCustomerOpen(true);
                return;
              }
              navigate('/customer/calendar');
            }}
          >
            <Calendar className="size-3.5" />
            My calendar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/vendor')}
          >
            <Wrench className="size-3.5" />
            Vendor mode
          </Button>
        </div>
      </header>

      {promptSelectCustomer && !selectedCustomer && (
        <div className="mx-6 mt-2 rounded-lg bg-primary/10 border border-primary/20 px-4 py-2 text-sm text-foreground">
          Select a customer below to view your calendar after booking a job.
        </div>
      )}

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
        {!selectedCustomer ? (
          <div className="w-full max-w-xl">
            <div className="rounded-2xl border border-border/60 bg-card/50 p-8 text-center space-y-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Choose or create a customer
              </h1>
              <p className="text-sm text-muted-foreground">
                Select who you are to continue. Agent orchestration is only available for customer accounts.
              </p>
              <Button onClick={() => setCustomerOpen(true)} size="lg" className="rounded-xl">
                Choose customer
              </Button>
            </div>
          </div>
        ) : (
        <div className="w-full max-w-xl space-y-8">
          <div className="space-y-2 text-center">
            <style>{`
              @keyframes gradientFlow {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
              }
              .gradient-heading-animated {
                background: linear-gradient(90deg, #ff6a00, #ff9f43, #f59e0b, #ffbe76, #ff4757, #ff6348, #ff6a00, #ff9f43) !important;
                background-size: 200% 100% !important;
                -webkit-background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
                background-clip: text !important;
                color: transparent !important;
                animation: gradientFlow 4s linear infinite !important;
              }
            `}</style>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1]">
              <span className="gradient-heading-animated">What do you need done?</span>
            </h1>
            <p className="text-muted-foreground text-base">
              Describe the job in plain English. Your agent will find vendors, negotiate the best price, and book it.
            </p>
          </div>

          <div className="space-y-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. I need a plumber to fix a leak under my kitchen sink next week..."
              className="min-h-[140px] resize-none bg-card border-border text-foreground placeholder:text-muted-foreground text-base leading-relaxed p-4 rounded-xl focus-visible:ring-primary/40"
              autoFocus
            />

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">How urgent is this job?</p>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger className="bg-card">
                  <SelectValue placeholder="Select urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Low (flexible timing)</SelectItem>
                  <SelectItem value="2">2 - Soon (within a week)</SelectItem>
                  <SelectItem value="3">3 - Medium (next few days)</SelectItem>
                  <SelectItem value="4">4 - High (as soon as possible)</SelectItem>
                  <SelectItem value="5">5 - Emergency (today)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">City</p>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Palo Alto"
                className="bg-card"
              />
            </div>

            {/* Maximum budget — shown once the user types a job description */}
            {prompt.trim().length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Maximum budget</p>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      min={1}
                      value={budgetStr}
                      onChange={(e) => setBudgetStr(e.target.value)}
                      placeholder={
                        avgPrice && avgPrice.avg_price > 0
                          ? String(avgPrice.avg_price)
                          : '200'
                      }
                      className="bg-card pl-7 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  {avgPriceLoading ? (
                    <p className="text-[11px] text-muted-foreground/60 flex-shrink-0 animate-pulse">
                      Looking up similar jobs...
                    </p>
                  ) : avgPrice && avgPrice.avg_price > 0 ? (
                    <div className="flex items-start gap-1.5 flex-shrink-0 max-w-[260px]">
                      <Info className="size-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Similar jobs average{' '}
                        <span className="text-foreground font-semibold">${avgPrice.avg_price}</span>
                        <span className="text-muted-foreground/50">
                          {' '}({avgPrice.job_count} past job{avgPrice.job_count === 1 ? '' : 's'}
                          {avgPrice.matched_types.length > 0 && (
                            <> &mdash; {avgPrice.matched_types.join(', ')}</>
                          )}
                          )
                        </span>
                      </p>
                    </div>
                  ) : avgPrice && avgPrice.job_count === 0 ? (
                    <div className="flex items-start gap-1.5 flex-shrink-0 max-w-[220px]">
                      <Info className="size-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        No similar past jobs found to estimate price.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {urgency && (
              <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">Your availability for the next week</p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedAvailability.size} slot{selectedAvailability.size === 1 ? '' : 's'} selected
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Click cells to mark when you are free.
                </p>
                <div className="overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-8 gap-1">
                      <div className="h-9" />
                      {weekDays.map((day) => (
                        <button
                          key={dateKey(day)}
                          type="button"
                          onClick={() => selectEntireDay(day)}
                          className="h-9 rounded-md bg-muted/40 px-2 py-1 text-center transition-colors hover:bg-muted/70"
                          aria-label={`Select all time slots on ${day.toDateString()}`}
                        >
                          <p className="text-[10px] text-muted-foreground">
                            {day.toLocaleDateString('en-US', { weekday: 'short' })}
                          </p>
                          <p className="text-[11px] font-medium text-foreground">
                            {day.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                          </p>
                        </button>
                      ))}
                      {SLOT_LABELS.map((slotLabel) => (
                        <div key={`row-${slotLabel}`} className="contents">
                          <div
                            className="h-8 flex items-center justify-end pr-2 text-[10px] text-muted-foreground"
                          >
                            {slotLabel}
                          </div>
                          {weekDays.map((day) => {
                            const key = `${dateKey(day)}|${slotLabel}`;
                            const active = selectedAvailability.has(key);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => toggleAvailabilitySlot(day, slotLabel)}
                                className={cn(
                                  'h-8 rounded-sm border transition-colors',
                                  active
                                    ? 'border-primary/70 bg-primary/25 hover:bg-primary/30'
                                    : 'border-border/60 bg-background hover:bg-muted/60'
                                )}
                                aria-label={`Toggle ${day.toDateString()} ${slotLabel}`}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="relative -mx-6 overflow-hidden">
              <style>{`
                @keyframes marquee {
                  0% { transform: translateX(0); }
                  100% { transform: translateX(-50%); }
                }
                .marquee-track {
                  animation: marquee 20s linear infinite;
                }
                .marquee-track:hover {
                  animation-play-state: paused;
                }
              `}</style>
              {/* Left fade */}
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-background to-transparent" />
              {/* Right fade */}
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-background to-transparent" />
              <div className="marquee-track flex gap-3 w-max px-6">
                {/* Duplicate suggestions for seamless loop */}
                {[...SUGGESTIONS, ...SUGGESTIONS].map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    type="button"
                    onClick={() => setPrompt(s)}
                    className="shrink-0 text-xs text-muted-foreground bg-muted/60 hover:bg-muted hover:text-foreground rounded-full px-3 py-1.5 transition-colors whitespace-nowrap"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={() => handleSubmit()}
              disabled={!prompt.trim() || !urgency || !city.trim()}
              size="lg"
              className="w-full rounded-xl text-base font-medium gap-2"
            >
              Find vendors
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
        )}
      </main>

      {/* Customer picker dialog */}
      <Dialog open={customerOpen} onOpenChange={setCustomerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose or create customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {customerError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {customerError}
              </p>
            )}
            {dataError?.customers && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2 space-y-1">
                <p className="font-medium">Could not load customers</p>
                <p className="text-xs">{dataError.customers}</p>
              </div>
            )}
            <Input
              placeholder="Search by name..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="w-full"
            />
            {sortedCustomers.length === 0 && !dataError?.customers ? (
              <div className="text-sm text-muted-foreground py-4 text-center space-y-1">
                <p>No consumers yet. Create one below to get started.</p>
              </div>
            ) : sortedCustomers.length === 0 ? null : (
            <div className="max-h-[200px] overflow-auto space-y-1">
              {sortedCustomers.slice(0, 50).map((c) => (
                <button
                  key={c.consumer_name}
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(c);
                    setCustomerOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                    selectedCustomer?.consumer_name === c.consumer_name
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'hover:bg-muted'
                  )}
                >
                  {c.consumer_name}
                  {c.job_count > 0 && (
                    <span className="text-muted-foreground ml-2">({c.job_count} jobs)</span>
                  )}
                </button>
              ))}
            </div>
            )}
            <div className="border-t border-border pt-4 flex gap-2">
              <Input
                placeholder="New customer name"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCustomer()}
              />
              <Button onClick={handleCreateCustomer} disabled={!newCustomerName.trim() || creatingCustomer}>
                {creatingCustomer ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
