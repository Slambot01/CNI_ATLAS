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
      <div className="flex items-center justify-center min-h-[70vh]">
        <p className="text-cni-muted text-sm">Analyze a repository first to chat with CNI.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-cni-border">
        <div>
          <h2 className="text-sm font-semibold text-cni-text">Ask CNI</h2>
          <p className="text-xs text-cni-muted">Ask questions about your codebase · Powered by local LLM</p>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className="btn-ghost text-xs">
            Clear Chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3 opacity-60">
              <p className="text-3xl">◈</p>
              <p className="text-sm text-cni-muted">Ask anything about your codebase</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  'What does repo_scanner do?',
                  'How is the cache invalidated?',
                  'Explain the graph builder',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-cni-border hover:border-cni-accent/40 text-cni-muted hover:text-cni-text transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-cni-accent text-white rounded-br-md'
                  : 'glass-card text-cni-text rounded-bl-md'
              }`}
            >
              <div className="whitespace-pre-wrap font-mono text-xs">
                {msg.content}
                {msg.role === 'assistant' && streaming && i === messages.length - 1 && (
                  <span className="inline-block w-2 h-4 bg-cni-accent ml-0.5 animate-pulse" />
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-cni-border">
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
          <button
            className="btn-primary text-sm disabled:opacity-50"
            onClick={handleSend}
            disabled={!input.trim() || streaming}
          >
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
