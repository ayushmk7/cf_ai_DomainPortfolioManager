import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Radar,
  LayoutDashboard,
  Globe,
  Server,
  History,
  Bell,
  Settings,
  User,
  Menu,
  X,
  MessageSquare,
  Briefcase,
  Building2,
  Users,
} from 'lucide-react';
import { cn, GlassPanel } from '../components/shared';
import { useAuth } from '../auth/AuthContext';
import { useOrg } from '../org/OrgContext';

const NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/app' },
  { name: 'Domains', icon: Globe, path: '/app/domains' },
  { name: 'Clients', icon: Users, path: '/app/clients' },
  { name: 'DNS Records', icon: Server, path: '/app/dns' },
  { name: 'Chat', icon: MessageSquare, path: '/app/chat' },
  { name: 'History', icon: History, path: '/app/history' },
  { name: 'Alerts', icon: Bell, path: '/app/alerts' },
  { name: 'Portfolio', icon: Briefcase, path: '/app/portfolio' },
];

function isNavActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === '/app') {
    return currentPath === '/app' || currentPath === '/app/';
  }
  return currentPath.startsWith(itemPath);
}

const SidebarContent = ({
  isCollapsed,
  isMobile,
  closeMobile,
}: {
  isCollapsed: boolean;
  isMobile: boolean;
  closeMobile?: () => void;
}) => {
  const location = useLocation();
  const { user } = useAuth();
  const orgContext = useOrg();
  const orgs = orgContext?.orgs ?? [];
  const selectedOrgId = orgContext?.selectedOrgId ?? null;
  const setSelectedOrgId = orgContext?.setSelectedOrgId;
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || '';
  const photoURL = user?.photoURL;
  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  return (
    <div className="flex flex-col h-full gap-6">
      <div className={cn('flex items-center gap-3 px-2 pt-2', isCollapsed ? 'justify-center' : '')}>
        <Link
          to="/"
          className={cn(
            'flex items-center gap-3 min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            isCollapsed ? 'justify-center p-0' : 'flex-1',
          )}
          aria-label="Back to home"
        >
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/20 shrink-0">
            <Radar className="w-6 h-6 text-white" />
            <div className="absolute inset-0 rounded-xl bg-white/10 blur-md -z-10" />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-medium tracking-tight text-white truncate">
              DomainPilot
            </span>
          )}
        </Link>
        {!isCollapsed && isMobile && closeMobile && (
          <button onClick={closeMobile} className="p-1 text-white/50 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {!isCollapsed && orgs.length > 1 && (
        <div className="px-2">
          <label className="text-xs text-white/40 uppercase tracking-wider px-2 block mb-1">Organization</label>
          <select
            value={selectedOrgId ?? ''}
            onChange={(e) => setSelectedOrgId?.(e.target.value || null)}
            className="w-full rounded-lg bg-white/5 border border-white/20 text-white/90 text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id} className="bg-neutral-900 text-white">
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {isCollapsed && orgs.length > 1 && selectedOrg && (
        <div className="flex justify-center" title={selectedOrg.name}>
          <Building2 className="w-5 h-5 text-white/50" />
        </div>
      )}

      <GlassPanel className="flex-1 flex flex-col py-2 overflow-hidden" intensity="low">
        <div className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(item.path, location.pathname);
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => isMobile && closeMobile?.()}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden',
                  active
                    ? 'text-white bg-white/10 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]'
                    : 'text-white/40 hover:text-white hover:bg-white/5',
                  isCollapsed ? 'justify-center px-0' : '',
                )}
                title={isCollapsed ? item.name : undefined}
              >
                {active && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute left-0 top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                  />
                )}
                <item.icon
                  className={cn(
                    'w-5 h-5 transition-colors shrink-0',
                    active ? 'text-white' : 'text-white/40 group-hover:text-white/80',
                  )}
                />
                {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.name}</span>}
              </Link>
            );
          })}
        </div>

        <div className={cn('p-2 mt-auto border-t border-white/5', isCollapsed && 'items-center flex flex-col')}>
          <div className={cn('flex items-center gap-3 p-2', isCollapsed && 'justify-center p-0')}>
            {photoURL ? (
              <img
                src={photoURL}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full border border-white/20 object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900 border border-white/20 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-white/90" />
              </div>
            )}
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/90 truncate">{displayName}</p>
                {userEmail && <p className="text-xs text-white/40 truncate">{userEmail}</p>}
              </div>
            )}
            {!isCollapsed && (
              <Link
                to="/app/settings"
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
              >
                <Settings className="w-4 h-4" />
              </Link>
            )}
          </div>

        </div>
      </GlassPanel>
    </div>
  );
};

const Sidebar = ({
  isOpen,
  setIsOpen,
  isCollapsed,
  isMobile,
}: {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  isCollapsed: boolean;
  isMobile: boolean;
}) => {
  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              className="fixed left-0 top-0 bottom-0 w-[280px] z-50 p-4 bg-black border-r border-white/10"
            >
              <SidebarContent
                isCollapsed={false}
                isMobile={true}
                closeMobile={() => setIsOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      animate={{ width: isCollapsed ? 80 : 280 }}
      className="h-full p-4 flex flex-col gap-6 relative z-30 shrink-0"
    >
      <SidebarContent
        isCollapsed={isCollapsed}
        isMobile={false}
      />
    </motion.div>
  );
};

// --- Mobile Nav ---

const MobileNav = ({ toggleSidebar }: { toggleSidebar: () => void }) => {
  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button onClick={toggleSidebar} className="p-2 -ml-2 text-white/70 hover:text-white">
          <Menu className="w-6 h-6" />
        </button>
        <Link
          to="/"
          className="font-medium text-white hover:text-white/90 outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded"
        >
          DomainPilot
        </Link>
      </div>
    </div>
  );
};

// --- Layout ---

export default function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarCollapsed = false;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-white/60">Loading…</div>
      </div>
    );
  }
  // No login required: show dashboard to everyone (frontend-only demo)

  return (
    <div className="w-full h-screen bg-black text-[#E6EDF3] font-sans selection:bg-white/30 overflow-hidden flex flex-col">
      {/* Frontend-only notice */}
      <div className="flex-shrink-0 bg-amber-500/90 text-black text-center py-1.5 px-4 text-sm font-medium z-50">
        Frontend-only demo, no backend. This showcases the UI and functionality only.
      </div>
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {isMobile && (
          <MobileNav toggleSidebar={() => setSidebarOpen(true)} />
        )}

        <Sidebar
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          isCollapsed={sidebarCollapsed}
          isMobile={isMobile}
        />

        <main className="flex-1 p-4 pt-0 lg:p-4 lg:pl-0 h-full max-w-[1600px] mx-auto overflow-hidden">
          <div className="h-full overflow-y-auto custom-scrollbar pr-2 pb-6">
            <Outlet />
          </div>
        </main>
      </div>


      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
        body {
          font-feature-settings: "ss01", "ss02", "cv01", "cv02";
          background-color: #000000;
        }
      `}</style>
    </div>
  );
}
