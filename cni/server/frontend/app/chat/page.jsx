'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import { useAnalysisContext } from '../client-layout';
import { MessageSquarePlus, History, Trash2, ChevronDown } from 'lucide-react';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';

export default function ChatPage() {
  const { repoPath, stats } = useAnalysisContext();
  const {
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
  } = useChat(repoPath);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const sessionsRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (sessionsRef.current && !sessionsRef.current.contains(e.target)) {
        setSessionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [setSessionsOpen]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || !repoPath || streaming) return;
    sendMessage(q, repoPath);
    setInput('');
  };

  if (!repoPath || !stats) {
    return <NotAnalyzed />;
  }

  /** Format a date string into a human-friendly label */
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'Z'); // treat as UTC
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDays = Math.floor(diffHr / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const currentSessionLabel = sessions.find((s) => s.session_id === sessionId);

  return (
    <div className="flex flex-col h-[calc(100vh-5.75rem)]">
      {/* Header with session switcher */}
      <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: '1px solid var(--cni-border)' }}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--cni-text)' }}>Ask CNI</h2>
            <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>Ask questions about your codebase · Powered by local LLM</p>
          </div>

          {/* Session selector */}
          <div className="relative ml-auto flex items-center gap-2" ref={sessionsRef}>
            <button
              onClick={startNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(99, 102, 241, 0.12))',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.2))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(99, 102, 241, 0.12))';
              }}
            >
              <MessageSquarePlus size={12} /> New Chat
            </button>

            {sessions.length > 0 && (
              <button
                onClick={() => setSessionsOpen(!sessionsOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-200"
                style={{
                  border: '1px solid var(--cni-border)',
                  color: 'var(--cni-muted)',
                  background: sessionsOpen ? 'var(--cni-surface)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
                  e.currentTarget.style.color = '#a5b4fc';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--cni-border)';
                  e.currentTarget.style.color = 'var(--cni-muted)';
                }}
              >
                <History size={12} />
                <span className="max-w-[140px] truncate">
                  {currentSessionLabel
                    ? formatDate(currentSessionLabel.created_at)
                    : `${sessions.length} sessions`}
                </span>
                <ChevronDown size={10} className={`transition-transform duration-200 ${sessionsOpen ? 'rotate-180' : ''}`} />
              </button>
            )}

            {/* Sessions dropdown */}
            {sessionsOpen && sessions.length > 0 && (
              <div
                className="absolute right-0 top-full mt-2 w-80 max-h-64 overflow-y-auto rounded-xl animate-slide-up z-50"
                style={{
                  background: 'var(--cni-surface)',
                  border: '1px solid var(--cni-border)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                }}
              >
                <div className="p-2 space-y-0.5">
                  {sessions.map((s) => (
                    <div
                      key={s.session_id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 group"
                      style={{
                        background: s.session_id === sessionId ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                        borderLeft: s.session_id === sessionId ? '2px solid #6366f1' : '2px solid transparent',
                      }}
                      onClick={() => loadSession(s.session_id)}
                      onMouseEnter={(e) => {
                        if (s.session_id !== sessionId) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      }}
                      onMouseLeave={(e) => {
                        if (s.session_id !== sessionId) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* Active dot */}
                      {s.session_id === sessionId && (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#6366f1' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate" style={{ color: s.session_id === sessionId ? '#a5b4fc' : 'var(--cni-text)' }}>
                          {s.first_message || 'Empty session'}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--cni-muted)' }}>
                          {formatDate(s.created_at)} · {s.message_count} msgs
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSession(s.session_id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all duration-150"
                        style={{ color: 'var(--cni-muted)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--cni-muted)'; }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ollama down banner */}
      {ollamaDown && (
        <div className="px-6 pt-4">
          <ErrorMessage
            message="Cannot connect to Ollama"
            hint="Start Ollama with: ollama serve"
            onRetry={clearChat}
          />
        </div>
      )}

      {/* Error banner (non-Ollama) */}
      {error && !ollamaDown && (
        <div className="px-6 pt-4">
          <ErrorMessage message={error.message} hint={error.hint} />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !ollamaDown && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3 opacity-60">
              <p className="text-3xl">◈</p>
              <p className="text-sm" style={{ color: 'var(--cni-muted)' }}>Ask anything about your codebase</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {['What does repo_scanner do?', 'How is the cache invalidated?', 'Explain the graph builder'].map((q) => (
                  <button key={q} onClick={() => setInput(q)}
                    className="text-xs px-3 py-1.5 rounded-full transition-all duration-200"
                    style={{ border: '1px solid var(--cni-border)', color: 'var(--cni-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)'; e.currentTarget.style.color = 'var(--cni-text)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cni-border)'; e.currentTarget.style.color = 'var(--cni-muted)'; }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
            <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
              style={msg.role === 'user'
                ? { background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', borderBottomRightRadius: '6px' }
                : { background: 'var(--cni-surface)', border: '1px solid var(--cni-border)', color: 'var(--cni-text)', borderBottomLeftRadius: '6px' }
              }>
              <div className="whitespace-pre-wrap font-mono text-xs">
                {msg.content}
                {msg.role === 'assistant' && streaming && i === messages.length - 1 && (
                  <span className="inline-block w-2 h-4 ml-0.5 animate-pulse" style={{ background: 'var(--cni-accent)' }} />
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {streaming && messages.length > 0 && messages[messages.length - 1]?.content === '' && (
          <div className="flex justify-start animate-slide-up">
            <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--cni-surface)', border: '1px solid var(--cni-border)', borderBottomLeftRadius: '6px' }}>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--cni-muted)', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--cni-muted)', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--cni-muted)', animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4" style={{ borderTop: '1px solid var(--cni-border)' }}>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Ask about your codebase…"
            className="input-field flex-1 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={streaming || ollamaDown}
          />
          <button className="btn-primary text-sm disabled:opacity-50" onClick={handleSend} disabled={!input.trim() || streaming || ollamaDown}>
            {streaming ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Thinking…
              </span>
            ) : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
