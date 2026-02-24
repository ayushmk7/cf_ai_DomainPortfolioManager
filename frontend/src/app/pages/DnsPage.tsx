import { useState, useEffect } from 'react';
import { Server, Search } from 'lucide-react';
import { GlassPanel, Badge, EmptyState } from '../components/shared';
import { postTool } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrg } from '../org/OrgContext';

interface DnsRecord {
  id: string;
  domain_id: string;
  record_type: string;
  name?: string;
  subdomain?: string;
  value: string;
  ttl: number;
  priority: number | null;
}

export default function DnsPage() {
  const { idToken } = useAuth();
  const orgId = useOrg()?.selectedOrgId ?? null;
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    postTool('queryDomains', {}, idToken, orgId)
      .then(async (res) => {
        const raw = res.ok && res.result ? (res.result as { domains?: { domain?: string; name?: string }[] }).domains : null;
        if (!Array.isArray(raw)) return;
        const allRecords: DnsRecord[] = [];
        for (const d of raw.slice(0, 20)) {
          const domainName = d.domain ?? d.name;
          if (!domainName) continue;
          try {
            const dnsRes = await postTool('getDnsRecords', { domain: domainName }, idToken, orgId);
            const recs = dnsRes.ok && dnsRes.result ? (dnsRes.result as { records?: DnsRecord[] }).records : null;
            if (Array.isArray(recs)) allRecords.push(...recs);
          } catch {}
        }
        setRecords(allRecords);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [idToken, orgId]);

  const recordName = (r: DnsRecord) => r.subdomain ?? r.name ?? '';
  const filtered = records.filter(
    (r) =>
      recordName(r).toLowerCase().includes(search.toLowerCase()) ||
      r.value.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium text-white flex items-center gap-2">
        <Server className="w-5 h-5 text-white/80" />
        DNS Records
      </h1>

      <GlassPanel className="p-3" intensity="low">
        <div className="flex items-center gap-2 px-2">
          <Search className="w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search records..."
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
            icon={Server}
            title="No DNS records"
            description="DNS records will appear here once you add domains and configure records via chat."
          />
        </GlassPanel>
      ) : (
        <GlassPanel className="p-0 overflow-hidden" intensity="low">
          <table className="w-full text-left text-sm">
            <thead className="text-white/40 text-xs font-medium border-b border-white/10">
              <tr>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Value</th>
                <th className="px-5 py-3">TTL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-5 py-3">
                    <Badge type={r.record_type as any} />
                  </td>
                  <td className="px-5 py-3 font-mono text-white/80 text-xs">{recordName(r)}</td>
                  <td className="px-5 py-3 font-mono text-white/60 text-xs truncate max-w-[200px]">
                    {r.value}
                  </td>
                  <td className="px-5 py-3 text-white/40 text-xs">{r.ttl}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      )}
    </div>
  );
}
