import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { SearchInput } from '../../components/search-input.js';
import { api } from '../../lib/api-client.js';
import type { Lead } from './types.js';

const statuses = ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'NURTURE', 'NOT_QUALIFIED', 'CONVERTED', 'LOST'];
const businessSizes = ['SOLO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE', 'UNKNOWN'];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const channels = ['WHATSAPP', 'SMS', 'VOICE', 'EMAIL'];
const sortFields = [
  ['createdAt', 'Created'],
  ['updatedAt', 'Updated'],
  ['name', 'Name'],
  ['status', 'Status'],
  ['source', 'Source'],
  ['priority', 'Priority'],
  ['score', 'Score'],
  ['location', 'Location'],
  ['businessSize', 'Business size'],
] as const;
const defaultCrmMapping = [
  ['school_name', 'Lead name and company'],
  ['phone', 'WhatsApp and SMS contacts'],
  ['domain', 'Tag and business sector'],
  ['size', 'Business size'],
  ['city / area / state / country', 'Location fields'],
  ['website', 'Website'],
  ['rating', 'Ratings'],
  ['score / final_score / base_score', 'Lead score'],
  ['priority', 'Priority'],
  ['pitch', 'Sales pitch'],
  ['notes', 'Comments'],
  ['gaps_found / search_query / reviews', 'Info and custom fields'],
  ['id / assigned_id / timestamps', 'External CRM custom fields'],
] as const;

