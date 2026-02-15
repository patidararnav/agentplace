import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles, CheckCircle2, Circle, Clock, CreditCard,
  Star, ArrowLeft, MapPin, Camera, ShieldCheck, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { updateJobStatus } from '@/lib/supabase-data';
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

  const stepsDoneByStatus = job?.status != null ? stepsDoneFromStatus(job.status) : 0;

  const handleBack = () => {
    if (isVendorTracking) navigate('/vendor/calendar');
    else if (fromCalendar) navigate('/customer/calendar');
    else navigate('/customer/results');
  };

  const handleConfirmCompletion = () => {
    setConfirmed(true);
    if (job?.id) updateJobStatus(Number(job.id), 7);
  };

  // FET payment: request details then submit tx hash + wallet
  const [paymentRequest, setPaymentRequest] = useState<{
    recipient_address: string;
    amount_fet: string;
    fet_network: string;
    reference: string;
    description: string;
  } | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [buyerWallet, setBuyerWallet] = useState('');
  const [paymentAgentStatus, setPaymentAgentStatus] = useState<{
    ready: boolean;
    fet_network: string | null;
  } | null>(null);

  useEffect(() => {
    if (!confirmed || paymentReleased) return;
    let cancelled = false;
    fetch('/api/payment-agent/status')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPaymentAgentStatus({ ready: !!data.ready, fet_network: data.fet_network ?? null });
      })
      .catch(() => {
        if (!cancelled) setPaymentAgentStatus({ ready: false, fet_network: null });
      });
    return () => { cancelled = true; };
  }, [confirmed, paymentReleased]);

  const handleRequestPayment = async () => {
    if (!job?.id) return;
    setPaymentError(null);
    try {
      const res = await fetch(`/api/jobs/${Number(job.id)}/request-payment`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        setPaymentError(data.error || 'Failed to get payment details');
        return;
      }
      setPaymentRequest(data);
    } catch (e) {
      setPaymentError('Network error. Is the backend running?');
    }
  };

  const handleCommitPayment = async () => {
    if (!job?.id || !txHash.trim() || !buyerWallet.trim()) return;
    setPaymentError(null);
    setPaymentSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${Number(job.id)}/commit-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: txHash.trim(), buyer_fet_wallet: buyerWallet.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setPaymentReleased(true);
        if (job?.id) updateJobStatus(Number(job.id), 9);
      } else {
        setPaymentError(data.error || 'Payment verification failed');
      }
    } catch (e) {
      setPaymentError('Network error');
    } finally {
      setPaymentSubmitting(false);
    }
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
                (step.id === 'completed' && (job?.status != null && job.status >= 7 || confirmed)) ||
                (step.id === 'payment' && (job?.status != null && job.status >= 8 || paymentReleased)) ||
                (step.id === 'received' && (job?.status != null && job.status >= 9 || reviewSubmitted || (isVendorTracking && paymentReleased)));
              const isActive = !isDone && (
                (step.id === 'completed' && !confirmed && stepsDoneByStatus >= 2 && (job?.status == null || job.status <= 6)) ||
                (step.id === 'payment' && confirmed && !paymentReleased) ||
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

                    {step.id === 'completed' && !confirmed && stepsDoneByStatus >= 2 && (job?.status == null || job.status <= 6) && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Camera className="size-3.5" />
                          <span>3 photos uploaded as proof of work</span>
                        </div>
                        <Button size="sm" onClick={handleConfirmCompletion} className="gap-1.5">
                          <CheckCircle2 className="size-4" />
                          Confirm job complete
                        </Button>
                      </div>
                    )}

                    {step.id === 'payment' && confirmed && !paymentReleased && (
                      <div className="mt-3 space-y-3">
                        {paymentAgentStatus !== null && (
                          <p className={cn(
                            'text-xs',
                            paymentAgentStatus.ready ? 'text-[var(--success)]' : 'text-muted-foreground'
                          )}>
                            {paymentAgentStatus.ready
                              ? `Payment agent ready${paymentAgentStatus.fet_network ? ` (${paymentAgentStatus.fet_network})` : ''}`
                              : 'Payment agent not running. Start the backend and refresh.'}
                          </p>
                        )}
                        {!paymentRequest ? (
                          <>
                            <p className="text-xs text-muted-foreground">
                              Pay with FET (Fetch.ai). The payment agent will verify on-chain and release to the vendor.
                            </p>
                            <Button size="sm" onClick={handleRequestPayment} className="gap-1.5">
                              <CreditCard className="size-4" />
                              Get payment details
                            </Button>
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground">
                              Send <strong>{paymentRequest.amount_fet} FET</strong> to the address below on{' '}
                              <strong>{paymentRequest.fet_network}</strong>, then paste the transaction hash and your wallet address.
                            </p>
                            <div className="rounded-md bg-muted/50 p-2 font-mono text-xs break-all">
                              {paymentRequest.recipient_address}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              <a
                                href="https://companion.sandbox-london-b.fetch-ai.com/dorado-1/agents#Agents"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline"
                              >
                                Get testnet FET (faucet)
                              </a>
                            </p>
                            <input
                              type="text"
                              placeholder="Transaction hash (tx hash)"
                              value={txHash}
                              onChange={(e) => setTxHash(e.target.value)}
                              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            />
                            <input
                              type="text"
                              placeholder="Your Fetch wallet address (buyer_fet_wallet)"
                              value={buyerWallet}
                              onChange={(e) => setBuyerWallet(e.target.value)}
                              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                            />
                            {paymentError && (
                              <p className="text-xs text-destructive">{paymentError}</p>
                            )}
                            <Button
                              size="sm"
                              onClick={handleCommitPayment}
                              disabled={paymentSubmitting || !txHash.trim() || !buyerWallet.trim()}
                              className="gap-1.5"
                            >
                              {paymentSubmitting ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="size-4" />
                              )}
                              {paymentSubmitting ? 'Verifying...' : 'Submit payment'}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    {step.id === 'payment' && paymentReleased && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-[var(--success)]">
                        <CreditCard className="size-3.5" />
                        Payment verified and released to {displayVendor}
                      </div>
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
