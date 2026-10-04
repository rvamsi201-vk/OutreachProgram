import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../lib/api-client.js';

interface Overview {
  leads: number;
  qualified: number;
  opportunities: number;
  won: number;
  aiCost: number | null;
}

interface Funnel {
  leads: number;
  reached: number;
  responded: number;
  interested: number;
  qualified: number;
  handedOff: number;
  won: number;
}

export function DashboardPage() {
  const overview = useQuery({ queryKey: ['analytics-overview'], queryFn: () => api.get<Overview>('/analytics/overview') });
  const funnel = useQuery({ queryKey: ['analytics-funnel'], queryFn: () => api.get<Funnel>('/analytics/funnel') });
  const funnelData = funnel.data ? Object.entries(funnel.data).map(([name, value]) => ({ name, value })) : [];

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">Measured funnel, sales, channel, and AI activity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total Leads" value={overview.data?.leads ?? 0} />
        <Kpi label="Qualified Leads" value={overview.data?.qualified ?? 0} />
        <Kpi label="Opportunities" value={overview.data?.opportunities ?? 0} />
        <Kpi label="Won" value={overview.data?.won ?? 0} />
        <Kpi label="AI Cost" value={overview.data?.aiCost == null ? 'Unknown' : overview.data.aiCost} />
      </div>

      <section className="rounded-lg border border-gray-800 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Funnel</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dedbd3" />
              <XAxis dataKey="name" stroke="#6f6b63" />
              <YAxis stroke="#6f6b63" />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #dedbd3', color: '#171717' }} />
              <Bar dataKey="value" fill="#171717" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-800 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Channel Performance</h2>
          <p className="mt-4 text-sm text-gray-500">Metrics appear when message delivery and call events exist.</p>
        </section>
        <section className="rounded-lg border border-gray-800 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Salesperson Metrics</h2>
          <p className="mt-4 text-sm text-gray-500">Opportunity and task counts are available through analytics APIs.</p>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );
}
