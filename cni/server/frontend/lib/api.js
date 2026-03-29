/**
 * lib/api.js — Centralised API client for the CNI backend.
 *
 * All component API calls must go through this module.
 * In dev mode Next.js proxies /api/* to localhost:8000
 * via the rewrites in next.config.js.
 *
 * Every function returns either the data on success, or an object
 * { error: true, message: string, hint?: string } on failure.
 */

import axios from 'axios';

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  timeout: 120_000,
});

/**
 * Parse an axios error into a consistent { error, message, hint } shape.
 */
function parseError(err) {
  // Network / connection error
  if (!err.response) {
    if (err.code === 'ECONNABORTED') {
      return { error: true, status: 0, message: 'Request timed out', hint: 'Try a smaller repo or increase timeout.' };
    }
    return { error: true, status: 0, message: 'Cannot connect to CNI backend', hint: 'Make sure cni serve is running.' };
  }

  const status = err.response.status;
  const body = err.response.data;

  // 400 — not analyzed yet (from repo_state)
  if (status === 400) {
    return {
      error: true,
      status,
      notAnalyzed: !!(body?.error && body?.hint),
      message: body?.error || body?.detail || 'Bad request',
      hint: body?.hint || body?.detail || '',
    };
  }

  // 404
  if (status === 404) {
    return { error: true, status, message: body?.detail || 'Not found', hint: '' };
  }

  // 500 — server error, possibly Ollama down
  if (status === 500) {
    const detail = body?.detail || '';
    if (detail.toLowerCase().includes('ollama') || detail.toLowerCase().includes('llm')) {
      return { error: true, status, message: 'LLM request failed', hint: 'Make sure Ollama is running: ollama serve' };
    }
    return { error: true, status, message: detail || 'Server error', hint: 'Check the CNI server logs for details.' };
  }

  // Other errors
  return { error: true, status: status || 0, message: body?.detail || err.message || 'Unknown error', hint: '' };
}

/** POST /api/analyze */
export async function analyzeRepo(path) {
  try {
    const { data } = await API.post('/api/analyze', { path });
    return data;
  } catch (err) {
    throw parseError(err);
  }
}

/** GET /api/graph?path=... */
export async function getGraph(path) {
  try {
    const { data } = await API.get('/api/graph', { params: { path } });
    // Handle 200 response that's actually an error body from JSONResponse
    if (data?.error && data?.hint) {
      return { error: true, status: 400, notAnalyzed: true, message: data.error, hint: data.hint };
    }
    return data;
  } catch (err) {
    return parseError(err);
  }
}

/** GET /api/health?path=... */
export async function getHealth(path) {
  try {
    const { data } = await API.get('/api/health', { params: { path } });
    if (data?.error && data?.hint) {
      return { error: true, status: 400, notAnalyzed: true, message: data.error, hint: data.hint };
    }
    return data;
  } catch (err) {
    return parseError(err);
  }
}

/** GET /api/onboard?path=... */
export async function getOnboard(path) {
  try {
    const { data } = await API.get('/api/onboard', { params: { path } });
    if (data?.error && data?.hint) {
      return { error: true, status: 400, notAnalyzed: true, message: data.error, hint: data.hint };
    }
    return data;
  } catch (err) {
    return parseError(err);
  }
}

/** POST /api/impact */
export async function getImpact(file, path) {
  try {
    const { data } = await API.post('/api/impact', { file, path });
    if (data?.error && data?.hint) {
      return { error: true, status: 400, notAnalyzed: true, message: data.error, hint: data.hint };
    }
    return data;
  } catch (err) {
    return parseError(err);
  }
}

/** GET /api/explain?file=...&path=... */
export async function explainFile(file, path) {
  try {
    const { data } = await API.get('/api/explain', { params: { file, path } });
    if (data?.error && data?.hint) {
      return { error: true, status: 400, notAnalyzed: true, message: data.error, hint: data.hint };
    }
    return data;
  } catch (err) {
    return parseError(err);
  }
}

/**
 * Open a WebSocket to /ws/ask and stream LLM tokens.
 *
 * @param {string} question
 * @param {string} path
 * @param {(token: string) => void} onToken
 * @param {() => void} onDone
 * @param {(errObj: {message: string, hint: string}) => void} [onError]
 * @param {string} [sessionId]
 * @returns {WebSocket}
 */
export function createAskSocket(question, path, onToken, onDone, onError, sessionId) {
  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
  const ws = new WebSocket(`${wsBase}/ws/ask`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ question, path, session_id: sessionId || '' }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.token) {
      onToken(msg.token);
    }
    if (msg.done) {
      onDone(msg.session_id || sessionId || '');
    }
    if (msg.error) {
      const errMsg = msg.error;
      const isOllama = errMsg.toLowerCase().includes('ollama') || errMsg.toLowerCase().includes('cannot connect');
      if (onError) {
        onError({
          message: isOllama ? 'Cannot connect to Ollama' : errMsg,
          hint: isOllama ? 'Start Ollama with: ollama serve' : '',
        });
      } else {
        onToken(`\n\nError: ${errMsg}`);
      }
      onDone(sessionId || '');
    }
  };

  ws.onerror = () => {
    if (onError) {
      onError({ message: 'WebSocket connection failed', hint: 'Make sure cni serve is running.' });
    } else {
      onToken('\n\nWebSocket connection failed.');
    }
    onDone(sessionId || '');
  };

  return ws;
}

