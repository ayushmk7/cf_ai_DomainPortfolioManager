import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Settings, User, CreditCard, Bell, LogOut, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { GlassPanel } from '../components/shared';
import { useAuth } from '../auth/AuthContext';
import {
  getSubscription,
  createCheckoutSession,
  createPortalSession,
  type SubscriptionInfo,
} from '../api/client';

function getAppOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, signOut, enabled, idToken } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null | undefined>(undefined);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const paymentSuccess = searchParams.get('success') === '1';

  useEffect(() => {
    if (!idToken) {
      setSubscription(null);
      return;
    }
    getSubscription(idToken)
      .then((res) => setSubscription(res.subscription ?? null))
      .catch(() => setSubscription(null));
  }, [idToken]);

  useEffect(() => {
    if (paymentSuccess) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('success');
        return next;
      }, { replace: true });
    }
  }, [paymentSuccess, setSearchParams]);

  const handleSubscribe = async () => {
    if (!user?.uid) {
      setBillingError('Please sign in to subscribe.');
      return;
    }
    setBillingLoading(true);
    setBillingError(null);
    try {
      const origin = getAppOrigin();
      const { url } = await createCheckoutSession({
        userId: user.uid,
        customerEmail: user.email ?? undefined,
        successUrl: `${origin}/app/settings?success=1`,
        cancelUrl: `${origin}/app/settings`,
      });
      if (url) window.location.href = url;
      else setBillingError('Could not start checkout.');
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : 'Checkout failed. Try again.');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleManageBilling = async () => {
    const sub = subscription;
    if (!sub?.stripeCustomerId) return;
    setBillingLoading(true);
    setBillingError(null);
    try {
      const origin = getAppOrigin();
      const { url } = await createPortalSession(sub.stripeCustomerId, `${origin}/app/settings`);
      if (url) window.location.href = url;
      else setBillingError('Could not open billing portal.');
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : 'Could not open billing. Try again.');
    } finally {
      setBillingLoading(false);
    }
  };

  const isPro = subscription && (subscription.plan === 'pro' && subscription.status === 'active');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium text-white flex items-center gap-2">
        <Settings className="w-5 h-5 text-white/80" />
        Settings
      </h1>

      {/* Profile */}
      <GlassPanel className="p-5">
        <h2 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-wider flex items-center gap-2">
          <User className="w-4 h-4" />
          Profile
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/40 block mb-1">Display Name</label>
            <div className="text-sm text-white/70 bg-white/[0.03] rounded-lg px-3 py-2 border border-white/10">
              {user?.displayName || user?.email?.split('@')[0] || 'User'}
            </div>
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Email</label>
            <div className="text-sm text-white/70 bg-white/[0.03] rounded-lg px-3 py-2 border border-white/10">
              {user?.email || (enabled ? 'Not signed in' : 'Auth not configured')}
            </div>
          </div>
          {enabled && user && (
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 text-sm transition-all mt-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          )}
        </div>
      </GlassPanel>

      {/* Billing */}
      <GlassPanel className="p-5">
        <h2 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-wider flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          Billing
        </h2>
        {paymentSuccess && (
          <div className="flex items-center gap-2 text-emerald-400/90 text-sm mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Payment successful. Your subscription is now active.
          </div>
        )}
        <p className="text-sm text-white/50 mb-4">
          Upgrade to Pro for $10/month to unlock unlimited domains and advanced features.
        </p>
        {subscription === undefined ? (
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading billing…
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {isPro && (
              <p className="text-sm text-emerald-400/90">
                You're on the <strong>Pro</strong> plan.
                {subscription.currentPeriodEnd && (
                  <span className="text-white/50 ml-1">
                    Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                  </span>
                )}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {!isPro && (
                <button
                  onClick={handleSubscribe}
                  disabled={billingLoading || !enabled || !user}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] disabled:opacity-50"
                >
                  {billingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Subscribe — $10/month
                </button>
              )}
              {subscription?.stripeCustomerId && (
                <button
                  onClick={handleManageBilling}
                  disabled={billingLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-sm transition-all disabled:opacity-50"
                >
                  {billingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  Manage billing
                </button>
              )}
            </div>
            {billingError && (
              <p className="text-sm text-red-400/90">{billingError}</p>
            )}
          </div>
        )}
      </GlassPanel>

      {/* Notifications */}
      <GlassPanel className="p-5">
        <h2 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-wider flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Notifications
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80">Domain expiry alerts</p>
              <p className="text-xs text-white/40">Get notified before domains expire</p>
            </div>
            <button className="w-10 h-6 rounded-full bg-emerald-500/30 border border-emerald-500/50 relative transition-colors">
              <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-emerald-400 transition-transform" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80">SSL certificate alerts</p>
              <p className="text-xs text-white/40">Get notified before SSL certificates expire</p>
            </div>
            <button className="w-10 h-6 rounded-full bg-emerald-500/30 border border-emerald-500/50 relative transition-colors">
              <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-emerald-400 transition-transform" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80">DNS change notifications</p>
              <p className="text-xs text-white/40">Get notified when DNS records are modified</p>
            </div>
            <button className="w-10 h-6 rounded-full bg-white/20 border border-white/30 relative transition-colors hover:bg-white/30">
              <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white/60 transition-transform" />
            </button>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
