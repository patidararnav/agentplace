import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Bot, CheckCircle2, Loader2, Circle,
  MessageSquare, Search, ListOrdered, AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApp } from '@/context/AppContext';
import type { NegotiationResults } from '@/context/AppContext';
import { useNegotiation } from '@/hooks/useNegotiation';
import type { StepId, VendorResultEvent } from '@/hooks/useNegotiation';
import type { VendorQuote, NegotiationMessage, AgentThought } from '@/types';
import { cn } from '@/lib/utils';

/* Each agent gets a unique accent color */
const SYSTEM_AGENTS = [
  { id: 'concierge' as StepId, label: 'Concierge', icon: MessageSquare, angle: -90, color: '#0070f3' },
  { id: 'matching' as StepId, label: 'Matching', icon: Search, angle: 0, color: '#7928ca' },
  { id: 'negotiation' as StepId, label: 'Negotiation', icon: Bot, angle: 90, color: '#ff0080' },
  { id: 'ranking' as StepId, label: 'Ranking', icon: ListOrdered, angle: 180, color: '#79ffe1' },
];

/** Convert backend results to the VendorQuote[] format the results page expects */
function buildQuotes(
  vendorResults: VendorResultEvent[],
  vendorNegotiations: Record<string, { messages: NegotiationMessage[]; originalPrice?: number }>,
): VendorQuote[] {
  const deals = vendorResults
    .filter((v) => v.outcome === 'deal' && v.price > 0)
    .sort((a, b) => a.price - b.price);

  return deals.map((d, idx) => {
    const neg = vendorNegotiations[d.vendor_address] || { messages: [] };
    const origPrice = neg.originalPrice || Math.round(d.price * 1.2);

    // Build agent thoughts from the negotiation messages
    const customerThoughts: AgentThought[] = neg.messages
      .filter((m) => m.role === 'customer-agent')
      .map((m, i) => ({
        timestamp: m.timestamp || `0:${String(i + 1).padStart(2, '0')}`,
        text: m.text,
        type: i === neg.messages.filter((x) => x.role === 'customer-agent').length - 1 ? 'result' as const : 'action' as const,
      }));

    const vendorThoughts: AgentThought[] = neg.messages
      .filter((m) => m.role === 'vendor-agent')
      .map((m, i) => ({
        timestamp: m.timestamp || `0:${String(i + 1).padStart(2, '0')}`,
        text: m.text,
        type: i === neg.messages.filter((x) => x.role === 'vendor-agent').length - 1 ? 'result' as const : 'reasoning' as const,
      }));

    return {
      rank: idx + 1,
      name: d.vendor_name,
      price: d.price,
      originalPrice: origPrice,
      dateTime: new Date(Date.now() + (idx + 2) * 86400000).toISOString(),
      durationMinutes: 90,
      vendorId: idx + 1,
      negotiationMessages: neg.messages,
      customerAgentThoughts: customerThoughts,
      vendorAgentThoughts: vendorThoughts,
      insightTags: [
        `${d.rounds} rounds`,
        d.price <= origPrice * 0.85 ? 'Great deal' : d.price <= origPrice * 0.95 ? 'Good savings' : 'Fair price',
      ],
    };
  });
}

