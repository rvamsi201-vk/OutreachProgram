import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api-client.js';
import type { Campaign, CampaignRun } from './types.js';

export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const campaign = useQuery({ queryKey: ['campaign', id], queryFn: () => api.get<Campaign>(`/campaigns/${id}`), enabled: Boolean(id) });
  const runs = useQuery({ queryKey: ['campaign-runs', id], queryFn: () => api.get<{ data: CampaignRun[] }>(`/campaigns/${id}/runs`), enabled: Boolean(id), refetchInterval: 15_000 });
  const control = useMutation({
    mutationFn: ({ runId, action }: { runId: string; action: 'pause' | 'resume' | 'cancel' }) => api.post(`/campaign-runs/${runId}/${action}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['campaign-runs', id] }),
  });

  if (campaign.isLoading) return <div className="p-6 text-sm text-gray-500">Loading campaign...</div>;
  if (!campaign.data) return <div className="p-6 text-sm text-red-600">Campaign not found.</div>;
  const channelSet = [...new Set(campaign.data.steps.map((step) => step.channel))];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><Link to="/campaigns" className="text-sm text-gray-500">Back to campaigns</Link><h1 className="mt-2 text-2xl font-semibold">{campaign.data.name}</h1><p className="text-sm text-gray-500">Reusable template · {channelSet.join(', ')} · {campaign.data.timezone}</p></div><div className="flex flex-wrap gap-2"><Link to={`/campaigns/${id}/edit`} className="btn-secondary">Edit Template</Link><Link to={`/campaigns/${id}/runs/new`} className="btn-primary">Start New Run</Link></div></div>

      <div className="grid gap-4 md:grid-cols-3"><div className="rounded-lg border border-gray-300 bg-white p-4"><div className="text-xs uppercase text-gray-500">Sequence</div><div className="mt-2 text-2xl font-semibold">{campaign.data.steps.length} steps</div></div><div className="rounded-lg border border-gray-300 bg-white p-4"><div className="text-xs uppercase text-gray-500">Available channels</div><div className="mt-2 font-semibold">{channelSet.join(', ')}</div></div><div className="rounded-lg border border-gray-300 bg-white p-4"><div className="text-xs uppercase text-gray-500">Default window</div><div className="mt-2 font-semibold">{campaign.data.scheduleWindow.startHour}:00 to {campaign.data.scheduleWindow.endHour}:00</div></div></div>

      <section className="overflow-hidden rounded-lg border border-gray-300 bg-white"><div className="flex items-center justify-between border-b border-gray-200 p-4"><div><h2 className="font-semibold">Campaign Runs</h2><p className="text-sm text-gray-500">Each run has an independent audience, schedule, and progress.</p></div></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-100 text-left text-gray-500"><tr><th className="px-4 py-3">Run</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Channels</th><th className="px-4 py-3">Audience</th><th className="px-4 py-3">Enrollment status</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-200">{runs.data?.data.map((run) => <tr key={run.id}><td className="px-4 py-3"><div className="font-medium">{run.title}</div><div className="text-xs text-gray-500">{new Date(run.createdAt).toLocaleString()}</div></td><td className="px-4 py-3"><Status value={run.status} /></td><td className="px-4 py-3">{run.selectedChannels.join(', ')}</td><td className="px-4 py-3"><div>{run.eligibleLeads} eligible</div><div className="text-xs text-gray-500">{run.excludedLeads} excluded</div></td><td className="px-4 py-3"><RunStats stats={run.stats} /></td><td className="px-4 py-3">{run.scheduledAt ? new Date(run.scheduledAt).toLocaleString() : 'Immediately'}</td><td className="px-4 py-3"><RunActions run={run} isWorking={control.isPending} onAction={(action) => control.mutate({ runId: run.id, action })} /></td></tr>)}{runs.data?.data.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No runs yet. The template is ready to reuse whenever you choose an audience.</td></tr>}</tbody></table></div>{control.isError ? <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{control.error instanceof Error ? control.error.message : 'Could not update run.'}</div> : null}</section>

      <section className="rounded-lg border border-gray-300 bg-white"><div className="border-b border-gray-200 p-4"><h2 className="font-semibold">Reusable Sequence</h2></div><div className="divide-y divide-gray-200">{campaign.data.steps.map((step) => <div key={step.id ?? step.position} className="p-4"><div className="flex items-center justify-between gap-3"><div className="font-medium">Step {step.position}: {step.channel}</div><div className="text-sm text-gray-500">Wait {step.delayMinutes} minutes</div></div>{step.subject && <div className="mt-2 text-sm text-gray-600">Subject: {step.subject}</div>}<pre className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-100 p-3 text-sm text-gray-700">{step.template}</pre></div>)}</div></section>
    </div>
  );
}

function Status({ value }: { value: CampaignRun['status'] }) {
  const color = value === 'RUNNING' ? 'bg-green-100 text-green-800' : value === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' : value === 'PAUSED' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700';
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${color}`}>{value}</span>;
}

function RunActions({ run, isWorking, onAction }: { run: CampaignRun; isWorking: boolean; onAction: (action: 'pause' | 'resume' | 'cancel') => void }) {
  if (run.status === 'COMPLETED') return <span className="block text-right text-xs text-gray-500">Finished</span>;
  if (run.status === 'CANCELLED') return <span className="block text-right text-xs text-gray-500">Cancelled</span>;
  return (
    <div className="flex min-w-44 flex-wrap justify-end gap-2">
      {['RUNNING', 'SCHEDULED'].includes(run.status) ? (
        <button className="btn-secondary whitespace-nowrap px-3 py-2 text-sm" disabled={isWorking} onClick={() => onAction('pause')}>
          {isWorking ? 'Working...' : 'Pause'}
        </button>
      ) : null}
      {run.status === 'PAUSED' ? (
        <button className="btn-primary whitespace-nowrap px-3 py-2 text-sm" disabled={isWorking} onClick={() => onAction('resume')}>
          {isWorking ? 'Working...' : 'Resume'}
        </button>
      ) : null}
      <button className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60" disabled={isWorking} onClick={() => onAction('cancel')}>
        Cancel
      </button>
    </div>
  );
}

function RunStats({ stats }: { stats?: Record<string, number> }) {
  const entries = Object.entries(stats ?? {});
  if (entries.length === 0) return <span className="text-gray-500">No activity yet</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([status, count]) => (
        <span key={status} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{status}: {count}</span>
      ))}
    </div>
  );
}
