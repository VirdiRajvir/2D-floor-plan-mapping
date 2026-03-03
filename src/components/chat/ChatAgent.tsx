'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getOpenAIKey } from '@/components/ApiKeySettings';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface QuickQuestion {
  label: string;
  question: string;
}

interface ChatAgentProps {
  /** Agent colour theme */
  variant: 'setup' | 'firefighter';
  /** System prompt (injected as first message to GPT) */
  systemPrompt: string;
  /** Live context JSON string — refreshed before every send */
  context: string;
  /** Pre-set quick questions shown as chips */
  quickQuestions: QuickQuestion[];
  /** Label shown in the header */
  title: string;
  /** Small subtitle under the title */
  subtitle: string;
  /** Model override (default: gpt-4o-mini) */
  model?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChatAgent({
  variant,
  systemPrompt,
  context,
  quickQuestions,
  title,
  subtitle,
  model,
}: ChatAgentProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Check key on mount + when panel opens
  useEffect(() => {
    setHasKey(!!getOpenAIKey());
  }, [open]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && hasKey && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open, hasKey]);

  const sendMessage = useCallback(async (text: string) => {
    const apiKey = getOpenAIKey();
    if (!apiKey || !text.trim() || streaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    // Build history for API (only role + content)
    const history = [...messages, userMsg].map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const assistantId = crypto.randomUUID();
    setMessages(prev => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() },
    ]);

    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          systemPrompt,
          context,
          apiKey,
          model: model ?? 'gpt-4o-mini',
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: `Error: ${(err as { error?: string }).error ?? 'Unknown error'}` }
              : m
          )
        );
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) throw new Error('No response stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;

          try {
            const parsed = JSON.parse(payload) as { text?: string; error?: string };
            if (parsed.error) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, content: m.content + `\n\nError: ${parsed.error}` } : m
                )
              );
            } else if (parsed.text) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, content: m.content + parsed.text } : m
                )
              );
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: m.content || 'Failed to get a response. Please try again.' }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, streaming, systemPrompt, context, model]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  const clearChat = useCallback(() => {
    if (streaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
  }, [streaming]);

  // ─── Colours ────────────────────────────────────────────────

  const isSetup = variant === 'setup';
  const accentBg = isSetup ? 'bg-amber-500' : 'bg-red-500';
  const accentBgHover = isSetup ? 'hover:bg-amber-400' : 'hover:bg-red-400';
  const accentBgMuted = isSetup ? 'bg-amber-500/15' : 'bg-red-500/15';
  const accentBorder = isSetup ? 'border-amber-500/40' : 'border-red-500/40';
  const accentText = isSetup ? 'text-amber-400' : 'text-red-400';
  const accentTextLight = isSetup ? 'text-amber-300' : 'text-red-300';
  const chipBg = isSetup ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30' : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30';
  const fabIcon = isSetup ? '🛠️' : '🔥';

  // ─── FAB (floating action button) ──────────────────────────

  if (!open) {
    return (
      <div className="fixed bottom-6 right-6 z-[100]">
        <button
          onClick={() => hasKey ? setOpen(true) : undefined}
          disabled={!hasKey}
          title={hasKey ? `Open ${title}` : 'Add your OpenAI API key in ⚙ Settings to enable the AI assistant'}
          className={`group relative w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-2xl transition-all
            ${hasKey
              ? `${accentBg} ${accentBgHover} text-white cursor-pointer hover:scale-110 active:scale-95`
              : 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-60'
            }`}
        >
          {hasKey ? fabIcon : '🔒'}
          {/* Pulse ring when has key */}
          {hasKey && (
            <span className={`absolute inset-0 rounded-full ${accentBg} opacity-30 animate-ping`} />
          )}
          {/* Tooltip for disabled */}
          {!hasKey && (
            <span className="absolute bottom-full mb-2 right-0 w-56 px-3 py-2 text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-left">
              Add your OpenAI API key in ⚙ Settings on the home page to enable the AI assistant.
            </span>
          )}
        </button>
      </div>
    );
  }

  // ─── Chat Panel ────────────────────────────────────────────

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-[400px] max-h-[600px] flex flex-col rounded-2xl bg-[#0d1117] border border-slate-700/80 shadow-2xl shadow-black/50 overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${accentBgMuted} border-b ${accentBorder}`}>
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{fabIcon}</span>
          <div>
            <h3 className={`text-sm font-semibold ${accentTextLight}`}>{title}</h3>
            <p className="text-[10px] text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-all"
              title="Clear chat"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-all"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[380px]">
        {messages.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-3xl mb-3">{fabIcon}</div>
            <p className={`text-sm font-medium ${accentText}`}>{title}</p>
            <p className="text-xs text-slate-500 mt-1 max-w-[280px] mx-auto">{subtitle}</p>
            <p className="text-[10px] text-slate-600 mt-3">Ask a question or pick one below</p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? `${accentBgMuted} ${accentText} border ${accentBorder}`
                    : 'bg-slate-800/80 text-slate-300 border border-slate-700/50'
                }`}
              >
                {msg.role === 'assistant' && !msg.content && streaming ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick questions */}
      {messages.length < 2 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {quickQuestions.slice(0, 5).map(q => (
              <button
                key={q.label}
                onClick={() => sendMessage(q.question)}
                disabled={streaming}
                className={`px-2.5 py-1 text-[10px] rounded-full border transition-all disabled:opacity-50 ${chipBg} ${accentText}`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="px-3 pb-3 pt-1">
        <div className="flex items-end gap-2 bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something..."
            rows={1}
            className="flex-1 bg-transparent text-slate-200 text-xs outline-none resize-none placeholder:text-slate-600 max-h-20 scrollbar-thin"
            style={{ lineHeight: '1.5' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming}
            className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all text-sm
              ${input.trim() && !streaming
                ? `${accentBg} text-white ${accentBgHover}`
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
        <p className="text-[9px] text-slate-600 text-center mt-1.5">Powered by OpenAI · Responses may not always be accurate</p>
      </div>
    </div>
  );
}
