import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api-client.js';

interface ImportStatus {
  id: string;
  title: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  fileName: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  summary: {
    imported?: number;
    cleaned?: number;
    duplicates?: number;
    invalid?: number;
    ready?: number;
    error?: string;
  };
}

type FieldKey =
  | 'name'
  | 'company'
  | 'email'
  | 'phone'
  | 'pitch'
  | 'info'
  | 'comments'
  | 'source'
  | 'status'
  | 'location'
  | 'businessSize'
  | 'website'
  | 'otherLinks'
  | 'ratings'
  | 'score'
  | 'priority'
  | 'timezone'
  | 'tags';

type Mapping = {
  columns: Partial<Record<FieldKey, string>>;
  defaults: Partial<Record<FieldKey, string>>;
};

const TARGET_FIELDS: Array<{ key: FieldKey; label: string; required?: boolean; hint?: string }> = [
  { key: 'name', label: 'Name', required: true, hint: 'Required' },
  { key: 'email', label: 'Email', hint: 'Unique' },
  { key: 'phone', label: 'Phone', hint: 'Unique, auto-cleaned' },
  { key: 'company', label: 'Company' },
  { key: 'pitch', label: 'Pitch' },
  { key: 'info', label: 'Info' },
  { key: 'comments', label: 'Comments' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'businessSize', label: 'Business size' },
  { key: 'website', label: 'Website' },
  { key: 'otherLinks', label: 'Other links' },
  { key: 'ratings', label: 'Ratings' },
  { key: 'score', label: 'Score' },
  { key: 'priority', label: 'Priority' },
  { key: 'timezone', label: 'Timezone' },
  { key: 'tags', label: 'Tags' },
];

const STEPS = ['Upload', 'Map columns', 'Preview', 'Confirm', 'Import'];

