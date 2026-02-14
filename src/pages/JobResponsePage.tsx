import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { mockQuotes, mockJobStats } from '@/data/mock';
import { NegotiationChatModal } from '@/components/NegotiationChatModal';
import type { VendorQuote } from '@/types';
import { cn } from '@/lib/utils';

function formatDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function JobResponsePage() {
  const navigate = useNavigate();
  const [selectedChat, setSelectedChat] = useState<VendorQuote | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollIndex, setScrollIndex] = useState(0);

  const stats = mockJobStats;
  const quotes = mockQuotes;

  const scrollTo = (index: number) => {
    const i = Math.max(0, Math.min(index, quotes.length - 1));
    setScrollIndex(i);
    scrollRef.current?.children[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="border-b border-border/50 px-4 py-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-foreground">Your top quotes</h1>
        <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
          <span>{stats.vendorsSearched} vendors searched</span>
          <span>{stats.vendorsNegotiated} negotiated</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            onClick={() => scrollTo(scrollIndex - 1)}
            disabled={scrollIndex === 0}
            className="p-2 rounded-lg bg-card border border-border text-foreground disabled:opacity-50"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex-1 overflow-x-auto overflow-y-hidden flex gap-4 px-2 py-4 scroll-smooth" ref={scrollRef}>
            {quotes.map((q) => (
              <div
                key={q.vendorId}
                className="flex-shrink-0 w-[280px] rounded-2xl border border-border bg-card p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-brand-primary text-primary-foreground w-8 h-8 flex items-center justify-center text-sm font-bold">
                    {q.rank}
                  </span>
                  <span className="text-xs text-brand-emerald font-medium">Top pick</span>
                </div>
                <h3 className="font-semibold text-foreground">{q.name}</h3>
                <div className="text-2xl font-bold text-foreground">${q.price}</div>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  <p>{formatDate(q.dateTime)}</p>
                  <p>{q.durationMinutes} min</p>
                </div>
                <div className="flex gap-2 mt-auto pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedChat(q)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium',
                      'bg-muted text-foreground hover:bg-muted/80'
                    )}
                  >
                    <MessageCircle className="size-4" />
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/calendar')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium',
                      'bg-brand-emerald text-white hover:opacity-90'
                    )}
                  >
                    <Check className="size-4" />
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollTo(scrollIndex + 1)}
            disabled={scrollIndex >= quotes.length - 1}
            className="p-2 rounded-lg bg-card border border-border text-foreground disabled:opacity-50"
          >
            <ChevronRight className="size-5" />
          </button>
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
