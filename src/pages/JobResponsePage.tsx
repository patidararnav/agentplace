import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  Check,
  Star,
  Clock,
  DollarSign,
  TrendingDown,
  ArrowLeft,
  Calendar,
  CalendarX2,
  MessageSquare,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { NegotiationChatModal } from '@/components/NegotiationChatModal';
import { useApp } from '@/context/AppContext';
import type { VendorQuote } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createJob, fetchJobById, updateJobStatus } from '@/lib/supabase-data';

function formatDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const JOB_STATUS_BOOKED = 5;

function parseDate(dateTime: string): string | undefined {
  const date = dateTime.split('T')[0] ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function parseStartTime(dateTime: string): string {
  const timeWithZone = dateTime.split('T')[1] ?? '';
  const hhmm = timeWithZone.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '09:00';
}

export function JobResponsePage() {
  const navigate = useNavigate();
  const { negotiationResults, selectedCustomer, negotiateParams, refetchCustomers, refetchVendors } = useApp();
  const [selectedChat, setSelectedChat] = useState<VendorQuote | null>(null);
  const [acceptedQuote, setAcceptedQuote] = useState<VendorQuote | null>(null);
  const [acceptingVendorId, setAcceptingVendorId] = useState<number | null>(null);
  const [acceptError, setAcceptError] = useState('');

  const stats = negotiationResults?.stats ?? { vendorsSearched: 0, vendorsNegotiated: 0, avgSavings: 0 };
  const quotes = negotiationResults?.quotes ?? [];
  const unavailableVendors = negotiationResults?.unavailableVendors ?? [];

  async function handleAccept(q: VendorQuote) {
    if (!selectedCustomer) {
      navigate('/', { state: { promptSelectCustomer: true } });
      return;
    }

    setAcceptError('');
    setAcceptingVendorId(q.vendorId);
    try {
      let accepted = q;
      let bookedExistingRow = false;
      const jobPayload = {
        vendor_id: q.vendorId,
        vendor_name: q.name,
        consumer_name: selectedCustomer.consumer_name,
        job_type: negotiateParams?.service ?? 'general',
        price: q.price,
        duration_minutes: q.durationMinutes,
        date: parseDate(q.dateTime),
        start_time: parseStartTime(q.dateTime),
        status: JOB_STATUS_BOOKED,
      };

      if (q.job_id != null) {
        const statusResult = await updateJobStatus(q.job_id, JOB_STATUS_BOOKED);
        if (!('error' in statusResult)) {
          const existing = await fetchJobById(q.job_id);
          if (
            existing &&
            existing.vendor_id === q.vendorId &&
            existing.consumer_name === selectedCustomer.consumer_name
          ) {
            accepted = { ...q, job_id: existing.job_id };
            bookedExistingRow = true;
          }
        }
      }

      if (!bookedExistingRow) {
        const createResult = await createJob(jobPayload);
        if ('error' in createResult) {
          setAcceptError(createResult.error);
          return;
        }
        accepted = { ...q, job_id: createResult.data.job_id };
      }

      await Promise.allSettled([refetchCustomers(), refetchVendors()]);
      setAcceptedQuote(accepted);
    } finally {
      setAcceptingVendorId(null);
    }
  }

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => navigate('/customer/agents')}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <BrandLogo className="h-12 w-12" />
          <div>
            <h1 className="text-base font-semibold text-foreground">Your top quotes</h1>
            <p className="text-xs text-muted-foreground">
              {stats.vendorsSearched} vendors scanned · {stats.vendorsNegotiated} negotiated · {stats.avgSavings}% avg savings
            </p>
          </div>
        </div>
      </header>

      {/* Quotes */}
      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {acceptError && (
            <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-2">
              {acceptError}
            </div>
          )}
          {quotes.length === 0 && (
            <div className="text-center py-20 space-y-3">
              <Sparkles className="size-10 text-muted-foreground/30 mx-auto" />
              <h2 className="text-lg font-semibold text-foreground">No quotes yet</h2>
              <p className="text-sm text-muted-foreground">
                Submit a request from the home page to get real vendor quotes via agent negotiation.
              </p>
              <Button variant="outline" onClick={() => navigate('/')}>
                Go to home
              </Button>
            </div>
          )}
          {quotes.map((q, idx) => {
            const savings = Math.round(
              ((q.originalPrice - q.price) / q.originalPrice) * 100
            );
            const displayTags = (q.insightTags ?? []).filter((tag) => !/\brounds?\b/i.test(tag));
            return (
              <Card
                key={q.vendorId}
                className={
                  idx === 0
                    ? 'border-primary/30 bg-card shadow-md'
                    : 'bg-card'
                }
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: vendor info */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2.5">
                        <div className="size-9 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                          {q.rank}
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground leading-tight">
                            {q.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            {idx === 0 && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Star className="size-3" />
                                Best match
                              </Badge>
                            )}
                            <Badge
                              variant="secondary"
                              className="text-xs gap-1 text-[var(--success)] bg-[var(--success-muted)] border-[var(--success)]/30"
                            >
                              <TrendingDown className="size-3" />
                              {savings}% off
                            </Badge>
                          </div>
                          {displayTags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {displayTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[11px] px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/50"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <Separator className="bg-border/50" />

                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3.5" />
                          {formatDate(q.dateTime)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3.5" />
                          {q.durationMinutes} min
                        </span>
                      </div>
                    </div>

                    {/* Right: price */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-muted-foreground line-through">
                        ${q.originalPrice}
                      </div>
                      <div className="flex items-baseline gap-0.5">
                        <DollarSign className="size-4 text-muted-foreground" />
                        <span className="text-3xl font-bold text-foreground tracking-tight">
                          {q.price}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-border/30">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => setSelectedChat(q)}
                    >
                      <MessageCircle className="size-4" />
                      Negotiation
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5"
                      disabled={acceptingVendorId != null}
                      onClick={() => handleAccept(q)}
                    >
                      <Check className="size-4" />
                      {acceptingVendorId === q.vendorId ? 'Accepting…' : 'Accept'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Unavailable vendors (schedule mismatch) */}
          {unavailableVendors.length > 0 && (
            <div className="space-y-3 pt-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                No availability for your times
              </p>
              {unavailableVendors.map((v) => (
                <Card
                  key={v.name}
                  className="border-border/20 bg-muted/20 opacity-50"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-full bg-muted/60 flex items-center justify-center">
                        <CalendarX2 className="size-4 text-muted-foreground/60" />
                      </div>
                      <div>
                        <h4 className="font-medium text-muted-foreground">
                          {v.name}
                        </h4>
                        <p className="text-xs text-muted-foreground/50 mt-0.5">
                          {v.reason}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Job booked — choose next: new prompt or calendar */}
      {acceptedQuote && (
        <Dialog open onOpenChange={() => setAcceptedQuote(null)}>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <span className="flex size-9 items-center justify-center rounded-full bg-[var(--success-muted)]">
                  <Check className="size-5 text-[var(--success)]" />
                </span>
                Job booked
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {acceptedQuote.name} is confirmed. You can start a new request or view your calendar.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                className="w-full gap-2"
                onClick={() => {
                  setAcceptedQuote(null);
                  navigate('/');
                }}
              >
                <MessageSquare className="size-4" />
                New prompt
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  if (!selectedCustomer) {
                    setAcceptedQuote(null);
                    navigate('/', { state: { promptSelectCustomer: true } });
                    return;
                  }
                  setAcceptedQuote(null);
                  navigate('/customer/calendar');
                }}
              >
                <Calendar className="size-4" />
                My calendar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Negotiation chat modal */}
      {selectedChat && (
        <NegotiationChatModal
          messages={selectedChat.negotiationMessages}
          vendorName={selectedChat.name}
          onClose={() => setSelectedChat(null)}
        />
      )}
    </div>
  );
}
