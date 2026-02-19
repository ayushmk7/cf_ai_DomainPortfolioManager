import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radar, 
  LayoutDashboard, 
  Globe, 
  Server, 
  History, 
  Bell, 
  Settings, 
  User,
  ShieldCheck,
  CheckCircle2,
  Send,
  Zap,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  BarChart3
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getAgentState, postChat, type ChatMessage as ApiChatMessage } from './api/client';
import { DEFAULT_DASHBOARD_STATS, type DashboardStats } from './data/dashboardData';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Glass Components ---

const GlassPanel = ({ 
  children, 
  className, 
  intensity = 'medium',
  hover = false
}: { 
  children: React.ReactNode; 
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
  hover?: boolean;
}) => {
  // Updated for pitch black background: higher contrast borders, more subtle fills
  const bgOpacity = intensity === 'low' ? 'bg-white/[0.02]' : intensity === 'medium' ? 'bg-white/[0.05]' : 'bg-white/[0.08]';
  const borderOpacity = 'border-white/[0.12]'; // Crisper borders against black
  
  return (
    <div className={cn(
      "relative rounded-2xl backdrop-blur-2xl border shadow-lg transition-all duration-300 overflow-hidden",
      bgOpacity,
      borderOpacity,
      hover && "hover:bg-white/[0.08] hover:border-white/[0.25] hover:shadow-[0_0_30px_rgba(255,255,255,0.05)]",
      className
    )}>
      {/* Subtle top gradient shimmer for depth - refined for monochrome */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-30 pointer-events-none" />
      {/* Liquid reflection effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] to-transparent opacity-0 hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      {children}
    </div>
  );
};

const Badge = ({ type }: { type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' }) => {
  // Desaturated, cleaner functional colors
  const colors = {
    'A': 'bg-white/10 text-white/90 border-white/20',
    'AAAA': 'bg-white/10 text-white/90 border-white/20',
    'CNAME': 'bg-white/10 text-white/90 border-white/20',
    'MX': 'bg-white/10 text-white/90 border-white/20',
    'TXT': 'bg-white/10 text-white/90 border-white/20',
    'NS': 'bg-white/10 text-white/90 border-white/20',
  };

  return (
    <span className={cn(
      "px-2 py-0.5 rounded-md text-[10px] font-mono border font-medium",
      colors[type]
    )}>
      {type}
    </span>
  );
};

// --- Sub-Components ---

const Sidebar = ({ 
  isOpen, 
  setIsOpen, 
  isCollapsed, 
  setIsCollapsed,
  isMobile
}: { 
  isOpen: boolean; 
  setIsOpen: (v: boolean) => void;
  isCollapsed: boolean; 
  setIsCollapsed: (v: boolean) => void;
  isMobile: boolean;
}) => {
  const [active, setActive] = useState('Dashboard');
  
  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Domains', icon: Globe },
    { name: 'DNS Records', icon: Server },
    { name: 'History', icon: History },
    { name: 'Alerts', icon: Bell },
  ];

  // Mobile sidebar overlay handling
  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              className="fixed left-0 top-0 bottom-0 w-[280px] z-50 p-4 bg-black border-r border-white/10"
            >
               <SidebarContent active={active} setActive={setActive} navItems={navItems} isCollapsed={false} setIsCollapsed={() => {}} isMobile={true} closeMobile={() => setIsOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // Desktop sidebar
  return (
    <motion.div 
      animate={{ width: isCollapsed ? 80 : 280 }}
      className="h-full p-4 flex flex-col gap-6 relative z-30 shrink-0"
    >
      <SidebarContent 
        active={active} 
        setActive={setActive} 
        navItems={navItems} 
        isCollapsed={isCollapsed} 
        setIsCollapsed={setIsCollapsed} 
        isMobile={false}
      />
    </motion.div>
  );
};

const SidebarContent = ({ 
  active, 
  setActive, 
  navItems, 
  isCollapsed, 
  setIsCollapsed,
  isMobile,
  closeMobile
}: any) => {
  return (
    <div className="flex flex-col h-full gap-6">
      {/* Logo */}
      <div className={cn("flex items-center gap-3 px-2 pt-2", isCollapsed ? "justify-center" : "")}>
        <Link
          to="/"
          className={cn(
            "flex items-center gap-3 min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            isCollapsed ? "justify-center p-0" : "flex-1"
          )}
          aria-label="Back to home"
        >
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/20 shrink-0">
            <Radar className="w-6 h-6 text-white" />
            <div className="absolute inset-0 rounded-xl bg-white/10 blur-md -z-10" />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-medium tracking-tight text-white truncate">DomainPilot</span>
          )}
        </Link>
        {!isCollapsed && isMobile && (
          <button onClick={closeMobile} className="p-1 text-white/50 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <GlassPanel className="flex-1 flex flex-col py-2 overflow-hidden" intensity="low">
        <div className="flex-1 space-y-1 p-2">
          {navItems.map((item: any) => (
            <button
              key={item.name}
              onClick={() => {
                setActive(item.name);
                if (isMobile) closeMobile();
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden",
                active === item.name 
                  ? "text-white bg-white/10 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]" 
                  : "text-white/40 hover:text-white hover:bg-white/5",
                isCollapsed ? "justify-center px-0" : ""
              )}
              title={isCollapsed ? item.name : undefined}
            >
              {active === item.name && (
                <motion.div 
                  layoutId="activeNav"
                  className="absolute left-0 top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" 
                />
              )}
              <item.icon className={cn(
                "w-5 h-5 transition-colors shrink-0",
                active === item.name ? "text-white" : "text-white/40 group-hover:text-white/80"
              )} />
              {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.name}</span>}
            </button>
          ))}
        </div>

        {/* User Footer */}
        <div className={cn("p-2 mt-auto border-t border-white/5", isCollapsed && "items-center flex flex-col")}>
          <div className={cn("flex items-center gap-3 p-2", isCollapsed && "justify-center p-0")}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900 border border-white/20 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-white/90" />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/90 truncate">Alex Chen</p>
                <p className="text-xs text-white/40 truncate">Pro Plan</p>
              </div>
            )}
            {!isCollapsed && (
              <button className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {!isMobile && (
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="mt-2 w-full flex items-center justify-center p-2 text-white/20 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}

const StatCard = ({ title, value, type = 'neutral' }: { title: string, value: string | number, type?: 'neutral' | 'warning' | 'danger' }) => {
  return (
    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.08] flex flex-col items-center justify-center text-center group hover:bg-white/[0.08] transition-colors relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
      <span className={cn(
        "text-3xl font-light mb-1",
        type === 'neutral' && "text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]",
        type === 'warning' && "text-[#FFB347] drop-shadow-[0_0_8px_rgba(255,179,71,0.2)]",
        type === 'danger' && "text-[#FF6B6B] drop-shadow-[0_0_8px_rgba(255,107,107,0.2)]"
      )}>
        {value}
      </span>
      <span className="text-xs font-medium text-white/40 uppercase tracking-wider group-hover:text-white/60 transition-colors">{title}</span>
    </div>
  );
};

const ExpiringDomainRow = ({ domain, days }: { domain: string, days: number }) => {
  let statusColor = "bg-emerald-500/50";
  if (days < 7) statusColor = "bg-[#FF6B6B] shadow-[0_0_8px_#FF6B6B]";
  else if (days < 30) statusColor = "bg-[#FFB347] shadow-[0_0_8px_#FFB347]";

  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-white/5 rounded-lg transition-colors group cursor-pointer border border-transparent hover:border-white/10">
      <div className="flex items-center gap-3">
        <div className={cn("w-1.5 h-1.5 rounded-full", statusColor)} />
        <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">{domain}</span>
      </div>
      <span className="text-xs font-mono text-white/40">{days}d left</span>
    </div>
  );
};

const ActivityRow = ({ action, domain, type, time }: { action: 'create' | 'update' | 'delete', domain: string, type: string, time: string }) => {
  const colors = {
    create: 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]',
    update: 'bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]',
    delete: 'bg-[#FF6B6B] shadow-[0_0_5px_rgba(255,107,107,0.5)]',
  };

  return (
    <div className="flex items-start gap-3 py-3 px-4 relative pl-8 border-l border-white/5 ml-2 group hover:bg-white/[0.02] rounded-r-lg transition-colors">
      <div className={cn("absolute left-[-5px] top-4 w-2.5 h-2.5 rounded-full border-2 border-black", colors[action])} />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-white/90 font-medium group-hover:text-white">{domain}</span>
          <Badge type={type as any} />
        </div>
        <p className="text-xs text-white/30">{time}</p>
      </div>
    </div>
  );
};

const DashboardColumn = ({ stats }: { stats: DashboardStats }) => {
  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar pb-6">
      {/* Portfolio Overview */}
      <GlassPanel className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white/90 flex items-center gap-2">
            <Globe className="w-5 h-5 text-white/80" />
            Portfolio
          </h2>
          <button className="text-xs text-white/40 hover:text-white transition-colors">View All</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="Total" value={stats.total} />
          <StatCard title="Active" value={stats.active} />
          <StatCard title="Expiring" value={stats.expiring} type="warning" />
          <StatCard title="Expired" value={stats.expired} type="danger" />
        </div>
      </GlassPanel>

      {/* Expiring Soon — live data only; no hardcoded list */}
      <GlassPanel className="p-5">
        <h2 className="text-sm font-medium text-white/60 mb-3 uppercase tracking-wider px-1">Expiring Soon</h2>
        <p className="text-sm text-white/40 px-1">No domains expiring in the next 30 days.</p>
      </GlassPanel>

      {/* Pending Approvals */}
      <GlassPanel className="p-1 overflow-hidden relative group">
        <div className="absolute top-0 left-0 w-1 h-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
        <div className="p-5 pl-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Approval Required
            </h2>
            <span className="text-[10px] bg-white/10 text-white px-2 py-0.5 rounded-full border border-white/20">Urgent</span>
          </div>
          <p className="text-sm text-white/70 mb-4 leading-relaxed">
            Request to delete <span className="font-mono text-[#FF6B6B]">CNAME</span> record for <span className="font-medium text-white">staging.example.com</span> pointing to <span className="font-mono text-white/60">lb-01.aws.amazon.com</span>.
          </p>
          <div className="flex gap-3">
            <button className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              Approve
            </button>
            <button className="flex-1 py-2 rounded-lg bg-transparent hover:bg-[#FF6B6B]/10 border border-white/10 hover:border-[#FF6B6B]/30 text-white/60 hover:text-[#FF6B6B] text-sm font-medium transition-all">
              Reject
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* Recent Activity — live data only; no hardcoded list */}
      <GlassPanel className="flex-1 p-5 min-h-[200px]">
        <h2 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-wider px-1">Recent Activity</h2>
        <p className="text-sm text-white/40 px-1">No recent activity.</p>
      </GlassPanel>
    </div>
  );
};

