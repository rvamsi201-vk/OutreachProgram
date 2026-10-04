import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../../lib/api-client.js';
import type { Lead } from './types.js';

const statuses = ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'NURTURE', 'NOT_QUALIFIED', 'CONVERTED', 'LOST'];

export function LeadDetailPage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [tag, setTag] = useState('');
  const [reason, setReason] = useState('OPTED_OUT');
  const [editing, setEditing] = useState(searchParams.get('edit') === '1');
  const [editForm, setEditForm] = useState({ name: '', company: '', status: 'NEW', email: '', phone: '', whatsapp: '' });
  const [consentForm, setConsentForm] = useState({ doNotContact: false, optedOut: false, wrongNumber: false, blocked: false });

  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => api.get<Lead>(`/leads/${id}`), enabled: Boolean(id) });
  const timeline = useQuery({ queryKey: ['lead-timeline', id], queryFn: () => api.get<{ data: Array<{ id: string; eventType: string; channel: string | null; createdAt: string }> }>(`/leads/${id}/timeline`), enabled: Boolean(id) });
  const createConversation = useMutation({
    mutationFn: (channel: string) => api.post<{ id: string }>('/conversations', { leadId: id, channel }),
  });
  const updateTags = useMutation({
    mutationFn: () => api.patch(`/leads/${id}`, { tags: [...(lead.data?.tags?.map((item) => item.name) ?? []), tag] }),
    onSuccess: () => {
      setTag('');
      void queryClient.invalidateQueries({ queryKey: ['lead', id] });
    },
  });
  const suppress = useMutation({
    mutationFn: () => api.post('/suppressions', { leadId: id, reason }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lead', id] }),
  });
  const removeSuppression = useMutation({
    mutationFn: (suppressionId: string) => api.delete(`/suppressions/${suppressionId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lead', id] }),
  });
  const updateConsent = useMutation({
    mutationFn: () => api.patch(`/leads/${id}`, consentForm),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lead', id] }),
  });
  const updateLead = useMutation({
    mutationFn: () => api.patch(`/leads/${id}`, {
      name: editForm.name,
      company: editForm.company || null,
      status: editForm.status,
      contacts: [
        ...(editForm.email ? [{ channel: 'EMAIL', value: editForm.email, isPrimary: true }] : []),
        ...(editForm.phone ? [{ channel: 'SMS', value: editForm.phone, isPrimary: !editForm.email }] : []),
        ...(editForm.whatsapp ? [{ channel: 'WHATSAPP', value: editForm.whatsapp, isPrimary: !editForm.email && !editForm.phone }] : []),
      ],
    }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['lead', id] });
    },
  });

  useEffect(() => {
    if (!lead.data) return;
    const contact = (channel: string) => lead.data?.contacts?.find((item) => item.channel === channel)?.value ?? '';
    setEditForm({
      name: lead.data.name,
      company: lead.data.company ?? '',
      status: lead.data.status,
      email: contact('EMAIL'),
      phone: contact('SMS') || contact('VOICE'),
      whatsapp: contact('WHATSAPP'),
    });
    setConsentForm({
      doNotContact: lead.data.doNotContact,
      optedOut: lead.data.optedOut,
      wrongNumber: lead.data.wrongNumber,
      blocked: lead.data.blocked,
    });
  }, [lead.data]);

  if (lead.isLoading) return <div className="p-6 text-sm text-gray-500">Loading lead...</div>;
  if (!lead.data) return <div className="p-6 text-sm text-red-400">Lead not found.</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/leads" className="text-sm text-gray-500 hover:text-gray-300">Back to leads</Link>
          <h1 className="mt-2 text-2xl font-semibold">{lead.data.name}</h1>
          <p className="text-sm text-gray-500">{lead.data.company || 'No company'} - {lead.data.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel Edit' : 'Edit Lead'}</button>
          <button className="btn-secondary" onClick={() => createConversation.mutate('SMS')}>Open SMS Conversation</button>
        </div>
      </div>

      {editing && (
        <section className="rounded-lg border border-gray-300 bg-white p-4">
          <h2 className="font-semibold">Edit Lead</h2>
          <p className="mt-1 text-sm text-gray-500">Phone and WhatsApp numbers without a country code are normalized as India numbers by default. If WhatsApp is same as phone, the campaign can use the phone contact.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input className="input-field" placeholder="Name" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
            <input className="input-field" placeholder="Company" value={editForm.company} onChange={(event) => setEditForm({ ...editForm, company: event.target.value })} />
            <select className="input-field" value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
            <input className="input-field" placeholder="Email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
            <input className="input-field" placeholder="Phone / SMS, e.g. 9876543210" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} />
            <input className="input-field" placeholder="WhatsApp, optional if same as phone" value={editForm.whatsapp} onChange={(event) => setEditForm({ ...editForm, whatsapp: event.target.value })} />
          </div>
          {updateLead.error && <p className="mt-3 text-sm text-red-600">{updateLead.error instanceof Error ? updateLead.error.message : 'Could not update lead.'}</p>}
          <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={!editForm.name.trim() || updateLead.isPending} onClick={() => updateLead.mutate()}>{updateLead.isPending ? 'Saving...' : 'Save Lead'}</button></div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <Panel title="Contacts">
            <div className="divide-y divide-gray-800">
              {lead.data.contacts?.map((contact) => (
                <div key={contact.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <div className="font-medium text-gray-200">{contact.channel}</div>
                    <div className="text-gray-500">{contact.normalizedValue}</div>
                    <div className="text-xs text-gray-500">Original: {contact.value}</div>
                  </div>
                  <span className="text-xs text-gray-400">{contact.validationStatus}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Timeline">
            {timeline.data?.data.length ? timeline.data.data.map((event) => (
              <div key={event.id} className="border-b border-gray-800 py-3 text-sm">
                <div className="text-gray-200">{event.eventType}</div>
                <div className="text-xs text-gray-500">{event.channel || 'CRM'} - {new Date(event.createdAt).toLocaleString()}</div>
              </div>
            )) : <p className="text-sm text-gray-500">No timeline events yet.</p>}
          </Panel>

          <Panel title="Custom Fields">
            {lead.data.customFields?.length ? lead.data.customFields.map((field) => (
              <div key={field.id} className="flex justify-between border-b border-gray-800 py-2 text-sm">
                <span className="text-gray-400">{field.label}</span>
                <span>{String(field.value ?? '')}</span>
              </div>
            )) : <p className="text-sm text-gray-500">No custom fields set.</p>}
          </Panel>
        </section>

        <aside className="space-y-4">
          <Panel title="Tags">
            <div className="flex flex-wrap gap-2">
              {lead.data.tags?.map((item) => <span key={item.id} className="rounded-md bg-gray-800 px-2 py-1 text-xs">{item.name}</span>)}
            </div>
            <div className="mt-4 flex gap-2">
              <input className="input-field" placeholder="Add tag" value={tag} onChange={(event) => setTag(event.target.value)} />
              <button className="btn-secondary" disabled={!tag} onClick={() => updateTags.mutate()}>Add</button>
            </div>
          </Panel>

          <Panel title="Consent & Suppression">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Lead consent status</h3>
                <p className="mt-1 text-xs text-gray-500">These flags directly block campaign sends until you turn them off.</p>
              </div>
              <div className="grid gap-2">
                <ConsentCheckbox
                  checked={consentForm.doNotContact}
                  label="Do not contact"
                  onChange={(value) => setConsentForm((current) => ({ ...current, doNotContact: value }))}
                />
                <ConsentCheckbox
                  checked={consentForm.optedOut}
                  label="Opted out"
                  onChange={(value) => setConsentForm((current) => ({ ...current, optedOut: value }))}
                />
                <ConsentCheckbox
                  checked={consentForm.wrongNumber}
                  label="Wrong number"
                  onChange={(value) => setConsentForm((current) => ({ ...current, wrongNumber: value }))}
                />
                <ConsentCheckbox
                  checked={consentForm.blocked}
                  label="Blocked"
                  onChange={(value) => setConsentForm((current) => ({ ...current, blocked: value }))}
                />
              </div>
              {updateConsent.error && <p className="text-xs text-red-600">{updateConsent.error instanceof Error ? updateConsent.error.message : 'Could not save consent status.'}</p>}
              <button className="btn-secondary w-full" disabled={updateConsent.isPending} onClick={() => updateConsent.mutate()}>
                {updateConsent.isPending ? 'Saving...' : 'Save consent status'}
              </button>
            </div>

            <div className="mt-5 border-t border-gray-800 pt-4">
              <h3 className="text-sm font-semibold text-gray-200">Suppression entries</h3>
              <p className="mt-1 text-xs text-gray-500">These are individual block records. Remove the row if it should no longer exclude this lead.</p>
              <div className="mt-3 space-y-2">
                {lead.data.suppressions?.length ? lead.data.suppressions.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-800 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-red-300">{item.reason}</div>
                      <div className="text-xs text-gray-500">{item.channel ?? 'All channels'}{item.notes ? ` - ${item.notes}` : ''}</div>
                    </div>
                    <button
                      className="btn-secondary px-3 py-1 text-xs"
                      disabled={removeSuppression.isPending}
                      onClick={() => removeSuppression.mutate(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                )) : <p className="text-sm text-gray-500">No suppression entries.</p>}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <select className="input-field" value={reason} onChange={(event) => setReason(event.target.value)}>
                <option>DO_NOT_CONTACT</option>
                <option>OPTED_OUT</option>
                <option>WRONG_NUMBER</option>
                <option>BLOCKED</option>
              </select>
              <button className="btn-secondary" onClick={() => suppress.mutate()}>Suppress</button>
            </div>
            {suppress.error && <p className="mt-2 text-xs text-red-600">{suppress.error instanceof Error ? suppress.error.message : 'Could not add suppression.'}</p>}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function ConsentCheckbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-gray-800 px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      {children}
    </section>
  );
}
