import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, CheckCircle2, Circle, Clock, CreditCard,
  Star, ArrowLeft, MapPin, Camera, ShieldCheck, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { mockFulfillmentSteps } from '@/data/mock';
import { cn } from '@/lib/utils';

export function FulfillmentPage() {
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  const [paymentReleased, setPaymentReleased] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const handleConfirmCompletion = () => {
    setConfirmed(true);
    setTimeout(() => setPaymentReleased(true), 1500);
  };

  const handleSubmitReview = () => {
    setReviewSubmitted(true);
    setTimeout(() => navigate('/'), 2000);
  };

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate('/customer/results')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Job Tracking</h1>
            <p className="text-xs text-muted-foreground">QuickFix Plumbing · Kitchen sink repair</p>
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
                  <h3 className="font-semibold text-foreground">Kitchen Sink Repair</h3>
                  <p className="text-sm text-muted-foreground">QuickFix Plumbing</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-foreground">$285</div>
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
                  Tue Feb 18, 9:00 AM
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  Palo Alto, CA
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  90 min estimated
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

            {mockFulfillmentSteps.map((step, idx) => {
              const isDone = step.done || (step.id === 'completed' && confirmed) || (step.id === 'payment' && paymentReleased) || (step.id === 'review' && reviewSubmitted);
              const isActive = !isDone && (
                (step.id === 'completed' && !confirmed) ||
                (step.id === 'payment' && confirmed && !paymentReleased) ||
                (step.id === 'review' && paymentReleased && !reviewSubmitted)
              );
              const isLast = idx === mockFulfillmentSteps.length - 1;

              return (
                <div key={step.id} className="flex gap-4">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'size-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-500',
                        isDone
                          ? 'border-primary bg-primary/20'
                          : isActive
                          ? 'border-primary bg-primary/15'
                          : 'border-border bg-card'
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-primary" />
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
                          isDone ? 'bg-primary/30' : 'bg-border/40'
                        )}
                      />
                    )}
                  </div>

                  {/* Content */}
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
                    {step.time && isDone && (
                      <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono">
                        {new Date(step.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    )}

                    {/* Completion confirmation button */}
                    {step.id === 'completed' && !confirmed && (
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

                    {/* Payment release animation */}
                    {step.id === 'payment' && confirmed && !paymentReleased && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                        <Loader2 className="size-3 animate-spin" />
                        Releasing escrow payment...
                      </div>
                    )}
                    {step.id === 'payment' && paymentReleased && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                        <CreditCard className="size-3.5" />
                        $285 released to QuickFix Plumbing
                      </div>
                    )}

                    {/* Review form */}
                    {step.id === 'review' && paymentReleased && !reviewSubmitted && !reviewOpen && (
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

          {/* Review form */}
          {reviewOpen && !reviewSubmitted && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Star className="size-4 text-primary" />
                  Rate QuickFix Plumbing
                </h3>

                {/* Star rating */}
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

          {/* Review submitted */}
          {reviewSubmitted && (
            <Card className="border-primary/30">
              <CardContent className="p-5 text-center space-y-2">
                <CheckCircle2 className="size-10 text-primary mx-auto" />
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
