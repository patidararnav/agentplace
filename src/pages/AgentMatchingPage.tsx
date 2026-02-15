import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  CheckCircle2,
  Loader2,
  Circle,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Handshake,
  XCircle,
  Bot,
  Activity,
} from 'lucide-react';
import { NegotiationChatModal } from '@/components/NegotiationChatModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import type { NegotiationResults, UnavailableVendor } from '@/context/AppContext';
import { useNegotiation } from '@/hooks/useNegotiation';
import type { StepId, VendorResultEvent } from '@/hooks/useNegotiation';
import type { VendorQuote, NegotiationMessage, AgentThought } from '@/types';
import { cn } from '@/lib/utils';

const SYSTEM_AGENTS: Array<{ id: StepId; label: string }> = [
  { id: 'concierge', label: 'Concierge' },
  { id: 'matching', label: 'Matching' },
  { id: 'negotiation', label: 'Negotiation' },
  { id: 'ranking', label: 'Ranking' },
];

const SLOT_TO_TIME: Record<string, { rank: number; hhmm: string }> = {
  '8a': { rank: 0, hhmm: '08:00' },
  '9a': { rank: 1, hhmm: '09:00' },
  '10a': { rank: 2, hhmm: '10:00' },
  '11a': { rank: 3, hhmm: '11:00' },
  '12p': { rank: 4, hhmm: '12:00' },
  '1p': { rank: 5, hhmm: '13:00' },
  '2p': { rank: 6, hhmm: '14:00' },
  '3p': { rank: 7, hhmm: '15:00' },
  '4p': { rank: 8, hhmm: '16:00' },
  '5p': { rank: 9, hhmm: '17:00' },
  '6p': { rank: 10, hhmm: '18:00' },
  '7p': { rank: 11, hhmm: '19:00' },
};

type WarNodeStatus = 'negotiating' | 'deal' | 'no_deal' | 'no_availability';

interface WarNode {
  id: string;
  name: string;
  status: WarNodeStatus;
  messages: NegotiationMessage[];
  rounds: number;
  price?: number;
  messageCount: number;
  lastMessage?: string;
}

const WAR_STATUS_STYLE: Record<
  WarNodeStatus,
  { label: string; color: string; border: string; glow: string; line: string; badgeClass: string }
> = {
  negotiating: {
    label: 'Negotiating',
    color: '#ff8a00',
    border: 'rgba(255, 138, 0, 0.78)',
    glow: 'rgba(255, 138, 0, 0.42)',
    line: 'rgba(255, 138, 0, 0.72)',
    badgeClass: 'text-orange-300 bg-orange-500/15 border-orange-400/40',
  },
  deal: {
    label: 'Deal Found',
    color: '#22c55e',
    border: 'rgba(34, 197, 94, 0.82)',
    glow: 'rgba(34, 197, 94, 0.44)',
    line: 'rgba(34, 197, 94, 0.74)',
    badgeClass: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/40',
  },
  no_deal: {
    label: 'No Deal',
    color: '#ef4444',
    border: 'rgba(239, 68, 68, 0.82)',
    glow: 'rgba(239, 68, 68, 0.42)',
    line: 'rgba(239, 68, 68, 0.72)',
    badgeClass: 'text-red-300 bg-red-500/15 border-red-400/40',
  },
  no_availability: {
    label: 'No Availability',
    color: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.6)',
    glow: 'rgba(148, 163, 184, 0.25)',
    line: 'rgba(148, 163, 184, 0.68)',
    badgeClass: 'text-muted-foreground bg-zinc-500/15 border-zinc-400/35',
  },
};

