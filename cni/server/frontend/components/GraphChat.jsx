'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { useAnalysisContext } from '../app/client-layout';
import { MessageSquare, X, Send, Trash2 } from 'lucide-react';

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

  // ─── Collapsed strip ───
  if (!isOpen) {
    return (
      <div
        style={{
          width: 40,
          flexShrink: 0,
          background: 'rgba(12, 18, 32, 0.85)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          transition: 'width 300ms ease',
          position: 'relative',
        }}
      >
        <button
          onClick={onToggle}
          title="Open Chat"
          className="group relative"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#60a5fa',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(59, 130, 246, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <MessageSquare size={16} />
          {/* Badge dot when there are messages */}
          {hasMessages && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#3b82f6',
                boxShadow: '0 0 6px rgba(59, 130, 246, 0.6)',
              }}
            />
          )}
          {/* Tooltip */}
          <span
            className="absolute right-full mr-2 px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200"
            style={{
              background: 'rgba(12,18,32,0.95)',
              border: '1px solid var(--cni-border)',
              color: '#e2e8f0',
              transitionDelay: '200ms',
            }}
          >
            Open Chat
          </span>
        </button>
      </div>
    );
  }

  // ─── Open sidebar ───
  return (
    <div
      style={{
        width: 350,
        flexShrink: 0,
        background: 'rgba(15, 15, 20, 0.95)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 300ms ease',
        zIndex: 30,
      }}
      className="animate-slide-in-right"
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(12, 18, 32, 0.6)',
        }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={14} style={{ color: '#60a5fa' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--cni-text)' }}>
            Graph Chat
          </span>
        </div>
        <div className="flex items-center gap-1">
          {hasMessages && (
            <button
              onClick={clearChat}
              title="Clear Chat"
              className="p-1.5 rounded-lg transition-all duration-200"
              style={{ color: 'var(--cni-muted)', background: 'transparent' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#f87171';
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--cni-muted)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={onToggle}
            title="Close Chat"
            className="p-1.5 rounded-lg transition-all duration-200"
            style={{ color: 'var(--cni-muted)', background: 'transparent' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--cni-text)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--cni-muted)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Context indicator ── */}
      {selectedFile && (
        <div
          className="flex items-center gap-2 px-4 py-2 animate-fade-in"
          style={{
            background: 'rgba(59, 130, 246, 0.06)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
          }}
        >
          <span
            className="flex-1 text-xs font-mono truncate px-2 py-1 rounded-md"
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              color: '#93bbfc',
              border: '1px solid rgba(59, 130, 246, 0.15)',
            }}
          >
            Asking about: {selectedFile.label || selectedFile.id}
          </span>
          <button
            onClick={() => setSelectedFile(null)}
            title="Remove file context"
            className="p-0.5 rounded transition-colors"
            style={{ color: 'var(--cni-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--cni-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--cni-muted)')}
          >
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
      <div
        className="px-3 py-3"
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(10, 10, 15, 0.6)',
        }}
      >
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={selectedFile ? `Ask about ${selectedFile.label}…` : 'Ask about your codebase…'}
            className="flex-1 text-xs px-3 py-2 rounded-lg transition-all duration-200"
            style={{
              background: 'rgba(6, 10, 19, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--cni-text)',
              outline: 'none',
            }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.08)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            disabled={streaming || ollamaDown}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming || ollamaDown}
            className="p-2 rounded-lg transition-all duration-200 disabled:opacity-30"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: 'white',
              border: 'none',
              cursor: !input.trim() || streaming || ollamaDown ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(59, 130, 246, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {streaming ? (
              <span
                className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin block"
              />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