export function LeadImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [batchTitle, setBatchTitle] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({ columns: {}, defaults: { source: 'CSV', status: 'NEW' } });
  const [importId, setImportId] = useState('');

  const preview = useMemo(() => file ? { name: file.name, size: Math.max(1, Math.round(file.size / 1024)) } : null, [file]);
  const mappedEnough = Boolean(getMappedPreviewValue('name', rows[0], headers, mapping) || mapping.columns.name)
    && Boolean(mapping.columns.email || mapping.columns.phone || mapping.defaults.email || mapping.defaults.phone);
  const validPreviewRows = rows.filter((row) => {
    const name = getMappedPreviewValue('name', row, headers, mapping);
    const email = getMappedPreviewValue('email', row, headers, mapping);
    const phone = getMappedPreviewValue('phone', row, headers, mapping);
    return name && (email || phone);
  }).length;

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a CSV first');
      if (!mappedEnough) throw new Error('Map Name and at least one unique contact column: Email or Phone');
      const form = new FormData();
      form.append('file', file);
      form.append('title', batchTitle.trim() || file.name.replace(/\.csv$/i, ''));
      form.append('mapping', JSON.stringify(mapping));
      return api.upload<{ importId: string }>('/leads/import', form);
    },
    onSuccess: (data) => setImportId(data.importId),
  });

  const status = useQuery({
    queryKey: ['lead-import', importId],
    queryFn: () => api.get<ImportStatus>(`/leads/import/${importId}`),
    enabled: Boolean(importId),
    refetchInterval: (query) => {
      const value = query.state.data?.status;
      return value === 'COMPLETED' || value === 'FAILED' ? false : 2000;
    },
  });
  const summary = status.data?.summary;
  const currentStatus = status.data?.status ?? (upload.isPending ? 'QUEUED' : 'WAITING');
  const activeStep = importId ? 4 : mappedEnough ? 3 : headers.length > 0 ? 1 : file ? 0 : 0;

  const handleFile = async (nextFile: File | null) => {
    setFile(nextFile);
    setImportId('');
    setHeaders([]);
    setRows([]);
    setMapping({ columns: {}, defaults: { source: 'CSV', status: 'NEW' } });
    if (!nextFile) return;
    const text = await nextFile.text();
    const parsed = parseCsv(text, 50);
    const nextHeaders = parsed[0] ?? [];
    setHeaders(nextHeaders);
    setRows(parsed.slice(1));
    setMapping({ columns: autoMap(nextHeaders), defaults: { source: 'CSV', status: 'NEW' } });
    setBatchTitle(nextFile.name.replace(/\.csv$/i, ''));
  };

  const updateColumn = (key: FieldKey, value: string) => {
    setMapping((current) => ({ ...current, columns: { ...current.columns, [key]: value || undefined } }));
  };

  const updateDefault = (key: FieldKey, value: string) => {
    setMapping((current) => ({ ...current, defaults: { ...current.defaults, [key]: value || undefined } }));
  };

  return (
    <div className="space-y-6 p-8">
      <div>
        <Link to="/leads" className="text-sm text-[#6f6b63] hover:text-[#171717]">Back to leads</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Import Leads</h1>
        <p className="mt-1 text-sm text-[#6f6b63]">Upload any CSV, map it into the lead table, and track the import batch.</p>
      </div>

      <div className="rounded-2xl border border-[#e1ded6] bg-white p-5">
        <div className="grid grid-cols-5 items-center gap-2">
          {STEPS.map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index <= activeStep ? 'bg-[#171717] text-white' : 'bg-[#f1efe8] text-[#6f6b63]'}`}>
                {index + 1}
              </div>
              <div className="min-w-0">
                <div className={`truncate text-sm font-medium ${index <= activeStep ? 'text-[#171717]' : 'text-[#8b867c]'}`}>{step}</div>
              </div>
              {index < STEPS.length - 1 ? <div className={`hidden h-px flex-1 md:block ${index < activeStep ? 'bg-[#171717]' : 'bg-[#e1ded6]'}`} /> : null}
            </div>
          ))}
        </div>
      </div>

      <section className="card">
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <label className="block text-sm font-semibold">
            Import batch title
            <input
              className="input-field mt-2"
              placeholder="September lead import"
              value={batchTitle}
              onChange={(event) => setBatchTitle(event.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold">
            CSV file
            <input
              className="mt-2 block w-full text-sm text-[#45413a] file:mr-4 file:rounded-md file:border-0 file:bg-[#171717] file:px-3 file:py-2 file:text-white"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {preview ? <p className="mt-3 text-sm text-[#6f6b63]">{preview.name} - {preview.size} KB - {headers.length} columns detected - {rows.length} preview rows loaded.</p> : null}
      </section>

      {headers.length > 0 && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6f6b63]">Map columns</h2>
              <p className="mt-1 text-sm text-[#6f6b63]">Choose a CSV column or type a default value. Email and phone are cleaned and deduplicated during import.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${mappedEnough ? 'bg-[#c8ff5f] text-[#171717]' : 'bg-[#ffe3a3] text-[#684b00]'}`}>
              {mappedEnough ? `${validPreviewRows} preview rows ready` : 'Name plus email or phone required'}
            </span>
          </div>
          <div className="mt-5 overflow-hidden rounded-xl border border-[#e1ded6]">
            <div className="grid grid-cols-[1fr_1.25fr_1.25fr] bg-[#f1efe8] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#6f6b63]">
              <div>Lead table field</div>
              <div>CSV column</div>
              <div>Default for all rows</div>
            </div>
            <div className="divide-y divide-[#e1ded6] bg-white">
              {TARGET_FIELDS.map((field) => (
                <div key={field.key} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_1.25fr_1.25fr]">
                  <div>
                    <div className="font-medium text-[#171717]">{field.label}{field.required ? ' *' : ''}</div>
                    {field.hint ? <div className="text-xs text-[#6f6b63]">{field.hint}</div> : null}
                  </div>
                  <select className="input-field" value={mapping.columns[field.key] ?? ''} onChange={(event) => updateColumn(field.key, event.target.value)}>
                    <option value="">No CSV column</option>
                    {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                  <input
                    className="input-field"
                    placeholder={field.key === 'source' ? 'Example: Instagram' : field.key === 'status' ? 'Example: NEW' : 'Optional default'}
                    value={mapping.defaults[field.key] ?? ''}
                    onChange={(event) => updateDefault(field.key, event.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6f6b63]">Preview mapped leads</h2>
          <div className="mt-4 overflow-auto rounded-xl border border-[#e1ded6]">
            <table className="min-w-full text-sm">
              <thead className="bg-[#f1efe8]">
                <tr>
                  {['Name', 'Email', 'Phone', 'Company', 'Source', 'Status', 'Location', 'Comments'].map((header) => (
                    <th key={header} className="whitespace-nowrap px-3 py-2 text-left font-medium">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e1ded6] bg-white">
                {rows.slice(0, 8).map((row, index) => (
                  <tr key={index}>
                    {(['name', 'email', 'phone', 'company', 'source', 'status', 'location', 'comments'] as FieldKey[]).map((field) => (
                      <td key={field} className="max-w-64 truncate px-3 py-2 text-[#45413a]">{cleanPreview(field, getMappedPreviewValue(field, row, headers, mapping)) || '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6f6b63]">Confirm & start</h2>
        <p className="mt-2 text-sm text-[#6f6b63]">This creates one import batch with a timestamp. Duplicate email or phone values are merged into the existing lead instead of creating another lead.</p>
        <button className="btn-primary mt-4" disabled={!file || !mappedEnough || upload.isPending || Boolean(importId)} onClick={() => upload.mutate()}>
          {upload.isPending ? 'Uploading...' : importId ? 'Import started' : 'Start Import'}
        </button>
        {upload.isError ? <p className="mt-3 text-sm text-red-600">{upload.error instanceof Error ? upload.error.message : 'Upload failed.'}</p> : null}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6f6b63]">Import status</h2>
            <p className="mt-2 text-lg font-semibold">{statusLabel(currentStatus)}</p>
            {status.data ? <p className="text-sm text-[#6f6b63]">{status.data.title} - {new Date(status.data.createdAt).toLocaleString()}</p> : null}
          </div>
          <StatusPill status={currentStatus} />
        </div>
        {summary ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <Metric label="Imported" value={summary.imported ?? 0} />
            <Metric label="Cleaned" value={summary.cleaned ?? 0} />
            <Metric label="Duplicates" value={summary.duplicates ?? 0} />
            <Metric label="Invalid" value={summary.invalid ?? 0} />
            <Metric label="Ready" value={summary.ready ?? 0} />
          </div>
        ) : null}
        {summary?.error ? <p className="mt-3 text-sm text-red-600">{summary.error}</p> : null}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#e1ded6] bg-white p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-[#6f6b63]">{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const classes: Record<string, string> = {
    WAITING: 'bg-[#f1efe8] text-[#45413a]',
    QUEUED: 'bg-[#ffe3a3] text-[#684b00]',
    RUNNING: 'bg-[#d9c1ff] text-[#331a55]',
    COMPLETED: 'bg-[#c8ff5f] text-[#171717]',
    FAILED: 'bg-red-100 text-red-700',
  };
  return <span className={`rounded-full px-3 py-1 text-sm font-semibold ${classes[status] ?? classes.WAITING}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: string) {
  return ({
    WAITING: 'Waiting for upload',
    QUEUED: 'Queued',
    RUNNING: 'Importing',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
  } as Record<string, string>)[status] ?? status;
}

function autoMap(headers: string[]) {
  const map: Partial<Record<FieldKey, string>> = {};
  for (const field of TARGET_FIELDS) {
    const match = headers.find((header) => aliases(field.key).some((alias) => normalize(header).includes(alias)));
    if (match) map[field.key] = match;
  }
  return map;
}

function aliases(key: FieldKey) {
  const values: Record<FieldKey, string[]> = {
    name: ['name', 'fullname', 'customername', 'leadname', 'personname', 'businessname'],
    company: ['company', 'business', 'organization', 'organisation', 'brand', 'firm'],
    email: ['email', 'mail', 'emailaddress'],
    phone: ['phone', 'mobile', 'mobilenumber', 'whatsapp', 'contactnumber', 'number', 'telephone', 'cell'],
    pitch: ['pitch', 'offer'],
    info: ['info', 'description', 'about', 'notes'],
    comments: ['comments', 'comment', 'remarks', 'feedback'],
    source: ['source', 'channel', 'origin'],
    status: ['status', 'stage'],
    location: ['location', 'city', 'address', 'area', 'state', 'country'],
    businessSize: ['businesssize', 'size', 'employees', 'team'],
    website: ['website', 'site', 'url', 'domain'],
    otherLinks: ['links', 'otherlinks', 'social', 'instagram', 'linkedin'],
    ratings: ['rating', 'ratings', 'reviews'],
    score: ['score', 'leadscore'],
    priority: ['priority', 'urgency'],
    timezone: ['timezone', 'time'],
    tags: ['tags', 'labels'],
  };
  return values[key];
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getMappedPreviewValue(field: FieldKey, row: string[] | undefined, headers: string[], mapping: Mapping) {
  const header = mapping.columns[field];
  const index = header ? headers.indexOf(header) : -1;
  const value = row && index >= 0 ? row[index]?.trim() ?? '' : '';
  return value || mapping.defaults[field]?.trim() || '';
}

function cleanPreview(field: FieldKey, value: string) {
  if (field === 'phone') return value.replace(/[^\d+]/g, '');
  if (field === 'email') return value.trim().toLowerCase();
  return value;
}

function parseCsv(text: string, maxRows: number) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
      if (rows.length >= maxRows) break;
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}
