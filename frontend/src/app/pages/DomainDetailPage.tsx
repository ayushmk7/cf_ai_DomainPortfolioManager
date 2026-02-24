import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { Globe, Server, History, ArrowLeft } from 'lucide-react';
import { GlassPanel, cn } from '../components/shared';
import { getDomain, getDomainRecords, getHistory, type DomainRecord, type DnsRecordApi, type ChangeLogEntry } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrg } from '../org/OrgContext';

type Tab = 'overview' | 'dns' | 'history';

export default function DomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { idToken } = useAuth();
  const orgId = useOrg()?.selectedOrgId ?? null;
  const [domain, setDomain] = useState<DomainRecord | null>(null);
  const [records, setRecords] = useState<DnsRecordApi[]>([]);
  const [history, setHistory] = useState<ChangeLogEntry[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !idToken) return;
    getDomain(id, idToken, orgId)
      .then((res) => setDomain(res.domain))
      .catch((e) => setError(e?.message ?? 'Failed to load domain'))
      .finally(() => setLoading(false));
  }, [id, idToken, orgId]);

  useEffect(() => {
    if (!id || !idToken || tab !== 'dns') return;
    getDomainRecords(id, idToken, undefined, orgId)
      .then((res) => setRecords(res.records ?? []))
      .catch(() => setRecords([]));
  }, [id, idToken, orgId, tab]);

  useEffect(() => {
    if (!idToken || tab !== 'history') return;
    getHistory(idToken, 100, orgId)
      .then((res) => {
        const list = res.history ?? [];
        const domainId = domain?.id;
        setHistory(domainId ? list.filter((h) => h.domain_id === domainId) : list);
      })
      .catch(() => setHistory([]));
  }, [idToken, orgId, tab, domain?.id]);

  if (loading || !domain) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/app/domains" className="text-sm text-white/60 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Domains
        </Link>
        <GlassPanel className="p-8">
          {error ? (
            <p className="text-white/60">{error}</p>
          ) : (
            <div className="flex justify-center">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            </div>
          )}
        </GlassPanel>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Globe }[] = [
    { key: 'overview', label: 'Overview', icon: Globe },
    { key: 'dns', label: 'DNS Records', icon: Server },
    { key: 'history', label: 'Change History', icon: History },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link to="/app/domains" className="text-sm text-white/60 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Domains
        </Link>
      </div>
      <h1 className="text-xl font-medium text-white flex items-center gap-2">
        <Globe className="w-5 h-5 text-white/80" />
        {domain.domain}
      </h1>

      <div className="flex gap-2 border-b border-white/10 pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t.key ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <GlassPanel className="p-5">
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-white/50">Registrar</dt>
              <dd className="text-white">{domain.registrar ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-white/50">Expiry date</dt>
              <dd className="text-white">{domain.expiry_date ? new Date(domain.expiry_date).toLocaleDateString() : '—'}</dd>
            </div>
            <div>
              <dt className="text-white/50">SSL expiry</dt>
              <dd className="text-white">{domain.ssl_expiry_date ? new Date(domain.ssl_expiry_date).toLocaleDateString() : '—'}</dd>
            </div>
            <div>
              <dt className="text-white/50">Status</dt>
              <dd className="text-white">{domain.status}</dd>
            </div>
            {domain.notes && (
              <div>
                <dt className="text-white/50">Notes</dt>
                <dd className="text-white">{domain.notes}</dd>
              </div>
            )}
          </dl>
        </GlassPanel>
      )}

      {tab === 'dns' && (
        <GlassPanel className="p-4">
          {records.length === 0 ? (
            <p className="text-white/50 text-sm">No DNS records.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/50 border-b border-white/10">
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Name / Subdomain</th>
                    <th className="pb-2 pr-4">Value</th>
                    <th className="pb-2">TTL</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-b border-white/5">
                      <td className="py-2 pr-4 text-white">{r.record_type}</td>
                      <td className="py-2 pr-4 text-white">{r.subdomain || '@'}</td>
                      <td className="py-2 pr-4 text-white/80 break-all">{r.value}</td>
                      <td className="py-2 text-white/60">{r.ttl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassPanel>
      )}

      {tab === 'history' && (
        <GlassPanel className="p-4">
          {history.length === 0 ? (
            <p className="text-white/50 text-sm">No change history for this domain.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-2 py-2 border-b border-white/5 last:border-0">
                  <span className="text-white/80">{h.action}</span>
                  {h.record_type && <span className="text-white/50">{h.record_type}</span>}
                  {h.old_value && <span className="text-white/40">from {h.old_value}</span>}
                  {h.new_value && <span className="text-white/40">to {h.new_value}</span>}
                  <span className="text-white/30 text-xs">{new Date(h.changed_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
