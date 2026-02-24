import { useState, useEffect, useRef, useCallback } from 'react';
import { Radar, Send, Zap, Sparkles } from 'lucide-react';
import { cn, GlassPanel, ChatMessage } from '../components/shared';
import { getHealth, getAgentState, postChat, type ChatMessage as ApiChatMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrg } from '../org/OrgContext';

const WELCOME_MESSAGE =
  "Hi, I'm DomainPilot. Ask me to manage your domains or DNS — add domains, view records, check health, or get alerts.";

const SUGGESTED_PROMPTS = [
  'Add domain example.com',
  'Show DNS records for my domains',
  'Check domain health for example.com',
  'Set up Google Workspace email',
  'List all expiring domains',
  'Show my portfolio overview',
];

interface ChatMessageItem {
  role: 'user' | 'ai';
  content: string;
}

export default function ChatPage() {
  const { idToken } = useAuth();
  const orgId = useOrg()?.selectedOrgId ?? null;
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [ready, setReady] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const checkReadiness = useCallback(async () => {
    try {
      const health = await getHealth();
      if (!health.ok) { setReady(false); return; }
      const agent = await getAgentState(idToken, orgId);
      setReady(agent.ok);
    } catch {
      setReady(false);
    }
  }, [idToken, orgId]);

  useEffect(() => {
    checkReadiness();
    const interval = setInterval(checkReadiness, 60_000);
    return () => clearInterval(interval);
  }, [checkReadiness]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = (text?: string) => {
    const trimmed = (text ?? inputValue).trim();
    if (!trimmed || loading) return;
    setInputValue('');
    const newMessages: ChatMessageItem[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setLoading(true);

    const apiMessages: ApiChatMessage[] = newMessages.map((m) => ({
      role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));

    postChat(apiMessages, idToken, orgId)
      .then((res) => {
        if (res.ok && res.text) {
          setMessages((prev) => [...prev, { role: 'ai', content: res.text! }]);
        } else {
          setMessages((prev) => [
            ...prev,
            { role: 'ai', content: res.error ?? 'Something went wrong.' },
          ]);
        }
      })
      .catch(() => {
        setMessages((prev) => [
          ...prev,
          { role: 'ai', content: 'Sorry, the backend is unavailable. Please try again later.' },
        ]);
      })
      .finally(() => setLoading(false));
  };

  const statusDotClass = loading
    ? 'bg-white/80 animate-pulse'
    : ready === true
      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
      : ready === false
        ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]'
        : 'bg-white/40';

  const statusText = loading
    ? 'DomainPilot is thinking\u2026'
    : ready === true
      ? 'DomainPilot is ready'
      : ready === false
        ? 'DomainPilot is unavailable'
        : 'Checking\u2026';

  const isEmpty = messages.length === 0;

  return (
    <div className="h-full flex flex-col pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/20 shrink-0">
          <Radar className="w-5 h-5 text-white" />
          <div className="absolute inset-0 rounded-xl bg-white/10 blur-md -z-10" />
        </div>
        <div>
          <h1 className="text-lg font-medium text-white">DomainPilot Chat</h1>
          <div className="flex items-center gap-2">
            <span className={cn('w-1.5 h-1.5 rounded-full', statusDotClass)} />
            <span className="text-xs text-white/50">{statusText}</span>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <GlassPanel className="flex-1 flex flex-col overflow-hidden relative" intensity="low">
        <div className="absolute top-[-10%] right-[-10%] w-[300px] h-[300px] bg-white/[0.02] rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[250px] h-[250px] bg-white/[0.02] rounded-full blur-[60px] pointer-events-none" />

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 lg:px-12">
          {isEmpty ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 py-12">
              <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/15">
                <Sparkles className="w-8 h-8 text-white/60" />
                <div className="absolute inset-0 rounded-2xl bg-white/5 blur-xl -z-10" />
              </div>
              <div className="text-center max-w-md">
                <p className="text-white/70 text-sm leading-relaxed">{WELCOME_MESSAGE}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="px-3 py-1.5 rounded-full text-xs text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2 py-4 max-w-3xl mx-auto">
              <ChatMessage role="ai" content={WELCOME_MESSAGE} />
              {messages.map((msg, i) => (
                <ChatMessage key={`${i}-${msg.role}`} role={msg.role} content={msg.content} />
              ))}
              {loading && (
                <div className="flex items-center gap-2 px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 px-4 md:px-8 lg:px-12 pb-4 pt-3">
          <div className="max-w-3xl mx-auto">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-white/20 to-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-700 blur-md" />
              <div className="relative flex items-center bg-black/50 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl transition-all group-hover:border-white/30">
                <button
                  type="button"
                  onClick={() => {
                    const prompt = SUGGESTED_PROMPTS[Math.floor(Math.random() * SUGGESTED_PROMPTS.length)];
                    setInputValue(prompt);
                    inputRef.current?.focus();
                  }}
                  className="p-2 text-white/40 hover:text-white transition-colors"
                  title="Suggested prompt"
                >
                  <Zap className="w-5 h-5" />
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())
                  }
                  placeholder="Ask DomainPilot to manage your DNS..."
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 px-3 py-2 text-sm font-light"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={loading || !inputValue.trim()}
                  className="p-2.5 rounded-xl bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
