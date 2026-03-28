'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import { useAnalysisContext } from '../client-layout';

export default function ChatPage() {
  const { repoPath, stats } = useAnalysisContext();
  const { messages, streaming, sendMessage, clearChat } = useChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || !repoPath || streaming) return;
    sendMessage(q, repoPath);
    setInput('');
  };

  if (!repoPath || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[75vh]">
        <p className="text-sm" style={{ color: 'var(--cni-muted)' }}>Analyze a repository first to chat with CNI.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5.75rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: '1px solid var(--cni-border)' }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--cni-text)' }}>Ask CNI</h2>
          <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>Ask questions about your codebase · Powered by local LLM</p>
        </div>
        {messages.length > 0 && <button onClick={clearChat} className="btn-ghost text-xs">Clear</button>}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
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
            disabled={streaming}
          />
          <button className="btn-primary text-sm disabled:opacity-50" onClick={handleSend} disabled={!input.trim() || streaming}>
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
