import { useMutation, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SearchInput } from '../../components/search-input.js';
import { api } from '../../lib/api-client.js';
import type { Campaign, CampaignStep } from './types.js';

type AudienceMode = 'ALL' | 'BATCHES' | 'FILTERS' | 'SELECTED';
type Channel = CampaignStep['channel'];

interface ImportBatch { id: string; title: string; fileName: string; status: string; createdAt: string }
interface Lead { id: string; name: string; company: string | null; location: string | null; status: string }
interface PreviewLeadDetail {
  leadId: string;
  name: string;
  company: string | null;
  status: string;
  eligible: boolean;
  reachableChannels: string[];
  contacts?: Array<{ requestedChannel: string; contactChannel: string; value: string; normalizedValue: string; validationStatus: string }>;
  excludedReasons: string[];
}
interface Preview { total: number; eligible: number; excluded: number; reachable: Record<string, number>; exclusionSummary?: Record<string, number>; details?: PreviewLeadDetail[] }

const weekdays = [{ value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' }];

export function NewCampaignRunPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AudienceMode>('SELECTED');
  const [title, setTitle] = useState(`Run ${new Date().toLocaleDateString()}`);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [businessSize, setBusinessSize] = useState('');
  const [priority, setPriority] = useState('');
  const [tags, setTags] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(20);
  const [sendingDays, setSendingDays] = useState([1, 2, 3, 4, 5]);
  const [rateLimit, setRateLimit] = useState(100);

  const campaign = useQuery({ queryKey: ['campaign', id], queryFn: () => api.get<Campaign>(`/campaigns/${id}`), enabled: Boolean(id) });
  const batches = useQuery({ queryKey: ['lead-import-batches'], queryFn: () => api.get<{ data: ImportBatch[] }>('/leads/import-batches') });
  const leads = useQuery({ queryKey: ['run-leads', search], queryFn: () => api.get<{ data: Lead[] }>(`/leads?limit=100&offset=0${search ? `&search=${encodeURIComponent(search)}` : ''}`), enabled: mode === 'SELECTED' });
  const availableChannels = useMemo(() => [...new Set((campaign.data?.steps ?? []).map((step) => step.channel))], [campaign.data?.steps]);

  useEffect(() => {
    if (channels.length === 0 && availableChannels.length > 0) setChannels(availableChannels);
  }, [availableChannels, channels.length]);

  const payload = () => ({
    title,
    audience: {
      mode,
      importIds: mode === 'BATCHES' ? batchIds : [],
      leadIds: mode === 'SELECTED' ? leadIds : [],
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      filters: mode === 'FILTERS' ? { status: status || undefined, source: source || undefined, businessSize: businessSize || undefined, priority: priority || undefined, search: search || undefined } : {},
    },
    selectedChannels: channels,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    timezone,
    scheduleWindow: { startHour, endHour },
    sendingDays,
    rateLimitPerHour: rateLimit,
  });

  const preview = useMutation({ mutationFn: () => api.post<Preview>(`/campaigns/${id}/runs/preview`, payload()) });
  const create = useMutation({
    mutationFn: () => api.post(`/campaigns/${id}/runs`, payload()),
    onSuccess: () => navigate(`/campaigns/${id}`),
  });

  const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
  const canPreview = title.trim() && channels.length > 0 && sendingDays.length > 0 && (mode !== 'BATCHES' || batchIds.length > 0) && (mode !== 'SELECTED' || leadIds.length > 0);

  if (!campaign.data) return <div className="p-6 text-sm text-gray-500">Loading campaign...</div>;

  return (
    <div className="space-y-6 p-6">
      <div><Link to={`/campaigns/${id}`} className="text-sm text-gray-500">Back to campaign</Link><h1 className="mt-2 text-2xl font-semibold">Start Campaign Run</h1><p className="mt-1 text-sm text-gray-500">Assign leads and schedule a reusable run of {campaign.data.name}.</p></div>

      <section className="rounded-lg border border-gray-300 bg-white p-5">
        <label className="text-sm"><span className="mb-1 block font-medium">Run title</span><input className="input-field" placeholder="Example: Pune restaurant leads - first week of October" value={title} onChange={(event) => setTitle(event.target.value)} /><FieldHint>Name for this launch. Use it to tell runs apart in the campaign history.</FieldHint></label>
        <div className="mt-5"><div className="text-sm font-medium">Channels for this run</div><FieldHint>Pick which template channels to use now. Steps from unchecked channels are skipped for this run.</FieldHint><div className="mt-2 flex flex-wrap gap-2">{availableChannels.map((channel) => <label key={channel} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 ${channels.includes(channel) ? 'border-brand-600 bg-brand-50' : 'border-gray-300'}`}><input type="checkbox" checked={channels.includes(channel)} onChange={() => setChannels(toggle(channels, channel))} />{channel}</label>)}</div></div>
      </section>

      <section className="rounded-lg border border-gray-300 bg-white p-5">
        <h2 className="font-semibold">Choose audience</h2>
        <p className="mt-1 text-sm text-gray-500">This decides which leads enter the run. The preview checks contact details and consent before anything sends.</p>
        <div className="mt-3 flex flex-wrap gap-2">{(['BATCHES', 'SELECTED', 'FILTERS', 'ALL'] as AudienceMode[]).map((item) => <button key={item} className={mode === item ? 'btn-primary' : 'btn-secondary'} onClick={() => { setMode(item); preview.reset(); }}>{item === 'BATCHES' ? 'Import batches' : item === 'SELECTED' ? 'Select leads' : item === 'FILTERS' ? 'Use filters' : 'All leads'}</button>)}</div>

        {mode === 'BATCHES' && <><FieldHint>Select one or more CSV imports. Only leads from those imports are considered.</FieldHint><div className="mt-4 grid gap-2 md:grid-cols-2">{batches.data?.data.map((batch) => <label key={batch.id} className={`cursor-pointer rounded-lg border p-3 ${batchIds.includes(batch.id) ? 'border-brand-600 bg-brand-50' : 'border-gray-300'}`}><div className="flex gap-3"><input type="checkbox" checked={batchIds.includes(batch.id)} onChange={() => setBatchIds(toggle(batchIds, batch.id))} /><div><div className="font-medium">{batch.title}</div><div className="text-xs text-gray-500">{batch.fileName} - {new Date(batch.createdAt).toLocaleString()}</div></div></div></label>)}</div></>}

        {mode === 'SELECTED' && <div className="mt-4"><SearchInput placeholder="Name, company, phone, email, or location" value={search} onValueChange={setSearch} /><FieldHint>Manually choose exact leads for this run. Showing up to 100 matching leads.</FieldHint><LeadSearchResults leads={leads.data?.data ?? []} selectedIds={leadIds} isLoading={leads.isLoading || leads.isFetching} error={leads.error} onToggle={(leadId) => setLeadIds(toggle(leadIds, leadId))} search={search} /></div>}

        {mode === 'FILTERS' && <div className="mt-4"><FieldHint>Filters are combined, so a lead must match each filled field.</FieldHint><div className="mt-2 grid gap-3 md:grid-cols-3"><SearchInput placeholder="Name, company, location, or source" value={search} onValueChange={setSearch} /><select className="input-field" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Any status</option>{['NEW','CONTACTED','ENGAGED','QUALIFIED','NURTURE','NOT_QUALIFIED','CONVERTED','LOST'].map((item) => <option key={item}>{item}</option>)}</select><input className="input-field" placeholder="Source, for example website or CSV" value={source} onChange={(event) => setSource(event.target.value)} /><select className="input-field" value={businessSize} onChange={(event) => setBusinessSize(event.target.value)}><option value="">Any business size</option>{['SOLO','SMALL','MEDIUM','LARGE','ENTERPRISE','UNKNOWN'].map((item) => <option key={item}>{item}</option>)}</select><select className="input-field" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Any priority</option>{['LOW','MEDIUM','HIGH','URGENT'].map((item) => <option key={item}>{item}</option>)}</select></div></div>}
        <label className="mt-4 block text-sm"><span className="mb-1 block">Matching tags, any (optional)</span><input className="input-field" placeholder="Example: customer, opted-in" value={tags} onChange={(event) => setTags(event.target.value)} /><FieldHint>Comma-separated tag names. Leave blank if tags should not limit the audience.</FieldHint></label>
      </section>

      <section className="rounded-lg border border-gray-300 bg-white p-5">
        <h2 className="font-semibold">Schedule and delivery</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4"><label className="text-sm"><span className="mb-1 block">Start at</span><input className="input-field" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /><FieldHint>Leave blank to start as soon as you click Start Run.</FieldHint></label><label className="text-sm"><span className="mb-1 block">Timezone</span><input className="input-field" placeholder="Example: Asia/Kolkata" value={timezone} onChange={(event) => setTimezone(event.target.value)} /><FieldHint>Used for the start time, send window, and sending days.</FieldHint></label><label className="text-sm"><span className="mb-1 block">Daily start hour</span><input className="input-field" type="number" min={0} max={23} placeholder="9" value={startHour} onChange={(event) => setStartHour(Number(event.target.value))} /><FieldHint>First allowed hour. 9 means from 09:00.</FieldHint></label><label className="text-sm"><span className="mb-1 block">Daily end hour</span><input className="input-field" type="number" min={1} max={24} placeholder="20" value={endHour} onChange={(event) => setEndHour(Number(event.target.value))} /><FieldHint>Last allowed window ends before this hour. 23 allows sends until 22:59.</FieldHint></label></div>
        <div className="mt-4"><div className="text-sm font-medium">Sending days</div><FieldHint>Messages are only sent on selected weekdays in the run timezone.</FieldHint><div className="mt-2 flex flex-wrap gap-2">{weekdays.map((day) => <label key={day.value} className={`cursor-pointer rounded border px-3 py-2 text-sm ${sendingDays.includes(day.value) ? 'border-brand-600 bg-brand-50' : 'border-gray-300'}`}><input className="sr-only" type="checkbox" checked={sendingDays.includes(day.value)} onChange={() => setSendingDays(toggle(sendingDays, day.value))} />{day.label}</label>)}</div></div>
        <label className="mt-4 block max-w-xs text-sm"><span className="mb-1 block">Maximum messages per hour</span><input className="input-field" type="number" min={1} max={10000} placeholder="100" value={rateLimit} onChange={(event) => setRateLimit(Number(event.target.value))} /><FieldHint>Caps how many campaign step messages this run can send each hour.</FieldHint></label>
      </section>

      <section className="rounded-lg border border-gray-300 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Eligibility check</h2><p className="text-sm text-gray-500">Checks valid contact details and consent for each selected channel. Previewing does not send messages.</p></div><button className="btn-secondary" disabled={!canPreview || preview.isPending} onClick={() => preview.mutate()}>{preview.isPending ? 'Checking...' : 'Preview audience'}</button></div>
        {preview.data && <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Metric label="Matched" value={preview.data.total} /><Metric label="Eligible" value={preview.data.eligible} /><Metric label="Excluded" value={preview.data.excluded} />{channels.map((channel) => <Metric key={channel} label={`${channel} reachable`} value={preview.data.reachable[channel] ?? 0} />)}</div>}
        {preview.data && <PreviewDetails preview={preview.data} />}
        {(preview.error || create.error) && <p className="mt-3 text-sm text-red-600">{(preview.error ?? create.error) instanceof Error ? (preview.error ?? create.error as Error)?.message : 'Could not create run.'}</p>}
        <div className="mt-5 flex justify-end"><button className="btn-primary" disabled={!preview.data?.eligible || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Starting...' : scheduledAt ? 'Schedule Run' : 'Start Run'}</button></div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-gray-100 p-3"><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-gray-500">{label}</div></div>;
}

function LeadSearchResults({
  leads,
  selectedIds,
  isLoading,
  error,
  onToggle,
  search,
}: {
  leads: Lead[];
  selectedIds: string[];
  isLoading: boolean;
  error: unknown;
  onToggle: (leadId: string) => void;
  search: string;
}) {
  if (error) {
    return (
      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Could not load leads for this search. Try clearing the search or refresh the page.
      </div>
    );
  }

  return (
    <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-gray-300">
      {isLoading ? <div className="p-4 text-sm text-gray-500">Searching leads...</div> : null}
      {!isLoading && leads.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">
          {search.trim() ? `No leads found for "${search.trim()}".` : 'No leads available.'}
        </div>
      ) : null}
      {!isLoading && leads.map((lead) => (
        <label key={lead.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-200 p-3 last:border-0 hover:bg-gray-50">
          <input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={() => onToggle(lead.id)} />
          <div>
            <div className="font-medium">{lead.name}</div>
            <div className="text-xs text-gray-500">{[lead.company, lead.location, lead.status].filter(Boolean).join(' - ')}</div>
          </div>
        </label>
      ))}
    </div>
  );
}

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-5 text-gray-500">{children}</p>;
}

function PreviewDetails({ preview }: { preview: Preview }) {
  const excluded = (preview.details ?? []).filter((lead) => !lead.eligible);
  const eligibleWithFallbacks = (preview.details ?? []).filter((lead) => lead.eligible && lead.contacts?.some((contact) => contact.requestedChannel !== contact.contactChannel));
  const summary = Object.entries(preview.exclusionSummary ?? {});
  if (excluded.length === 0 && summary.length === 0 && eligibleWithFallbacks.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-gray-300 bg-white">
      <div className="border-b border-gray-200 p-4">
        <h3 className="font-semibold">Audience eligibility details</h3>
        <p className="mt-1 text-sm text-gray-500">WhatsApp can use a lead's WhatsApp contact, or a valid phone/SMS/voice contact. Local Indian numbers are normalized with +91 by default.</p>
      </div>
      {summary.length > 0 && <div className="flex flex-wrap gap-2 border-b border-gray-200 p-4">{summary.map(([reason, count]) => <span key={reason} className="rounded bg-gray-100 px-3 py-1 text-sm">{reasonLabel(reason)}: {count}</span>)}</div>}
      <div className="max-h-72 overflow-auto">
        {eligibleWithFallbacks.map((lead) => (
          <div key={lead.leadId} className="grid gap-2 border-b border-gray-100 p-4 last:border-0 md:grid-cols-[1fr_2fr_auto]">
            <div>
              <div className="font-medium">{lead.name}</div>
              <div className="text-xs text-gray-500">{[lead.company, lead.status].filter(Boolean).join(' - ')}</div>
              <ContactLines contacts={lead.contacts ?? []} />
            </div>
            <div className="flex flex-wrap gap-2">
              {(lead.contacts ?? []).filter((contact) => contact.requestedChannel !== contact.contactChannel).map((contact) => <span key={`${contact.requestedChannel}-${contact.normalizedValue}`} className="rounded bg-green-50 px-2 py-1 text-xs text-green-700">{contact.requestedChannel} uses {contact.contactChannel}: {contact.normalizedValue}</span>)}
            </div>
            <LeadActions leadId={lead.leadId} />
          </div>
        ))}
        {excluded.map((lead) => (
          <div key={lead.leadId} className="grid gap-2 border-b border-gray-100 p-4 last:border-0 md:grid-cols-[1fr_2fr_auto]">
            <div>
              <div className="font-medium">{lead.name}</div>
              <div className="text-xs text-gray-500">{[lead.company, lead.status].filter(Boolean).join(' - ')}</div>
              <ContactLines contacts={lead.contacts ?? []} />
            </div>
            <div className="flex flex-wrap gap-2">
              {lead.excludedReasons.map((reason) => <span key={reason} className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{reasonLabel(reason)}</span>)}
            </div>
            <LeadActions leadId={lead.leadId} excludedReasons={lead.excludedReasons} />
          </div>
        ))}
      </div>
    </div>
  );
}

function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    do_not_contact: 'Marked do not contact',
    opted_out: 'Opted out',
    wrong_number: 'Wrong number',
    blocked: 'Blocked',
    quiet_hours: 'Outside contact hours',
    daily_contact_cap: 'Daily contact cap reached',
    per_lead_contact_cap: '30-day contact cap reached',
    lead_not_found: 'Lead not found',
  };
  if (labels[reason]) return labels[reason];
  if (reason.startsWith('no_') && reason.endsWith('_contact')) return `No ${reason.slice(3, -8).toUpperCase()} contact`;
  if (reason.startsWith('invalid_') && reason.endsWith('_contact')) return `Invalid ${reason.slice(8, -8).toUpperCase()} contact`;
  return reason.replaceAll('_', ' ');
}

function ContactLines({ contacts }: { contacts: NonNullable<PreviewLeadDetail['contacts']> }) {
  if (contacts.length === 0) return null;
  return <div className="mt-1 space-y-0.5 text-xs text-gray-500">{contacts.map((contact) => <div key={`${contact.requestedChannel}-${contact.normalizedValue}`}>{contact.requestedChannel}: {contact.normalizedValue}{contact.requestedChannel !== contact.contactChannel ? ` from ${contact.contactChannel}` : ''}</div>)}</div>;
}

function LeadActions({ leadId, excludedReasons = [] }: { leadId: string; excludedReasons?: string[] }) {
  const resetDailyCap = useMutation({
    mutationFn: () => api.delete<{ deleted: number; attemptedOn: string }>(`/leads/${leadId}/contact-attempts/today`),
  });
  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      <Link className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs" to={`/leads/${leadId}`}>View</Link>
      <Link className="btn-primary whitespace-nowrap px-3 py-1.5 text-xs" to={`/leads/${leadId}?edit=1`}>Edit</Link>
      {excludedReasons.includes('daily_contact_cap') ? (
        <button className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs" disabled={resetDailyCap.isPending} onClick={() => resetDailyCap.mutate()}>
          {resetDailyCap.isPending ? 'Resetting...' : resetDailyCap.data ? 'Reset done' : 'Reset daily cap'}
        </button>
      ) : null}
    </div>
  );
}