// --- Chat Components ---

const ChatMessage = ({ 
  role, 
  content, 
  children 
}: { 
  role: 'user' | 'ai', 
  content: string, 
  children?: React.ReactNode 
}) => {
  return (
    <div className={cn(
      "flex w-full mb-6 animate-in slide-in-from-bottom-2 fade-in duration-500",
      role === 'user' ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "max-w-[90%] md:max-w-[85%]",
        role === 'user' ? "items-end flex flex-col" : "items-start flex flex-col"
      )}>
        <div className={cn(
          "px-5 py-3 rounded-2xl text-sm leading-relaxed backdrop-blur-md shadow-sm border",
          role === 'user' 
            ? "bg-white/10 border-white/20 text-white rounded-br-none" 
            : "bg-white/[0.04] border-white/10 text-white/80 rounded-bl-none"
        )}>
          {content}
        </div>
        {children && <div className="mt-3 w-full">{children}</div>}
      </div>
    </div>
  );
};

const DNSTable = () => (
  <GlassPanel className="p-0 overflow-hidden" intensity="low">
    <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
      <span className="text-xs font-medium text-white/60">New Records Created</span>
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-[#FF6B6B]/20 border border-[#FF6B6B]/50" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#FFB347]/20 border border-[#FFB347]/50" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/20 border border-white/50" />
      </div>
    </div>
    <div className="p-1 overflow-x-auto">
      <table className="w-full text-left text-xs min-w-[400px]">
        <thead className="text-white/40 font-medium border-b border-white/5">
          <tr>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Value</th>
            <th className="px-4 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {[
            { type: 'MX', name: '@', value: 'aspmx.l.google.com.', pri: 1 },
            { type: 'MX', name: '@', value: 'alt1.aspmx.l.google.com.', pri: 5 },
            { type: 'MX', name: '@', value: 'alt2.aspmx.l.google.com.', pri: 5 },
            { type: 'TXT', name: '@', value: 'v=spf1 include:_spf.google.com ~all', pri: null },
          ].map((record, i) => (
            <tr key={i} className="group hover:bg-white/[0.03] transition-colors">
              <td className="px-4 py-2.5"><Badge type={record.type as any} /></td>
              <td className="px-4 py-2.5 font-mono text-white/80">{record.name}</td>
              <td className="px-4 py-2.5 font-mono text-white/60 truncate max-w-[150px]">{record.value}</td>
              <td className="px-4 py-2.5 text-right">
                <CheckCircle2 className="w-4 h-4 text-emerald-500/80 ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </GlassPanel>
);

const ChatApprovalCard = () => (
  <GlassPanel className="p-4 border-l-2 border-l-white" intensity="low">
    <div className="flex justify-between items-start mb-3">
      <div>
        <h4 className="text-sm font-medium text-white mb-1">SPF Record Updates</h4>
        <p className="text-xs text-white/60">Standardizing email security across 3 domains.</p>
      </div>
      <ShieldCheck className="w-5 h-5 text-white" />
    </div>
    <div className="flex gap-3 mt-4">
      <button className="flex-1 py-1.5 px-3 rounded-lg bg-white/20 hover:bg-white/30 border border-white/30 text-white text-xs font-medium transition-all">
        Review & Approve
      </button>
      <button className="py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-medium transition-all">
        Dismiss
      </button>
    </div>
  </GlassPanel>
);

const PLACEHOLDER_MESSAGES_FOR_API: ApiChatMessage[] = [
  { role: "user", content: "Set up Google Workspace email for example.com" },
  { role: "assistant", content: "I've configured the necessary MX and TXT records for Google Workspace on example.com. These changes usually propagate within 15-60 minutes." },
  { role: "assistant", content: "I've prepared SPF updates for 3 domains. Review and approve?" },
];

const ChatInput = ({
  value,
  onChange,
  onSend,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  loading: boolean;
}) => {
  const handleSubmit = () => {
    if (!value.trim() || loading) return;
    onSend();
  };
  return (
    <div className="mt-auto pt-4 relative shrink-0">
        <div className="flex justify-center mb-3">
            <span className="text-[10px] uppercase tracking-widest text-white/50 font-medium flex items-center gap-2">
                <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_10px_white]", loading ? "bg-white/80 animate-pulse" : "bg-white/80")} />
                {loading ? "DomainPilot is thinking…" : "DomainPilot is ready"}
            </span>
        </div>
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-white/20 to-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-700 blur-md" />
        <div className="relative flex items-center bg-black/50 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl transition-all group-hover:border-white/30">
          <button type="button" className="p-2 text-white/40 hover:text-white transition-colors">
            <Zap className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSubmit())}
            placeholder="Ask DomainPilot to manage your DNS..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 px-3 py-2 text-sm font-light"
            disabled={loading}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !value.trim()}
            className="p-2.5 rounded-xl bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface ChatMessageItem {
  role: "user" | "ai";
  content: string;
}

