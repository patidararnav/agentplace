import { useState, useEffect, useRef } from 'react';
import { startNegotiation, connectNegotiationWS } from '@/lib/api';
import type { NegotiateParams } from '@/lib/api';
import type { NegotiationMessage } from '@/types';

/* ── Event types from the backend WebSocket ── */

export interface StepEvent {
  type: 'step';
  step: string;
  status: 'active' | 'done';
  detail: string;
  vendor_count?: number;
  vendor_names?: string[];
}

export interface LogEvent {
  type: 'log';
  agent: string;
  text: string;
}

export interface NegotiationMsgEvent {
  type: 'negotiation_msg';
  role: 'customer-agent' | 'vendor-agent';
  vendor_address: string;
  vendor_name?: string;
  price: number;
  text: string;
}

export interface VendorResultEvent {
  type: 'vendor_result';
  vendor_name: string;
  vendor_address: string;
  vendor_id?: number;
  outcome: string;
  price: number;
  rounds: number;
  text: string;
}

export interface DoneEvent {
  type: 'done';
  outcome: string;
  outcome_text: string;
  winner: string;
  winner_price: number;
  /** Set when backend created a job for the winning deal; use for quote approval */
  winner_job_id?: number;
  vendor_results: VendorResultEvent[];
  config: Record<string, unknown>;
}

export type WSEvent =
  | StepEvent
  | LogEvent
  | NegotiationMsgEvent
  | VendorResultEvent
  | DoneEvent
  | { type: 'status'; text: string }
  | { type: 'terminated'; text: string }
  | { type: 'deal_closed'; text: string; winner: string; winner_price: number }
  | { type: 'heartbeat' }
  | { type: 'error'; text: string };

/* ── Step status tracking ── */

export type StepId = 'concierge' | 'matching' | 'negotiation' | 'ranking';
export type StepStatus = 'pending' | 'active' | 'done';

/* ── Log entry for the activity log sidebar ── */

export interface LogEntry {
  id: number;
  timestamp: string;
  agent: string;
  text: string;
  eventType: string;
}

/* ── Per-vendor negotiation data ── */

export interface VendorNegotiation {
  vendor_name: string;
  vendor_address: string;
  messages: NegotiationMessage[];
  outcome?: string;
  price?: number;
  rounds?: number;
  originalPrice?: number;
}

/* ── Hook state ── */

export interface NegotiationState {
  /** Current status of each orchestration step */
  stepStatuses: Record<StepId, StepStatus>;
  /** All log entries for the activity sidebar */
  logs: LogEntry[];
  /** Per-vendor negotiation messages and results */
  vendors: Record<string, VendorNegotiation>;
  /** Final results per vendor (from consensus) */
  vendorResults: VendorResultEvent[];
  /** Final outcome */
  outcome: DoneEvent | null;
  /** Is the negotiation complete? */
  isComplete: boolean;
  /** Is it still connecting? */
  isConnecting: boolean;
  /** Error message if any */
  error: string | null;
}

let logCounter = 0;

function makeLogEntry(agent: string, text: string, eventType: string): LogEntry {
  return {
    id: ++logCounter,
    timestamp: new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    agent,
    text,
    eventType,
  };
}

