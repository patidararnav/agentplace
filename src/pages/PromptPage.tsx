import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { insertConsumer } from '@/lib/supabase-data';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Fix a leak under my kitchen sink',
  'Deep clean my 2BR apartment this weekend',
  'Install a ceiling fan in the bedroom',
  'Paint my living room walls — neutral tones',
];

export function PromptPage() {
  const [prompt, setPrompt] = useState('');
  const [consumerOpen, setConsumerOpen] = useState(false);
  const [consumerSearch, setConsumerSearch] = useState('');
  const [newConsumerName, setNewConsumerName] = useState('');
  const [creatingConsumer, setCreatingConsumer] = useState(false);
  const [consumerError, setConsumerError] = useState('');
  const navigate = useNavigate();
  const { setLastPrompt, userLocation, setUserLocation, consumers, selectedConsumer, setSelectedConsumer, refetchConsumers, dataError } = useApp();

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

  const filteredConsumers = consumerSearch.trim()
    ? consumers.filter((c) =>
        c.consumer_name.toLowerCase().includes(consumerSearch.toLowerCase())
      )
    : consumers;
  const sortedConsumers = [...filteredConsumers].sort(
    (a, b) => b.job_count - a.job_count || a.consumer_name.localeCompare(b.consumer_name)
  );

  const handleCreateConsumer = async () => {
    const name = newConsumerName.trim();
    if (!name) return;
    setCreatingConsumer(true);
    const result = await insertConsumer({ consumer_name: name, job_count: 0, job_ids: [] });
    setCreatingConsumer(false);
    if ('data' in result) {
      await refetchConsumers();
      setSelectedConsumer(result.data);
      setNewConsumerName('');
      setConsumerOpen(false);
      setConsumerError('');
    } else {
      setConsumerError(result.error);
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
          {/* Consumer picker */}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setConsumerOpen(true)}
          >
            {selectedConsumer ? selectedConsumer.consumer_name : 'Choose consumer'}
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

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-16">
        <div className="w-full max-w-xl space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              What do you need done?
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

            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="text-xs text-muted-foreground bg-muted/60 hover:bg-muted hover:text-foreground rounded-full px-3 py-1.5 transition-colors"
                >
                  {s}
                </button>
              ))}
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

      {/* Consumer picker dialog */}
      <Dialog open={consumerOpen} onOpenChange={setConsumerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose or create consumer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {consumerError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {consumerError}
              </p>
            )}
            {dataError?.consumers && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2 space-y-1">
                <p className="font-medium">Could not load consumers</p>
                <p className="text-xs">{dataError.consumers}</p>
                <p className="text-xs opacity-90">Check table name (ConsumerData), RLS policies, and SUPABASE_SETUP.md.</p>
              </div>
            )}
            <Input
              placeholder="Search by name..."
              value={consumerSearch}
              onChange={(e) => setConsumerSearch(e.target.value)}
              className="w-full"
            />
            {sortedConsumers.length === 0 && !dataError?.consumers ? (
              <div className="text-sm text-muted-foreground py-4 text-center space-y-1">
                <p>No consumers loaded. You have data in Supabase?</p>
                <p className="text-xs">If yes, RLS may be blocking SELECT. Run in SQL Editor: ALTER TABLE public.&quot;ConsumerData&quot; DISABLE ROW LEVEL SECURITY;</p>
              </div>
            ) : sortedConsumers.length === 0 ? null : (
            <div className="max-h-[200px] overflow-auto space-y-1">
              {sortedConsumers.slice(0, 50).map((c) => (
                <button
                  key={c.consumer_name}
                  type="button"
                  onClick={() => {
                    setSelectedConsumer(c);
                    setConsumerOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                    selectedConsumer?.consumer_name === c.consumer_name
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
                placeholder="New consumer name"
                value={newConsumerName}
                onChange={(e) => setNewConsumerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateConsumer()}
              />
              <Button onClick={handleCreateConsumer} disabled={!newConsumerName.trim() || creatingConsumer}>
                {creatingConsumer ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