const ChatColumn = () => {
  const [liveMessages, setLiveMessages] = useState<ChatMessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || loading) return;
    setInputValue("");
    const newLive: ChatMessageItem[] = [...liveMessages, { role: "user", content: trimmed }];
    setLiveMessages(newLive);
    setLoading(true);
    const apiMessages: ApiChatMessage[] = [
      ...PLACEHOLDER_MESSAGES_FOR_API,
      ...newLive.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content })),
    ];
    postChat(apiMessages)
      .then((res) => {
        if (res.ok && res.text) {
          setLiveMessages((prev) => [...prev, { role: "ai", content: res.text! }]);
        } else {
          setLiveMessages((prev) => [...prev, { role: "ai", content: res.error ?? "Something went wrong." }]);
        }
      })
      .catch(() => {
        setLiveMessages((prev) => [...prev, { role: "ai", content: "Sorry, the backend is unavailable. Please try again later." }]);
      })
      .finally(() => setLoading(false));
  };

  return (
    <GlassPanel className="h-full flex flex-col p-4 md:p-6 relative overflow-hidden" intensity="low">
      {/* Decorative background blurs within chat - Monochrome */}
      <div className="absolute top-[-10%] right-[-10%] w-[300px] h-[300px] bg-white/[0.03] rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[250px] h-[250px] bg-white/[0.03] rounded-full blur-[60px] pointer-events-none" />

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
        <div className="space-y-2 pt-4">
          <ChatMessage role="user" content="Set up Google Workspace email for example.com" />
          <ChatMessage role="ai" content="I've configured the necessary MX and TXT records for Google Workspace on example.com. These changes usually propagate within 15-60 minutes.">
            <DNSTable />
          </ChatMessage>
          <ChatMessage role="ai" content="I've prepared SPF updates for 3 domains. Review and approve?">
            <ChatApprovalCard />
          </ChatMessage>
          {liveMessages.map((msg, i) => (
            <ChatMessage key={`${i}-${msg.role}`} role={msg.role} content={msg.content} />
          ))}
        </div>
      </div>

      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        loading={loading}
      />
    </GlassPanel>
  );
};