function parsePreferredDateTimeFromNotes(notes?: string): string | null {
  if (!notes) return null;
  let inAvailability = false;
  let best: { date: string; rank: number; hhmm: string } | null = null;

  for (const rawLine of notes.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.includes('CUSTOMER_AVAILABILITY_NEXT_7_DAYS')) {
      inAvailability = true;
      continue;
    }
    if (!inAvailability) continue;

    const match = line.match(/^(\d{4}-\d{2}-\d{2})\s*:\s*(.+)$/);
    if (!match) continue;

    const date = match[1];
    const slots = match[2].split(',').map((s) => s.trim().toLowerCase());

    for (const slot of slots) {
      const info = SLOT_TO_TIME[slot];
      if (!info) continue;
      if (
        !best ||
        date < best.date ||
        (date === best.date && info.rank < best.rank)
      ) {
        best = { date, rank: info.rank, hhmm: info.hhmm };
      }
    }
  }

  return best ? `${best.date}T${best.hhmm}:00` : null;
}

function buildQuotes(
  vendorResults: VendorResultEvent[],
  vendorNegotiations: Record<string, { messages: NegotiationMessage[]; originalPrice?: number }>,
  preferredDateTime: string | null,
): VendorQuote[] {
  const deals = vendorResults
    .filter((v) => v.outcome === 'deal' && v.price > 0)
    .sort((a, b) => a.price - b.price);

  return deals.map((d, idx) => {
    const neg = vendorNegotiations[d.vendor_address] || { messages: [] };
    const origPrice = neg.originalPrice && neg.originalPrice > 0 ? neg.originalPrice : d.price;

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
      dateTime: d.start_iso || preferredDateTime || new Date(Date.now() + (idx + 2) * 86400000).toISOString(),
      durationMinutes: 90,
      vendorId: d.vendor_id && d.vendor_id > 0 ? d.vendor_id : idx + 1,
      negotiationMessages: neg.messages,
      customerAgentThoughts: customerThoughts,
      vendorAgentThoughts: vendorThoughts,
      insightTags: [
        d.price <= origPrice * 0.85 ? 'Great deal' : d.price <= origPrice * 0.95 ? 'Good savings' : 'Fair price',
      ],
    };
  });
}

function buildRingCounts(total: number) {
  const counts: number[] = [];
  let remaining = Math.max(total, 0);
  let ring = 0;
  while (remaining > 0) {
    const capacity = 4 + ring * 4;
    const take = Math.min(capacity, remaining);
    counts.push(take);
    remaining -= take;
    ring += 1;
  }
  return counts.length > 0 ? counts : [1];
}

function getWarNodeLayout(total: number, spread = 1) {
  const ringCounts = buildRingCounts(total);
  const ringTotal = ringCounts.length;
  const innerXBase = total <= 4 ? 25 : 22;
  const innerYBase = total <= 4 ? 21 : 18;
  const outerXBase = Math.min(47, innerXBase + (ringTotal - 1) * 9.5 + Math.max(0, total - 12) * 0.25);
  const outerYBase = Math.min(42, innerYBase + (ringTotal - 1) * 8 + Math.max(0, total - 12) * 0.2);

  const maxRadiusX = 48;
  const maxRadiusY = 43;
  let innerX = Math.min(innerXBase * spread, maxRadiusX - 6);
  let innerY = Math.min(innerYBase * spread, maxRadiusY - 5);
  let outerX = Math.min(outerXBase * spread, maxRadiusX);
  let outerY = Math.min(outerYBase * spread, maxRadiusY);
  if (outerX < innerX) outerX = innerX;
  if (outerY < innerY) outerY = innerY;

  const points: Array<{ x: number; y: number }> = [];

  ringCounts.forEach((count, ringIndex) => {
    const t = ringTotal === 1 ? 0 : ringIndex / (ringTotal - 1);
    const radiusX = innerX + (outerX - innerX) * t;
    const radiusY = innerY + (outerY - innerY) * t;
    const startAngle = -Math.PI / 2 + (ringIndex % 2 === 1 ? Math.PI / count : 0);

    for (let i = 0; i < count; i += 1) {
      const angle = startAngle + (i / count) * Math.PI * 2;
      points.push({
        x: 50 + Math.cos(angle) * radiusX,
        y: 50 + Math.sin(angle) * radiusY,
      });
    }
  });

  return points.slice(0, Math.max(total, 1));
}

