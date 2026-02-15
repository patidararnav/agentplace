import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles, CheckCircle2, Circle, Clock, CreditCard,
  Star, ArrowLeft, MapPin, ShieldCheck, Loader2, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { updateJobStatus, fetchJobById } from '@/lib/supabase-data';
import type { PlannedJob } from '@/types';
import { cn } from '@/lib/utils';

const FULFILLMENT_STEPS = [
  { id: 'booked', label: 'Job booked', detail: 'Escrow secured' },
  { id: 'in-progress', label: 'In progress', detail: 'Job in progress' },
  { id: 'completed', label: 'Project completed', detail: 'Work done. Confirm completion.' },
  { id: 'payment', label: 'Payment sent', detail: 'Payment sent to vendor' },
  { id: 'received', label: 'Payment received', detail: 'Rate your experience' },
];

/** Number of steps done (1–5) from job status: 5→1, 6→2, 7→3, 8→4, 9→5 */
function stepsDoneFromStatus(status: number | undefined): number {
  if (status == null || status < 5) return 0;
  const map: Record<number, number> = { 5: 1, 6: 2, 7: 3, 8: 4, 9: 5 };
  return map[status] ?? 0;
}

export function FulfillmentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname ?? '';
  const isVendorTracking = pathname.includes('/vendor/');
  const stateJob = (location.state as { job?: PlannedJob; fromCalendar?: boolean } | null)?.job;
  const fromCalendar = (location.state as { fromCalendar?: boolean } | null)?.fromCalendar ?? false;

  const job: PlannedJob | null = stateJob ?? null;

  const [confirmed, setConfirmed] = useState(() => (job?.status != null && job.status >= 7));
  const [paymentReleased, setPaymentReleased] = useState(() => (job?.status != null && job.status >= 8));
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(() => (job?.status != null && job.status >= 9));
  const [statusOverride, setStatusOverride] = useState<number | null>(null);
  const [serverStatus, setServerStatus] = useState<number | null>(null);

  const pollIntervalMs = 5000;
  useEffect(() => {
    if (!job?.id) return;
    const fetch = () => {
      fetchJobById(Number(job.id))
        .then((j) => j != null && setServerStatus(j.status));
    };
    fetch();
    const interval = setInterval(fetch, pollIntervalMs);
    return () => clearInterval(interval);
  }, [job?.id]);

  const effectiveStatus = statusOverride ?? serverStatus ?? job?.status ?? 0;
  const stepsDoneByStatus = stepsDoneFromStatus(effectiveStatus);

  const handleBack = () => {
    if (isVendorTracking) navigate('/vendor/calendar');
    else if (fromCalendar) navigate('/customer/calendar');
    else navigate('/customer/results');
  };

  const handleMarkInProgress = () => {
    if (job?.id) updateJobStatus(Number(job.id), 6);
    setStatusOverride(6);
  };

  const handleCustomerConfirmComplete = () => {
    setConfirmed(true);
    if (job?.id) updateJobStatus(Number(job.id), 7);
    setStatusOverride(7);
  };

  const handleCustomerReleasePayment = () => {
    if (job?.id) updateJobStatus(Number(job.id), 8);
    setPaymentReleased(true);
  };

  const handleSubmitReview = () => {
    setReviewSubmitted(true);
    if (job?.id) updateJobStatus(Number(job.id), 9);
    setTimeout(() => navigate(isVendorTracking ? '/vendor/calendar' : fromCalendar ? '/customer/calendar' : '/'), 2000);
  };

  const displayTitle = job?.jobType ?? 'Untitled job';
  const displayVendor = job?.vendorName ?? 'Unknown vendor';
  const displayCustomer = job?.customerName ?? '';
  const displayPrice = job?.price ?? 0;
  const displayDate = job?.dateTime
    ? new Date(job.dateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Not scheduled';
  const displayDuration = job?.durationMinutes ?? 0;

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-8" onClick={handleBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Job Tracking</h1>
            <p className="text-xs text-muted-foreground">
              {displayVendor}{displayCustomer ? ` · ${displayCustomer}` : ''} · {displayTitle}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Job summary card */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{displayTitle}</h3>
                  <p className="text-sm text-muted-foreground">
                    {displayVendor}{displayCustomer ? ` · ${displayCustomer}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-foreground">${displayPrice}</div>
                  <Badge variant="secondary" className="text-xs gap-1 mt-1">
                    <ShieldCheck className="size-3" />
                    Escrow held
                  </Badge>
                </div>
              </div>
              <Separator className="my-4 bg-border/50" />
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {displayDate}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  Palo Alto, CA
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {displayDuration} min estimated
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Fulfillment timeline */}
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Fulfillment Agent — Live Tracking
            </h2>

            {FULFILLMENT_STEPS.map((step, idx) => {
              const doneFromStatus = idx < stepsDoneByStatus;
              const isDone =
                doneFromStatus ||
                (step.id === 'completed' && (effectiveStatus >= 7 || confirmed)) ||
                (step.id === 'payment' && (effectiveStatus >= 8 || paymentReleased)) ||
                (step.id === 'received' && (effectiveStatus >= 9 || reviewSubmitted || (isVendorTracking && effectiveStatus >= 8)));
              const isActive = !isDone && (
                (step.id === 'completed' && !confirmed && stepsDoneByStatus >= 2 && effectiveStatus <= 6 && !isVendorTracking) ||
                (step.id === 'payment' && confirmed && !paymentReleased && !isVendorTracking) ||
                (step.id === 'received' && paymentReleased && !reviewSubmitted && !isVendorTracking)
              );
              const isLast = idx === FULFILLMENT_STEPS.length - 1;

              return (
                <div key={step.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'size-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-500',
                        isDone
                          ? 'border-[var(--success)] bg-[var(--success-muted)]'
                          : isActive
                          ? 'border-primary bg-primary/15'
                          : 'border-border bg-card'
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-[var(--success)]" />
                      ) : isActive ? (
                        <Loader2 className="size-3.5 text-primary animate-spin" />
                      ) : (
                        <Circle className="size-3 text-muted-foreground" />
                      )}
                    </div>
                    {!isLast && (
                      <div
                        className={cn(
                          'w-px flex-1 min-h-[24px]',
                          isDone ? 'bg-[var(--success)]/20' : 'bg-border/40'
                        )}
                      />
                    )}
                  </div>

                  <div className="pb-5 -mt-0.5">
                    <p
                      className={cn(
                        'text-sm font-medium leading-tight',
                        isDone ? 'text-foreground' : isActive ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{step.detail}</p>

                    {step.id === 'in-progress' && isVendorTracking && effectiveStatus === 5 && (
                      <div className="mt-3">
                        <Button size="sm" onClick={handleMarkInProgress} className="gap-1.5">
                          <Play className="size-4" />
                          Go — Start job
                        </Button>
                      </div>
                    )}

                    {step.id === 'in-progress' && !isVendorTracking && effectiveStatus === 5 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Waiting for vendor to start the job.
                      </p>
                    )}

                    {step.id === 'completed' && !isVendorTracking && !confirmed && stepsDoneByStatus >= 2 && effectiveStatus <= 6 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Confirm when the work is done.
                        </p>
                        <Button size="sm" onClick={handleCustomerConfirmComplete} className="gap-1.5">
                          <CheckCircle2 className="size-4" />
                          Confirm job complete
                        </Button>
                      </div>
                    )}

                    {step.id === 'completed' && isVendorTracking && effectiveStatus >= 6 && effectiveStatus < 7 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Waiting for customer to confirm completion.
                      </p>
                    )}

                    {step.id === 'payment' && !isVendorTracking && effectiveStatus >= 7 && !paymentReleased && (
                      <div className="mt-3">
                        <Button size="sm" onClick={handleCustomerReleasePayment} className="gap-1.5">
                          <CreditCard className="size-4" />
                          Release payment to vendor
                        </Button>
                      </div>
                    )}
                    {step.id === 'payment' && (paymentReleased || effectiveStatus >= 8) && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-[var(--success)]">
                        <CreditCard className="size-3.5" />
                        {`$${displayPrice} released to ${displayVendor}`}
                      </div>
                    )}
                    {step.id === 'payment' && isVendorTracking && effectiveStatus >= 7 && effectiveStatus < 8 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Waiting for customer to release payment.
                      </p>
                    )}

                    {step.id === 'received' && paymentReleased && !reviewSubmitted && !reviewOpen && !isVendorTracking && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 gap-1.5"
                        onClick={() => setReviewOpen(true)}
                      >
                        <Star className="size-4" />
                        Leave a review
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Review form (customer only; vendor cannot leave a review) */}
          {!isVendorTracking && reviewOpen && !reviewSubmitted && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Star className="size-4 text-primary" />
                  Rate {displayVendor}
                </h3>

                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className="p-1 transition-colors"
                    >
                      <Star
                        className={cn(
                          'size-7',
                          n <= rating
                            ? 'text-primary fill-primary'
                            : 'text-muted-foreground/30'
                        )}
                      />
                    </button>
                  ))}
                </div>

                <Textarea
                  placeholder="How was your experience? (optional)"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  className="min-h-[80px] resize-none"
                />

                <Button
                  onClick={handleSubmitReview}
                  disabled={rating === 0}
                  className="w-full gap-1.5"
                >
                  <CheckCircle2 className="size-4" />
                  Submit review
                </Button>
              </CardContent>
            </Card>
          )}

          {!isVendorTracking && reviewSubmitted && (
            <Card className="border-[var(--success)]/30">
              <CardContent className="p-5 text-center space-y-2">
                <CheckCircle2 className="size-10 text-[var(--success)] mx-auto" />
                <h3 className="font-semibold text-foreground">Review submitted!</h3>
                <p className="text-sm text-muted-foreground">
                  Reputation Agent updated vendor score. Redirecting...
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