interface ImportBatch {
  id: string;
  title: string;
  fileName: string;
  status: string;
  createdAt: string;
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface LeadsResponse {
  data: Lead[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    total?: number;
  };
}

type ExternalCrmLeadPreview = Record<string, unknown>;

interface ExternalCrmPreviewResponse {
  data: ExternalCrmLeadPreview[];
  fetched: number;
  endpoint: string;
}

export function LeadsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    source: '',
    businessSize: '',
    priority: '',
    importId: '',
    tag: '',
    channel: '',
    hasWebsite: '',
    minScore: '',
    maxScore: '',
    createdFrom: '',
    createdTo: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    limit: '25',
  });
  const [page, setPage] = useState(0);
  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    pitch: '',
    info: '',
    comments: '',
    source: 'Manual',
    location: '',
    businessSize: '',
    website: '',
    otherLinks: '',
    ratings: '',
    score: '',
    priority: '',
  });
  const [showCrmImport, setShowCrmImport] = useState(false);
  const [crmImport, setCrmImport] = useState({
    baseUrl: 'https://crm.exora.solutions/api/leads/',
    loginUrl: '',
    email: '',
    password: '',
    bearerToken: '',
    domain: '',
    city: '',
    area: '',
    state: '',
    size: '',
    limit: '250',
  });
  const [fetchedCrmLeads, setFetchedCrmLeads] = useState<ExternalCrmLeadPreview[]>([]);
  const [selectedCrmLeadKeys, setSelectedCrmLeadKeys] = useState<Set<string>>(new Set());
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [crmPreviewFilters, setCrmPreviewFilters] = useState({
    search: '',
    domain: '',
    city: '',
    priority: '',
    hasPhone: '',
    minScore: '',
  });

  const batches = useQuery({
    queryKey: ['lead-import-batches'],
    queryFn: () => api.get<{ data: ImportBatch[] }>('/leads/import-batches'),
  });
  const tags = useQuery({
    queryKey: ['lead-tags'],
    queryFn: () => api.get<{ data: Tag[] }>('/tags'),
  });
  const batchById = useMemo(() => new Map((batches.data?.data ?? []).map((batch) => [batch.id, batch])), [batches.data?.data]);
  const pageSize = Number(filters.limit) || 25;

  const queryString = new URLSearchParams({
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.businessSize ? { businessSize: filters.businessSize } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.importId ? { importId: filters.importId } : {}),
    ...(filters.tag ? { businessTag: filters.tag } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.hasWebsite ? { hasWebsite: filters.hasWebsite } : {}),
    ...(filters.minScore ? { minScore: filters.minScore } : {}),
    ...(filters.maxScore ? { maxScore: filters.maxScore } : {}),
    ...(filters.createdFrom ? { createdFrom: filters.createdFrom } : {}),
    ...(filters.createdTo ? { createdTo: filters.createdTo } : {}),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    limit: String(pageSize),
    offset: String(page * pageSize),
  }).toString();

  const leads = useQuery({
    queryKey: ['leads', queryString],
    queryFn: () => api.get<LeadsResponse>(`/leads?${queryString}`),
  });

  const createLead = useMutation({
    mutationFn: () => api.post<Lead>('/leads', {
      name: form.name,
      company: form.company || null,
      pitch: form.pitch || null,
      info: form.info || null,
      comments: form.comments || null,
      source: form.source || 'Manual',
      location: form.location || null,
      businessSize: form.businessSize || null,
      website: form.website || null,
      otherLinks: splitList(form.otherLinks),
      ratings: form.ratings || null,
      score: form.score ? Number(form.score) : null,
      priority: form.priority || null,
      contacts: [
        ...(form.email ? [{ channel: 'EMAIL', value: form.email, isPrimary: true }] : []),
        ...(form.phone ? [{ channel: 'SMS', value: form.phone, isPrimary: !form.email }] : []),
      ],
      tags: [],
      customFields: {},
    }),
    onSuccess: () => {
      setForm({
        name: '',
        company: '',
        email: '',
        phone: '',
        pitch: '',
        info: '',
        comments: '',
        source: 'Manual',
        location: '',
        businessSize: '',
        website: '',
        otherLinks: '',
        ratings: '',
        score: '',
        priority: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const deleteLead = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/leads/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
  const deleteSelectedLeads = useMutation({
    mutationFn: async () => {
      await Promise.all([...selectedLeadIds].map((id) => api.delete<void>(`/leads/${id}`)));
    },
    onSuccess: () => {
      setSelectedLeadIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const fetchFromCrm = useMutation({
    mutationFn: () => api.post<ExternalCrmPreviewResponse>('/leads/import/external-crm/preview', {
      baseUrl: crmImport.baseUrl,
      loginUrl: crmImport.loginUrl || null,
      email: crmImport.email || null,
      password: crmImport.password || null,
      bearerToken: crmImport.bearerToken || null,
      domain: crmImport.domain || null,
      city: crmImport.city || null,
      area: crmImport.area || null,
      state: crmImport.state || null,
      size: crmImport.size || null,
      limit: Number(crmImport.limit) || 250,
    }),
    onSuccess: (result) => {
      setFetchedCrmLeads(result.data);
      setSelectedCrmLeadKeys(new Set());
    },
    onSettled: () => {
      setCrmImport((current) => ({ ...current, email: '', password: '', bearerToken: '' }));
    },
  });

  const importFromCrm = useMutation({
    mutationFn: () => api.post<{ importId: string; requested: number; imported: number; duplicates: number; invalid: number }>('/leads/import/external-crm', {
      baseUrl: crmImport.baseUrl,
      rows: fetchedCrmLeads.filter((row, index) => selectedCrmLeadKeys.has(externalCrmLeadKey(row, index))),
      domain: crmImport.domain || null,
      city: crmImport.city || null,
      area: crmImport.area || null,
      state: crmImport.state || null,
      size: crmImport.size || null,
      limit: Number(crmImport.limit) || 250,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['lead-import-batches'] });
      setFetchedCrmLeads([]);
      setSelectedCrmLeadKeys(new Set());
    },
  });

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      status: '',
      source: '',
      businessSize: '',
      priority: '',
      importId: '',
      tag: '',
      channel: '',
      hasWebsite: '',
      minScore: '',
      maxScore: '',
      createdFrom: '',
      createdTo: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
      limit: '25',
    });
    setPage(0);
  };

  const canCreate = Boolean(form.name && (form.email || form.phone));
  const canFetchFromCrm = Boolean(
    crmImport.baseUrl && ((crmImport.email && crmImport.password) || crmImport.bearerToken),
  );
  const filteredCrmLeads = useMemo(() => fetchedCrmLeads.filter((row) => {
    const search = crmPreviewFilters.search.trim().toLowerCase();
    const score = Number(externalCrmValue(row, 'score') || externalCrmValue(row, 'final_score') || externalCrmValue(row, 'base_score') || 0);
    if (search && !JSON.stringify(row).toLowerCase().includes(search)) return false;
    if (crmPreviewFilters.domain && externalCrmValue(row, 'domain') !== crmPreviewFilters.domain) return false;
    if (crmPreviewFilters.city && externalCrmValue(row, 'city') !== crmPreviewFilters.city) return false;
    if (crmPreviewFilters.priority && externalCrmValue(row, 'priority') !== crmPreviewFilters.priority) return false;
    if (crmPreviewFilters.hasPhone === 'yes' && !externalCrmValue(row, 'phone')) return false;
    if (crmPreviewFilters.hasPhone === 'no' && externalCrmValue(row, 'phone')) return false;
    if (crmPreviewFilters.minScore && score < Number(crmPreviewFilters.minScore)) return false;
    return true;
  }), [crmPreviewFilters, fetchedCrmLeads]);
  const selectedCrmRows = fetchedCrmLeads.filter((row, index) => selectedCrmLeadKeys.has(externalCrmLeadKey(row, index)));
  const allVisibleSelected = filteredCrmLeads.length > 0 && filteredCrmLeads.every((row) => selectedCrmLeadKeys.has(externalCrmLeadKey(row, fetchedCrmLeads.indexOf(row))));
  const crmDomains = uniqueExternalValues(fetchedCrmLeads, 'domain');
  const crmCities = uniqueExternalValues(fetchedCrmLeads, 'city');
  const crmPriorities = uniqueExternalValues(fetchedCrmLeads, 'priority');
  const totalLeads = leads.data?.pagination.total;
  const pageStart = totalLeads && totalLeads > 0 ? page * pageSize + 1 : 0;
  const pageEnd = Math.min((page + 1) * pageSize, totalLeads ?? page * pageSize + (leads.data?.data.length ?? 0));
  const canGoPrevious = page > 0;
  const canGoNext = Boolean(leads.data?.pagination.hasMore);
  const visibleLeadIds = leads.data?.data.map((lead) => lead.id) ?? [];
  const selectedVisibleLeadIds = visibleLeadIds.filter((id) => selectedLeadIds.has(id));
  const allVisibleLeadsSelected = visibleLeadIds.length > 0 && selectedVisibleLeadIds.length === visibleLeadIds.length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="mt-1 text-sm text-[#6f6b63]">Search, filter, import, create, and clean lead batches.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setShowCrmImport((value) => !value)}>Import from CRM</button>
          <Link className="btn-secondary" to="/leads/import">Import CSV</Link>
        </div>
      </div>

      {showCrmImport && (
        <section className="card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6f6b63]">Import from external CRM</h2>
              <p className="mt-1 text-sm text-[#6f6b63]">Step 1 fetches leads into a temporary preview. Step 2 lets you filter and select. Step 3 imports only the selected leads.</p>
            </div>
            <button className="btn-secondary" onClick={() => setCrmImport((current) => ({ ...current, email: '', password: '', bearerToken: '' }))}>Clear credentials</button>
          </div>
          <div className="mb-4 grid gap-2 md:grid-cols-3">
            <div className="rounded-md border border-[#171717] bg-[#171717] px-3 py-2 text-sm font-semibold text-white">1. Fetch from CRM</div>
            <div className="rounded-md border border-[#d8d3c8] bg-white px-3 py-2 text-sm font-semibold text-[#45413a]">2. Filter and select</div>
            <div className="rounded-md border border-[#d8d3c8] bg-white px-3 py-2 text-sm font-semibold text-[#45413a]">3. Import selected</div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <input className="input-field md:col-span-2" placeholder="External CRM URL" value={crmImport.baseUrl} onChange={(event) => setCrmImport({ ...crmImport, baseUrl: event.target.value })} />
            <input className="input-field md:col-span-2" placeholder="Login URL, default: /api/auth/login" value={crmImport.loginUrl} onChange={(event) => setCrmImport({ ...crmImport, loginUrl: event.target.value })} />
            <input className="input-field md:col-span-2" type="email" autoComplete="off" placeholder="External CRM email" value={crmImport.email} onChange={(event) => setCrmImport({ ...crmImport, email: event.target.value })} />
            <input className="input-field md:col-span-2" type="password" autoComplete="off" placeholder="External CRM password" value={crmImport.password} onChange={(event) => setCrmImport({ ...crmImport, password: event.target.value })} />
            <input className="input-field md:col-span-4" type="password" autoComplete="off" placeholder="Optional manual bearer token fallback" value={crmImport.bearerToken} onChange={(event) => setCrmImport({ ...crmImport, bearerToken: event.target.value })} />
            <input className="input-field" placeholder="Domain, e.g. gym" value={crmImport.domain} onChange={(event) => setCrmImport({ ...crmImport, domain: event.target.value })} />
            <input className="input-field" placeholder="City" value={crmImport.city} onChange={(event) => setCrmImport({ ...crmImport, city: event.target.value })} />
            <input className="input-field" placeholder="Area" value={crmImport.area} onChange={(event) => setCrmImport({ ...crmImport, area: event.target.value })} />
            <input className="input-field" placeholder="State" value={crmImport.state} onChange={(event) => setCrmImport({ ...crmImport, state: event.target.value })} />
            <input className="input-field" placeholder="Size, e.g. small" value={crmImport.size} onChange={(event) => setCrmImport({ ...crmImport, size: event.target.value })} />
            <input className="input-field" type="number" min={1} max={1000} placeholder="Limit" value={crmImport.limit} onChange={(event) => setCrmImport({ ...crmImport, limit: event.target.value })} />
            <button className="btn-primary md:col-span-2" disabled={!canFetchFromCrm || fetchFromCrm.isPending} onClick={() => fetchFromCrm.mutate()}>{fetchFromCrm.isPending ? 'Fetching preview...' : 'Step 1: Fetch Leads'}</button>
          </div>
          {fetchedCrmLeads.length > 0 ? (
            <div className="mt-4 rounded-lg border border-[#d8d3c8] bg-white">
              <div className="border-b border-[#e1ded6] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Step 2: Filter and select fetched leads</h3>
                    <p className="mt-1 text-sm text-[#6f6b63]">Fetched {fetchedCrmLeads.length}. Showing {filteredCrmLeads.length}. Selected {selectedCrmRows.length}.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={() => {
                      setSelectedCrmLeadKeys((current) => {
                        const next = new Set(current);
                        for (const row of filteredCrmLeads) next.add(externalCrmLeadKey(row, fetchedCrmLeads.indexOf(row)));
                        return next;
                      });
                    }}>Select visible</button>
                    <button className="btn-secondary" onClick={() => {
                      setSelectedCrmLeadKeys((current) => {
                        const next = new Set(current);
                        for (const row of filteredCrmLeads) next.delete(externalCrmLeadKey(row, fetchedCrmLeads.indexOf(row)));
                        return next;
                      });
                    }}>Clear visible</button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <SearchInput className="md:col-span-2" placeholder="Filter fetched leads" value={crmPreviewFilters.search} onValueChange={(value) => setCrmPreviewFilters({ ...crmPreviewFilters, search: value })} />
                  <select className="input-field" value={crmPreviewFilters.domain} onChange={(event) => setCrmPreviewFilters({ ...crmPreviewFilters, domain: event.target.value })}>
                    <option value="">All domains</option>
                    {crmDomains.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select className="input-field" value={crmPreviewFilters.city} onChange={(event) => setCrmPreviewFilters({ ...crmPreviewFilters, city: event.target.value })}>
                    <option value="">All cities</option>
                    {crmCities.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select className="input-field" value={crmPreviewFilters.priority} onChange={(event) => setCrmPreviewFilters({ ...crmPreviewFilters, priority: event.target.value })}>
                    <option value="">All priorities</option>
                    {crmPriorities.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select className="input-field" value={crmPreviewFilters.hasPhone} onChange={(event) => setCrmPreviewFilters({ ...crmPreviewFilters, hasPhone: event.target.value })}>
                    <option value="">Phone any</option>
                    <option value="yes">Has phone</option>
                    <option value="no">No phone</option>
                  </select>
                  <input className="input-field" type="number" min={0} max={100} placeholder="Min score" value={crmPreviewFilters.minScore} onChange={(event) => setCrmPreviewFilters({ ...crmPreviewFilters, minScore: event.target.value })} />
                </div>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full divide-y divide-[#e1ded6] text-sm">
                  <thead className="sticky top-0 bg-[#f1efe8]">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input type="checkbox" checked={allVisibleSelected} onChange={(event) => {
                          setSelectedCrmLeadKeys((current) => {
                            const next = new Set(current);
                            for (const row of filteredCrmLeads) {
                              const key = externalCrmLeadKey(row, fetchedCrmLeads.indexOf(row));
                              if (event.target.checked) next.add(key);
                              else next.delete(key);
                            }
                            return next;
                          });
                        }} />
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Business</th>
                      <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Phone</th>
                      <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Domain</th>
                      <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">City</th>
                      <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e1ded6]">
                    {filteredCrmLeads.map((row) => {
                      const rowIndex = fetchedCrmLeads.indexOf(row);
                      const key = externalCrmLeadKey(row, rowIndex);
                      return (
                        <tr key={key} className="hover:bg-[#faf9f5]">
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={selectedCrmLeadKeys.has(key)} onChange={(event) => {
                              setSelectedCrmLeadKeys((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(key);
                                else next.delete(key);
                                return next;
                              });
                            }} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-[#171717]">{externalCrmValue(row, 'school_name') || externalCrmValue(row, 'name') || 'Unnamed lead'}</div>
                            <div className="text-xs text-[#6f6b63]">{externalCrmValue(row, 'address') || externalCrmValue(row, 'notes') || 'No details'}</div>
                          </td>
                          <td className="px-4 py-3 text-[#6f6b63]">{externalCrmValue(row, 'phone') || '-'}</td>
                          <td className="px-4 py-3 text-[#6f6b63]">{externalCrmValue(row, 'domain') || '-'}</td>
                          <td className="px-4 py-3 text-[#6f6b63]">{externalCrmValue(row, 'city') || '-'}</td>
                          <td className="px-4 py-3 text-[#6f6b63]">{externalCrmValue(row, 'score') || externalCrmValue(row, 'final_score') || '-'}</td>
                        </tr>
                      );
                    })}
                    {filteredCrmLeads.length === 0 ? (
                      <tr><td className="px-4 py-8 text-center text-[#6f6b63]" colSpan={6}>No fetched leads match these filters.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1ded6] bg-[#faf9f5] p-4">
                <p className="text-sm text-[#6f6b63]">Step 3 imports only checked rows into this CRM.</p>
                <button className="btn-primary" disabled={selectedCrmRows.length === 0 || importFromCrm.isPending} onClick={() => importFromCrm.mutate()}>{importFromCrm.isPending ? 'Importing selected...' : `Import ${selectedCrmRows.length} Selected`}</button>
              </div>
            </div>
          ) : null}
          <div className="mt-4 rounded-lg border border-[#e1ded6] bg-[#faf9f5] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Default DB mapping</h3>
                <p className="mt-1 text-sm text-[#6f6b63]">These fields are mapped automatically during import. No password or bearer token is saved.</p>
              </div>
              <span className="rounded-full border border-[#d8d3c8] px-3 py-1 text-xs font-semibold text-[#6f6b63]">Auto applied</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {defaultCrmMapping.map(([source, target]) => (
                <div key={source} className="rounded-md border border-[#e1ded6] bg-white px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#6f6b63]">{source}</div>
                  <div className="mt-1 text-sm text-[#171717]">{target}</div>
                </div>
              ))}
            </div>
          </div>
          {fetchFromCrm.data ? <p className="mt-3 text-sm text-green-700">Fetched {fetchFromCrm.data.fetched} leads into the preview. Credentials were cleared.</p> : null}
          {importFromCrm.data ? <p className="mt-3 text-sm text-green-700">Imported {importFromCrm.data.imported}, merged {importFromCrm.data.duplicates}, invalid {importFromCrm.data.invalid}.</p> : null}
          {fetchFromCrm.isError ? <p className="mt-3 text-sm text-red-600">{fetchFromCrm.error instanceof Error ? fetchFromCrm.error.message : 'Could not fetch external CRM leads.'}</p> : null}
          {importFromCrm.isError ? <p className="mt-3 text-sm text-red-600">{importFromCrm.error instanceof Error ? importFromCrm.error.message : 'Could not import selected external CRM leads.'}</p> : null}
        </section>
      )}

      <section className="card">
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <SearchInput className="md:col-span-2" placeholder="Name, phone, email, business, tag, location" value={filters.search} onValueChange={(value) => updateFilter('search', value)} />
          <select className="input-field" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input className="input-field" placeholder="Source" value={filters.source} onChange={(event) => updateFilter('source', event.target.value)} />
          <select className="input-field" value={filters.businessSize} onChange={(event) => updateFilter('businessSize', event.target.value)}>
            <option value="">All sizes</option>
            {businessSizes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="input-field" value={filters.priority} onChange={(event) => updateFilter('priority', event.target.value)}>
            <option value="">All priorities</option>
            {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="input-field" value={filters.tag} onChange={(event) => updateFilter('tag', event.target.value)}>
            <option value="">All business tags</option>
            {tags.data?.data.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
          </select>
          <select className="input-field" value={filters.channel} onChange={(event) => updateFilter('channel', event.target.value)}>
            <option value="">All channels</option>
            {channels.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="input-field" value={filters.hasWebsite} onChange={(event) => updateFilter('hasWebsite', event.target.value)}>
            <option value="">Website any</option>
            <option value="yes">Has website</option>
            <option value="no">No website</option>
          </select>
          <input className="input-field" type="number" min={0} max={100} placeholder="Min score" value={filters.minScore} onChange={(event) => updateFilter('minScore', event.target.value)} />
          <input className="input-field" type="number" min={0} max={100} placeholder="Max score" value={filters.maxScore} onChange={(event) => updateFilter('maxScore', event.target.value)} />
          <select className="input-field" value={filters.importId} onChange={(event) => updateFilter('importId', event.target.value)}>
            <option value="">All batches</option>
            {batches.data?.data.map((batch) => <option key={batch.id} value={batch.id}>{batch.title}</option>)}
          </select>
          <input className="input-field" type="date" value={filters.createdFrom} onChange={(event) => updateFilter('createdFrom', event.target.value)} />
          <input className="input-field" type="date" value={filters.createdTo} onChange={(event) => updateFilter('createdTo', event.target.value)} />
          <select className="input-field" value={filters.sortBy} onChange={(event) => updateFilter('sortBy', event.target.value)}>
            {sortFields.map(([value, label]) => <option key={value} value={value}>Sort: {label}</option>)}
          </select>
          <select className="input-field" value={filters.sortOrder} onChange={(event) => updateFilter('sortOrder', event.target.value)}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
          <select className="input-field" value={filters.limit} onChange={(event) => updateFilter('limit', event.target.value)}>
            <option value="10">10 per page</option>
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>
          <button className="btn-secondary" onClick={clearFilters}>Clear</button>
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6f6b63]">Manual batch</h2>
            <p className="mt-1 text-sm text-[#6f6b63]">Manual leads are kept separate from CSV import batches. Email or phone is required and deduplicated.</p>
          </div>
          <button className="btn-primary" disabled={!canCreate || createLead.isPending} onClick={() => createLead.mutate()}>
            {createLead.isPending ? 'Adding...' : 'Add Lead'}
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
          <input className="input-field" placeholder="Name *" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input className="input-field" placeholder="Company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
          <input className="input-field" placeholder="Email unique" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <input className="input-field" placeholder="Phone unique" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          <input className="input-field" placeholder="Source" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
          <input className="input-field" placeholder="Pitch" value={form.pitch} onChange={(event) => setForm({ ...form, pitch: event.target.value })} />
          <input className="input-field" placeholder="Info" value={form.info} onChange={(event) => setForm({ ...form, info: event.target.value })} />
          <input className="input-field" placeholder="Comments" value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} />
          <input className="input-field" placeholder="Location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
          <select className="input-field" value={form.businessSize} onChange={(event) => setForm({ ...form, businessSize: event.target.value })}>
            <option value="">Business size</option>
            {businessSizes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input className="input-field" placeholder="Website" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
          <input className="input-field" placeholder="Other links" value={form.otherLinks} onChange={(event) => setForm({ ...form, otherLinks: event.target.value })} />
          <input className="input-field" placeholder="Ratings" value={form.ratings} onChange={(event) => setForm({ ...form, ratings: event.target.value })} />
          <input className="input-field" placeholder="Score 0-100" value={form.score} onChange={(event) => setForm({ ...form, score: event.target.value })} />
          <select className="input-field" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
            <option value="">Priority</option>
            {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        {createLead.isError ? <p className="mt-3 text-sm text-red-600">{createLead.error instanceof Error ? createLead.error.message : 'Could not create lead.'}</p> : null}
      </section>

      {leads.isLoading ? <p className="text-sm text-[#6f6b63]">Loading leads...</p> : null}
      {leads.isError ? <p className="text-sm text-red-600">Could not load leads.</p> : null}
      <div className="overflow-hidden rounded-lg border border-[#d8d3c8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1ded6] bg-[#faf9f5] px-4 py-3 text-sm">
          <div className="text-[#6f6b63]">
            {selectedLeadIds.size} selected. Select all applies only to the leads visible after filters on this page.
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" disabled={visibleLeadIds.length === 0} onClick={() => {
              setSelectedLeadIds((current) => {
                const next = new Set(current);
                for (const id of visibleLeadIds) next.add(id);
                return next;
              });
            }}>Select visible</button>
            <button className="btn-secondary" disabled={selectedVisibleLeadIds.length === 0} onClick={() => {
              setSelectedLeadIds((current) => {
                const next = new Set(current);
                for (const id of visibleLeadIds) next.delete(id);
                return next;
              });
            }}>Clear visible</button>
            <button className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" disabled={selectedLeadIds.size === 0 || deleteSelectedLeads.isPending} onClick={() => deleteSelectedLeads.mutate()}>
              {deleteSelectedLeads.isPending ? 'Deleting...' : `Delete ${selectedLeadIds.size}`}
            </button>
          </div>
        </div>
        <table className="min-w-full divide-y divide-[#e1ded6] text-sm">
          <thead className="bg-[#f1efe8]">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">
                <input type="checkbox" checked={allVisibleLeadsSelected} onChange={(event) => {
                  setSelectedLeadIds((current) => {
                    const next = new Set(current);
                    for (const id of visibleLeadIds) {
                      if (event.target.checked) next.add(id);
                      else next.delete(id);
                    }
                    return next;
                  });
                }} />
              </th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Batch</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Lead</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Status</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Source</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Priority</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Score</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Location</th>
              <th className="px-4 py-3 text-left font-medium text-[#6f6b63]">Created</th>
              <th className="px-4 py-3 text-right font-medium text-[#6f6b63]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e1ded6] bg-white">
            {leads.data?.data.map((lead) => {
              const batch = lead.importId ? batchById.get(lead.importId) : null;
              return (
                <tr key={lead.id} className="hover:bg-[#faf9f5]">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedLeadIds.has(lead.id)} onChange={(event) => {
                      setSelectedLeadIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(lead.id);
                        else next.delete(lead.id);
                        return next;
                      });
                    }} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#171717]">{batch?.title ?? 'Manual'}</div>
                    <div className="text-xs text-[#8b867c]">{batch ? new Date(batch.createdAt).toLocaleString() : 'Manual batch'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/leads/${lead.id}`} className="font-medium text-[#3157d5]">{lead.name}</Link>
                    <div className="text-xs text-[#6f6b63]">{lead.company || lead.comments || 'No company'}</div>
                    {lead.tags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lead.tags.slice(0, 3).map((tag) => (
                          <span key={tag.id} className="rounded-full border border-[#d8d3c8] px-2 py-0.5 text-[11px] font-medium text-[#6f6b63]">{tag.name}</span>
                        ))}
                        {lead.tags.length > 3 ? <span className="rounded-full border border-[#d8d3c8] px-2 py-0.5 text-[11px] font-medium text-[#6f6b63]">+{lead.tags.length - 3}</span> : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[#45413a]">{lead.status}</td>
                  <td className="px-4 py-3 text-[#6f6b63]">{lead.source || 'Manual'}</td>
                  <td className="px-4 py-3 text-[#6f6b63]">{lead.priority || '-'}</td>
                  <td className="px-4 py-3 text-[#6f6b63]">{lead.score ?? '-'}</td>
                  <td className="px-4 py-3 text-[#6f6b63]">{lead.location || '-'}</td>
                  <td className="px-4 py-3 text-[#8b867c]">{new Date(lead.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                    <Link className="rounded-md border border-[#dedbd3] px-3 py-1 text-xs font-semibold text-[#171717] hover:bg-[#f7f6f2]" to={`/leads/${lead.id}`}>View</Link>
                    <Link className="rounded-md border border-[#171717] bg-[#171717] px-3 py-1 text-xs font-semibold text-white hover:bg-[#2a2a2a]" to={`/leads/${lead.id}?edit=1`}>Edit</Link>
                    <button className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50" disabled={deleteLead.isPending} onClick={() => deleteLead.mutate(lead.id)}>
                      Delete
                    </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {leads.data?.data.length === 0 ? (
              <tr><td className="px-4 py-8 text-center text-[#6f6b63]" colSpan={10}>No leads match this view.</td></tr>
            ) : null}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1ded6] bg-[#faf9f5] px-4 py-3 text-sm text-[#6f6b63]">
          <div>
            {totalLeads !== undefined
              ? `Showing ${pageStart}-${pageEnd} of ${totalLeads} leads`
              : `Showing ${leads.data?.data.length ?? 0} leads`}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" disabled={!canGoPrevious || leads.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
            <span className="min-w-20 text-center font-medium text-[#45413a]">Page {page + 1}</span>
            <button className="btn-secondary" disabled={!canGoNext || leads.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function splitList(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

function externalCrmLeadKey(row: ExternalCrmLeadPreview, index: number) {
  return externalCrmValue(row, 'id') || `${externalCrmValue(row, 'phone') || 'row'}-${index}`;
}

function externalCrmValue(row: ExternalCrmLeadPreview, key: string) {
  const value = row[key];
  if (value === null || typeof value === 'undefined') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function uniqueExternalValues(rows: ExternalCrmLeadPreview[], key: string) {
  return Array.from(new Set(rows.map((row) => externalCrmValue(row, key)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