export function AgentMatchingPage() {
  const navigate = useNavigate();
  const { lastPrompt, negotiateParams, setNegotiationResults } = useApp();
  const negotiation = useNegotiation(negotiateParams);
  const logEndRef = useRef<HTMLDivElement>(null);
  const hasNavigated = useRef(false);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [negotiation.logs.length]);

  // Navigate to results when done
  useEffect(() => {
    if (negotiation.isComplete && negotiation.outcome && !hasNavigated.current) {
      hasNavigated.current = true;

      const quotes = buildQuotes(negotiation.vendorResults, negotiation.vendors);
      const totalVendors = Math.max(
        Object.keys(negotiation.vendors).length,
        negotiation.vendorResults.length,
      );
      const deals = quotes.length;
      const avgSavings = deals > 0
        ? Math.round(quotes.reduce((acc, q) => acc + ((q.originalPrice - q.price) / q.originalPrice) * 100, 0) / deals)
        : 0;

      const results: NegotiationResults = {
        quotes,
        stats: {
          vendorsSearched: totalVendors,
          vendorsNegotiated: totalVendors,
          avgSavings,
        },
        outcome: negotiation.outcome.outcome,
        winner: negotiation.outcome.winner,
        winnerPrice: negotiation.outcome.winner_price,
      };

      setNegotiationResults(results);

      // Small delay so user sees the "Done" state
      setTimeout(() => navigate('/customer/results'), 1500);
    }
  }, [negotiation.isComplete, negotiation.outcome, negotiation.vendorResults, negotiation.vendors, navigate, setNegotiationResults]);

  const steps = SYSTEM_AGENTS.map((a) => ({
    ...a,
    status: negotiation.stepStatuses[a.id],
  }));

  const doneCount = steps.filter((s) => s.status === 'done').length;
  const progress = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="min-h-svh bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Agent Orchestration</h1>
              {lastPrompt && (
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                  &ldquo;{lastPrompt}&rdquo;
                </p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 font-mono text-xs">
            {negotiation.error ? (
              <>
                <AlertCircle className="size-3 text-destructive" />
                Error
              </>
            ) : progress < 100 ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                {progress}%
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3 text-[var(--success)]" />
                Done
              </>
            )}
          </Badge>
        </div>
        <div className="mt-3 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out bg-[var(--success)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Error banner */}
      {negotiation.error && (
        <div className="mx-6 mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <p className="font-medium">Connection Error</p>
          <p className="text-xs mt-1 opacity-80">{negotiation.error}</p>
          <p className="text-xs mt-1 opacity-60">Make sure the backend is running: cd backend && source venv/bin/activate && uvicorn server:app --host 0.0.0.0 --port 8081</p>
        </div>
      )}

      {/* Main: ring visualization + log */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left: Agent ring */}
        <div className="flex-1 relative flex items-center justify-center p-6 min-h-[420px]">
          {/* Background grid */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          <div className="relative">
            {/* Center orchestrator node */}
            <div className="relative z-10 size-28 rounded-full border-2 border-primary bg-primary/20 shadow-lg shadow-primary/20 flex flex-col items-center justify-center gap-1.5">
              <Sparkles className="size-7 text-primary" />
              <span className="text-[10px] font-bold text-foreground tracking-wider">ORCHESTRATOR</span>
            </div>

            {/* Glow */}
            <div
              className="absolute inset-0 rounded-full scale-[3] opacity-100"
              style={{
                background: 'radial-gradient(circle, rgba(250,250,250,0.06) 0%, transparent 70%)',
              }}
            />

            {/* 4 agent nodes */}
            {steps.map((agent) => {
              const status = agent.status;
              const rad = (agent.angle * Math.PI) / 180;
              const radius = 140;
              const x = Math.cos(rad) * radius;
              const y = Math.sin(rad) * radius;
              const Icon = agent.icon;
              const isActive = status === 'active';
              const isDone = status === 'done';

              return (
                <div key={agent.id}>
                  {/* Connection line */}
                  <svg
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    width={radius * 2 + 80}
                    height={radius * 2 + 80}
                    style={{ zIndex: 0 }}
                  >
                    <line
                      x1={radius + 40}
                      y1={radius + 40}
                      x2={radius + 40 + x}
                      y2={radius + 40 + y}
                      stroke={isDone ? 'var(--success)' : isActive ? agent.color : '#404040'}
                      strokeWidth={isActive ? 2 : 1}
                      strokeDasharray={isDone ? 'none' : '4 6'}
                      opacity={status === 'pending' ? 0.3 : 0.7}
                    />
                  </svg>

                  {/* Node */}
                  <div
                    className={cn(
                      'absolute z-10 flex flex-col items-center gap-1.5 transition-all duration-500',
                      status === 'pending' ? 'opacity-40' : 'opacity-100'
                    )}
                    style={{
                      top: `calc(50% + ${y}px - 22px)`,
                      left: `calc(50% + ${x}px - 22px)`,
                    }}
                  >
                    <div
                      className={cn(
                        'size-11 rounded-full border-2 flex items-center justify-center transition-all duration-500',
                      )}
                      style={{
                        borderColor: isDone ? 'var(--success)' : isActive ? agent.color : '#333',
                        background: isDone
                          ? 'rgba(80,227,194,0.1)'
                          : isActive
                          ? `${agent.color}15`
                          : 'rgba(10,10,10,0.5)',
                        boxShadow: isActive ? `0 0 20px ${agent.color}40` : isDone ? '0 0 15px rgba(80,227,194,0.3)' : 'none',
                      }}
                    >
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-[var(--success)]" />
                      ) : isActive ? (
                        <Loader2 className="size-4 animate-spin" style={{ color: agent.color }} />
                      ) : (
                        <Icon className="size-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <span
                      className="text-[9px] font-semibold text-center leading-tight"
                      style={{ color: isActive ? agent.color : isDone ? 'var(--success)' : '#555' }}
                    >
                      {agent.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Activity log */}
        <div className="lg:w-[420px] border-t lg:border-t-0 lg:border-l border-border/40 flex flex-col bg-card/30">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <div className={cn(
              "size-2 rounded-full",
              negotiation.isComplete ? "bg-[var(--success)]" : "bg-[var(--success)] animate-pulse"
            )} />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Agent Activity Log
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">
              {doneCount}/{steps.length} steps
            </span>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2.5 font-mono text-sm">
              {negotiation.isConnecting && (
                <div className="flex gap-3 opacity-60">
                  <Loader2 className="size-4 animate-spin text-primary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Connecting to backend...</p>
                  </div>
                </div>
              )}
              {negotiation.logs.map((entry) => {
                const isNeg = entry.eventType === 'negotiation';
                const isDone = entry.eventType === 'done';
                const isResult = entry.eventType === 'result';

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'flex gap-3 transition-opacity duration-300',
                      isDone ? 'opacity-100' : 'opacity-80'
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-[var(--success)]" />
                      ) : isResult ? (
                        <CheckCircle2 className="size-4 text-primary" />
                      ) : isNeg ? (
                        <MessageSquare className="size-4 text-pink-400" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground/50">{entry.timestamp}</span>
                        <span className={cn(
                          "text-[10px] font-semibold",
                          entry.agent === 'orchestrator' ? 'text-blue-400' :
                          entry.agent === 'Customer' ? 'text-yellow-400' :
                          entry.agent === 'system' ? 'text-muted-foreground' :
                          'text-green-400'
                        )}>
                          {entry.agent}
                        </span>
                      </div>
                      <p className={cn(
                        'text-[11px] leading-relaxed mt-0.5',
                        isDone ? 'text-[var(--success)] font-medium' :
                        isResult ? 'text-primary' :
                        'text-muted-foreground/60'
                      )}>
                        {entry.text}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </ScrollArea>
        </div>
      </main>
    </div>
  );
}
