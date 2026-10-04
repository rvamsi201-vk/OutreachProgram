import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';

interface VoiceAgent {
  id: string;
  name: string;
  role: string;
  tone: string;
  objective: string;
  languages: string[];
  mustCollectFields: string[];
  escalationRules: string[];
  isActive: boolean;
}

interface Template {
  id: string;
  category: 'Collections' | 'Reminder' | 'Recovery' | 'Lead qualification';
  name: string;
  description: string;
  role: string;
  tone: string;
  objective: string;
  mustCollectFields: string[];
  escalationRules: string[];
  forbiddenClaims: string[];
}

const TEMPLATES: Template[] = [
  {
    id: 'sales-discovery',
    category: 'Lead qualification',
    name: 'Sales discovery',
    description: 'Qualify warm leads, collect buying intent, and identify next best action.',
    role: 'Voice sales discovery agent',
    tone: 'Warm, concise, consultative',
    objective: 'Call warm leads, understand their requirement, qualify interest, and route qualified leads to a human salesperson.',
    mustCollectFields: ['need', 'budget', 'timeline', 'location', 'decision_maker', 'interest'],
    escalationRules: ['Escalate when the lead asks for pricing approval, legal terms, or a human callback'],
    forbiddenClaims: ['guaranteed discount', 'lowest price guaranteed', 'legal or financial advice'],
  },
  {
    id: 'appointment-management',
    category: 'Reminder',
    name: 'Appointment management',
    description: 'Book, reschedule, confirm, and remind customers about appointments.',
    role: 'Appointment scheduling voice agent',
    tone: 'Helpful, efficient, polite',
    objective: 'Confirm appointment intent, collect preferred time slots, and hand off scheduling changes for confirmation.',
    mustCollectFields: ['preferred_time', 'timezone', 'purpose', 'contact_number'],
    escalationRules: ['Escalate if customer requests cancellation refund, urgent escalation, or unavailable slots'],
    forbiddenClaims: ['confirmed booking without system confirmation', 'refund promises'],
  },
  {
    id: 'emi-collection',
    category: 'Collections',
    name: 'EMI collection',
    description: 'Call customers with payment reminders and capture payment intent safely.',
    role: 'Collections reminder voice agent',
    tone: 'Respectful, calm, compliant',
    objective: 'Remind customers about pending payment, capture reason for delay, and identify promise-to-pay date.',
    mustCollectFields: ['payment_status', 'reason_for_delay', 'promise_to_pay_date', 'preferred_payment_channel'],
    escalationRules: ['Escalate disputes, hardship requests, harassment complaints, or legal questions'],
    forbiddenClaims: ['threats', 'false legal consequences', 'guaranteed waiver', 'asking for full card details'],
  },
  {
    id: 'lost-lead-recovery',
    category: 'Recovery',
    name: 'Lost lead recovery',
    description: 'Reconnect with dormant leads and find out if they are ready to re-engage.',
    role: 'Lead recovery voice agent',
    tone: 'Friendly, low-pressure, brief',
    objective: 'Reopen dormant conversations, understand why the lead dropped, and capture renewed interest.',
    mustCollectFields: ['current_interest', 'reason_lost', 'new_timeline', 'preferred_followup'],
    escalationRules: ['Escalate if lead is upset, asks for deletion, or wants a human manager'],
    forbiddenClaims: ['fake limited-time offers', 'pressure tactics'],
  },
];

const CATEGORY_FILTERS = ['All', 'Collections', 'Reminder', 'Recovery', 'Lead qualification'] as const;
const DEFAULT_TEMPLATE = TEMPLATES[0]!;

