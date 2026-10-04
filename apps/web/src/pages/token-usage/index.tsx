import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../lib/api-client.js';

interface UsageResponse {
  summary: { runs: number; input_tokens: number; output_tokens: number; total_tokens: number };
  daily: Array<{ bucket: string; runs: number; input_tokens: number; output_tokens: number; total_tokens: number }>;
  byFeature: Array<{ feature: string; runs: number; total_tokens: number }>;
  recent: Array<{ id: string; model: string; status: string; input_tokens: number | null; output_tokens: number | null; error: string | null; metadata: Record<string, unknown>; created_at: string }>;
}

export function TokenUsagePage() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const usage = useQuery({
    queryKey: ['token-usage', period],
    queryFn: () => api.get<UsageResponse>(`/analytics/token-usage?period=${period}`),
    refetchInterval: 30_000,
  });
  const data = usage.data;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Token Usage</h1>
          <p className="mt-1 text-sm text-[#6f6b63]">Track which AI features are consuming tokens across outreach and replies.</p>
        </div>
        <select className="input-field w-40" value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}>
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="AI calls" value={data?.summary.runs ?? 0} />
        <Metric label="Input tokens" value={data?.summary.input_tokens ?? 0} />
        <Metric label="Output tokens" value={data?.summary.output_tokens ?? 0} />
        <Metric label="Total tokens" value={data?.summary.total_tokens ?? 0} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-[#d8d3c8] bg-white p-4">
          <h2 className="font-semibold">Tokens over time</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tickFormatter={(value) => new Date(value).toLocaleDateString()} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="input_tokens" stackId="tokens" fill="#3157d5" />
                <Bar dataKey="output_tokens" stackId="tokens" fill="#c8ff5f" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-[#d8d3c8] bg-white p-4">
          <h2 className="font-semibold">Usage by feature</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byFeature ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="feature" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total_tokens" fill="#171717" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-[#d8d3c8] bg-white">
        <div className="border-b border-[#e1ded6] p-4">
          <h2 className="font-semibold">Recent AI calls</h2>
        </div>
        <table className="min-w-full divide-y divide-[#e1ded6] text-sm">
          <thead className="bg-[#f1efe8] text-left text-[#6f6b63]">
            <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Feature</th><th className="px-4 py-3">Model</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tokens</th><th className="px-4 py-3">Error</th></tr>
          </thead>
          <tbody className="divide-y divide-[#e1ded6]">
            {data?.recent.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 text-[#6f6b63]">{new Date(row.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">{String(row.metadata?.feature ?? 'conversation')}</td>
                <td className="px-4 py-3 text-[#6f6b63]">{row.model}</td>
                <td className="px-4 py-3 text-[#6f6b63]">{row.status}</td>
                <td className="px-4 py-3 text-[#6f6b63]">{(row.input_tokens ?? 0) + (row.output_tokens ?? 0)}</td>
                <td className="max-w-md px-4 py-3 text-xs text-red-700">{row.error ?? '-'}</td>
              </tr>
            ))}
            {data?.recent.length === 0 ? <tr><td className="px-4 py-8 text-center text-[#6f6b63]" colSpan={6}>No AI usage recorded yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#d8d3c8] bg-white p-4">
      <div className="text-xs uppercase text-[#6f6b63]">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}
