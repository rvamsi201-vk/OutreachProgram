import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/auth-context.js';
import { api } from '../lib/api-client.js';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: 'D' },
  { label: 'Leads', path: '/leads', icon: 'L' },
  { label: 'Campaigns', path: '/campaigns', icon: 'C' },
  { label: 'Inbox', path: '/inbox', icon: 'I' },
  { label: 'Agents', path: '/agents', icon: 'AI' },
  { label: 'Voice Agents', path: '/voice-agents', icon: 'VA' },
  { label: 'Knowledge', path: '/knowledge', icon: 'KB' },
  { label: 'Pipeline', path: '/pipeline', icon: 'P' },
  { label: 'Tasks', path: '/tasks', icon: 'T' },
  { label: 'Team', path: '/team', icon: 'TM' },
  { label: 'Token Usage', path: '/token-usage', icon: 'TU' },
  { label: 'Settings', path: '/settings', icon: 'S' },
  { label: 'User Guide', path: '/guide', icon: '?' },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ data: Array<{ id: string; readAt: string | null }> }>('/notifications'),
  });
  const unread = notifications.data?.data.filter((item) => !item.readAt).length ?? 0;

  useEffect(() => {
    const source = new EventSource('/api/events/stream', { withCredentials: true });
    source.addEventListener('notification.created', () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    });
    source.addEventListener('message.received', () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    return () => source.close();
  }, [queryClient]);

  const handleLogout = async () => {
    const confirmed = window.confirm('Are you sure you want to logout?');
    if (!confirmed) return;
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#ecebe7] text-[#171717]">
      <aside className="m-3 mr-0 flex w-64 flex-col overflow-hidden rounded-l-2xl border border-[#262626] bg-[#1d1d1b] shadow-2xl">
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f4f2eb] text-sm font-bold text-[#171717]">
            AI
          </div>
          <span className="text-lg font-semibold text-white">Outreach CRM</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-[#c8ff5f]/15 text-[#d9ff85]'
                    : 'text-[#c9c7c0] hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold ${isActive ? 'bg-[#c8ff5f] text-[#171717]' : 'bg-white/5 text-[#f4f2eb]'}`}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <Link to="/tasks" className="mb-3 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#f4f2eb]">
            <span>Notifications</span>
            <span className="rounded-full bg-[#c8ff5f] px-2 py-0.5 text-xs font-semibold text-[#171717]">{unread}</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d99cff] text-sm font-semibold text-[#171717]">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs text-[#a8a59e]">
                {user?.activeOrganization?.name}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-1.5 text-[#a8a59e] transition-colors hover:bg-white/10 hover:text-white"
              title="Logout"
            >
              X
            </button>
          </div>
        </div>
      </aside>

      <main className="m-3 ml-0 flex-1 overflow-y-auto rounded-r-2xl border border-l-0 border-[#ddd9cf] bg-[#f7f6f2] shadow-2xl">
        <Outlet />
      </main>
    </div>
  );
}
