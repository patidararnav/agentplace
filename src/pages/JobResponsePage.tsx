import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  Check,
  Star,
  Clock,
  DollarSign,
  Sparkles,
  Brain,
  TrendingDown,
  Bot,
  User,
  ArrowLeft,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import { NegotiationChatModal } from '@/components/NegotiationChatModal';
import { updateJobStatus } from '@/lib/supabase-data';
import { useApp } from '@/context/AppContext';
import type { VendorQuote } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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

export function JobResponsePage() {
  const navigate = useNavigate();
  const { negotiationResults, selectedCustomer } = useApp();
  const [selectedChat, setSelectedChat] = useState<VendorQuote | null>(null);
  const [selectedCoT, setSelectedCoT] = useState<VendorQuote | null>(null);
  const [acceptedQuote, setAcceptedQuote] = useState<VendorQuote | null>(null);

  const stats = negotiationResults?.stats ?? { vendorsSearched: 0, vendorsNegotiated: 0, avgSavings: 0 };
  const quotes = negotiationResults?.quotes ?? [];

  async function handleAccept(q: VendorQuote) {
    if (q.job_id != null) {
      await updateJobStatus(q.job_id, JOB_STATUS_BOOKED);
    }
    setAcceptedQuote(q);
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
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
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
                          {q.insightTags && q.insightTags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {q.insightTags.map((tag) => (
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
                      onClick={() => setSelectedCoT(q)}
                    >
                      <Brain className="size-4" />
                      Agent reasoning
                    </Button>
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
                      onClick={() => handleAccept(q)}
                    >
                      <Check className="size-4" />
                      Accept
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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

      {/* Chain-of-thought modal */}
      {selectedCoT && (
        <Dialog open onOpenChange={() => setSelectedCoT(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 bg-card border-border">
            <DialogHeader className="px-5 py-4 border-b border-border/50">
              <DialogTitle className="text-base flex items-center gap-2">
                <Brain className="size-4 text-primary" />
                Agent Reasoning — {selectedCoT.name}
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="customer" className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-5 mt-3 w-auto self-start">
                <TabsTrigger value="customer" className="gap-1.5 text-xs">
                  <User className="size-3.5" />
                  Your Agent
                </TabsTrigger>
                <TabsTrigger value="vendor" className="gap-1.5 text-xs">
                  <Bot className="size-3.5" />
                  Vendor Agent
                </TabsTrigger>
              </TabsList>

              <TabsContent value="customer" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-[400px]">
                  <div className="p-5 space-y-4">
                    {selectedCoT.customerAgentThoughts.map((t, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                            {i + 1}.
                          </span>
                        </div>
                        <div>
                          <p
                            className={cn(
                              'text-sm',
                              t.type === 'result'
                                ? 'text-primary font-medium'
                                : 'text-foreground'
                            )}
                          >
                            {t.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="vendor" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-[400px]">
                  <div className="p-5 space-y-4">
                    {selectedCoT.vendorAgentThoughts.map((t, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                            {i + 1}.
                          </span>
                        </div>
                        <div>
                          <p
                            className={cn(
                              'text-sm',
                              t.type === 'result'
                                ? 'text-primary font-medium'
                                : 'text-foreground'
                            )}
                          >
                            {t.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