export function VoiceAgentsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof CATEGORY_FILTERS)[number]>('All');
  const [prompt, setPrompt] = useState('Create a voice agent to call leads and qualify them for sales');
  const [selected, setSelected] = useState<Template>(DEFAULT_TEMPLATE);
  const [form, setForm] = useState(templateToForm(DEFAULT_TEMPLATE));

  const agents = useQuery({
    queryKey: ['voice-agents'],
    queryFn: () => api.get<{ data: VoiceAgent[] }>('/agents?channel=VOICE'),
  });

  const visibleTemplates = useMemo(
    () => TEMPLATES.filter((template) => filter === 'All' || template.category === filter),
    [filter],
  );

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
      supportedChannels: ['VOICE'],
      isActive: true,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['voice-agents'] });
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const applyTemplate = (template: Template) => {
    setSelected(template);
    setForm(templateToForm(template));
  };

  const applyPrompt = () => {
    const lower = prompt.toLowerCase();
    const match = TEMPLATES.find((template) =>
      lower.includes(template.name.toLowerCase())
      || lower.includes(template.category.toLowerCase())
      || template.mustCollectFields.some((field) => lower.includes(field.replaceAll('_', ' '))),
    );
    applyTemplate(match ?? DEFAULT_TEMPLATE);
  };

  return (
    <div className="space-y-8 p-8 text-[#171717]">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Voice Agents</h1>
          <p className="mt-1 text-sm text-[#6f6b63]">Build call agent blueprints now. Connect calling providers later.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary">Drafts</button>
          <button className="btn-primary">New Agent</button>
        </div>
      </header>

      <section className="mx-auto flex max-w-5xl flex-col items-center rounded-2xl border border-[#e1ded6] bg-white px-8 py-12 text-center shadow-sm">
        <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-3xl bg-[#f1efe8] text-4xl font-semibold text-[#171717] shadow-inner">
          VA
        </div>
        <h2 className="text-4xl font-semibold tracking-tight text-[#171717]">What should your voice agent do?</h2>
        <div className="mt-8 flex w-full max-w-3xl items-center gap-3 rounded-full border border-[#dedbd3] bg-white p-2 shadow-[0_14px_40px_rgba(23,23,23,0.08)]">
          <input
            className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm text-[#171717] outline-none placeholder:text-[#9b9891]"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <button className="btn-primary rounded-full px-4" onClick={applyPrompt}>
            Use
          </button>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {CATEGORY_FILTERS.map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${filter === item ? 'bg-[#171717] text-white' : 'bg-[#f1efe8] text-[#45413a] hover:bg-[#e8e4da]'}`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visibleTemplates.map((template, index) => (
            <button
              key={template.id}
              className={`rounded-xl border p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#171717] ${selected.id === template.id ? 'border-[#171717] bg-white' : 'border-[#e1ded6] bg-white'}`}
              onClick={() => applyTemplate(template)}
            >
              <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl text-sm font-semibold text-[#171717] ${accent(index)}`}>
                {template.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}
              </div>
              <h2 className="text-lg font-semibold text-[#171717]">{template.name}</h2>
              <p className="mt-3 text-sm leading-6 text-[#6f6b63]">{template.description}</p>
              <div className="mt-5 inline-flex rounded-full bg-[#f1efe8] px-3 py-1 text-xs font-medium text-[#5b564e]">{template.category}</div>
            </button>
          ))}
        </div>

        <form
          className="space-y-4 rounded-xl border border-[#e1ded6] bg-white p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <h2 className="font-semibold text-[#171717]">Configure agent</h2>
            <p className="mt-1 text-xs text-[#6f6b63]">This saves the agent blueprint. Live calling and Sarvam connection come later.</p>
          </div>

          <input className="input-field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Agent name" />
          <input className="input-field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="Role" />
          <input className="input-field" value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })} placeholder="Tone" />
          <input className="input-field" value={form.languages} onChange={(event) => setForm({ ...form, languages: event.target.value })} placeholder="Languages" />
          <textarea className="input-field min-h-24" value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Objective" />
          <textarea className="input-field min-h-20" value={form.mustCollectFields} onChange={(event) => setForm({ ...form, mustCollectFields: event.target.value })} placeholder="Must collect fields" />
          <textarea className="input-field min-h-20" value={form.escalationRules} onChange={(event) => setForm({ ...form, escalationRules: event.target.value })} placeholder="Escalation rules" />
          <textarea className="input-field min-h-20" value={form.forbiddenClaims} onChange={(event) => setForm({ ...form, forbiddenClaims: event.target.value })} placeholder="Forbidden claims" />

          {create.error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {create.error instanceof Error ? create.error.message : 'Could not save voice agent'}
            </div>
          )}

          <button className="btn-primary w-full" disabled={create.isPending}>
            {create.isPending ? 'Saving...' : 'Save Voice Agent'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-[#e1ded6] bg-white shadow-sm">
        <div className="border-b border-[#e1ded6] px-4 py-3">
          <h2 className="font-semibold text-[#171717]">Saved voice agents</h2>
        </div>
        <div className="divide-y divide-[#e1ded6]">
          {agents.data?.data.map((agent) => (
            <div key={agent.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
              <div>
                <div className="font-medium text-[#171717]">{agent.name}</div>
                <div className="mt-1 text-sm text-[#6f6b63]">{agent.role} | {agent.tone}</div>
                <div className="mt-2 text-sm text-[#45413a]">{agent.objective}</div>
              </div>
              <div className="text-right text-xs text-[#6f6b63]">
                <div>{agent.isActive ? 'Active' : 'Inactive'}</div>
                <div>{agent.languages.join(', ')}</div>
              </div>
            </div>
          ))}
          {agents.data?.data.length === 0 && (
            <div className="p-4 text-sm text-[#6f6b63]">No voice agents saved yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function templateToForm(template: Template) {
  return {
    name: template.name,
    role: template.role,
    tone: template.tone,
    languages: 'English,Hindi,Kannada',
    objective: template.objective,
    mustCollectFields: template.mustCollectFields.join(','),
    allowedClaims: 'general product information,availability,next steps',
    forbiddenClaims: template.forbiddenClaims.join(','),
    escalationRules: template.escalationRules.join('\n'),
  };
}

function split(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

function accent(index: number) {
  return ['bg-[#c8ff5f]', 'bg-[#d9c1ff]', 'bg-[#ffd767]', 'bg-[#f7b4cf]', 'bg-[#bdefff]'][index % 5];
}
