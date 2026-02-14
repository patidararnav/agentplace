import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Sparkles, Wrench, Calendar } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { insertCustomer } from '@/lib/supabase-data';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Fix a leak under my kitchen sink',
  'Deep clean my 2BR apartment this weekend',
  'Install a ceiling fan in the bedroom',
  'Paint my living room walls — neutral tones',
];

export function PromptPage() {
  const [prompt, setPrompt] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerError, setCustomerError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const promptSelectCustomer = (location.state as { promptSelectCustomer?: boolean } | null)?.promptSelectCustomer ?? false;
  const { setLastPrompt, userLocation, setUserLocation, customers, selectedCustomer, setSelectedCustomer, refetchCustomers, dataError } = useApp();

  useEffect(() => {
    if (!userLocation) setUserLocation({ lat: 37.4419, lng: -122.143 });
  }, [userLocation, setUserLocation]);

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setLastPrompt(trimmed);
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
            Agent Place
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
            onClick={() => navigate('/customer/calendar')}
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
              onClick={handleSubmit}
              disabled={!prompt.trim()}
              size="lg"
              className="w-full rounded-xl text-base font-medium gap-2"
            >
              Find vendors
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
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
                <p className="text-xs opacity-90">Check table name (ConsumerData), RLS policies, and SUPABASE_SETUP.md.</p>
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
                <p>No customers loaded. You have data in Supabase?</p>
                <p className="text-xs">If yes, RLS may be blocking SELECT. Run in SQL Editor: ALTER TABLE public.&quot;ConsumerData&quot; DISABLE ROW LEVEL SECURITY;</p>
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
