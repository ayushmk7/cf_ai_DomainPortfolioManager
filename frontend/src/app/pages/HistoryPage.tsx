import React, { useState, useEffect } from 'react';
import { History, Search } from 'lucide-react';
import { GlassPanel, Badge, EmptyState } from '../components/shared';
import { postTool } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface HistoryEntry {
  id: string;
  domain_id: string;
  record_id: string | null;
  action: string;
  record_type: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  change_source: string;
}

export default function HistoryPage() {
  const { idToken } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    postTool('queryDomains', {}, idToken)
      .then(async (res) => {
        const raw = res.ok && res.result ? (res.result as { domains?: { domain?: string; name?: string }[] }).domains : null;
        if (!Array.isArray(raw)) return;
        const all: HistoryEntry[] = [];
        for (const d of raw.slice(0, 20)) {
          const domainName = d.domain ?? d.name;
          if (!domainName) continue;
          try {
            const hRes = await postTool('getDnsHistory', { domain: domainName }, idToken);
            const history = hRes.ok && hRes.result ? (hRes.result as { history?: HistoryEntry[] }).history : null;
            if (Array.isArray(history)) all.push(...history);
          } catch {}
        }
        all.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
        setEntries(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [idToken]);

  const filtered = entries.filter(
    (e) =>
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      (e.new_value ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium text-white flex items-center gap-2">
        <History className="w-5 h-5 text-white/80" />
        Change History
      </h1>

      <GlassPanel className="p-3" intensity="low">
        <div className="flex items-center gap-2 px-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search history..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/30"
          />
        </div>
      </GlassPanel>

      {loading ? (
        <GlassPanel className="p-8">
          <div className="flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        </GlassPanel>
      ) : filtered.length === 0 ? (
        <GlassPanel className="p-4">
          <EmptyState
            icon={History}
            title="No history yet"
            description="DNS changes will appear here as you manage records through the chat."
          />
        </GlassPanel>
      ) : (
        <GlassPanel className="p-0 overflow-hidden" intensity="low">
          <table className="w-full text-left text-sm">
            <thead className="text-white/40 text-xs font-medium border-b border-white/10">
              <tr>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Old Value</th>
                <th className="px-5 py-3">New Value</th>
                <th className="px-5 py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-5 py-3">
                    <span className="text-xs text-white/70 capitalize">{e.action}</span>
                  </td>
                  <td className="px-5 py-3">
                    {e.record_type ? <Badge type={e.record_type as any} /> : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-5 py-3 font-mono text-white/40 text-xs truncate max-w-[150px]">
                    {e.old_value ?? '—'}
                  </td>
                  <td className="px-5 py-3 font-mono text-white/60 text-xs truncate max-w-[150px]">
                    {e.new_value ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-white/40 text-xs">
                    {new Date(e.changed_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      )}
    </div>
  );
}
