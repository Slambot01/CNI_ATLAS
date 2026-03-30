'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { useAnalysisContext } from '../app/client-layout';
import { MessageSquare, X, Send, Trash2, PanelRightClose, PanelRightOpen } from 'lucide-react';

const T = { bg: '#09090b', surface: '#111113', border: '#1f1f23', text: '#ffffff', muted: '#71717a' };

/**
 * Collapsible chat sidebar for the Graph page.
 * Context-aware: when a node is clicked, the chat knows which file is selected.
 */
export default function GraphChat({ isOpen, onToggle }) {
  const { repoPath } = useAnalysisContext();
  const {
    messages,
    streaming,
    error,
    ollamaDown,
    sendMessage,
    clearChat,
    selectedFile,
    setSelectedFile,
  } = useChat();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || !repoPath || streaming) return;

    let question = q;
    if (selectedFile) {
      question = `I'm looking at the file: ${selectedFile.label || selectedFile.id}. It has ${selectedFile.indegree ?? 0} files importing it and imports ${selectedFile.outdegree ?? 0} files. My question: ${q}`;
    }

    sendMessage(question, repoPath);
    setInput('');
  };

  const hasMessages = messages.length > 0;

  // ─── Collapsed state: just show a toggle button ───
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        title="Open Chat"
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 30,
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: T.border, border: `1px solid ${T.border}`, borderRadius: 8,
          cursor: 'pointer', color: T.muted, transition: 'color 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
        onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}
      >
        <PanelRightOpen size={14} />
      </button>
    );
  }

  // ─── Open sidebar ───
  return (
    <div
      style={{
        width: 360,
        flexShrink: 0,
        background: T.surface,
        borderLeft: `1px solid ${T.border}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        zIndex: 30,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquare size={14} style={{ color: T.muted }} />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', fontWeight: 600, color: T.text }}>Graph Chat</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {hasMessages && (
            <button onClick={clearChat} title="Clear Chat"
              style={{ padding: 6, borderRadius: 8, border: 'none', cursor: 'pointer', color: T.muted, background: 'transparent', transition: 'color 0.15s ease' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}>
              <Trash2 size={13} />
            </button>
          )}
          <button onClick={onToggle} title="Close Chat"
            style={{ padding: 6, borderRadius: 8, border: 'none', cursor: 'pointer', color: T.muted, background: 'transparent', transition: 'color 0.15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
            onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}>
            <PanelRightClose size={14} />
          </button>
        </div>
      </div>

      {/* ── Context indicator ── */}
      {selectedFile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: T.bg, borderBottom: `1px solid ${T.border}` }}>
          <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: T.text, padding: '4px 8px', borderRadius: 6, background: T.border, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedFile.label || selectedFile.id}
          </span>
          <button onClick={() => setSelectedFile(null)} style={{ padding: 2, borderRadius: 4, border: 'none', cursor: 'pointer', color: T.muted, background: 'transparent', transition: 'color 0.15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
            onMouseLeave={e => { e.currentTarget.style.color = T.muted; }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Ollama error ── */}
      {ollamaDown && (
        <div
          className="mx-3 mt-3 px-3 py-2 rounded-lg text-xs"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.15)',
            color: '#f87171',
          }}
        >
          Cannot connect to Ollama. Run: <code>ollama serve</code>
        </div>
      )}

      {error && !ollamaDown && (
        <div
          className="mx-3 mt-3 px-3 py-2 rounded-lg text-xs"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.15)',
            color: '#f87171',
          }}
        >
          {error.message || 'Chat error'}
        </div>
      )}

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !ollamaDown && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2 opacity-50 px-4">
              <MessageSquare size={28} style={{ color: 'var(--cni-muted)', margin: '0 auto' }} />
              <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>
                Ask questions about your codebase.
                {selectedFile ? ` Context: ${selectedFile.label}` : ' Click a node for file context.'}
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
          >
            <div
              className="max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-relaxed"
              style={
                msg.role === 'user'
                  ? {
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                      color: 'white',
                      borderBottomRightRadius: '6px',
                    }
                  : {
                      background: 'rgba(12, 18, 32, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      color: 'var(--cni-text)',
                      borderBottomLeftRadius: '6px',
                    }
              }
            >
              <div className="whitespace-pre-wrap font-mono text-[11px]">
                {msg.content}
                {msg.role === 'assistant' && streaming && i === messages.length - 1 && (
                  <span
                    className="inline-block w-1.5 h-3 ml-0.5 animate-pulse"
                    style={{ background: 'var(--cni-accent)' }}
                  />
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Typing dots */}
        {streaming && messages.length > 0 && messages[messages.length - 1]?.content === '' && (
          <div className="flex justify-start animate-slide-up">
            <div
              className="rounded-2xl px-3 py-2"
              style={{
                background: 'rgba(12, 18, 32, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderBottomLeftRadius: '6px',
              }}
            >
              <div className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--cni-muted)', animationDelay: '0ms' }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--cni-muted)', animationDelay: '150ms' }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--cni-muted)', animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ── */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder={selectedFile ? `Ask about ${selectedFile.label}…` : 'Ask about your codebase…'}
            style={{
              flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '8px 12px', borderRadius: 8,
              background: T.bg, border: `1px solid ${T.border}`, color: T.text, outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            onFocus={e => { e.currentTarget.style.borderColor = T.muted; }}
            onBlur={e => { e.currentTarget.style.borderColor = T.border; }}
            disabled={streaming || ollamaDown}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming || ollamaDown}
            style={{
              padding: 8, borderRadius: 8, border: 'none', cursor: !input.trim() || streaming || ollamaDown ? 'not-allowed' : 'pointer',
              background: T.text, color: T.bg, transition: 'background 0.15s ease',
              opacity: !input.trim() || streaming || ollamaDown ? 0.3 : 1,
            }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#e4e4e7'; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.text; }}
          >
            {streaming ? (
              <span style={{ width: 14, height: 14, border: `2px solid rgba(0,0,0,0.2)`, borderTopColor: T.bg, borderRadius: '50%', animation: 'spin 0.6s linear infinite', display: 'block' }} />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
