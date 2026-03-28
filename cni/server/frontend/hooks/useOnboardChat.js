'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createOnboardChatSocket, getChatHistory, getChatSessions, createNewSession, deleteSession } from '../lib/api';

/**
 * Manages onboard follow-up chat messages with persistent session history.
 * Uses /ws/onboard/chat which includes architecture context in every LLM prompt.
 *
 * @param {string} repoPath – the current repo being analyzed
 */
export function useOnboardChat(repoPath) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [ollamaDown, setOllamaDown] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const wsRef = useRef(null);

  // Load sessions list + latest session messages on mount / repo change
  useEffect(() => {
    if (!repoPath) return;
    let cancelled = false;

    (async () => {
      try {
        const [histRes, sessRes] = await Promise.all([
          getChatHistory(repoPath, 'onboard'),
          getChatSessions(repoPath, 'onboard'),
        ]);

        if (cancelled) return;

        if (!histRes?.error && histRes?.messages?.length) {
          setMessages(histRes.messages.map((m) => ({ role: m.role, content: m.content })));
          setSessionId(histRes.session_id || '');
        }

        if (!sessRes?.error && sessRes?.sessions) {
          setSessions(sessRes.sessions);
        }
      } catch {
        // non-critical
      }
    })();

    return () => { cancelled = true; };
  }, [repoPath]);

  // Refresh sessions list
  const refreshSessions = useCallback(async () => {
    if (!repoPath) return;
    try {
      const res = await getChatSessions(repoPath, 'onboard');
      if (!res?.error && res?.sessions) setSessions(res.sessions);
    } catch {
      // ignore
    }
  }, [repoPath]);

  const sendMessage = useCallback((question, path) => {
    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: question }]);

    // Add placeholder for assistant
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    setStreaming(true);
    setError(null);
    setOllamaDown(false);

    const ws = createOnboardChatSocket(
      question,
      path,
      // onToken
      (token) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + token,
            };
          }
          return updated;
        });
      },
      // onDone — receives session_id from server
      (sid) => {
        setStreaming(false);
        if (sid) setSessionId(sid);
        refreshSessions();
      },
      // onError
      (errObj) => {
        setStreaming(false);
        if (errObj.message.toLowerCase().includes('ollama') || errObj.message.toLowerCase().includes('cannot connect')) {
          setOllamaDown(true);
        }
        setError(errObj);
        // Remove the empty assistant placeholder if no content was streamed
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            return updated.slice(0, -1);
          }
          return updated;
        });
      },
      sessionId,
    );

    wsRef.current = ws;
  }, [sessionId, refreshSessions]);

  // Start a new session
  const startNewSession = useCallback(async () => {
    if (wsRef.current) wsRef.current.close();
    if (!repoPath) return;

    try {
      const res = await createNewSession(repoPath, 'onboard');
      if (res?.session_id) setSessionId(res.session_id);
    } catch {
      // ignore
    }
    setMessages([]);
    setStreaming(false);
    setError(null);
    setOllamaDown(false);
    setSessionsOpen(false);
  }, [repoPath]);

  // Load a specific session
  const loadSession = useCallback(async (sid) => {
    if (!repoPath || !sid) return;
    try {
      const res = await getChatHistory(repoPath, 'onboard', sid);
      if (!res?.error && res?.messages) {
        setMessages(res.messages.map((m) => ({ role: m.role, content: m.content })));
        setSessionId(sid);
      }
    } catch {
      // ignore
    }
    setSessionsOpen(false);
    setStreaming(false);
    setError(null);
    setOllamaDown(false);
  }, [repoPath]);

  // Delete a session
  const removeSession = useCallback(async (sid) => {
    if (!repoPath || !sid) return;
    try {
      await deleteSession(repoPath, 'onboard', sid);
      if (sid === sessionId) {
        setMessages([]);
        setSessionId('');
      }
      refreshSessions();
    } catch {
      // ignore
    }
  }, [repoPath, sessionId, refreshSessions]);

  const clearChat = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setMessages([]);
    setStreaming(false);
    setError(null);
    setOllamaDown(false);
  }, []);

  return {
    messages,
    streaming,
    error,
    ollamaDown,
    sessionId,
    sessions,
    sessionsOpen,
    setSessionsOpen,
    sendMessage,
    clearChat,
    startNewSession,
    loadSession,
    removeSession,
    refreshSessions,
  };
}
