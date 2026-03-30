'use client';

import { useState, useEffect, useRef } from 'react';
import { useAnalysisContext } from '../client-layout';
import { useOnboardChat } from '../../hooks/useOnboardChat';
import {
  Send, MessageSquare, Trash2, MessageSquarePlus, History,
  ChevronDown, Download, BookOpen, Check, Circle, FileText,
  MapPin, Building2,
} from 'lucide-react';
import { exportOnboardReport } from '../../lib/exportReport';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { useAppContext } from '../../context/AppContext';

export default function OnboardPage() {
  const {
    repoPath, stats,
    onboardData: data, onboardLoading: loading, onboardError: error,
    fetchOnboard, setOnboardError,
  } = useAnalysisContext();

  const {
    messages, streaming, error: chatError, ollamaDown,
    sessionId, sessions, sessionsOpen, setSessionsOpen,
    sendMessage, clearChat, startNewSession, loadSession, removeSession,
  } = useOnboardChat();

  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef(null);
  const sessionsRef = useRef(null);

  const {
    checklist, checklistProgress,
    fetchChecklist, fetchChecklistProgress, toggleChecklistItem,
  } = useAppContext();

  useEffect(() => {
    if (repoPath && stats) fetchOnboard(repoPath);
  }, [repoPath, stats, fetchOnboard]);

  useEffect(() => {
    if (data && repoPath) { fetchChecklist(); fetchChecklistProgress(); }
  }, [data, repoPath, fetchChecklist, fetchChecklistProgress]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClick = (e) => {
      if (sessionsRef.current && !sessionsRef.current.contains(e.target)) setSessionsOpen(false);
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
    } catch { return dateStr; }
  };

  if (!repoPath || !stats) return <NotAnalyzed />;
  if (loading) return <LoadingSkeleton variant="text" message="Generating onboarding report… This may take a minute" />;
  if (error) return (
    <div style={{ padding: 28 }}>
      <ErrorMessage message={error.message} hint={error.hint} onRetry={() => { setOnboardError(null); fetchOnboard(repoPath); }} />
    </div>
  );
  if (!data) return null;

  const maxCentrality = Math.max(...(data.critical_modules?.map(m => m.centrality) || [1]), 0.01);

  const suggestedQuestions = [
    'What should I read first?',
    'How do the entry points connect?',
    'Which modules are most risky to change?',
  ];

  const currentSessionLabel = sessions.find(s => s.session_id === sessionId);

  return (
    <div style={{ padding: 28 }} className="animate-fade-in">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between" style={{ marginBottom: 36 }}>
        <h1 className="text-section-header">Developer Onboarding</h1>
        <button
          onClick={() => exportOnboardReport(data, repoPath)}
          className="flex items-center gap-1.5 text-xs font-medium transition-all duration-200"
          style={{ padding: '6px 14px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <Download size={14} /> Export
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── Section 1: Entry Points ─────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: 24 }}>
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={15} style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'white' }}>Entry Points</h3>
            {data.entry_points?.length > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>{data.entry_points.length}</span>
            )}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Where code execution begins</p>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {data.entry_points?.slice(0, 20).map(ep => {
              const fileName = ep.split(/[/\\]/).pop();
              return (
                <div key={ep} className="transition-all duration-200"
                  style={{
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: 9999,
                    padding: '6px 14px',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.08)'}>
                  <span className="text-xs block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fileName}</span>
                </div>
              );
            })}
            {(!data.entry_points || data.entry_points.length === 0) && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No entry points detected.</p>
            )}
          </div>
        </div>

        {/* ── Section 2: Critical Modules ─────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: 24 }}>
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={15} style={{ color: '#3b82f6' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'white' }}>Critical Modules</h3>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Ranked by betweenness centrality</p>
          <div>
            {data.critical_modules?.map((mod, i) => {
              const barWidth = Math.max(8, (mod.centrality / maxCentrality) * 100);
              return (
                <div key={i}
                  className="transition-colors"
                  style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div className="flex items-center justify-between" style={{ paddingLeft: 4, paddingRight: 4 }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs w-5 text-right" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
                      <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{mod.name}</span>
                    </div>
                    <span className="text-xs font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>{mod.centrality.toFixed(3)}</span>
                  </div>
                  {/* Thin progress bar below text */}
                  <div style={{ marginTop: 8, marginLeft: 4, marginRight: 4, height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                    <div style={{
                      width: `${barWidth}%`,
                      height: '100%',
                      borderRadius: 2,
                      background: '#22c55e',
                      opacity: 0.6,
                      transition: 'width 0.5s ease-out',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Section 3: Reading Checklist ─────────────────────────── */}
        {checklist.length > 0 && (() => {
          const CATEGORY_ORDER = ['entry_point', 'core', 'config', 'utility'];
          const CATEGORY_LABELS = { entry_point: 'Entry Points', core: 'Core Modules', config: 'Configuration', utility: 'Utilities' };
          const groups = {};
          checklist.forEach(item => { if (!groups[item.category]) groups[item.category] = []; groups[item.category].push(item); });
          const completedCount = checklist.filter(item => checklistProgress[item.file]).length;
          const totalCount = checklist.length;
          const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: 24 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
                <BookOpen size={15} style={{ color: '#3b82f6' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'white' }}>Reading Checklist</h3>
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: 8 }}>
                <div className="w-full overflow-hidden rounded-full" style={{ height: 6, background: 'rgba(255,255,255,0.04)' }}>
                  <div className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, background: 'var(--accent)', boxShadow: pct === 100 ? '0 0 8px rgba(34,197,94,0.4)' : 'none' }} />
                </div>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', marginBottom: 20 }}>
                {completedCount} / {totalCount} ({pct}%)
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {CATEGORY_ORDER.map(cat => {
                  const items = groups[cat];
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={cat}>
                      <p className="text-label" style={{ marginBottom: 8 }}>{CATEGORY_LABELS[cat] || cat}</p>
                      <div className="space-y-0.5">
                        {items.map(item => {
                          const done = !!checklistProgress[item.file];
                          return (
                            <div key={item.file}
                              className="flex items-center gap-3 px-3 py-2 transition-all duration-200 cursor-pointer group"
                              style={{ background: done ? 'rgba(34,197,94,0.04)' : 'transparent', borderRadius: 8 }}
                              onClick={() => toggleChecklistItem(item.file)}
                              onMouseEnter={e => e.currentTarget.style.background = done ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)'}
                              onMouseLeave={e => e.currentTarget.style.background = done ? 'rgba(34,197,94,0.04)' : 'transparent'}
                            >
                              <span className="flex-shrink-0" style={{ color: done ? 'var(--accent)' : 'var(--text-muted)' }}>
                                {done ? <Check size={16} /> : <Circle size={16} />}
                              </span>
                              <a href={`/graph?search=${encodeURIComponent(item.file)}`}
                                className="text-xs hover:underline transition-colors"
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  color: done ? 'var(--text-secondary)' : 'var(--text-primary)',
                                  opacity: done ? 0.7 : 1,
                                  textDecoration: done ? 'line-through' : 'none',
                                }}
                                onClick={e => e.stopPropagation()}>
                                {item.file}
                              </a>
                              <span className="text-[11px] ml-auto hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                                {item.reason}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {pct === 100 && (
                <div className="mt-4 text-center text-xs py-2 animate-fade-in"
                  style={{ background: 'var(--accent-muted)', color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: 10 }}>
                  🎉 All done! You&apos;ve reviewed the key files.
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Section 4: Architecture Summary ─────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: 24 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
            <FileText size={15} style={{ color: 'var(--text-secondary)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'white' }}>Architecture Summary</h3>
          </div>
          <p className="text-sm leading-[1.75] whitespace-pre-wrap" style={{ color: 'var(--text-secondary)', maxWidth: 720 }}>
            {data.summary}
          </p>
        </div>

        {/* ── Section 5: Follow-up Chat ───────────────────────────── */}
        <div className="overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14 }}>
          {/* Chat header */}
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
            <div className="flex items-center gap-2">
              <MessageSquare size={15} style={{ color: 'var(--accent)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'white' }}>Ask Follow-up Questions</h3>
            </div>
            <div className="flex items-center gap-2 relative" ref={sessionsRef}>
              <button onClick={startNewSession}
                className="flex items-center gap-1 text-xs font-medium transition-all duration-200"
                style={{ padding: '5px 12px', borderRadius: 9999, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--accent-muted)'}
              >
                <MessageSquarePlus size={11} /> New
              </button>

              {sessions.length > 0 && (
                <button onClick={() => setSessionsOpen(!sessionsOpen)}
                  className="flex items-center gap-1 text-xs transition-all duration-200"
                  style={{ padding: '5px 12px', borderRadius: 9999, border: '1px solid var(--border-default)', color: 'var(--text-muted)', background: sessionsOpen ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <History size={11} />
                  <span className="max-w-[100px] truncate">{currentSessionLabel ? formatDate(currentSessionLabel.created_at) : `${sessions.length}`}</span>
                  <ChevronDown size={10} className={`transition-transform duration-200 ${sessionsOpen ? 'rotate-180' : ''}`} />
                </button>
              )}

              {messages.length > 0 && (
                <button onClick={clearChat}
                  className="flex items-center gap-1 text-xs transition-all duration-200"
                  style={{ padding: '5px 10px', borderRadius: 9999, color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <Trash2 size={11} /> Clear
                </button>
              )}

              {/* Sessions dropdown */}
              {sessionsOpen && sessions.length > 0 && (
                <div className="absolute right-0 top-full mt-2 w-72 max-h-56 overflow-y-auto z-50 animate-slide-up"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                  <div className="p-2 space-y-0.5">
                    {sessions.map(s => (
                      <div key={s.session_id}
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-all duration-150 group"
                        style={{
                          background: s.session_id === sessionId ? 'var(--accent-muted)' : 'transparent',
                          borderLeft: s.session_id === sessionId ? '2px solid var(--accent)' : '2px solid transparent',
                          borderRadius: 8,
                        }}
                        onClick={() => loadSession(s.session_id)}
                        onMouseEnter={e => { if (s.session_id !== sessionId) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                        onMouseLeave={e => { if (s.session_id !== sessionId) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {s.session_id === sessionId && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate" style={{ color: s.session_id === sessionId ? 'var(--accent)' : 'var(--text-primary)' }}>
                            {s.first_message || 'Empty session'}
                          </p>
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {formatDate(s.created_at)} · {s.message_count} msgs
                          </p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); removeSession(s.session_id); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all duration-150"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
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

          {/* Ollama / chat errors */}
          {ollamaDown && <div className="px-4 pt-3"><ErrorMessage message="Cannot connect to Ollama" hint="Start Ollama with: ollama serve" /></div>}
          {chatError && !ollamaDown && <div className="px-4 pt-3"><ErrorMessage message={chatError.message} hint={chatError.hint} /></div>}

          {/* Messages */}
          <div className="overflow-y-auto px-5 py-4 space-y-3" style={{ maxHeight: 400, minHeight: 120 }}>
            {messages.length === 0 && !ollamaDown && (
              <div className="text-center py-6 space-y-3">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Ask anything about the architecture — the LLM has the full report as context.
                </p>
                <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
                  {suggestedQuestions.map(q => (
                    <button key={q} onClick={() => setChatInput(q)}
                      className="text-xs transition-all duration-200"
                      style={{
                        padding: '6px 14px',
                        borderRadius: 9999,
                        background: 'rgba(34, 197, 94, 0.08)',
                        border: '1px solid rgba(34, 197, 94, 0.2)',
                        color: 'var(--text-muted)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'; e.currentTarget.style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34, 197, 94, 0.08)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                <div className="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed"
                  style={msg.role === 'user'
                    ? { background: 'var(--accent-muted)', color: 'var(--text-primary)', borderRadius: '12px 12px 4px 12px' }
                    : { background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-primary)', borderRadius: '12px 12px 12px 4px' }
                  }>
                  <div className="whitespace-pre-wrap text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                    {msg.content}
                    {msg.role === 'assistant' && streaming && i === messages.length - 1 && msg.content && (
                      <span className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse" style={{ background: 'var(--accent)' }} />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing dots */}
            {streaming && messages.length > 0 && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start animate-slide-up">
                <div className="px-4 py-2.5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px 12px 12px 4px' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-default)' }}>
            <div className="flex gap-2">
              <input type="text" placeholder="Ask about the architecture…"
                className="input-field flex-1 text-sm"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChatSend()}
                disabled={streaming || ollamaDown}
              />
              <button
                className="flex items-center justify-center w-9 h-9 transition-all duration-200 disabled:opacity-40"
                style={{
                  background: chatInput.trim() && !streaming ? 'var(--accent)' : 'var(--bg-card)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: 10,
                  color: chatInput.trim() && !streaming ? '#000' : 'var(--text-muted)',
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
    </div>
  );
}
