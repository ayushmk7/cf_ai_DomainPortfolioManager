import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { Users, Globe, ArrowLeft } from 'lucide-react';
import { GlassPanel } from '../components/shared';
import { getClient, getDomains, type ClientRecord, type DomainRecord } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrg } from '../org/OrgContext';

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { idToken } = useAuth();
  const orgId = useOrg()?.selectedOrgId ?? null;
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !idToken) return;
    getClient(id, idToken, orgId)
      .then((res) => setClient(res.client))
      .catch((e) => setError(e?.message ?? 'Failed to load client'))
      .finally(() => setLoading(false));
  }, [id, idToken, orgId]);

  useEffect(() => {
    if (!id || !idToken) return;
    getDomains(idToken, 200, orgId, id)
      .then((res) => setDomains(res.domains ?? []))
      .catch(() => setDomains([]));
  }, [id, idToken, orgId]);

  if (loading || !client) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/app/clients" className="text-sm text-white/60 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Clients
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

  return (
    <div className="flex flex-col gap-4">
      <Link to="/app/clients" className="text-sm text-white/60 hover:text-white flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to Clients
      </Link>
      <h1 className="text-xl font-medium text-white flex items-center gap-2">
        <Users className="w-5 h-5 text-white/80" />
        {client.name}
      </h1>

      <GlassPanel className="p-5">
        <h2 className="text-sm font-medium text-white/80 mb-3">Overview</h2>
        <dl className="grid gap-2 text-sm">
          {client.contact_email && (
            <div>
              <dt className="text-white/50">Email</dt>
              <dd className="text-white">{client.contact_email}</dd>
            </div>
          )}
          {client.contact_name && (
            <div>
              <dt className="text-white/50">Contact</dt>
              <dd className="text-white">{client.contact_name}</dd>
            </div>
          )}
          {client.notes && (
            <div>
              <dt className="text-white/50">Notes</dt>
              <dd className="text-white">{client.notes}</dd>
            </div>
          )}
        </dl>
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Domains ({domains.length})
        </h2>
        {domains.length === 0 ? (
          <p className="text-white/50 text-sm">No domains for this client.</p>
        ) : (
          <ul className="space-y-2">
            {domains.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <span className="text-white font-medium">{d.domain}</span>
                <Link
                  to={`/app/domains/${d.id}`}
                  className="text-sm text-white/60 hover:text-white"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
}
