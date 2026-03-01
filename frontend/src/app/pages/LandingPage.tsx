import { Link } from 'react-router';
import { motion } from 'motion/react';
import {
  Radar,
  Globe,
  Server,
  History,
  Bell,
  ShieldCheck,
  MessageSquare,
  Zap,
  ChevronDown,
} from 'lucide-react';

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Chat-First Interface',
    description:
      'Manage DNS records with natural language. Just tell DomainPilot what to do, no forms or dashboards to learn.',
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
      'Every DNS change is logged with timestamps, old/new values, and source, searchable and exportable.',
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
  return (
    <div className="min-h-screen w-full bg-black text-[#E6EDF3] font-sans overflow-x-hidden">
      {/* Background mesh */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] max-w-[1400px] h-[80vh] bg-gradient-to-b from-indigo-500/[0.06] via-transparent to-transparent blur-3xl" />
        <div className="absolute top-[30%] left-[5%] w-[500px] h-[500px] bg-white/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-[15%] right-[5%] w-[400px] h-[400px] bg-white/[0.02] rounded-full blur-[100px]" />
        <div className="absolute top-[60%] left-[40%] w-[300px] h-[300px] bg-indigo-400/[0.04] rounded-full blur-[80px]" />
      </div>

      {/* Frontend-only notice */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500/90 text-black text-center py-1.5 px-4 text-sm font-medium">
        Frontend-only demo, no backend. This showcases the UI and functionality only.
      </div>

      {/* Nav */}
      <nav className="fixed top-12 left-0 right-0 z-50 backdrop-blur-xl bg-black/70 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-opacity hover:opacity-90"
            aria-label="DomainPilot home"
          >
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.03)]">
              <Radar className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-medium tracking-tight text-white">DomainPilot</span>
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-medium hover:bg-white/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)]"
          >
            See Dashboard and Features
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-44 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] border border-white/10 text-xs text-white/70 mb-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400/90" />
            AI-Powered Domain Management
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.08] mb-6"
          >
            <span className="text-white">Stop juggling dashboards.</span>
            <br />
            <span className="bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent">
              Talk to your domains.
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed mb-12"
          >
            DomainPilot is an AI-powered domain and DNS portfolio manager. Chat to configure records,
            track expiry and SSL status, get proactive alerts, and approve changes, all in one interface.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col items-center justify-center gap-4"
          >
            <a
              href="#features"
              className="px-8 py-4 rounded-xl bg-white text-black font-semibold shadow-[0_0_40px_rgba(255,255,255,0.25)] hover:shadow-[0_0_50px_rgba(255,255,255,0.35)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 scroll-smooth"
            >
              See Dashboard and Features
              <ChevronDown className="w-5 h-5" />
            </a>
          </motion.div>
          <motion.a
            href="#features"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/50 hover:text-white/80 transition-colors cursor-pointer"
            aria-label="Scroll to features"
          >
            <span className="text-xs font-medium">Scroll to see features</span>
            <motion.span
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-flex"
            >
              <ChevronDown className="w-8 h-8" strokeWidth={2} />
            </motion.span>
          </motion.a>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="relative py-24 px-6 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-semibold text-white mb-4">
              Everything you need for domain management
            </h2>
            <p className="text-white/45 max-w-xl mx-auto text-lg">
              From DNS configuration to expiry alerts, manage your entire domain portfolio with AI assistance.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="group p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] hover:shadow-[0_0_40px_rgba(255,255,255,0.03)] transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:bg-white/10 group-hover:border-white/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-white/70" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-semibold text-white mb-4">How it works</h2>
            <p className="text-white/45">Three steps to effortless domain management.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {HOW_IT_WORKS.map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-5 text-xl font-semibold text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-white/45">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why DomainPilot comparison */}
      <section className="relative py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-4xl font-semibold text-white mb-4">Why DomainPilot?</h2>
            <p className="text-white/45">One view for all clients and providers. Approval workflows and full audit trail.</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_0_60px_rgba(0,0,0,0.3)]"
          >
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-white/50 font-medium">Dimension</th>
                  <th className="text-left px-4 py-3 text-white/50 font-medium">Spreadsheets / Manual</th>
                  <th className="text-left px-4 py-3 text-white/50 font-medium">Registrar dashboards only</th>
                  <th className="text-left px-4 py-3 text-white/50 font-medium">Generic DNS tools</th>
                  <th className="text-left px-4 py-3 text-white font-medium">DomainPilot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="px-4 py-3 text-white/70 font-medium">Single view</td>
                  <td className="px-4 py-3 text-white/40">No</td>
                  <td className="px-4 py-3 text-white/40">No (one per registrar)</td>
                  <td className="px-4 py-3 text-white/40">Often single provider</td>
                  <td className="px-4 py-3 text-white">Yes, all providers and clients in one place</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-white/70 font-medium">AI / natural language</td>
                  <td className="px-4 py-3 text-white/40">No</td>
                  <td className="px-4 py-3 text-white/40">No</td>
                  <td className="px-4 py-3 text-white/40">Rare</td>
                  <td className="px-4 py-3 text-white">Yes, chat to manage DNS and domains</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-white/70 font-medium">Cross-provider sync</td>
                  <td className="px-4 py-3 text-white/40">Manual</td>
                  <td className="px-4 py-3 text-white/40">N/A</td>
                  <td className="px-4 py-3 text-white/40">Usually single</td>
                  <td className="px-4 py-3 text-white">Yes, Cloudflare and more; drift detection</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-white/70 font-medium">Client / portfolio view</td>
                  <td className="px-4 py-3 text-white/40">Manual</td>
                  <td className="px-4 py-3 text-white/40">No</td>
                  <td className="px-4 py-3 text-white/40">No</td>
                  <td className="px-4 py-3 text-white">Yes, clients, reports, per-client domains</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-white/70 font-medium">Expiry and SSL alerts</td>
                  <td className="px-4 py-3 text-white/40">Manual</td>
                  <td className="px-4 py-3 text-white/40">Per-registrar</td>
                  <td className="px-4 py-3 text-white/40">Varies</td>
                  <td className="px-4 py-3 text-white">Yes, proactive alerts and digest</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-white/70 font-medium">Audit and approval</td>
                  <td className="px-4 py-3 text-white/40">Manual</td>
                  <td className="px-4 py-3 text-white/40">Limited</td>
                  <td className="px-4 py-3 text-white/40">Varies</td>
                  <td className="px-4 py-3 text-white">Yes, change history, approval workflows</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-white/70 font-medium">Team and RBAC</td>
                  <td className="px-4 py-3 text-white/40">No</td>
                  <td className="px-4 py-3 text-white/40">Limited</td>
                  <td className="px-4 py-3 text-white/40">Sometimes</td>
                  <td className="px-4 py-3 text-white">Yes, orgs, roles, invitations</td>
                </tr>
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-14 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 text-white/45 hover:text-white/70 text-sm transition-colors">
            <Radar className="w-4 h-4" />
            <span>DomainPilot</span>
          </Link>
          <p className="text-xs text-white/25">&copy; {new Date().getFullYear()} DomainPilot. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
