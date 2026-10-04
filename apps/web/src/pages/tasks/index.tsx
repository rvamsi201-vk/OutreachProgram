import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api-client.js';

interface Task {
  id: string;
  title: string;
  description: string | null;
  leadId: string | null;
  opportunityId: string | null;
  dueAt: string | null;
  status: string;
  priority: string;
}

export function TasksPage() {
  const queryClient = useQueryClient();
  const tasks = useQuery({ queryKey: ['my-tasks'], queryFn: () => api.get<{ data: Task[] }>('/tasks?mine=true') });
  const complete = useMutation({
    mutationFn: (id: string) => api.patch(`/tasks/${id}`, { status: 'COMPLETED' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['my-tasks'] }),
  });
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">My Tasks</h1>
        <p className="mt-1 text-sm text-gray-500">Follow up qualified leads and move opportunities forward.</p>
      </div>
      <div className="divide-y divide-gray-800 rounded-lg border border-gray-800">
        {tasks.data?.data.map((task) => (
          <div key={task.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <div className="font-medium">{task.title}</div>
              <div className="text-sm text-gray-500">{task.priority} · {task.dueAt ? new Date(task.dueAt).toLocaleString() : 'No due date'}</div>
              {task.leadId ? <Link className="text-sm text-brand-400" to={`/leads/${task.leadId}`}>Open lead</Link> : null}
            </div>
            <button className="btn-secondary" disabled={task.status === 'COMPLETED'} onClick={() => complete.mutate(task.id)}>
              {task.status === 'COMPLETED' ? 'Completed' : 'Complete'}
            </button>
          </div>
        ))}
        {tasks.data?.data.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">No tasks assigned.</div> : null}
      </div>
    </div>
  );
}
