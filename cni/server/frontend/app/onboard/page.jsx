'use client';

import { useState, useEffect, useRef } from 'react';
import { useAnalysisContext } from '../client-layout';
import { useOnboardChat } from '../../hooks/useOnboardChat';
import { Send, MessageSquare, Trash2, MessageSquarePlus, History, ChevronDown } from 'lucide-react';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSkeleton from '../../components/LoadingSkeleton';

export default function OnboardPage() {
  const {
    repoPath, stats,
    onboardData: data, onboardLoading: loading, onboardError: error,
    fetchOnboard, setOnboardError, setOnboardLoading,
  } = useAnalysisContext();

  // Follow-up chat from global context
  const {
    messages,
    streaming,
    error: chatError,
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
  } = useOnboardChat();
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef(null);
  const sessionsRef = useRef(null);

  // Fetch onboard data on mount (cached — returns instantly if already loaded)
  useEffect(() => {
    if (repoPath && stats) {
      fetchOnboard(repoPath);
    }
  }, [repoPath, stats, fetchOnboard]);

  // Auto-scroll chat
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

  const handleChatSend = () => {
    const q = chatInput.trim();
    if (!q || !repoPath || streaming) return;
    sendMessage(q, repoPath);
    setChatInput('');
  };

  /** Format a date string into a human-friendly label */
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'Z');
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

  if (!repoPath || !stats) return <NotAnalyzed />;
  if (loading) return <LoadingSkeleton variant="text" message="Generating onboarding report… This may take a minute" />;
  if (error) return (
    <div className="p-6">
      <ErrorMessage message={error.message} hint={error.hint} onRetry={() => {
        setOnboardError(null);
        fetchOnboard(repoPath);
      }} />
    </div>
  );
  if (!data) return null;

  const maxCentrality = Math.max(...(data.critical_modules?.map((m) => m.centrality) || [1]), 0.01);

  const suggestedQuestions = [
    'What should I read first?',
    'How do the entry points connect?',
    'Which modules are most risky to change?',
  ];

  const currentSessionLabel = sessions.find((s) => s.session_id === sessionId);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-lg font-bold" style={{ color: 'var(--cni-text)' }}>Onboarding Report</h2>

      {/* ── Entry Points ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--cni-text)' }}>
          Entry Points <span className="badge-success">{data.entry_points?.length || 0}</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {data.entry_points?.slice(0, 20).map((ep) => (
            <span key={ep} className="badge-info font-mono">{ep.split(/[/\\]/).pop()}</span>
          ))}
          {(!data.entry_points || data.entry_points.length === 0) && <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>No entry points detected.</p>}
        </div>
      </div>

      {/* ── Critical Modules ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--cni-text)' }}>
          Critical Modules <span className="text-xs font-normal ml-1" style={{ color: 'var(--cni-muted)' }}>(read these first)</span>
        </h3>
        <div className="space-y-3">
          {data.critical_modules?.map((mod, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-5 text-right" style={{ color: 'var(--cni-muted)' }}>{i + 1}.</span>
                  <span className="text-sm font-mono" style={{ color: 'var(--cni-text)' }}>{mod.name}</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--cni-muted)' }}>{mod.centrality.toFixed(2)}</span>
              </div>
              <div className="ml-7 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cni-bg)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(mod.centrality / maxCentrality) * 100}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Dead Modules ── */}
      {data.dead_modules?.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--cni-text)' }}>
            Dead Modules <span className="badge-warning">{data.dead_modules.length}</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.dead_modules.slice(0, 20).map((dm) => <span key={dm} className="badge-warning font-mono">{dm}</span>)}
          </div>
        </div>
      )}

      {/* ── Architecture Summary ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--cni-text)' }}>Architecture Summary</h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(226, 232, 240, 0.8)' }}>{data.summary}</p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          Follow-Up Chat Section
          ══════════════════════════════════════════════════════════════════ */}

      {/* Divider */}
      <div className="flex items-center gap-4 py-2">
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--cni-border), transparent)' }} />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
          style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.15)', color: '#a5b4fc' }}>
          <MessageSquare size={12} />
          Follow-up Chat
        </div>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--cni-border), transparent)' }} />
      </div>

      {/* Chat container */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: 'rgba(6, 10, 19, 0.6)',
        border: '1px solid var(--cni-border)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
      }}>
        {/* Chat header with session controls */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--cni-border)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--cni-text)' }}>Ask Follow-up Questions</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--cni-muted)' }}>
              Answers include the architecture report as context
            </p>
          </div>

          <div className="flex items-center gap-2 relative" ref={sessionsRef}>
            <button onClick={startNewSession}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-200"
              style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.15)';
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
              }}
            >
              <MessageSquarePlus size={11} /> New
            </button>

            {sessions.length > 0 && (
              <button
                onClick={() => setSessionsOpen(!sessionsOpen)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-200"
                style={{
                  border: '1px solid var(--cni-border)',
                  color: 'var(--cni-muted)',
                  background: sessionsOpen ? 'var(--cni-surface)' : 'transparent',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)'; e.currentTarget.style.color = '#a5b4fc'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--cni-border)'; e.currentTarget.style.color = 'var(--cni-muted)'; }}
              >
                <History size={11} />
                <span className="max-w-[100px] truncate">
                  {currentSessionLabel ? formatDate(currentSessionLabel.created_at) : `${sessions.length}`}
                </span>
                <ChevronDown size={10} className={`transition-transform duration-200 ${sessionsOpen ? 'rotate-180' : ''}`} />
              </button>
            )}

            {messages.length > 0 && (
              <button onClick={clearChat}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-all duration-200"
                style={{ color: 'var(--cni-muted)', border: '1px solid var(--cni-border)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'; e.currentTarget.style.color = '#f87171'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cni-border)'; e.currentTarget.style.color = 'var(--cni-muted)'; }}>
                <Trash2 size={11} />
              </button>
            )}

            {/* Sessions dropdown */}
            {sessionsOpen && sessions.length > 0 && (
              <div
                className="absolute right-0 top-full mt-2 w-72 max-h-56 overflow-y-auto rounded-xl animate-slide-up z-50"
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
                      onMouseEnter={(e) => { if (s.session_id !== sessionId) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'; }}
                      onMouseLeave={(e) => { if (s.session_id !== sessionId) e.currentTarget.style.background = 'transparent'; }}
                    >
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
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ollama error banner */}
        {ollamaDown && (
          <div className="px-4 pt-3">
            <ErrorMessage
              message="Cannot connect to Ollama"
              hint="Start Ollama with: ollama serve"
            />
          </div>
        )}

        {/* Chat error (non-Ollama) */}
        {chatError && !ollamaDown && (
          <div className="px-4 pt-3">
            <ErrorMessage message={chatError.message} hint={chatError.hint} />
          </div>
        )}

        {/* Messages area */}
        <div className="overflow-y-auto px-5 py-4 space-y-3" style={{ maxHeight: 400, minHeight: 120 }}>
          {messages.length === 0 && !ollamaDown && (
            <div className="text-center py-6 space-y-3">
              <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>
                Ask anything about the architecture — the LLM has the full report as context.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestedQuestions.map((q) => (
                  <button key={q} onClick={() => setChatInput(q)}
                    className="text-xs px-3 py-1.5 rounded-full transition-all duration-200"
                    style={{ border: '1px solid var(--cni-border)', color: 'var(--cni-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)'; e.currentTarget.style.color = '#a5b4fc'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cni-border)'; e.currentTarget.style.color = 'var(--cni-muted)'; }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                style={msg.role === 'user'
                  ? { background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', borderBottomRightRadius: '6px' }
                  : { background: 'var(--cni-surface)', border: '1px solid var(--cni-border)', color: 'var(--cni-text)', borderBottomLeftRadius: '6px' }
                }>
                <div className="whitespace-pre-wrap font-mono text-xs">
                  {msg.content}
                  {msg.role === 'assistant' && streaming && i === messages.length - 1 && msg.content && (
                    <span className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse" style={{ background: '#a5b4fc' }} />
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {streaming && messages.length > 0 && messages[messages.length - 1]?.content === '' && (
            <div className="flex justify-start animate-slide-up">
              <div className="rounded-2xl px-4 py-2.5" style={{ background: 'var(--cni-surface)', border: '1px solid var(--cni-border)', borderBottomLeftRadius: '6px' }}>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#a5b4fc', animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#a5b4fc', animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#a5b4fc', animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid var(--cni-border)' }}>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ask about the architecture…"
              className="input-field flex-1 text-sm"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
              disabled={streaming || ollamaDown}
            />
            <button
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 disabled:opacity-40"
              style={{
                background: chatInput.trim() && !streaming ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--cni-surface)',
                border: '1px solid var(--cni-border)',
                color: chatInput.trim() && !streaming ? 'white' : 'var(--cni-muted)',
              }}
              onClick={handleChatSend}
              disabled={!chatInput.trim() || streaming || ollamaDown}
            >
              {streaming ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send size={14} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