/** POST /api/onboard/chat — follow-up chat with architecture context */
export async function onboardChat(question, path, sessionId) {
  try {
    const { data } = await API.post('/api/onboard/chat', { question, path, session_id: sessionId || '' });
    if (data?.error && data?.hint) {
      return { error: true, notAnalyzed: true, message: data.error, hint: data.hint };
    }
    return data;
  } catch (err) {
    return parseError(err);
  }
}

/**
 * Open a WebSocket to /ws/onboard/chat and stream LLM tokens.
 * The server automatically includes the onboarding report as context.
 *
 * @param {string} question
 * @param {string} path
 * @param {(token: string) => void} onToken
 * @param {() => void} onDone
 * @param {(errObj: {message: string, hint: string}) => void} [onError]
 * @param {string} [sessionId]
 * @returns {WebSocket}
 */
export function createOnboardChatSocket(question, path, onToken, onDone, onError, sessionId) {
  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
  const ws = new WebSocket(`${wsBase}/ws/onboard/chat`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ question, path, session_id: sessionId || '' }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.token) {
      onToken(msg.token);
    }
    if (msg.done) {
      onDone(msg.session_id || sessionId || '');
    }
    if (msg.error) {
      const errMsg = msg.error;
      const isOllama = errMsg.toLowerCase().includes('ollama') || errMsg.toLowerCase().includes('cannot connect');
      if (onError) {
        onError({
          message: isOllama ? 'Cannot connect to Ollama' : errMsg,
          hint: isOllama ? 'Start Ollama with: ollama serve' : '',
        });
      } else {
        onToken(`\n\nError: ${errMsg}`);
      }
      onDone(sessionId || '');
    }
  };

  ws.onerror = () => {
    if (onError) {
      onError({ message: 'WebSocket connection failed', hint: 'Make sure cni serve is running.' });
    } else {
      onToken('\n\nWebSocket connection failed.');
    }
    onDone(sessionId || '');
  };

  return ws;
}

// ---------------------------------------------------------------------------
// Chat History API
// ---------------------------------------------------------------------------

/**
 * GET /api/chat/history — Fetch messages for the latest (or specified) session.
 * @param {string} path  — repo path
 * @param {string} page  — "chat" or "onboard"
 * @param {string} [sessionId]
 * @returns {Promise<{session_id: string, messages: Array}>}
 */
export async function getChatHistory(path, page = 'chat', sessionId) {
  try {
    const params = { path, page };
    if (sessionId) params.session_id = sessionId;
    const { data } = await API.get('/api/chat/history', { params });
    if (data?.error && data?.hint) {
      return { error: true, notAnalyzed: true, message: data.error, hint: data.hint };
    }
    return data;
  } catch (err) {
    return parseError(err);
  }
}

/**
 * GET /api/chat/sessions — List all sessions for a page.
 * @param {string} path
 * @param {string} page — "chat" or "onboard"
 * @returns {Promise<{sessions: Array}>}
 */
export async function getChatSessions(path, page = 'chat') {
  try {
    const { data } = await API.get('/api/chat/sessions', { params: { path, page } });
    if (data?.error && data?.hint) {
      return { error: true, notAnalyzed: true, message: data.error, hint: data.hint };
    }
    return data;
  } catch (err) {
    return parseError(err);
  }
}

/**
 * POST /api/chat/new-session — Create a new session.
 * @param {string} path
 * @param {string} page — "chat" or "onboard"
 * @returns {Promise<{session_id: string}>}
 */
export async function createNewSession(path, page = 'chat') {
  try {
    const { data } = await API.post(`/api/chat/new-session?path=${encodeURIComponent(path)}&page=${encodeURIComponent(page)}`);
    return data;
  } catch (err) {
    return parseError(err);
  }
}

/**
 * DELETE /api/chat/session — Delete a session.
 * @param {string} path
 * @param {string} page
 * @param {string} sessionId
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteSession(path, page, sessionId) {
  try {
    const { data } = await API.delete('/api/chat/session', {
      params: { path, page, session_id: sessionId },
    });
    return data;
  } catch (err) {
    return parseError(err);
  }
}

// ---------------------------------------------------------------------------
// Analysis History
// ---------------------------------------------------------------------------

/**
 * GET /api/history — Fetch analysis history for timeline chart.
 * @param {string} path — repo path
 * @param {number} [limit=30]
 * @returns {Promise<{history: Array}>}
 */
export async function getHistory(path, limit = 30) {
  try {
    const { data } = await API.get('/api/history', { params: { path, limit } });
    if (data?.error && data?.hint) {
      return { error: true, notAnalyzed: true, message: data.error, hint: data.hint };
    }
    return data;
  } catch (err) {
    return parseError(err);
  }
}
