import { useState, useEffect } from 'react';
import { Settings, User, LogOut, Users, Mail, Server, Plus, Trash2, RefreshCw, Building2, Copy, ExternalLink } from 'lucide-react';
import { GlassPanel } from '../components/shared';
import { useAuth } from '../auth/AuthContext';
import { useOrg } from '../org/OrgContext';
import {
  getOrgs,
  getInvitations,
  createInvitation as createInvitationApi,
  revokeInvitation as revokeInvitationApi,
  getProviders,
  connectProvider,
  syncProvider,
  disconnectProvider,
  type InvitationRecord,
  type ProviderConnection,
} from '../api/client';

export default function SettingsPage() {
  const { user, signOut, enabled, idToken } = useAuth();
  const orgId = useOrg()?.selectedOrgId ?? null;
  const [orgName, setOrgName] = useState<string>('');
  const [orgPlan, setOrgPlan] = useState<string>('free');
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!idToken) return;
    getOrgs(idToken)
      .then((res) => {
        const orgs = res.orgs ?? [];
        const current = orgId ? orgs.find((o) => o.id === orgId) : orgs[0];
        if (current) {
          setOrgName(current.name);
          setOrgPlan(current.plan ?? 'free');
        }
      })
      .catch(() => {});
  }, [idToken, orgId]);

  useEffect(() => {
    if (!idToken || !orgId) return;
    getInvitations(idToken, orgId)
      .then((res) => setInvitations(res.invitations ?? []))
      .catch(() => setInvitations([]));
  }, [idToken, orgId]);

  const copyInviteLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleInvite = () => {
    const email = inviteEmail.trim();
    if (!email) {
      setInviteError('Enter an email address');
      return;
    }
    setInviteError('');
    setInviteLoading(true);
    createInvitationApi(idToken ?? null, orgId, email, inviteRole)
      .then((res) => {
        setInviteLink(res.invitation.invite_link);
        setInviteEmail('');
        getInvitations(idToken!, orgId).then((r) => setInvitations(r.invitations ?? []));
      })
      .catch((err) => setInviteError(err?.message ?? 'Failed to create invitation'))
      .finally(() => setInviteLoading(false));
  };

  const handleRevoke = (invitationId: string) => {
    revokeInvitationApi(idToken ?? null, orgId, invitationId).then(() =>
      getInvitations(idToken!, orgId).then((r) => setInvitations(r.invitations ?? []))
    );
  };

  const [providers, setProviders] = useState<ProviderConnection[]>([]);
  const [providerToken, setProviderToken] = useState('');
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState('');
  useEffect(() => {
    if (!idToken || !orgId) return;
    getProviders(idToken, orgId)
      .then((res) => setProviders(res.providers ?? []))
      .catch(() => setProviders([]));
  }, [idToken, orgId]);

  const handleConnectProvider = () => {
    const token = providerToken.trim();
    if (!token) {
      setProviderError('API token is required');
      return;
    }
    setProviderError('');
    setProviderLoading(true);
    connectProvider(idToken ?? null, orgId, 'cloudflare', { apiToken: token })
      .then(() => {
        setProviderToken('');
        getProviders(idToken!, orgId).then((r) => setProviders(r.providers ?? []));
      })
      .catch((err) => setProviderError(err?.message ?? 'Failed to connect'))
      .finally(() => setProviderLoading(false));
  };

  const handleSync = (providerId: string) => {
    syncProvider(idToken ?? null, orgId, providerId).then(() =>
      getProviders(idToken!, orgId).then((r) => setProviders(r.providers ?? []))
    );
  };

  const handleDisconnect = (providerId: string) => {
    if (!confirm('Disconnect this provider?')) return;
    disconnectProvider(idToken ?? null, orgId, providerId).then(() =>
      getProviders(idToken!, orgId).then((r) => setProviders(r.providers ?? []))
    );
  };

  const formatDate = (s: string) => {
    try {
      const d = new Date(s);
      return isNaN(d.getTime()) ? '—' : d.toLocaleString();
    } catch {
      return '—';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-medium text-white flex items-center gap-2">
        <Settings className="w-5 h-5 text-white/80" />
        Settings
      </h1>

      {/* Profile */}
      <GlassPanel className="p-6">
        <h2 className="text-sm font-medium text-white/80 mb-4 uppercase tracking-wider flex items-center gap-2">
          <User className="w-4 h-4" />
          Profile
        </h2>
        <p className="text-xs text-white/40 mb-4">
          Your account is managed by Firebase. Display name and email are read-only here.
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-white/40 mb-1">Display name</dt>
            <dd className="text-sm text-white bg-white/[0.03] rounded-lg px-3 py-2 border border-white/10">
              {user?.displayName || user?.email?.split('@')[0] || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/40 mb-1">Email</dt>
            <dd className="text-sm text-white bg-white/[0.03] rounded-lg px-3 py-2 border border-white/10">
              {user?.email || (enabled ? 'Not signed in' : 'Auth not configured')}
            </dd>
          </div>
        </dl>
        {enabled && user && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 text-sm transition-all"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </GlassPanel>

      {/* Organization */}
      <GlassPanel className="p-6">
        <h2 className="text-sm font-medium text-white/80 mb-4 uppercase tracking-wider flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Organization
        </h2>
        <p className="text-xs text-white/40 mb-4">
          Current organization context. Switch org from the sidebar when you belong to multiple.
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-white/40 mb-1">Name</dt>
            <dd className="text-sm text-white bg-white/[0.03] rounded-lg px-3 py-2 border border-white/10">
              {orgName || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/40 mb-1">Plan</dt>
            <dd className="text-sm text-white bg-white/[0.03] rounded-lg px-3 py-2 border border-white/10 capitalize">
              {orgPlan}
            </dd>
          </div>
        </dl>
      </GlassPanel>

      {/* Team invitations */}
      <GlassPanel className="p-6">
        <h2 className="text-sm font-medium text-white/80 mb-4 uppercase tracking-wider flex items-center gap-2">
          <Users className="w-4 h-4" />
          Team invitations
        </h2>
        <p className="text-xs text-white/40 mb-4">
          Invite teammates by email. They receive a link to sign up or sign in and join this organization with the chosen role.
        </p>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-white/40 block mb-1">Email address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="w-full rounded-lg bg-white/[0.03] px-3 py-2 border border-white/10 text-white text-sm placeholder:text-white/30"
              />
            </div>
            <div className="w-[160px]">
              <label className="text-xs text-white/40 block mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full rounded-lg bg-white/[0.03] px-3 py-2 border border-white/10 text-white text-sm"
              >
                <option value="viewer">Viewer (read-only)</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleInvite}
              disabled={inviteLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm disabled:opacity-50"
            >
              <Mail className="w-4 h-4" />
              Send invite
            </button>
          </div>
          {inviteError && <p className="text-sm text-red-400">{inviteError}</p>}
          {inviteLink && (
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
              <p className="text-xs text-white/40 mb-2">Invite link (share with invitee)</p>
              <div className="flex gap-2 items-center">
                <code className="text-sm text-white/80 break-all flex-1">{inviteLink}</code>
                <button
                  type="button"
                  onClick={() => copyInviteLink(inviteLink)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm shrink-0"
                >
                  <Copy className="w-4 h-4" />
                  {copiedLink ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
          {invitations.length > 0 && (
            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-white/40 mb-2">Pending invitations</p>
              <ul className="space-y-3">
                {invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0"
                  >
                    <div>
                      <span className="text-sm text-white/90">{inv.email}</span>
                      <span className="text-xs text-white/50 ml-2">({inv.role})</span>
                      <p className="text-xs text-white/40 mt-0.5">Expires {formatDate(inv.expires_at)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(inv.id)}
                      className="text-sm text-white/50 hover:text-red-400 flex items-center gap-1"
                    >
                      <Trash2 className="w-4 h-4" />
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </GlassPanel>

      {/* DNS providers */}
      <GlassPanel className="p-6">
        <h2 className="text-sm font-medium text-white/80 mb-4 uppercase tracking-wider flex items-center gap-2">
          <Server className="w-4 h-4" />
          DNS providers
        </h2>
        <p className="text-xs text-white/40 mb-4">
          Connect Cloudflare to import zones and DNS records. Tokens are stored encrypted. Only org owners and admins can add or remove providers.
        </p>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-white/40 block mb-1">Cloudflare API token</label>
              <input
                type="password"
                value={providerToken}
                onChange={(e) => setProviderToken(e.target.value)}
                placeholder="Your Cloudflare API token"
                className="w-full rounded-lg bg-white/[0.03] px-3 py-2 border border-white/10 text-white text-sm placeholder:text-white/30"
              />
              <p className="text-xs text-white/40 mt-1">
                Create a token with Zone:Read, DNS:Edit at{' '}
                <a
                  href="https://dash.cloudflare.com/profile/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline inline-flex items-center gap-0.5"
                >
                  Cloudflare dashboard
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
            <button
              type="button"
              onClick={handleConnectProvider}
              disabled={providerLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Connect
            </button>
          </div>
          {providerError && <p className="text-sm text-red-400">{providerError}</p>}
          {providers.length > 0 && (
            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-white/40 mb-2">Connected providers</p>
              <ul className="space-y-3">
                {providers.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 px-3 rounded-lg bg-white/[0.02] border border-white/5"
                  >
                    <div>
                      <span className="text-sm text-white/90 font-medium">{p.display_name || p.provider_type}</span>
                      <span
                        className={`text-xs ml-2 px-2 py-0.5 rounded-full ${
                          p.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {p.status}
                      </span>
                      {p.last_sync_at && (
                        <p className="text-xs text-white/40 mt-1">Last sync: {formatDate(p.last_sync_at)}</p>
                      )}
                      {p.last_error && (
                        <p className="text-xs text-red-400/80 mt-1">Error: {p.last_error}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSync(p.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-sm"
                        title="Sync zones and records now"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Sync
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDisconnect(p.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 text-sm"
                        title="Disconnect and remove this provider"
                      >
                        <Trash2 className="w-4 h-4" />
                        Disconnect
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