// --- Mobile Navigation ---
const MobileNav = ({ activeTab, setActiveTab, toggleSidebar }: { activeTab: string, setActiveTab: (t: string) => void, toggleSidebar: () => void }) => {
  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button onClick={toggleSidebar} className="p-2 -ml-2 text-white/70 hover:text-white">
          <Menu className="w-6 h-6" />
        </button>
        <Link to="/" className="font-medium text-white hover:text-white/90 outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded">
          DomainPilot
        </Link>
      </div>
      
      <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            "p-2 rounded-md transition-all",
            activeTab === 'dashboard' ? "bg-white/10 text-white shadow-sm" : "text-white/40"
          )}
        >
          <BarChart3 className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={cn(
            "p-2 rounded-md transition-all",
            activeTab === 'chat' ? "bg-white/10 text-white shadow-sm" : "text-white/40"
          )}
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

// --- Main App ---

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileTab, setMobileTab] = useState<'dashboard' | 'chat'>('chat');
  const [isMobile, setIsMobile] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>(DEFAULT_DASHBOARD_STATS);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    getAgentState()
      .then((res) => {
        if (res.ok && res.state) {
          setDashboardStats({
            total: res.state.domainCount,
            expiring: res.state.domainsExpiringSoon,
            active: Math.max(0, res.state.domainCount - res.state.domainsExpiringSoon),
            expired: DEFAULT_DASHBOARD_STATS.expired,
          });
        }
      })
      .catch(() => {
        // Keep default hardcoded stats on failure
      });
  }, []);

  return (
    <div className="w-full h-screen bg-black text-[#E6EDF3] font-sans selection:bg-white/30 overflow-hidden flex flex-col lg:flex-row">
      
      {/* Mobile Header */}
      {isMobile && (
        <MobileNav 
          activeTab={mobileTab} 
          setActiveTab={(t) => setMobileTab(t as any)} 
          toggleSidebar={() => setSidebarOpen(true)} 
        />
      )}

      {/* Sidebar - Handles both mobile overlay and desktop permanent */}
      <Sidebar 
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarOpen} 
        isCollapsed={sidebarCollapsed}
        setIsCollapsed={setSidebarCollapsed}
        isMobile={isMobile}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 pt-0 lg:p-4 lg:pl-0 h-full max-w-[1600px] mx-auto overflow-hidden">
        
        {/* Left Column: Dashboard */}
        <div className={cn(
          "h-full transition-all duration-300",
          isMobile 
            ? (mobileTab === 'dashboard' ? "block w-full" : "hidden") 
            : "w-[45%]"
        )}>
            <DashboardColumn stats={dashboardStats} />
        </div>

        {/* Right Column: Chat */}
        <div className={cn(
          "h-full pb-2 transition-all duration-300",
          isMobile 
            ? (mobileTab === 'chat' ? "block w-full" : "hidden") 
            : "w-[55%]"
        )}>
            <ChatColumn />
        </div>
      </main>
      
      {/* Global CSS for scrollbars and font adjustments */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
        body {
            font-feature-settings: "ss01", "ss02", "cv01", "cv02";
            background-color: #000000;
        }
      `}</style>
    </div>
  );
}

export default App;
