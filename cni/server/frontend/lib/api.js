/**
 * lib/api.js — Centralised API client for the CNI backend.
 *
 * All component API calls must go through this module.
 * In dev mode Next.js proxies /api/* to localhost:8000
 * via the rewrites in next.config.js.
 */

import axios from 'axios';

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  timeout: 120_000,
});

/** POST /api/analyze */
export async function analyzeRepo(path) {
  const { data } = await API.post('/api/analyze', { path });
  return data;
}

/** GET /api/graph?path=... */
export async function getGraph(path) {
  const { data } = await API.get('/api/graph', { params: { path } });
  return data;
}

/** GET /api/health?path=... */
export async function getHealth(path) {
  const { data } = await API.get('/api/health', { params: { path } });
  return data;
}

/** GET /api/onboard?path=... */
export async function getOnboard(path) {
  const { data } = await API.get('/api/onboard', { params: { path } });
  return data;
}

/** POST /api/impact */
export async function getImpact(file, path) {
  const { data } = await API.post('/api/impact', { file, path });
  return data;
}

/** GET /api/explain?file=...&path=... */
export async function explainFile(file, path) {
  const { data } = await API.get('/api/explain', { params: { file, path } });
  return data;
}

/**
 * Open a WebSocket to /ws/ask and stream LLM tokens.
 *
 * @param {string} question
 * @param {string} path
 * @param {(token: string) => void} onToken
 * @param {() => void} onDone
 * @returns {WebSocket}
 */
export function createAskSocket(question, path, onToken, onDone) {
  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
  const ws = new WebSocket(`${wsBase}/ws/ask`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ question, path }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.token) {
      onToken(msg.token);
    }
    if (msg.done) {
      onDone();
    }
    if (msg.error) {
      onToken(`\n\nError: ${msg.error}`);
      onDone();
    }
  };

  ws.onerror = () => {
    onToken('\n\nWebSocket connection failed.');
    onDone();
  };

  return ws;
}