function getNodeVisualScale(total: number) {
  if (total <= 8) return 1;
  if (total <= 14) return 0.9;
  if (total <= 20) return 0.82;
  if (total <= 28) return 0.74;
  return 0.68;
}

function getLayoutSpreadFromZoom(zoom: number) {
  if (zoom < 1) return 1 + (1 - zoom) * 1.4;
  if (zoom > 1) return Math.max(0.82, 1 - (zoom - 1) * 0.35);
  return 1;
}

function trimText(value: string, max = 96) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function AgentMatchingPage() {
  const navigate = useNavigate();
  const { lastPrompt, negotiateParams, setNegotiationResults } = useApp();
  const negotiation = useNegotiation(negotiateParams);
  const logScrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const hasStoredResults = useRef(false);
  const [resultsReady, setResultsReady] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [selectedChatNodeId, setSelectedChatNodeId] = useState<string | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);

  const STEP_DURATION_MS = 1000;
  const [animationIndex, setAnimationIndex] = useState(0);

  const realDoneCount = SYSTEM_AGENTS.filter((a) => negotiation.stepStatuses[a.id] === 'done').length;
  const realDoneCountRef = useRef(realDoneCount);
  realDoneCountRef.current = realDoneCount;

  const steps = SYSTEM_AGENTS.map((a, i) => ({
    ...a,
    status: (animationIndex > i ? 'done' : animationIndex === i ? 'active' : 'pending') as 'pending' | 'active' | 'done',
  }));
  const doneCount = Math.min(animationIndex, steps.length);
  const progress = Math.round((doneCount / steps.length) * 100);

  const warNodes = useMemo<WarNode[]>(() => {
    const resultsByAddress = new Map<string, VendorResultEvent>();
    for (const result of negotiation.vendorResults) {
      resultsByAddress.set(result.vendor_address, result);
    }

    const addresses = new Set<string>();
    for (const address of Object.keys(negotiation.vendors)) addresses.add(address);
    for (const result of negotiation.vendorResults) addresses.add(result.vendor_address);

    const nodes = Array.from(addresses).map((address, index) => {
      const live = negotiation.vendors[address];
      const result = resultsByAddress.get(address);
      const name = live?.vendor_name || result?.vendor_name || `Vendor Agent ${index + 1}`;
      const messages = live?.messages || [];

      let status: WarNodeStatus = 'negotiating';
      if (result) {
        if (result.outcome === 'deal') {
          status = 'deal';
        } else if (result.outcome === 'no_availability') {
          status = 'no_availability';
        } else {
          status = 'no_deal';
        }
      } else if (negotiation.isComplete) {
        status = 'no_deal';
      }

      return {
        id: address,
        name,
        status,
        messages,
        rounds: result?.rounds ?? Math.max(0, Math.floor(messages.length / 2)),
        price: result && result.price > 0 ? result.price : undefined,
        messageCount: messages.length,
        lastMessage: messages.length > 0 ? messages[messages.length - 1].text : undefined,
      };
    });

    if (nodes.length === 0) return [];

    const statusOrder: Record<WarNodeStatus, number> = {
      negotiating: 0,
      deal: 1,
      no_deal: 2,
      no_availability: 3,
    };

    return nodes.sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return a.name.localeCompare(b.name);
    });
  }, [negotiation.vendors, negotiation.vendorResults, negotiation.isComplete, negotiation.error]);

  const focusedNode = warNodes.find((n) => n.id === focusedNodeId) || warNodes[0] || null;
  const selectedChatNode = warNodes.find((n) => n.id === selectedChatNodeId) || null;
  const isFindingAgents = warNodes.length === 0 && !negotiation.error && !negotiation.isComplete;
  const layoutSpread = useMemo(() => getLayoutSpreadFromZoom(canvasZoom), [canvasZoom]);
  const nodeLayout = useMemo(() => getWarNodeLayout(warNodes.length, layoutSpread), [warNodes.length, layoutSpread]);
  const nodeVisualScale = useMemo(() => getNodeVisualScale(warNodes.length), [warNodes.length]);
  const centerScale = useMemo(() => {
    if (warNodes.length <= 12) return 1;
    if (warNodes.length <= 20) return 0.92;
    return 0.86;
  }, [warNodes.length]);
  const labelMaxWidthClass = warNodes.length > 18 ? 'max-w-[102px]' : warNodes.length > 12 ? 'max-w-[114px]' : 'max-w-[132px]';
  const metrics = useMemo(() => {
    const negotiating = warNodes.filter((n) => n.status === 'negotiating').length;
    const deals = warNodes.filter((n) => n.status === 'deal').length;
    const noDeal = warNodes.filter((n) => n.status === 'no_deal').length;
    const noAvailability = warNodes.filter((n) => n.status === 'no_availability').length;
    return { negotiating, deals, noDeal, noAvailability };
  }, [warNodes]);

  useEffect(() => {
    if (warNodes.length === 0) return;
    if (!focusedNodeId || !warNodes.some((node) => node.id === focusedNodeId)) {
      setFocusedNodeId(warNodes[0].id);
    }
  }, [warNodes, focusedNodeId]);

  useEffect(() => {
    if (selectedChatNodeId && !warNodes.some((node) => node.id === selectedChatNodeId)) {
      setSelectedChatNodeId(null);
    }
  }, [warNodes, selectedChatNodeId]);

  useEffect(() => {
    if (negotiation.error) return;
    const id = setInterval(() => {
      setAnimationIndex((prev) => {
        const cap = realDoneCountRef.current;
        if (prev < cap) return Math.min(prev + 1, cap);
        return prev;
      });
    }, STEP_DURATION_MS);
    return () => clearInterval(id);
  }, [negotiation.error]);

  const handleLogScroll = useCallback(() => {
    const el = logScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= 24;
  }, []);

  const handleNodeCanvasWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const STEP = 0.08;
    const MIN_ZOOM = 0.55;
    const MAX_ZOOM = 1.7;

    setCanvasZoom((prev) => {
      const next = prev + direction * STEP;
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(next.toFixed(2))));
    });
  }, []);

  useEffect(() => {
    const el = logScrollRef.current;
    if (!el) return;
    if (!shouldAutoScrollRef.current) return;
    requestAnimationFrame(() => {
      if (el) {
        el.scrollTop = el.scrollHeight - el.clientHeight;
      }
    });
  }, [negotiation.logs.length]);

  useEffect(() => {
    if (negotiation.isComplete && negotiation.outcome && !hasStoredResults.current) {
      hasStoredResults.current = true;

      const preferredDateTime = parsePreferredDateTimeFromNotes(negotiateParams?.notes);
      const quotes = buildQuotes(negotiation.vendorResults, negotiation.vendors, preferredDateTime);

      const unavailableVendors: UnavailableVendor[] = negotiation.vendorResults
        .filter((v) => v.outcome === 'no_availability')
        .map((v) => ({
          name: v.vendor_name,
          reason: 'No availability for your times',
        }));

      const totalVendors = Math.max(
        Object.keys(negotiation.vendors).length,
        negotiation.vendorResults.length,
      );
      const negotiatedCount = totalVendors - unavailableVendors.length;
      const deals = quotes.length;
      const avgSavings = deals > 0
        ? Math.round(quotes.reduce((acc, q) => acc + ((q.originalPrice - q.price) / q.originalPrice) * 100, 0) / deals)
        : 0;

      const results: NegotiationResults = {
        quotes,
        unavailableVendors,
        stats: {
          vendorsSearched: totalVendors,
          vendorsNegotiated: negotiatedCount,
          avgSavings,
        },
        outcome: negotiation.outcome.outcome,
        winner: negotiation.outcome.winner,
        winnerPrice: negotiation.outcome.winner_price,
      };

      setNegotiationResults(results);
      setResultsReady(true);
    }
  }, [negotiation.isComplete, negotiation.outcome, negotiation.vendorResults, negotiation.vendors, setNegotiationResults, negotiateParams?.notes]);

  return (
    <div className="h-svh bg-background flex flex-col overflow-hidden">
      <header className="px-4 md:px-6 py-4 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-primary/90 flex items-center justify-center shadow-md shadow-white/15">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base md:text-lg font-semibold text-foreground">Vendor Negotiation Process</h1>
                <p className="text-xs text-muted-foreground">Your agent network is actively handling live vendor conversations.</p>
                {lastPrompt && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
                    <p className="truncate max-w-[420px] md:max-w-[540px]">
                      &ldquo;{lastPrompt}&rdquo;
                    </p>
                    {negotiateParams?.budget != null && (
                      <span className="shrink-0 rounded-full border border-border/60 bg-card/50 px-2 py-1">
                        Max budget: ${Number(negotiateParams.budget).toLocaleString()}
                      </span>
                    )}
                    {negotiateParams?.city && (
                      <span className="shrink-0 rounded-full border border-border/60 bg-card/50 px-2 py-1">
                        City: {negotiateParams.city}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
              <span className="px-2.5 py-1 rounded-full border border-border/60 bg-card/50 text-muted-foreground">
                Pipeline {doneCount}/{steps.length}
              </span>
              <span className="px-2.5 py-1 rounded-full border border-orange-400/40 bg-orange-500/10 text-orange-300">Orange: Negotiating</span>
              <span className="px-2.5 py-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">Green: Deal Found</span>
              <span className="px-2.5 py-1 rounded-full border border-zinc-400/40 bg-zinc-500/10 text-zinc-100">Gray: No Availability</span>
              <span className="px-2.5 py-1 rounded-full border border-red-400/40 bg-red-500/10 text-red-300">Red: No Deal</span>
            </div>
          </div>

          <Badge variant="secondary" className="gap-1.5 px-3 py-1 font-mono text-xs self-start lg:self-center">
            {negotiation.error ? (
              <>
                <AlertCircle className="size-3 text-destructive" />
                Error
              </>
            ) : !negotiation.isComplete ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                {progress}%
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3 text-[var(--success)]" />
                Complete
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

      {negotiation.error && (
        <div className="mx-4 md:mx-6 mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <p className="font-medium">
            {negotiation.error.includes('LLM failed') ? 'LLM Matching Error' : 'Connection Error'}
          </p>
          <p className="text-xs mt-1 opacity-80">{negotiation.error}</p>
          {!negotiation.error.includes('LLM failed') && (
            <p className="text-xs mt-1 opacity-60">Make sure the backend is running: cd backend && uvicorn server:app --port 8080</p>
          )}
        </div>
      )}

      <main className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1fr_430px] overflow-hidden">
        <section className="relative border-b xl:border-b-0 xl:border-r border-border/40 overflow-hidden min-h-0 h-full">
          <div className="absolute inset-0 war-room-grid" />
          <div className="absolute inset-0 war-room-scan" />
          <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-orange-500/16 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-emerald-500/14 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-[25%] h-72 w-72 rounded-full bg-red-500/9 blur-3xl pointer-events-none" />

          <div className="relative z-20 h-full p-4 md:p-6 flex flex-col">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
              <div className="rounded-xl border border-border/60 bg-black/45 backdrop-blur-sm px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Vendor Agents</p>
                <p className="text-xl font-semibold text-foreground mt-1">{warNodes.length}</p>
              </div>
              <div className="rounded-xl border border-orange-400/35 bg-orange-500/10 backdrop-blur-sm px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-orange-200/80">Negotiating</p>
                <p className="text-xl font-semibold text-orange-100 mt-1">{metrics.negotiating}</p>
              </div>
              <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 backdrop-blur-sm px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200/80">Deals Locked</p>
                <p className="text-xl font-semibold text-emerald-100 mt-1">{metrics.deals}</p>
              </div>
              <div className="rounded-xl border border-zinc-400/35 bg-zinc-500/10 backdrop-blur-sm px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-200/80">No Availability</p>
                <p className="text-xl font-semibold text-zinc-100 mt-1">{metrics.noAvailability}</p>
              </div>
              <div className="rounded-xl border border-red-400/35 bg-red-500/10 backdrop-blur-sm px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-red-200/80">No Deal</p>
                <p className="text-xl font-semibold text-red-100 mt-1">{metrics.noDeal}</p>
              </div>
              </div>

            <div
              onWheel={handleNodeCanvasWheel}
              className="relative mt-3 flex-1 min-h-0 rounded-2xl border border-border/40 bg-black/35 overflow-hidden backdrop-blur-sm"
            >
              <div className="absolute right-3 top-3 z-50 rounded-md border border-orange-400/35 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-300">
                Zoom {Math.round(canvasZoom * 100)}%
              </div>
              <div className="absolute left-3 top-3 z-50 rounded-md border border-border/60 bg-black/65 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Scroll to zoom
              </div>

              <div
                className="absolute inset-0 origin-center transition-transform duration-150"
                style={{ transform: `scale(${canvasZoom})` }}
              >
              <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                {warNodes.map((node, index) => {
                  const pos = nodeLayout[index] ?? { x: 50, y: 50 };
                  const palette = WAR_STATUS_STYLE[node.status];
                  return (
                    <line
                      key={`${node.id}-line`}
                      x1="50"
                      y1="50"
                      x2={String(pos.x)}
                      y2={String(pos.y)}
                      stroke={palette.line}
                      strokeWidth={node.status === 'deal' ? '0.35' : '0.3'}
                      strokeDasharray={node.status === 'negotiating' ? '1.4 1.6' : 'none'}
                      className={node.status === 'negotiating' ? 'war-room-link-flow' : undefined}
                      opacity={0.85}
                    />
                  );
                })}
              </svg>

              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <div className="relative" style={{ transform: `scale(${centerScale})` }}>
                  <div className="absolute inset-0 rounded-full blur-2xl bg-white/20 scale-150 pulse-glow pointer-events-none" />
                  <div className="relative size-24 md:size-28 rounded-full border border-white/30 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center shadow-[0_0_35px_rgba(148,163,184,0.35)]">
                    <Activity className="size-6 text-orange-300" />
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">Command</span>
                    <span className="text-[11px] font-semibold text-foreground">{isFindingAgents ? 'Finding vendors...' : 'Orchestrator'}</span>
                  </div>
                </div>
              </div>

              {warNodes.map((node, index) => {
                const pos = nodeLayout[index] ?? { x: 50, y: 50 };
                const palette = WAR_STATUS_STYLE[node.status];
                const isFocused = focusedNode?.id === node.id;
                const NodeIcon = node.status === 'deal'
                  ? Handshake
                  : ['no_deal', 'no_availability'].includes(node.status)
                    ? XCircle
                    : Bot;
                const visualScale = (isFocused ? 1.06 : 1) * nodeVisualScale;

                return (
                  <button
                    type="button"
                    key={node.id}
                    onMouseEnter={() => setFocusedNodeId(node.id)}
                    onFocus={() => setFocusedNodeId(node.id)}
                    onClick={() => {
                      setFocusedNodeId(node.id);
                      setSelectedChatNodeId(node.id);
                    }}
                    className={cn(
                      'absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 focus:outline-none',
                      isFocused ? 'z-40' : 'z-30'
                    )}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  >
                    <span className="relative block transition-transform duration-300" style={{ transform: `scale(${visualScale})` }}>
                      <span
                        className="absolute inset-0 rounded-full blur-xl opacity-50 pointer-events-none"
                        style={{ background: `radial-gradient(circle, ${palette.glow} 0%, transparent 72%)` }}
                      />
                      <span
                        className={cn(
                          'relative mx-auto flex size-14 md:size-16 items-center justify-center rounded-full border bg-black/75 backdrop-blur-md',
                          node.status === 'negotiating' && 'war-node-negotiating',
                        )}
                        style={{
                          borderColor: palette.border,
                          boxShadow: `0 0 26px ${palette.glow}`,
                        }}
                      >
                        {node.status === 'negotiating' ? (
                          <Loader2 className="size-4 md:size-5 animate-spin" style={{ color: palette.color }} />
                        ) : (
                          <NodeIcon className="size-4 md:size-5" style={{ color: palette.color }} />
                        )}
                      </span>

                      <span className={cn('mt-1 block text-center', labelMaxWidthClass)}>
                        <span className="block truncate text-[11px] font-semibold text-foreground">{node.name}</span>
                        <span className="block text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.color }}>
                          {palette.label}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
              </div>

              {focusedNode && (
                <div className="absolute left-4 bottom-4 z-50 w-[min(360px,calc(100%-2rem))] rounded-xl border border-border/60 bg-black/70 backdrop-blur-md p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn('px-2 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-[0.1em]', WAR_STATUS_STYLE[focusedNode.status].badgeClass)}>
                      {WAR_STATUS_STYLE[focusedNode.status].label}
                    </span>
                    <p className="text-sm font-semibold text-foreground truncate">{focusedNode.name}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-border/50 bg-black/35 px-2 py-1.5">
                      <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Messages</p>
                      <p className="text-sm font-semibold text-foreground mt-1">{focusedNode.messageCount}</p>
                    </div>
                    <div className="rounded-md border border-border/50 bg-black/35 px-2 py-1.5">
                      <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Rounds</p>
                      <p className="text-sm font-semibold text-foreground mt-1">{focusedNode.rounds}</p>
                    </div>
                    <div className="rounded-md border border-border/50 bg-black/35 px-2 py-1.5">
                      <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Best Price</p>
                      <p className="text-sm font-semibold text-foreground mt-1">
                        {focusedNode.price != null ? `$${focusedNode.price}` : '--'}
                      </p>
                    </div>
                  </div>
                  {focusedNode.lastMessage && (
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">
                      {trimText(focusedNode.lastMessage)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="xl:w-[430px] flex flex-col bg-card/35 min-h-0 h-full overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <div className={cn(
              'size-2 rounded-full',
              negotiation.isComplete ? 'bg-[var(--success)]' : 'bg-orange-400 animate-pulse'
            )} />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Live Agent Comms
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">
              {negotiation.logs.length} events
            </span>
          </div>

          <div
            ref={logScrollRef}
            onScroll={handleLogScroll}
            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2.5 font-mono text-sm overscroll-contain"
          >
              {negotiation.isConnecting && (
                <div className="flex gap-3 opacity-70">
                  <Loader2 className="size-4 animate-spin text-orange-300 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Linking to orchestration backend...</p>
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
                      'flex gap-3 rounded-md border px-2.5 py-2 transition-all duration-300',
                      isDone
                        ? 'border-emerald-400/35 bg-emerald-500/10'
                        : isResult
                        ? 'border-orange-400/25 bg-orange-500/10'
                        : 'border-border/45 bg-black/20',
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-emerald-400" />
                      ) : isResult ? (
                        <Handshake className="size-4 text-orange-300" />
                      ) : isNeg ? (
                        <MessageSquare className="size-4 text-orange-300" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground/60">{entry.timestamp}</span>
                        <span className={cn(
                          'text-[10px] font-semibold',
                          entry.agent === 'orchestrator' ? 'text-orange-300' :
                          entry.agent === 'Customer' ? 'text-amber-300' :
                          entry.agent === 'system' ? 'text-muted-foreground' :
                          'text-emerald-300'
                        )}>
                          {entry.agent}
                        </span>
                      </div>
                      <p className={cn(
                        'text-[11px] leading-relaxed mt-0.5',
                        isDone ? 'text-emerald-200 font-medium' :
                        isResult ? 'text-orange-100' :
                        'text-muted-foreground/70'
                      )}>
                        {entry.text}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </aside>
      </main>

      {resultsReady && (
        <div className="px-4 md:px-6 py-4 border-t border-border/40 flex-shrink-0">
          <Button
            className="w-full gap-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-orange-950"
            size="lg"
            onClick={() => navigate('/customer/results')}
          >
            Review Final Quotes
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      {selectedChatNode && (
        <NegotiationChatModal
          messages={selectedChatNode.messages}
          vendorName={selectedChatNode.name}
          onClose={() => setSelectedChatNodeId(null)}
        />
      )}
    </div>
  );
}
