import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Check, Star, Clock, DollarSign, Sparkles } from 'lucide-react';
import { mockQuotes, mockJobStats } from '@/data/mock';
import { NegotiationChatModal } from '@/components/NegotiationChatModal';
import type { VendorQuote } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

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

export function JobResponsePage() {
  const navigate = useNavigate();
  const [selectedChat, setSelectedChat] = useState<VendorQuote | null>(null);

  const stats = mockJobStats;
  const quotes = mockQuotes;

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Your top quotes</h1>
            <p className="text-xs text-muted-foreground">
              {stats.vendorsSearched} vendors found · {stats.vendorsNegotiated} negotiated
            </p>
          </div>
        </div>
      </header>

      {/* Quotes */}
      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {quotes.map((q, idx) => (
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
                        {idx === 0 && (
                          <Badge variant="secondary" className="mt-1 text-xs gap-1">
                            <Star className="size-3" />
                            Best match
                          </Badge>
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
                    <div className="flex items-baseline gap-1">
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
                    View negotiation
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => navigate('/calendar')}
                  >
                    <Check className="size-4" />
                    Accept quote
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

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
