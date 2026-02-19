import { useNavigate, Navigate } from 'react-router';
import {
  Radar,
  Globe,
  Server,
  History,
  Bell,
  ShieldCheck,
  MessageSquare,
  Zap,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Chat-First Interface',
    description:
      'Manage DNS records with natural language. Just tell DomainPilot what to do — no forms, no dashboards to learn.',
  },
  {
    icon: Globe,
    title: 'Domain Portfolio',
    description:
      'Track all your domains in one place. See expiry dates, registrars, and status at a glance.',
  },
  {
    icon: Server,
    title: 'DNS Records Management',
    description:
      'Add, update, and delete DNS records (A, AAAA, CNAME, MX, TXT, NS) with full audit trails.',
  },
  {
    icon: History,
    title: 'Change History & Audit',
    description:
      'Every DNS change is logged with timestamps, old/new values, and source — searchable and exportable.',
  },
  {
    icon: Bell,
    title: 'Proactive Alerts',
    description:
      'Get notified before domains expire or SSL certificates lapse. Never miss a renewal again.',
  },
  {
    icon: ShieldCheck,
    title: 'Approval Workflows',
    description:
      'Destructive operations (deletes, bulk changes) require explicit approval. Safety built in.',
  },
];

const HOW_IT_WORKS = [
  { step: '1', title: 'Add Domains', description: 'Import your domains or add them via chat.' },
  { step: '2', title: 'Manage via Chat', description: 'Tell DomainPilot to configure DNS, check health, or update records.' },
  { step: '3', title: 'Stay Protected', description: 'Get alerts, approve changes, and audit everything from one dashboard.' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // Signed-in users go straight to app — no sign-in prompt on home
  if (!loading && user) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen w-full bg-black text-[#E6EDF3] font-sans overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-black/60 border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/20">
              <Radar className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-medium tracking-tight text-white">DomainPilot</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[20%] left-[10%] w-[500px] h-[500px] bg-white/[0.02] rounded-full blur-[120px]" />
          <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-white/[0.015] rounded-full blur-[100px]" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 mb-8">
            <Zap className="w-3.5 h-3.5 text-white/80" />
            AI-Powered Domain Management
          </div>
          <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-white leading-[1.1] mb-6">
            Manage DNS with
            <br />
            <span className="text-white/60">natural language</span>
          </h1>
          <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed mb-10">
            DomainPilot is an AI-powered domain and DNS portfolio manager. Chat to configure records,
            track expiry and SSL status, get proactive alerts, and approve changes — all in one interface.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/app')}
              className="px-8 py-3.5 rounded-xl bg-white text-black font-medium shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white/80 font-medium hover:bg-white/10 transition-all"
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-medium text-white mb-4">
              Everything you need for domain management
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">
              From DNS configuration to expiry alerts — manage your entire domain portfolio with AI assistance.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.15] transition-all duration-300"
              >
                <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:bg-white/10 transition-colors">
                  <feature.icon className="w-5 h-5 text-white/70" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-medium text-white mb-4">How it works</h2>
            <p className="text-white/40">Three steps to effortless domain management.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-lg font-medium text-white/80">
                  {item.step}
                </div>
                <h3 className="text-lg font-medium text-white mb-2">{item.title}</h3>
                <p className="text-sm text-white/40">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-medium text-white mb-4">Simple pricing</h2>
          <p className="text-white/40 mb-10">One plan, everything included.</p>
          <div className="p-8 rounded-2xl bg-white/[0.03] border border-white/[0.1]">
            <div className="flex items-baseline justify-center gap-1 mb-2">
              <span className="text-5xl font-light text-white">$10</span>
              <span className="text-white/40">/month</span>
            </div>
            <p className="text-sm text-white/50 mb-6">Unlimited domains, full AI chat, all features.</p>
            <ul className="space-y-3 text-left mb-8">
              {[
                'Unlimited domain portfolio',
                'AI-powered DNS management',
                'Proactive expiry & SSL alerts',
                'Full audit & change history',
                'Approval workflows',
                'Priority support',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-white/70">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500/70 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 rounded-xl bg-white text-black font-medium hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              Get Started
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <Radar className="w-4 h-4" />
            <span>DomainPilot</span>
          </div>
          <p className="text-xs text-white/20">&copy; {new Date().getFullYear()} DomainPilot. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