export function useNegotiation(params: NegotiateParams | null) {
  const [state, setState] = useState<NegotiationState>({
    stepStatuses: {
      concierge: 'pending',
      matching: 'pending',
      negotiation: 'pending',
      ranking: 'pending',
    },
    logs: [],
    vendors: {},
    vendorResults: [],
    outcome: null,
    isComplete: false,
    isConnecting: true,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!params) return;

    let cancelled = false;

    async function start() {
      try {
        // 1. Start the negotiation via HTTP
        const { session_id } = await startNegotiation(params!);
        if (cancelled) return;
        sessionIdRef.current = session_id;

        setState((prev) => ({
          ...prev,
          isConnecting: false,
          logs: [
            ...prev.logs,
            makeLogEntry('system', `Session started: ${session_id.slice(0, 8)}`, 'system'),
          ],
        }));

        // 2. Connect WebSocket
        const ws = connectNegotiationWS(session_id);
        wsRef.current = ws;

        ws.onmessage = (ev) => {
          let event: WSEvent;
          try {
            event = JSON.parse(ev.data);
          } catch {
            return;
          }

          if (event.type === 'heartbeat') return;

          setState((prev) => {
            const next = { ...prev };

            switch (event.type) {
              case 'step': {
                const e = event as StepEvent;
                const stepId = e.step as StepId;
                if (stepId in next.stepStatuses) {
                  next.stepStatuses = { ...next.stepStatuses, [stepId]: e.status };
                }
                next.logs = [
                  ...prev.logs,
                  makeLogEntry('orchestrator', `[${e.step}] ${e.detail}`, 'step'),
                ];
                break;
              }

              case 'log': {
                const e = event as LogEvent;
                next.logs = [
                  ...prev.logs,
                  makeLogEntry(e.agent, e.text, 'log'),
                ];
                break;
              }

              case 'status': {
                const e = event as { type: 'status'; text: string };
                next.logs = [
                  ...prev.logs,
                  makeLogEntry('orchestrator', e.text, 'status'),
                ];
                break;
              }

              case 'negotiation_msg': {
                const e = event as NegotiationMsgEvent;
                const va = e.vendor_address;
                const existing = prev.vendors[va] || {
                  vendor_name: e.vendor_name || 'Vendor',
                  vendor_address: va,
                  messages: [],
                };

                const msg: NegotiationMessage = {
                  role: e.role,
                  text: e.text,
                  timestamp: new Date().toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }),
                };

                // Track original price (first vendor quote)
                let origPrice = existing.originalPrice;
                if (e.role === 'vendor-agent' && !origPrice && e.price > 0) {
                  origPrice = e.price;
                }

                next.vendors = {
                  ...prev.vendors,
                  [va]: {
                    ...existing,
                    vendor_name: e.vendor_name || existing.vendor_name,
                    messages: [...existing.messages, msg],
                    originalPrice: origPrice,
                  },
                };

                // Short log entry for negotiation
                const label = e.role === 'customer-agent' ? 'Customer' : (e.vendor_name || 'Vendor');
                next.logs = [
                  ...prev.logs,
                  makeLogEntry(label, `$${e.price}: ${e.text.slice(0, 100)}`, 'negotiation'),
                ];
                break;
              }

              case 'vendor_result': {
                const e = event as VendorResultEvent;

                // Deduplicate: skip if we already have a result for this vendor
                if (prev.vendorResults.some((v) => v.vendor_address === e.vendor_address)) {
                  return prev;
                }

                next.vendorResults = [...prev.vendorResults, e];

                // Update vendor data
                const va = e.vendor_address;
                const existing = prev.vendors[va];
                if (existing) {
                  next.vendors = {
                    ...prev.vendors,
                    [va]: {
                      ...existing,
                      outcome: e.outcome,
                      price: e.price,
                      rounds: e.rounds,
                    },
                  };
                }

                next.logs = [
                  ...prev.logs,
                  makeLogEntry(
                    'orchestrator',
                    `${e.vendor_name}: ${e.outcome.toUpperCase()} ${e.price > 0 ? `$${e.price}` : ''} (${e.rounds} rounds)`,
                    'result',
                  ),
                ];
                break;
              }

              case 'deal_closed': {
                const e = event as { type: 'deal_closed'; text: string; winner: string; winner_price: number };
                next.logs = [
                  ...prev.logs,
                  makeLogEntry('orchestrator', `DEAL: ${e.text}`, 'deal'),
                ];
                break;
              }

              case 'terminated': {
                const e = event as { type: 'terminated'; text: string };
                next.logs = [
                  ...prev.logs,
                  makeLogEntry('orchestrator', `TERMINATED: ${e.text}`, 'terminated'),
                ];
                break;
              }

              case 'done': {
                const e = event as DoneEvent;
                next.outcome = e;
                next.isComplete = true;
                // Make sure all steps are done
                next.stepStatuses = {
                  concierge: 'done',
                  matching: 'done',
                  negotiation: 'done',
                  ranking: 'done',
                };

                // Merge vendor_results from the done event so we always
                // have them even if earlier vendor_result WS events were
                // missed or arrived out of order.
                if (e.vendor_results && e.vendor_results.length > 0) {
                  const existing = new Set(
                    prev.vendorResults.map((v) => v.vendor_address),
                  );
                  const merged = [...prev.vendorResults];
                  for (const vr of e.vendor_results) {
                    if (!existing.has(vr.vendor_address)) {
                      merged.push(vr);
                    }
                  }
                  next.vendorResults = merged;
                }

                next.logs = [
                  ...prev.logs,
                  makeLogEntry(
                    'system',
                    `✓ Complete: ${e.outcome} ${e.winner ? `— ${e.winner} at $${e.winner_price}` : ''}`,
                    'done',
                  ),
                ];
                break;
              }

              case 'error': {
                next.error = (event as { type: 'error'; text: string }).text;
                break;
              }
            }

            return next;
          });
        };

        ws.onerror = () => {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              error: 'WebSocket connection error. Is the backend running?',
              isConnecting: false,
            }));
          }
        };

        ws.onclose = () => {
          if (!cancelled) {
            setState((prev) => {
              // If we already received a done event, nothing to do.
              if (prev.isComplete) return prev;

              // WebSocket closed before done event — synthesize completion
              // from whatever vendor results we already have.
              const hasResults = prev.vendorResults.length > 0;
              return {
                ...prev,
                isComplete: true,
                outcome: prev.outcome ?? {
                  type: 'done' as const,
                  outcome: hasResults ? 'deal' : 'no_deal',
                  outcome_text: hasResults
                    ? 'Negotiation completed (connection closed).'
                    : 'Connection closed before results arrived.',
                  winner: '',
                  winner_price: 0,
                  vendor_results: prev.vendorResults,
                  config: {},
                },
                stepStatuses: {
                  concierge: 'done',
                  matching: 'done',
                  negotiation: 'done',
                  ranking: 'done',
                },
              };
            });
          }
        };
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to connect';
          setState((prev) => ({
            ...prev,
            error: msg,
            isConnecting: false,
          }));
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [params]);

  return state;
}
