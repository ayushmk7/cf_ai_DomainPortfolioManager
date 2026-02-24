import { useState, useEffect } from 'react';
import { Briefcase, Globe } from 'lucide-react';
import { GlassPanel, StatCard, ExpiringDomainRow, EmptyState, cn } from '../components/shared';
import { getAgentState, postTool } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrg } from '../org/OrgContext';
import { DEFAULT_DASHBOARD_STATS, type DashboardStats } from '../data/dashboardData';

interface Domain {
  id: string;
  name: string;
  domain?: string;
  registrar: string | null;
  expiry_date: string | null;
  auto_renew?: number;
  status: string;
}

function daysUntil(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const now = new Date();
  const exp = new Date(expiryDate);
  const diff = exp.getTime() - now.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export default function PortfolioPage() {
  const { idToken } = useAuth();
  const orgId = useOrg()?.selectedOrgId ?? null;
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_DASHBOARD_STATS);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [expiringDomains, setExpiringDomains] = useState<{ domain: string; days: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAgentState(idToken, orgId).catch(() => null),
      postTool('queryDomains', {}, idToken, orgId).catch(() => null),
      postTool('queryDomains', { filter: 'expiring_soon' }, idToken, orgId).catch(() => null),
    ]).then(([stateRes, domainsRes, expiringRes]) => {
      if (stateRes?.ok && stateRes.state) {
        setStats({
          total: stateRes.state.domainCount,
          expiring: stateRes.state.domainsExpiringSoon,
          active: Math.max(0, stateRes.state.domainCount - stateRes.state.domainsExpiringSoon),
          expired: 0,
        });
      }
      const rawDomains = domainsRes?.ok && domainsRes.result ? (domainsRes.result as { domains?: Domain[] }).domains : null;
      if (Array.isArray(rawDomains)) {
        setDomains(rawDomains);
      }
      const rawExpiring = expiringRes?.ok && expiringRes.result ? (expiringRes.result as { domains?: Domain[] }).domains : null;
      if (Array.isArray(rawExpiring)) {
        setExpiringDomains(
          rawExpiring
            .map((d) => {
              const name = d.domain ?? (d as Domain).name;
              const days = daysUntil(d.expiry_date ?? null);
              return days !== null ? { domain: name, days } : null;
            })
            .filter((x): x is { domain: string; days: number } => x != null),
        );
      }
      setLoading(false);
    });
  }, [idToken, orgId]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium text-white flex items-center gap-2">
        <Briefcase className="w-5 h-5 text-white/80" />
        Portfolio
      </h1>

      {/* Stats */}
      <GlassPanel className="p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="Total" value={stats.total} />
          <StatCard title="Active" value={stats.active} />
          <StatCard title="Expiring" value={stats.expiring} type="warning" />
          <StatCard title="Expired" value={stats.expired} type="danger" />
        </div>
      </GlassPanel>

      {/* Expiring Soon — live only */}
      <GlassPanel className="p-5">
        <h2 className="text-sm font-medium text-white/60 mb-3 uppercase tracking-wider px-1">
          Expiring Soon
        </h2>
        {expiringDomains.length === 0 ? (
          <p className="text-sm text-white/40 px-1">No domains expiring in the next 30 days.</p>
        ) : (
          <div className="space-y-1">
            {expiringDomains.map((row) => (
              <ExpiringDomainRow key={row.domain} domain={row.domain} days={row.days} />
            ))}
          </div>
        )}
      </GlassPanel>

      {/* Full Domain List */}
      {loading ? (
        <GlassPanel className="p-8">
          <div className="flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        </GlassPanel>
      ) : domains.length === 0 ? (
        <GlassPanel className="p-4">
          <EmptyState
            icon={Globe}
            title="No domains in portfolio"
            description="Add domains via the chat to build your portfolio."
          />
        </GlassPanel>
      ) : (
        <GlassPanel className="p-0 overflow-hidden" intensity="low">
          <div className="px-5 py-3 border-b border-white/10">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">
              All Domains ({domains.length})
            </h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-white/40 text-xs font-medium border-b border-white/10">
              <tr>
                <th className="px-5 py-3">Domain</th>
                <th className="px-5 py-3">Registrar</th>
                <th className="px-5 py-3">Expiry</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {domains.map((d) => (
                <tr key={d.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-5 py-3 font-mono text-white/90">{d.domain ?? d.name}</td>
                  <td className="px-5 py-3 text-white/60">{d.registrar ?? '—'}</td>
                  <td className="px-5 py-3 text-white/60 font-mono text-xs">{d.expiry_date ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full border',
                        d.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-white/5 text-white/50 border-white/10',
                      )}
                    >
                      {d.status}
                    </span>
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
