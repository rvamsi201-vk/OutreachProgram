import { useMutation, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api-client.js';
import type { Campaign, CampaignStep } from './types.js';

const wizardSteps = ['Basics', 'Channels', 'Sequence', 'Review'];
const channels = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
const tokenHelp = 'Use the field picker to insert lead/contact database fields.';
const templateFields = [
  { label: 'lead.name', token: '{{lead.name}}' },
  { label: 'lead.company', token: '{{lead.company}}' },
  { label: 'lead.pitch', token: '{{lead.pitch}}' },
  { label: 'lead.info', token: '{{lead.info}}' },
  { label: 'lead.comments', token: '{{lead.comments}}' },
  { label: 'lead.status', token: '{{lead.status}}' },
  { label: 'lead.source', token: '{{lead.source}}' },
  { label: 'lead.location', token: '{{lead.location}}' },
  { label: 'lead.business_size', token: '{{lead.business_size}}' },
  { label: 'lead.website', token: '{{lead.website}}' },
  { label: 'lead.ratings', token: '{{lead.ratings}}' },
  { label: 'lead.score', token: '{{lead.score}}' },
  { label: 'lead.priority', token: '{{lead.priority}}' },
  { label: 'lead.timezone', token: '{{lead.timezone}}' },
  { label: 'contact.channel', token: '{{contact.channel}}' },
  { label: 'contact.value', token: '{{contact.value}}' },
  { label: 'contact.normalized_value', token: '{{contact.normalized_value}}' },
  { label: 'unsubscribe_url', token: '{{unsubscribe_url}}' },
];

interface AiAgentOption {
  id: string;
  name: string;
  role: string;
}

function makeStep(channel: CampaignStep['channel'], position: number, aiPersonalize = false): CampaignStep {
  return {
    position,
    channel,
    delayMinutes: position === 1 ? 0 : 1440,
    subject: channel === 'EMAIL' ? 'Hello {{lead.name}}' : null,
    template: channel === 'EMAIL'
      ? 'Hi {{lead.name}},\n\nI wanted to reach out about {{lead.company}}.\n\nUnsubscribe: {{unsubscribe_url}}'
      : 'Hi {{lead.name}}, I wanted to reach out about {{lead.company}}.',
    configuration: aiPersonalize ? {
      aiPersonalize: true,
      aiObjective: `Use this agent to start a helpful ${channel === 'EMAIL' ? 'email' : 'WhatsApp'} conversation, summarize the lead business, make the sales pitch, and ask one simple question to begin.`,
    } : {},
    retryPolicy: { attempts: 3, backoffMs: 60000 },
    conditions: [],
  };
}

export function NewCampaignPage() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(editId);
  const presetAgentId = searchParams.get('agentId') ?? '';
  const whatsappAiMode = searchParams.get('mode') === 'whatsapp-ai';
  const emailAiMode = searchParams.get('mode') === 'email-ai';
  const aiModeChannel = whatsappAiMode ? 'WHATSAPP' : emailAiMode ? 'EMAIL' : null;
  const [current, setCurrent] = useState(0);
  const [name, setName] = useState(aiModeChannel ? `AI ${aiModeChannel === 'EMAIL' ? 'Email' : 'WhatsApp'} Outreach - ${new Date().toLocaleDateString()}` : '');
  const [description, setDescription] = useState(aiModeChannel ? `Bulk ${aiModeChannel === 'EMAIL' ? 'email' : 'WhatsApp'} outreach where the selected AI agent writes the opener and handles replies.` : '');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [aiAgentId, setAiAgentId] = useState(presetAgentId);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(20);
  const [steps, setSteps] = useState<CampaignStep[]>([aiModeChannel ? makeStep(aiModeChannel, 1, true) : makeStep('EMAIL', 1)]);
  const [selectedFields, setSelectedFields] = useState<Record<number, string>>(Object.fromEntries(templateFields.map((field, index) => [index, field.token])));
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  const existingCampaign = useQuery({
    queryKey: ['campaign', editId],
    queryFn: () => api.get<Campaign>(`/campaigns/${editId}`),
    enabled: Boolean(editId),
  });
  const createCampaign = useMutation({
    mutationFn: () => api.post<Campaign>('/campaigns', {
      name,
      description: description || null,
      audience: { tags: [], leadIds: [], savedFilters: {} },
      scheduleWindow: { startHour, endHour },
      timezone,
      aiAgentId: aiAgentId || null,
      steps: steps.map((step, index) => ({ ...step, position: index + 1 })),
    }),
    onSuccess: (campaign) => navigate(`/campaigns/${campaign.id}`),
  });
  const updateCampaign = useMutation({
    mutationFn: () => api.patch<Campaign>(`/campaigns/${editId}`, {
      name,
      description: description || null,
      audience: existingCampaign.data?.audience ?? { tags: [], leadIds: [], savedFilters: {} },
      scheduleWindow: { startHour, endHour },
      timezone,
      aiAgentId: aiAgentId || null,
      qualificationProfileId: existingCampaign.data?.qualificationProfileId ?? null,
      steps: steps.map((step, index) => ({ ...step, position: index + 1 })),
    }),
    onSuccess: (campaign) => navigate(`/campaigns/${campaign.id}`),
  });
  const agents = useQuery({
    queryKey: ['campaign-ai-agents', aiModeChannel ?? (isEditing ? 'ALL' : 'WHATSAPP')],
    queryFn: () => api.get<{ data: AiAgentOption[] }>(isEditing && !aiModeChannel ? '/agents' : `/agents?channel=${aiModeChannel ?? 'WHATSAPP'}`),
  });

  const activeChannels = new Set(steps.map((step) => step.channel));

  useEffect(() => {
    if (!existingCampaign.data) return;
    setName(existingCampaign.data.name);
    setDescription(existingCampaign.data.description ?? '');
    setTimezone(existingCampaign.data.timezone);
    setStartHour(existingCampaign.data.scheduleWindow.startHour);
    setEndHour(existingCampaign.data.scheduleWindow.endHour);
    setAiAgentId(existingCampaign.data.aiAgentId ?? '');
    setSteps(existingCampaign.data.steps.map((step, index) => ({ ...step, position: index + 1 })));
  }, [existingCampaign.data]);
  const toggleChannel = (channel: CampaignStep['channel']) => {
    if (activeChannels.has(channel)) {
      if (activeChannels.size === 1) return;
      setSteps((items) => items.filter((item) => item.channel !== channel).map((item, index) => ({ ...item, position: index + 1 })));
    } else {
      setSteps((items) => [...items, makeStep(channel, items.length + 1)]);
    }
  };

  const updateStep = (index: number, patch: Partial<CampaignStep>) => {
    setSteps((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const updateStepConfiguration = (index: number, patch: Record<string, unknown>) => {
    setSteps((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, configuration: { ...item.configuration, ...patch } } : item));
  };

  const removeStep = (index: number) => {
    if (steps.length === 1) return;
    setSteps((items) => items.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, position: itemIndex + 1 })));
  };

  const insertToken = (index: number, target: 'subject' | 'template') => {
    const token = selectedFields[index] ?? templateFields[0]!.token;
    const key = `${index}-${target}`;
    const element = inputRefs.current[key];
    const currentValue = target === 'subject' ? steps[index]?.subject ?? '' : steps[index]?.template ?? '';
    const start = element?.selectionStart ?? currentValue.length;
    const end = element?.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;
    updateStep(index, target === 'subject' ? { subject: nextValue } : { template: nextValue });
    requestAnimationFrame(() => {
      const nextElement = inputRefs.current[key];
      nextElement?.focus();
      nextElement?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{isEditing ? 'Edit Campaign Template' : 'New Campaign Template'}</h1>
        <p className="mt-1 text-sm text-gray-500">{isEditing ? 'Edit the reusable fallback messages, AI objective, channels, and agent.' : 'Build the reusable message sequence first. Assign leads when you start a run.'}</p>
      </div>
      {existingCampaign.isLoading ? <div className="rounded-lg border border-gray-300 bg-white p-4 text-sm text-gray-500">Loading template...</div> : null}

      {aiModeChannel && (
        <section className="rounded-lg border border-brand-600 bg-brand-50 p-4 text-sm text-gray-700">
          <div className="font-semibold text-gray-900">AI {aiModeChannel === 'EMAIL' ? 'email' : 'WhatsApp'} campaign flow</div>
          <div className="mt-1">The selected agent writes the first {aiModeChannel === 'EMAIL' ? 'email' : 'WhatsApp'} opener for each lead, sends it through the connected account, and replies are routed back to the same agent before appearing in Inbox.</div>
        </section>
      )}

      <ol className="flex items-center" aria-label="Campaign setup progress">
        {wizardSteps.map((item, index) => (
          <li key={item} className={`flex min-w-0 flex-1 items-center ${index < wizardSteps.length - 1 ? 'after:mx-3 after:h-px after:flex-1 after:bg-gray-300' : ''}`}>
            <button className="flex items-center gap-2 text-left" onClick={() => setCurrent(index)}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${index <= current ? 'border-brand-600 bg-brand-600 text-black' : 'border-gray-300 bg-white text-gray-500'}`}>{index + 1}</span>
              <span className={`hidden text-sm sm:block ${index === current ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{item}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="rounded-lg border border-gray-800 p-5">
        {current === 0 && (
          <div className="grid gap-4">
            <label className="text-sm"><span className="mb-1 block font-medium">Template name</span><input className="input-field" placeholder="Example: October product follow-up" value={name} onChange={(event) => setName(event.target.value)} /><FieldHint>Internal name for this reusable sequence. Leads will not see it.</FieldHint></label>
            <label className="text-sm"><span className="mb-1 block font-medium">Description</span><textarea className="input-field min-h-24" placeholder="Example: Follow up with imported restaurant leads after the first demo offer." value={description} onChange={(event) => setDescription(event.target.value)} /><FieldHint>Short note explaining when this template should be used.</FieldHint></label>
            <label className="text-sm"><span className="mb-1 block font-medium">Client reply AI agent</span><select className="input-field" value={aiAgentId} onChange={(event) => setAiAgentId(event.target.value)}><option value="">No auto-reply agent</option>{(agents.data?.data ?? []).map((agent) => <option key={agent.id} value={agent.id}>{agent.name} - {agent.role}</option>)}</select><FieldHint>Optional. When a lead replies on the selected channel during an active run, this agent writes and sends the next response.</FieldHint></label>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm"><span className="mb-1 block font-medium">Default timezone</span><input className="input-field" placeholder="Example: Asia/Kolkata" value={timezone} onChange={(event) => setTimezone(event.target.value)} /><FieldHint>Used to decide local sending hours unless a run overrides it.</FieldHint></label>
              <label className="text-sm"><span className="mb-1 block font-medium">Send from</span><input className="input-field" type="number" min={0} max={23} placeholder="9" value={startHour} onChange={(event) => setStartHour(Number(event.target.value))} /><FieldHint>First allowed hour in 24-hour time. 9 means 9:00 AM.</FieldHint></label>
              <label className="text-sm"><span className="mb-1 block font-medium">Send until</span><input className="input-field" type="number" min={1} max={24} placeholder="20" value={endHour} onChange={(event) => setEndHour(Number(event.target.value))} /><FieldHint>Messages stop before this hour. 20 means before 8:00 PM.</FieldHint></label>
            </div>
          </div>
        )}

        {current === 1 && (
          <div>
            <h2 className="font-semibold">Channels in this template</h2>
            <p className="mt-1 text-sm text-gray-500">Select one or more. A run can use any subset later.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {channels.map((channel) => {
                const active = activeChannels.has(channel);
                return <label key={channel} className={`cursor-pointer rounded-lg border p-4 ${active ? 'border-brand-600 bg-brand-50' : 'border-gray-300 bg-white'}`}>
                  <div className="flex items-center justify-between"><span className="font-semibold">{channel}</span><input type="checkbox" checked={active} onChange={() => toggleChannel(channel)} /></div>
                  <p className="mt-2 text-xs text-gray-500">{channel === 'EMAIL' ? 'Email needs a subject and message body.' : channel === 'SMS' ? 'Short text message follow-ups.' : 'WhatsApp messages sent through the default WhatsApp account.'}</p>
                </label>;
              })}
            </div>
          </div>
        )}

        {current === 2 && (
          <div className="space-y-4">
            {steps.map((step, index) => (
              <article key={`${step.channel}-${index}`} className="rounded-lg border border-gray-300 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div><span className="text-xs font-semibold uppercase text-gray-500">Step {index + 1}</span><div className="font-semibold">{step.channel}</div></div>
                  <button className="btn-secondary" disabled={steps.length === 1} onClick={() => removeStep(index)}>Remove</button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
                  <label className="text-sm"><span className="mb-1 block">Wait after previous step</span><input className="input-field" type="number" min={0} placeholder={index === 0 ? '0' : '1440'} value={step.delayMinutes} onChange={(event) => updateStep(index, { delayMinutes: Number(event.target.value) })} /><FieldHint>Minutes to wait. Use 0 for immediate, 60 for one hour, 1440 for next day.</FieldHint></label>
                  {step.channel === 'EMAIL' && <label className="text-sm"><span className="mb-1 block">Subject</span><input ref={(element) => { inputRefs.current[`${index}-subject`] = element; }} className="input-field" placeholder="Example: Quick question for {{lead.company}}" value={step.subject ?? ''} onChange={(event) => updateStep(index, { subject: event.target.value })} /><FieldHint>Only used for email steps. Tokens are replaced per lead.</FieldHint></label>}
                </div>
                <label className="mt-4 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                  <input
                    className="mt-1 h-4 w-4"
                    type="checkbox"
                    checked={step.configuration?.aiPersonalize === true}
                    onChange={(event) => updateStepConfiguration(index, { aiPersonalize: event.target.checked })}
                  />
                  <span>
                    <span className="block font-medium">AI personalize this message</span>
                    <span className="mt-1 block text-xs leading-5 text-gray-500">When this step sends, the LLM writes a fresh opener from the lead&apos;s business summary, pitch, website, comments, and company. The message below is used as the fallback if AI is not configured.</span>
                  </span>
                </label>
                {step.configuration?.aiPersonalize === true && (
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block">AI objective</span>
                    <input
                      className="input-field"
                      placeholder="Example: Start a friendly conversation about improving their textile wholesale outreach."
                      value={typeof step.configuration.aiObjective === 'string' ? step.configuration.aiObjective : ''}
                      onChange={(event) => updateStepConfiguration(index, { aiObjective: event.target.value })}
                    />
                    <FieldHint>Optional instruction for the AI. Lead pitch and info are still used automatically.</FieldHint>
                  </label>
                )}
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <select className="input-field" value={selectedFields[index] ?? templateFields[0]!.token} onChange={(event) => setSelectedFields((items) => ({ ...items, [index]: event.target.value }))}>
                      {templateFields.map((field) => <option key={field.token} value={field.token}>{field.label}</option>)}
                    </select>
                    {step.channel === 'EMAIL' && <button className="btn-secondary" type="button" onClick={() => insertToken(index, 'subject')}>Insert in subject</button>}
                    <button className="btn-secondary" type="button" onClick={() => insertToken(index, 'template')}>Insert in message</button>
                  </div>
                  <FieldHint>Select a database field and insert it where your cursor is placed.</FieldHint>
                </div>
                <label className="mt-3 block text-sm"><span className="mb-1 block">Message</span><textarea ref={(element) => { inputRefs.current[`${index}-template`] = element; }} className="input-field min-h-36" placeholder={`Example: Hi {{lead.name}},\n\nI wanted to reach out about {{lead.company}}.\n\nUnsubscribe: {{unsubscribe_url}}`} value={step.template} onChange={(event) => updateStep(index, { template: event.target.value })} /><FieldHint>{tokenHelp}</FieldHint></label>
              </article>
            ))}
            <div className="flex flex-wrap gap-2">
              {channels.filter((channel) => activeChannels.has(channel)).map((channel) => <button key={channel} className="btn-secondary" onClick={() => setSteps((items) => [...items, makeStep(channel, items.length + 1)])}>Add {channel} step</button>)}
            </div>
          </div>
        )}

        {current === 3 && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div><div className="text-xs uppercase text-gray-500">Template</div><div className="mt-1 font-semibold">{name || 'Untitled'}</div></div>
              <div><div className="text-xs uppercase text-gray-500">Channels</div><div className="mt-1 font-semibold">{[...activeChannels].join(', ')}</div></div>
              <div><div className="text-xs uppercase text-gray-500">Sequence</div><div className="mt-1 font-semibold">{steps.length} steps</div></div>
              <div><div className="text-xs uppercase text-gray-500">Reply agent</div><div className="mt-1 font-semibold">{(agents.data?.data ?? []).find((agent) => agent.id === aiAgentId)?.name ?? 'None'}</div></div>
            </div>
            <div className="rounded-lg bg-gray-100 p-4 text-sm text-gray-600">No leads will be contacted when this template is created. You will choose an audience, schedule, and channel subset from its campaign page.</div>
            <button className="btn-primary" disabled={!name.trim() || steps.some((step) => !step.template.trim()) || createCampaign.isPending || updateCampaign.isPending} onClick={() => isEditing ? updateCampaign.mutate() : createCampaign.mutate()}>{isEditing ? updateCampaign.isPending ? 'Saving...' : 'Save Template' : createCampaign.isPending ? 'Creating...' : 'Create Template'}</button>
            {createCampaign.isError && <p className="text-sm text-red-600">{createCampaign.error instanceof Error ? createCampaign.error.message : 'Could not create template.'}</p>}
            {updateCampaign.isError && <p className="text-sm text-red-600">{updateCampaign.error instanceof Error ? updateCampaign.error.message : 'Could not save template.'}</p>}
          </div>
        )}
      </section>

      <div className="flex justify-between">
        <button className="btn-secondary" disabled={current === 0} onClick={() => setCurrent((value) => value - 1)}>Back</button>
        <button className="btn-primary" disabled={current === wizardSteps.length - 1 || (current === 0 && !name.trim())} onClick={() => setCurrent((value) => value + 1)}>Next</button>
      </div>
    </div>
  );
}

function FieldHint({ children }: { children: ReactNode }) {
  return <span className="mt-1 block text-xs leading-5 text-gray-500">{children}</span>;
}
