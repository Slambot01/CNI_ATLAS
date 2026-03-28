'use client';

import { useAppContext } from '../context/AppContext';

/**
 * Thin wrapper around AppContext for onboard follow-up chat state.
 * Messages now persist across page navigation.
 */
export function useOnboardChat() {
  const ctx = useAppContext();
  return {
    messages: ctx.onboardChatMessages,
    streaming: ctx.onboardChatStreaming,
    error: ctx.onboardChatError,
    ollamaDown: ctx.onboardOllamaDown,
    sessionId: ctx.onboardSessionId,
    sessions: ctx.onboardSessions,
    sessionsOpen: ctx.onboardSessionsOpen,
    setSessionsOpen: ctx.setOnboardSessionsOpen,
    sendMessage: ctx.sendOnboardChat,
    clearChat: ctx.clearOnboardChat,
    startNewSession: ctx.startNewOnboardSession,
    loadSession: ctx.loadOnboardSession,
    removeSession: ctx.removeOnboardSession,
    refreshSessions: ctx.refreshOnboardSessions,
  };
}
