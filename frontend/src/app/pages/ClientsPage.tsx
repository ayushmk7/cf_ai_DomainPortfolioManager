import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Users } from 'lucide-react';
import { GlassPanel, EmptyState } from '../components/shared';
import { getClients, type ClientRecord } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrg } from '../org/OrgContext';

export default function ClientsPage() {
  const { idToken } = useAuth();
  const orgId = useOrg()?.selectedOrgId ?? null;
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClients(idToken, orgId)
      .then((res) => setClients(res.clients ?? []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, [idToken, orgId]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium text-white flex items-center gap-2">
        <Users className="w-5 h-5 text-white/80" />
        Clients
      </h1>

      {loading ? (
        <GlassPanel className="p-8">
          <div className="flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        </GlassPanel>
      ) : clients.length === 0 ? (
        <GlassPanel className="p-8">
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Clients let you group domains (e.g. by customer). Add clients from the API or use domains with a client assignment."
          />
        </GlassPanel>
      ) : (
        <GlassPanel className="p-4">
          <ul className="space-y-2">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <span className="font-medium text-white">{c.name}</span>
                  {c.contact_email && (
                    <p className="text-sm text-white/50">{c.contact_email}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/app/clients/${c.id}`}
                    className="text-sm text-white/70 hover:text-white"
                  >
                    View
                  </Link>
                  <Link
                    to={`/app/domains?clientId=${encodeURIComponent(c.id)}`}
                    className="text-sm text-white/70 hover:text-white"
                  >
                    Domains
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}
    </div>
  );
}
