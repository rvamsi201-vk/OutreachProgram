import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api-client.js';

interface Agent {
  id: string;
  name: string;
  role: string;
  tone: string;
  objective: string;
  languages: string[];
  mustCollectFields: string[];
  allowedClaims: string[];
  forbiddenClaims: string[];
  escalationRules: string[];
  supportedChannels: string[];
  knowledgeBaseId: string | null;
  isActive: boolean;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
}

const agentChannels = ['WHATSAPP', 'EMAIL', 'SMS', 'VOICE'] as const;

export function AgentsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: 'Campaign WhatsApp Agent',
    role: 'Sales Assistant',
    tone: 'Professional, friendly, and concise',
    languages: 'English,Hindi,Kannada',
    objective: 'Start and continue campaign conversations, understand the customer requirement, and qualify whether they are interested.',
    mustCollectFields: 'need,budget,timeline,location,decision_maker',
    allowedClaims: 'We can explain services and collect requirements\nWe can arrange a human follow-up when needed',
    forbiddenClaims: 'guaranteed discount\nlowest price guaranteed\nmedical advice\nlegal advice\nfake delivery dates',
    escalationRules: 'Request human help when pricing, legal, medical, refund, or commitment questions are unclear.',
    knowledgeBaseId: '',
    supportedChannels: ['WHATSAPP'] as string[],
  });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<{ data: Agent[] }>('/agents') });
  const knowledgeBases = useQuery({ queryKey: ['knowledge-bases'], queryFn: () => api.get<{ data: KnowledgeBase[] }>('/knowledge-bases') });
  const create = useMutation({
    mutationFn: () => api.post('/agents', {
      name: form.name,
      role: form.role,
      tone: form.tone,
      languages: split(form.languages),
      objective: form.objective,
      mustCollectFields: split(form.mustCollectFields),
      allowedClaims: split(form.allowedClaims),
      forbiddenClaims: split(form.forbiddenClaims),
      escalationRules: split(form.escalationRules),
      supportedChannels: form.supportedChannels,
      knowledgeBaseId: form.knowledgeBaseId || null,
      isActive: true,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Agents</h1>
        <p className="mt-1 text-sm text-gray-500">Configure campaign conversation behavior, knowledge, and restrictions without writing a raw system prompt.</p>
      </div>

      <section className="grid gap-4 rounded-lg border border-gray-800 p-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Agent name</span>
          <input className="input-field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Example: WhatsApp Sales Agent" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Role</span>
          <input className="input-field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="Example: Sales Assistant" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Tone</span>
          <input className="input-field" value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })} placeholder="Example: Professional and friendly" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Languages</span>
          <input className="input-field" value={form.languages} onChange={(event) => setForm({ ...form, languages: event.target.value })} placeholder="English,Hindi,Kannada" />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-2 block font-medium">Agent channels</span>
          <div className="grid gap-2 sm:grid-cols-4">
            {agentChannels.map((channel) => (
              <label key={channel} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${form.supportedChannels.includes(channel) ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>
                <input
                  type="checkbox"
                  checked={form.supportedChannels.includes(channel)}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    supportedChannels: event.target.checked
                      ? [...current.supportedChannels, channel]
                      : current.supportedChannels.filter((item) => item !== channel),
                  }))}
                />
                {channel}
              </label>
            ))}
          </div>
          <span className="mt-1 block text-xs text-gray-500">Choose where this agent can operate. Campaign creation filters agents by channel.</span>
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Knowledge base</span>
          <select className="input-field" value={form.knowledgeBaseId} onChange={(event) => setForm({ ...form, knowledgeBaseId: event.target.value })}>
            <option value="">No knowledge base</option>
            {(knowledgeBases.data?.data ?? []).map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
          </select>
          <span className="mt-1 block text-xs text-gray-500">The agent reads the selected Knowledge base Description when writing campaign messages and replies.</span>
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Campaign objective</span>
          <textarea className="input-field min-h-24" value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Objective" />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Must collect fields</span>
          <input className="input-field" value={form.mustCollectFields} onChange={(event) => setForm({ ...form, mustCollectFields: event.target.value })} placeholder="need,budget,timeline,location,decision_maker" />
          <span className="mt-1 block text-xs text-gray-500">Comma-separated facts the agent should collect naturally before qualification.</span>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Allowed claims</span>
          <textarea className="input-field min-h-28" value={form.allowedClaims} onChange={(event) => setForm({ ...form, allowedClaims: event.target.value })} placeholder="One claim per line or comma-separated" />
          <span className="mt-1 block text-xs text-gray-500">Claims the AI is allowed to make during campaign conversations.</span>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">AI restrictions</span>
          <textarea className="input-field min-h-28" value={form.forbiddenClaims} onChange={(event) => setForm({ ...form, forbiddenClaims: event.target.value })} placeholder="No guaranteed discounts, no medical advice, no fake delivery dates" />
          <span className="mt-1 block text-xs text-gray-500">Forbidden claims and risky topics. Replies are checked against these before sending.</span>
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Escalation rules</span>
          <textarea className="input-field min-h-24" value={form.escalationRules} onChange={(event) => setForm({ ...form, escalationRules: event.target.value })} placeholder="Escalation rules" />
        </label>
        <button className="btn-primary md:col-span-2" disabled={create.isPending || !form.name.trim() || form.supportedChannels.length === 0} onClick={() => create.mutate()}>{create.isPending ? 'Creating...' : 'Create Agent'}</button>
      </section>

      <section className="divide-y divide-gray-800 rounded-lg border border-gray-800">
        {agents.data?.data.map((agent) => (
          <div key={agent.id} className="p-4">
            <div className="font-medium">{agent.name}</div>
            <div className="text-sm text-gray-500">{agent.role} - {agent.tone} - {agent.isActive ? 'Active' : 'Inactive'}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
              {agent.supportedChannels.map((channel) => <span key={channel} className="rounded border border-gray-800 px-2 py-1">{channel}</span>)}
              <span className="rounded border border-gray-800 px-2 py-1">Restrictions: {agent.forbiddenClaims.length}</span>
              <span className="rounded border border-gray-800 px-2 py-1">Allowed claims: {agent.allowedClaims.length}</span>
              <span className="rounded border border-gray-800 px-2 py-1">Knowledge: {agent.knowledgeBaseId ? 'Attached' : 'None'}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {agent.supportedChannels.includes('WHATSAPP') ? (
                <Link className="btn-primary inline-flex" to={`/campaigns/new?agentId=${agent.id}&mode=whatsapp-ai`}>
                  Start WhatsApp Campaign
                </Link>
              ) : null}
              {agent.supportedChannels.includes('EMAIL') ? (
                <Link className="btn-secondary inline-flex" to={`/campaigns/new?agentId=${agent.id}&mode=email-ai`}>
                  Start Email Campaign
                </Link>
              ) : null}
              <button className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" disabled={remove.isPending} onClick={() => remove.mutate(agent.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {agents.data?.data.length === 0 ? <div className="p-4 text-sm text-gray-500">No agents yet.</div> : null}
      </section>
    </div>
  );
}

function split(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}
