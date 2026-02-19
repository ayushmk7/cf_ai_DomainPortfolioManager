import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Globe, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { GlassPanel, StatCard, ExpiringDomainRow, cn } from '../components/shared';
import { getAgentState, postTool, type PendingAction, type ChangeLogEntry } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DEFAULT_DASHBOARD_STATS, type DashboardStats } from '../data/dashboardData';

interface DomainRecord {
  id: string;
  domain: string;
  expiry_date: string | null;
  [key: string]: unknown;
}

function daysUntil(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const now = new Date();
  const exp = new Date(expiryDate);
  const diff = exp.getTime() - now.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { idToken } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_DASHBOARD_STATS);
  const [expiringDomains, setExpiringDomains] = useState<{ domain: string; days: number }[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingAction[]>([]);
  const [recentChanges, setRecentChanges] = useState<ChangeLogEntry[]>([]);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  const loadState = useCallback(() => {
    Promise.all([
      getAgentState(idToken).catch(() => null),
      postTool('queryDomains', { filter: 'expiring_soon' }, idToken).catch(() => null),
    ]).then(([res, expiringRes]) => {
      if (res?.ok && res.state) {
        setStats({
          total: res.state.domainCount,
          expiring: res.state.domainsExpiringSoon,
          active: Math.max(0, res.state.domainCount - res.state.domainsExpiringSoon),
          expired: 0,
        });
        setPendingApprovals(res.state.pendingApprovals);
        setRecentChanges(res.state.recentChanges ?? []);
      }
      const raw = expiringRes?.ok && expiringRes.result ? (expiringRes.result as { domains?: DomainRecord[] }).domains : null;
      if (Array.isArray(raw)) {
        setExpiringDomains(
          raw
            .map((d) => {
              const days = daysUntil(d.expiry_date ?? null);
              return days !== null ? { domain: d.domain, days } : null;
            })
            .filter((x): x is { domain: string; days: number } => x != null),
        );
      }
    });
  }, [idToken]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleApproval = (approvalId: string, approved: boolean) => {
    setApprovalLoading(approvalId);
    postTool('handleApprovalResponse', { approvalId, approved }, idToken)
      .then(() => loadState())
      .catch(() => {})
      .finally(() => setApprovalLoading(null));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Portfolio Overview */}
      <GlassPanel className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white/90 flex items-center gap-2">
            <Globe className="w-5 h-5 text-white/80" />
            Portfolio
          </h2>
          <button
            onClick={() => navigate('/app/portfolio')}
            className="text-xs text-white/40 hover:text-white transition-colors"
          >
            View All
          </button>
        </div>
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

      {/* Pending Approvals — live from backend */}
      {pendingApprovals.length > 0 ? (
        pendingApprovals.map((approval) => (
          <GlassPanel key={approval.id} className="p-1 overflow-hidden relative group">
            <div className="absolute top-0 left-0 w-1 h-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
            <div className="p-5 pl-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Approval Required
                </h2>
                <span className="text-[10px] bg-white/10 text-white px-2 py-0.5 rounded-full border border-white/20">
                  Urgent
                </span>
              </div>
              <p className="text-sm text-white/70 mb-4 leading-relaxed">{approval.description}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleApproval(approval.id, true)}
                  disabled={approvalLoading === approval.id}
                  className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] disabled:opacity-50"
                >
                  {approvalLoading === approval.id ? 'Processing...' : 'Approve'}
                </button>
                <button
                  onClick={() => handleApproval(approval.id, false)}
                  disabled={approvalLoading === approval.id}
                  className="flex-1 py-2 rounded-lg bg-transparent hover:bg-[#FF6B6B]/10 border border-white/10 hover:border-[#FF6B6B]/30 text-white/60 hover:text-[#FF6B6B] text-sm font-medium transition-all disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </GlassPanel>
        ))
      ) : (
        <GlassPanel className="p-4 overflow-hidden relative">
          <div className="flex items-center gap-3 px-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500/70" />
            <p className="text-sm text-white/50">No pending approvals</p>
          </div>
        </GlassPanel>
      )}

      {/* Recent Activity — live only */}
      <GlassPanel className="flex-1 p-5 min-h-[200px]">
        <h2 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-wider px-1">
          Recent Activity
        </h2>
        {recentChanges.length === 0 ? (
          <p className="text-sm text-white/40 px-1">No recent activity.</p>
        ) : (
          <div className="space-y-0">
            {recentChanges.slice(0, 6).map((change) => (
              <div
                key={change.id}
                className="flex items-start gap-3 py-3 px-4 relative pl-8 border-l border-white/5 ml-2 hover:bg-white/[0.02] rounded-r-lg transition-colors"
              >
                <div
                  className={cn(
                    'absolute left-[-5px] top-4 w-2.5 h-2.5 rounded-full border-2 border-black',
                    change.action === 'created'
                      ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]'
                      : change.action === 'deleted'
                        ? 'bg-[#FF6B6B] shadow-[0_0_5px_rgba(255,107,107,0.5)]'
                        : 'bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]',
                  )}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-white/90 font-medium capitalize">{change.action}</span>
                    {change.record_type && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono border font-medium bg-white/10 text-white/90 border-white/20">
                        {change.record_type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/30">
                    {new Date(change.changed_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
