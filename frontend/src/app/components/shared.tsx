import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CheckCircle2 } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const GlassPanel = ({
  children,
  className,
  intensity = 'medium',
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
  hover?: boolean;
}) => {
  const bgOpacity =
    intensity === 'low'
      ? 'bg-white/[0.02]'
      : intensity === 'medium'
        ? 'bg-white/[0.05]'
        : 'bg-white/[0.08]';
  const borderOpacity = 'border-white/[0.12]';

  return (
    <div
      className={cn(
        'relative rounded-2xl backdrop-blur-2xl border shadow-lg transition-all duration-300 overflow-hidden',
        bgOpacity,
        borderOpacity,
        hover &&
          'hover:bg-white/[0.08] hover:border-white/[0.25] hover:shadow-[0_0_30px_rgba(255,255,255,0.05)]',
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-30 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] to-transparent opacity-0 hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      {children}
    </div>
  );
};

export const Badge = ({ type }: { type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' }) => {
  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-md text-[10px] font-mono border font-medium',
        'bg-white/10 text-white/90 border-white/20',
      )}
    >
      {type}
    </span>
  );
};

export const StatCard = ({
  title,
  value,
  type = 'neutral',
}: {
  title: string;
  value: string | number;
  type?: 'neutral' | 'warning' | 'danger';
}) => {
  return (
    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.08] flex flex-col items-center justify-center text-center group hover:bg-white/[0.08] transition-colors relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
      <span
        className={cn(
          'text-3xl font-light mb-1',
          type === 'neutral' && 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]',
          type === 'warning' && 'text-[#FFB347] drop-shadow-[0_0_8px_rgba(255,179,71,0.2)]',
          type === 'danger' && 'text-[#FF6B6B] drop-shadow-[0_0_8px_rgba(255,107,107,0.2)]',
        )}
      >
        {value}
      </span>
      <span className="text-xs font-medium text-white/40 uppercase tracking-wider group-hover:text-white/60 transition-colors">
        {title}
      </span>
    </div>
  );
};

export const ExpiringDomainRow = ({ domain, days }: { domain: string; days: number }) => {
  let statusColor = 'bg-emerald-500/50';
  if (days < 7) statusColor = 'bg-[#FF6B6B] shadow-[0_0_8px_#FF6B6B]';
  else if (days < 30) statusColor = 'bg-[#FFB347] shadow-[0_0_8px_#FFB347]';

  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-white/5 rounded-lg transition-colors group cursor-pointer border border-transparent hover:border-white/10">
      <div className="flex items-center gap-3">
        <div className={cn('w-1.5 h-1.5 rounded-full', statusColor)} />
        <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
          {domain}
        </span>
      </div>
      <span className="text-xs font-mono text-white/40">{days}d left</span>
    </div>
  );
};

export const ActivityRow = ({
  action,
  domain,
  type,
  time,
}: {
  action: 'create' | 'update' | 'delete';
  domain: string;
  type: string;
  time: string;
}) => {
  const colors = {
    create: 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]',
    update: 'bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]',
    delete: 'bg-[#FF6B6B] shadow-[0_0_5px_rgba(255,107,107,0.5)]',
  };

  return (
    <div className="flex items-start gap-3 py-3 px-4 relative pl-8 border-l border-white/5 ml-2 group hover:bg-white/[0.02] rounded-r-lg transition-colors">
      <div
        className={cn(
          'absolute left-[-5px] top-4 w-2.5 h-2.5 rounded-full border-2 border-black',
          colors[action],
        )}
      />
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

export const DNSTable = () => (
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
              <td className="px-4 py-2.5">
                <Badge type={record.type as any} />
              </td>
              <td className="px-4 py-2.5 font-mono text-white/80">{record.name}</td>
              <td className="px-4 py-2.5 font-mono text-white/60 truncate max-w-[150px]">
                {record.value}
              </td>
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

const markdownComponents: import('react-markdown').Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="text-white/80">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-white/20 pl-3 my-2 text-white/60 italic">{children}</blockquote>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <pre className="bg-white/[0.06] border border-white/10 rounded-lg p-3 my-2 overflow-x-auto">
          <code className={cn('text-xs font-mono text-white/80', className)} {...props}>{children}</code>
        </pre>
      );
    }
    return (
      <code className="bg-white/10 text-white/90 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  h1: ({ children }) => <h1 className="text-base font-semibold text-white mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold text-white mb-1.5">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-medium text-white mb-1">{children}</h3>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-white/10 bg-white/[0.04] px-2 py-1 text-left text-white/70 font-medium">{children}</th>,
  td: ({ children }) => <td className="border border-white/10 px-2 py-1 text-white/60">{children}</td>,
  hr: () => <hr className="border-white/10 my-3" />,
};

export const ChatMessage = ({
  role,
  content,
  children,
}: {
  role: 'user' | 'ai';
  content: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        'flex w-full mb-4 animate-in slide-in-from-bottom-2 fade-in duration-500',
        role === 'user' ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[90%] md:max-w-[85%]',
          role === 'user' ? 'items-end flex flex-col' : 'items-start flex flex-col',
        )}
      >
        <div
          className={cn(
            'px-4 py-3 rounded-2xl text-sm leading-relaxed backdrop-blur-md shadow-sm border',
            role === 'user'
              ? 'bg-white/10 border-white/20 text-white rounded-br-none'
              : 'bg-white/[0.04] border-white/10 text-white/80 rounded-bl-none',
          )}
        >
          {role === 'ai' ? (
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </Markdown>
          ) : (
            content
          )}
        </div>
        {children && <div className="mt-3 w-full">{children}</div>}
      </div>
    </div>
  );
};

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
      <Icon className="w-7 h-7 text-white/40" />
    </div>
    <h3 className="text-lg font-medium text-white/80 mb-2">{title}</h3>
    <p className="text-sm text-white/40 max-w-sm mb-6">{description}</p>
    {action}
  </div>
);
