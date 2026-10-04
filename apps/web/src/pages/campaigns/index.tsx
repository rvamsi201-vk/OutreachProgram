import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api-client.js';
import type { Campaign, CampaignRun } from './types.js';

export function CampaignsPage() {
  const queryClient = useQueryClient();
  const campaigns = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<{ data: Campaign[] }>('/campaigns?limit=50'),
  });
  const runQueries = useQueries({
    queries: (campaigns.data?.data ?? []).map((campaign) => ({
      queryKey: ['campaign-runs', campaign.id],
      queryFn: () => api.get<{ data: CampaignRun[] }>(`/campaigns/${campaign.id}/runs`),
      enabled: Boolean(campaign.id),
    })),
  });
  const runsByCampaign = new Map((campaigns.data?.data ?? []).map((campaign, index) => [campaign.id, runQueries[index]?.data?.data ?? []]));
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/campaigns/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">Build reusable multi-channel sequences, then launch independent runs.</p>
        </div>
        <Link to="/campaigns/new" className="btn-primary">New Campaign</Link>
      </div>

      {campaigns.isLoading ? <div className="rounded-lg border border-gray-300 bg-white p-6 text-sm text-gray-500">Loading campaign templates...</div> : null}
      {campaigns.data?.data.length === 0 ? <div className="rounded-lg border border-gray-300 bg-white p-6 text-center text-sm text-gray-500">No campaign templates yet.</div> : null}
      <div className="space-y-4">
        {campaigns.data?.data.map((campaign) => (
          <CampaignTemplateCard
            key={campaign.id}
            campaign={campaign}
            runs={runsByCampaign.get(campaign.id) ?? []}
            runsLoading={runQueries[(campaigns.data?.data ?? []).findIndex((item) => item.id === campaign.id)]?.isLoading ?? false}
            deleting={remove.isPending}
            onDelete={() => remove.mutate(campaign.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CampaignTemplateCard({ campaign, runs, runsLoading, deleting, onDelete }: { campaign: Campaign; runs: CampaignRun[]; runsLoading: boolean; deleting: boolean; onDelete: () => void }) {
  const channels = [...new Set(campaign.steps.map((step) => step.channel))];
  const stats = countByStatus(runs);
  const latestRuns = runs.slice(0, 3);
  return (
    <section className="overflow-hidden rounded-lg border border-gray-300 bg-white">
      <div className="grid gap-4 border-b border-gray-200 p-4 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/campaigns/${campaign.id}`} className="text-lg font-semibold text-gray-900 underline underline-offset-2">{campaign.name}</Link>
            <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">Template</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{campaign.description || 'No description added.'}</p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Steps" value={String(campaign.steps.length)} />
            <Metric label="Channels" value={channels.join(', ') || '-'} />
            <Metric label="Default window" value={`${campaign.scheduleWindow.startHour}:00-${campaign.scheduleWindow.endHour}:00`} />
            <Metric label="Created" value={new Date(campaign.createdAt).toLocaleDateString()} />
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <Link to={`/campaigns/${campaign.id}`} className="btn-secondary whitespace-nowrap">Open Template</Link>
          <Link to={`/campaigns/${campaign.id}/edit`} className="btn-secondary whitespace-nowrap">Edit</Link>
          <Link to={`/campaigns/${campaign.id}/runs/new`} className="btn-primary whitespace-nowrap">Start Run</Link>
          <button className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" disabled={deleting} onClick={onDelete}>Delete</button>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div>
          <h3 className="text-sm font-semibold">Template sequence</h3>
          <div className="mt-2 space-y-2">
            {campaign.steps.map((step) => (
              <div key={step.id ?? step.position} className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Step {step.position}: {step.channel}</span>
                  <span className="text-xs text-gray-500">Wait {step.delayMinutes} min</span>
                </div>
                {step.subject ? <div className="mt-1 text-xs text-gray-500">Subject: {step.subject}</div> : null}
                <div className="mt-2 line-clamp-2 text-xs text-gray-600">{step.template}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Runs under this template</h3>
              <p className="text-xs text-gray-500">Each run is a launched campaign with its own audience and schedule.</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(stats).map(([status, count]) => <StatusPill key={status} status={status} count={count} />)}
              {runs.length === 0 && !runsLoading ? <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">No runs</span> : null}
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
            {runsLoading ? <div className="p-4 text-sm text-gray-500">Loading runs...</div> : null}
            {!runsLoading && latestRuns.length === 0 ? <div className="p-4 text-sm text-gray-500">No runs launched yet. Click Start Run to select leads and send.</div> : null}
            {latestRuns.map((run) => (
              <div key={run.id} className="grid gap-3 border-b border-gray-100 p-3 text-sm last:border-0 md:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{run.title}</span>
                    <Status value={run.status} />
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{run.eligibleLeads} eligible, {run.excludedLeads} excluded · {run.selectedChannels.join(', ')} · {run.scheduledAt ? new Date(run.scheduledAt).toLocaleString() : 'Immediately'}</div>
                  <RunStats stats={run.stats} />
                </div>
                <Link to={`/campaigns/${campaign.id}`} className="btn-secondary h-fit whitespace-nowrap px-3 py-2 text-xs">View Details</Link>
              </div>
            ))}
            {runs.length > latestRuns.length ? <div className="bg-gray-50 p-3 text-xs text-gray-500">Showing latest {latestRuns.length} of {runs.length} runs. Open the template to see all runs.</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-gray-50 p-3"><div className="text-xs text-gray-500">{label}</div><div className="mt-1 font-medium text-gray-900">{value}</div></div>;
}

function Status({ value }: { value: CampaignRun['status'] }) {
  const color = value === 'RUNNING' ? 'bg-green-100 text-green-800' : value === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' : value === 'PAUSED' ? 'bg-amber-100 text-amber-800' : value === 'CANCELLED' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700';
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${color}`}>{value}</span>;
}

function StatusPill({ status, count }: { status: string; count: number }) {
  return <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{status}: {count}</span>;
}

function RunStats({ stats }: { stats?: Record<string, number> }) {
  const entries = Object.entries(stats ?? {});
  if (entries.length === 0) return <div className="mt-2 text-xs text-gray-500">No enrollment activity yet</div>;
  return <div className="mt-2 flex flex-wrap gap-1">{entries.map(([status, count]) => <span key={status} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{status}: {count}</span>)}</div>;
}

function countByStatus(runs: CampaignRun[]) {
  return runs.reduce<Record<string, number>>((acc, run) => {
    acc[run.status] = (acc[run.status] ?? 0) + 1;
    return acc;
  }, {});
}
