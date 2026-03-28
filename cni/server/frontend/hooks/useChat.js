'use client';

import { useState, useRef, useCallback } from 'react';
import { createAskSocket } from '../lib/api';

/**
 * Manages chat messages and WebSocket streaming state.
 */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const wsRef = useRef(null);

  const sendMessage = useCallback((question, path) => {
    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: question }]);

    // Add placeholder for assistant
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    setStreaming(true);

    const ws = createAskSocket(
      question,
      path,
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
      () => {
        setStreaming(false);
      }
    );

    wsRef.current = ws;
  }, []);

  const clearChat = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setMessages([]);
    setStreaming(false);
  }, []);

  return { messages, streaming, sendMessage, clearChat };
}
