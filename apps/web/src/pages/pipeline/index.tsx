import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api-client.js';

interface Pipeline { id: string; name: string; stages: Array<{ id: string; name: string; kind: string; position: number }> }
interface Opportunity { id: string; title: string; leadName: string; leadId: string; stageId: string; ownerId: string | null; status: string }

export function PipelinePage() {
  const queryClient = useQueryClient();
  const pipelines = useQuery({ queryKey: ['pipelines'], queryFn: () => api.get<{ data: Pipeline[] }>('/pipelines') });
  const pipelineId = pipelines.data?.data[0]?.id;
  const pipeline = useQuery({ queryKey: ['pipeline', pipelineId], queryFn: () => api.get<Pipeline>(`/pipelines/${pipelineId}`), enabled: Boolean(pipelineId) });
  const opportunities = useQuery({ queryKey: ['opportunities', pipelineId], queryFn: () => api.get<{ data: Opportunity[] }>(`/opportunities?pipelineId=${pipelineId}`), enabled: Boolean(pipelineId) });
  const move = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) => api.patch(`/opportunities/${id}`, { stageId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['opportunities', pipelineId] }),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="mt-1 text-sm text-gray-500">Kanban view of qualified opportunities and human follow-up.</p>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {pipeline.data?.stages.map((stage) => (
          <section key={stage.id} className="min-w-72 rounded-lg border border-gray-800 bg-gray-950">
            <div className="border-b border-gray-800 p-3 text-sm font-semibold text-gray-300">{stage.name}</div>
            <div className="space-y-3 p-3">
              {opportunities.data?.data.filter((opp) => opp.stageId === stage.id).map((opp) => (
                <div key={opp.id} className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <div className="font-medium">{opp.title}</div>
                  <Link to={`/leads/${opp.leadId}`} className="text-sm text-brand-400">{opp.leadName}</Link>
                  <select className="input-field mt-3" value={opp.stageId} onChange={(e) => move.mutate({ id: opp.id, stageId: e.target.value })}>
                    {pipeline.data?.stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
