import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { GlassPanel, EmptyState, cn } from '../components/shared';
import { getAlerts, postTool } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useOrg } from '../org/OrgContext';

interface Alert {
  id: string;
  domain_id: string;
  alert_type: string;
  scheduled_for: string;
  sent: number;
  sent_at: string | null;
}

export default function AlertsPage() {
  const { idToken } = useAuth();
  const orgId = useOrg()?.selectedOrgId ?? null;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAlerts(idToken, undefined, orgId)
      .then((res) => setAlerts(res.alerts ?? []))
      .catch(() =>
        postTool('getAlerts', {}, idToken, orgId)
          .then((res) => {
            const result = res.ok && res.result ? (res.result as { alerts?: Alert[] }) : null;
            if (result?.alerts) setAlerts(result.alerts);
          })
          .catch(() => {})
      )
      .finally(() => setLoading(false));
  }, [idToken, orgId]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium text-white flex items-center gap-2">
        <Bell className="w-5 h-5 text-white/80" />
        Alerts
      </h1>

      {loading ? (
        <GlassPanel className="p-8">
          <div className="flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        </GlassPanel>
      ) : alerts.length === 0 ? (
        <GlassPanel className="p-4">
          <EmptyState
            icon={Bell}
            title="No alerts"
            description="Proactive alerts for domain expiry, SSL issues, and more will appear here."
          />
        </GlassPanel>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((a) => (
            <GlassPanel key={a.id} className="p-4" hover>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/90 font-medium capitalize">
                    {a.alert_type.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    Scheduled: {new Date(a.scheduled_for).toLocaleString()}
                  </p>
                </div>
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border',
                    a.sent
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-white/5 text-white/50 border-white/10',
                  )}
                >
                  {a.sent ? 'Sent' : 'Pending'}
                </span>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
