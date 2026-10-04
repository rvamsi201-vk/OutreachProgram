import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api-client.js';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
}

const exampleKnowledge = `Company: LUMRON
What we sell: AI-enabled ERP and CRM software for textile, fabric, and garment businesses.
Best-fit customers: textile wholesalers, garment manufacturers, fabric stores, boutiques, distributors, and fabric retailers.

Main problems we solve:
- Manual customer follow-ups
- Missed WhatsApp leads
- Scattered customer data
- Poor sales pipeline tracking
- Stock and order visibility issues

Product features:
- Lead management
- WhatsApp outreach
- Sales pipeline
- Customer history
- Follow-up reminders
- Inventory and order visibility
- Team activity tracking

Approved sales pitch:
We help textile and garment businesses manage leads, follow-ups, stock, and customer communication in one CRM/ERP system.

FAQ:
Q: What does LUMRON do?
A: It helps textile businesses manage leads, customers, follow-ups, sales pipeline, and operations in one place.

Q: Can you send pricing?
A: Pricing depends on business size and requirements. The AI should collect requirements and arrange a human follow-up.

Rules for the AI:
- Keep the first message short.
- Ask only one question at a time.
- Do not promise guaranteed discounts.
- Do not give fake delivery dates.
- Do not quote exact pricing unless approved.
- If pricing, legal, refund, or commitment questions are unclear, ask for human follow-up.`;

export function KnowledgePage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedKb, setSelectedKb] = useState('');
  const [editingKb, setEditingKb] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const bases = useQuery({ queryKey: ['knowledge-bases'], queryFn: () => api.get<{ data: KnowledgeBase[] }>('/knowledge-bases') });
  const selectedBase = useMemo(() => bases.data?.data.find((kb) => kb.id === selectedKb), [bases.data?.data, selectedKb]);

  useEffect(() => {
    if (!selectedKb && bases.data?.data[0]) setSelectedKb(bases.data.data[0].id);
  }, [bases.data?.data, selectedKb]);

  useEffect(() => {
    if (!selectedBase || editingKb) return;
    setEditName(selectedBase.name);
    setEditDescription(selectedBase.description ?? '');
  }, [editingKb, selectedBase]);

  const createKb = useMutation({
    mutationFn: () => api.post<KnowledgeBase>('/knowledge-bases', { name, description: description || null }),
    onSuccess: (kb) => {
      setName('');
      setDescription('');
      setSelectedKb(kb.id);
      setEditingKb(false);
      void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
  });
  const updateKb = useMutation({
    mutationFn: () => api.patch<KnowledgeBase>(`/knowledge-bases/${selectedKb}`, { name: editName, description: editDescription || null }),
    onSuccess: () => {
      setEditingKb(false);
      void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
  });
  const deleteKb = useMutation({
    mutationFn: () => api.delete<void>(`/knowledge-bases/${selectedKb}`),
    onSuccess: () => {
      setSelectedKb('');
      setEditingKb(false);
      void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Knowledge</h1>
        <p className="mt-1 text-sm text-gray-500">One simple knowledge base. The Description is what the AI agent reads.</p>
      </div>

      <section className="rounded-lg border border-gray-300 bg-white p-4">
        <h2 className="font-semibold">What to put here</h2>
        <div className="mt-3 grid gap-3 text-sm text-gray-600 md:grid-cols-3">
          <div className="rounded-md bg-gray-50 p-3">
            <div className="font-semibold text-gray-900">Knowledge base name</div>
            <p className="mt-1">A short label, like LUMRON or Textile CRM Offer.</p>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="font-semibold text-gray-900">Description</div>
            <p className="mt-1">Put everything here: company, product, FAQs, pricing rules, and AI restrictions.</p>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="font-semibold text-gray-900">Agent link</div>
            <p className="mt-1">In Agents, select this knowledge base. WhatsApp and email AI messages will use it.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-lg border border-gray-300 bg-white">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Knowledge bases</h2>
            <p className="mt-1 text-xs text-gray-500">Choose the one your agent should use.</p>
          </div>
          {bases.data?.data.map((kb) => (
            <button key={kb.id} className={`block w-full border-b border-gray-100 p-4 text-left last:border-0 ${selectedKb === kb.id ? 'bg-brand-50' : 'hover:bg-gray-50'}`} onClick={() => {
              setSelectedKb(kb.id);
              setEditingKb(false);
            }}>
              <div className="font-medium">{kb.name}</div>
              <div className="mt-1 line-clamp-3 text-xs text-gray-500">{kb.description || 'No description yet'}</div>
            </button>
          ))}
          {bases.data?.data.length === 0 ? <div className="p-4 text-sm text-gray-500">Create a knowledge base to begin.</div> : null}
        </aside>

        <div className="space-y-5">
          <section className="rounded-lg border border-gray-300 bg-white p-4">
            <h2 className="font-semibold">Create knowledge base</h2>
            <p className="mt-1 text-sm text-gray-500">Use this when you want a new company, product, or campaign knowledge set.</p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">Knowledge base name</span>
              <input className="input-field" placeholder="Example: LUMRON Textile CRM" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium">Description</span>
              <textarea
                className="input-field min-h-72"
                placeholder={exampleKnowledge}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="btn-secondary" type="button" onClick={() => setDescription(exampleKnowledge)}>Use example</button>
              <button className="btn-primary" disabled={!name.trim() || description.trim().length < 20 || createKb.isPending} onClick={() => createKb.mutate()}>{createKb.isPending ? 'Creating...' : 'Create knowledge base'}</button>
            </div>
          </section>

          <section className="rounded-lg border border-gray-300 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{selectedBase?.name ?? 'Select a knowledge base'}</h2>
                <p className="mt-1 text-sm text-gray-500">This is the exact knowledge content agents use when this base is selected.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedBase && !editingKb ? <button className="btn-secondary" onClick={() => {
                  setEditName(selectedBase.name);
                  setEditDescription(selectedBase.description ?? '');
                  setEditingKb(true);
                }}>Edit</button> : null}
                {selectedBase ? <button className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" disabled={deleteKb.isPending} onClick={() => deleteKb.mutate()}>{deleteKb.isPending ? 'Deleting...' : 'Delete'}</button> : null}
              </div>
            </div>

            {selectedBase ? (
              editingKb ? (
                <div className="mt-4">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Knowledge base name</span>
                    <input className="input-field" value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Knowledge base name" />
                  </label>
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block font-medium">Description</span>
                    <textarea className="input-field min-h-96" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} placeholder={exampleKnowledge} />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-secondary" type="button" onClick={() => setEditDescription(exampleKnowledge)}>Use example</button>
                    <button className="btn-primary" disabled={!editName.trim() || editDescription.trim().length < 20 || updateKb.isPending} onClick={() => updateKb.mutate()}>{updateKb.isPending ? 'Saving...' : 'Save knowledge'}</button>
                    <button className="btn-secondary" onClick={() => setEditingKb(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-4 text-sm leading-6 text-gray-700">{selectedBase.description || 'No knowledge added yet. Click Edit and add company, product, FAQ, and rule details in the Description.'}</pre>
              )
            ) : (
              <div className="mt-4 rounded-md bg-gray-50 p-4 text-sm text-gray-500">Create or select a knowledge base.</div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
