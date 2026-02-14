/**
 * API client for the AgentPlace backend bridge.
 *
 * In development, Vite proxies /api and /ws to the FastAPI server.
 */

export interface NegotiateParams {
  service: string;
  budget: number;
  urgency: number;
  aggression: number;
  notes: string;
}

export interface NegotiateResponse {
  session_id: string;
}

/**
 * Start a new negotiation session.
 * Returns the session_id used to connect via WebSocket.
 */
export async function startNegotiation(
  params: NegotiateParams
): Promise<NegotiateResponse> {
  const res = await fetch('/api/negotiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Failed to start negotiation: ${res.status}`);
  }
  return res.json();
}

/**
 * Open a WebSocket connection to stream negotiation events.
 */
export function connectNegotiationWS(sessionId: string): WebSocket {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return new WebSocket(`${proto}//${host}/ws/negotiate/${sessionId}`);
}
