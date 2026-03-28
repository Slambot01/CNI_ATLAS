'use client';

import { useAppContext } from '../context/AppContext';

/**
 * Thin wrapper around AppContext for chat state.
 * Messages now persist across page navigation.
 */
export function useChat() {
  const ctx = useAppContext();
  return {
    messages: ctx.chatMessages,
    streaming: ctx.chatStreaming,
    error: ctx.chatError,
    ollamaDown: ctx.chatOllamaDown,
    sessionId: ctx.chatSessionId,
    sessions: ctx.chatSessions,
    sessionsOpen: ctx.chatSessionsOpen,
    setSessionsOpen: ctx.setChatSessionsOpen,
    sendMessage: ctx.sendChatMessage,
    clearChat: ctx.clearChat,
    startNewSession: ctx.startNewChatSession,
    loadSession: ctx.loadChatSession,
    removeSession: ctx.removeChatSession,
    refreshSessions: ctx.refreshChatSessions,
  };
}
