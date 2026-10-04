import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';

type Category = 'AI' | 'WHATSAPP' | 'SMS' | 'EMAIL' | 'VOICE' | 'STT' | 'TTS';

interface Integration {
  id: string;
  name: string;
  category: Category;
  provider: string;
  isDefault: boolean;
  enabled: boolean;
  configuration: Record<string, unknown>;
  credentials: Record<string, string>;
  credentialKeys: string[];
  lastTestStatus: string | null;
  updatedAt: string;
}

interface ChannelAccount {
  id: string;
  name: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  provider: string;
  isDefault: boolean;
}

interface BaileysStatus {
  status: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED' | 'ERROR';
  qrDataUrl?: string;
  phoneNumber?: string;
  lastError?: string;
}

const CATEGORIES: Category[] = ['WHATSAPP', 'VOICE', 'STT', 'TTS', 'SMS', 'EMAIL'];
const SELECTED_WHATSAPP_STORAGE_KEY = 'ai-crm.selectedWhatsAppAccountId';

const PROVIDER_HINTS: Record<Category, string> = {
  AI: 'openai',
  WHATSAPP: 'baileys',
  SMS: 'twilio',
  EMAIL: 'sendgrid',
  VOICE: 'twilio_voice',
  STT: 'deepgram',
  TTS: 'elevenlabs',
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: 'baileys integration',
    category: 'WHATSAPP' as Category,
    provider: 'baileys',
    isDefault: true,
    enabled: true,
    credentialsText: '',
    configurationText: '{\n  "provider": "baileys"\n}',
  });
  const [whatsappName, setWhatsappName] = useState('Primary WhatsApp');
  const [selectedWhatsAppId, setSelectedWhatsAppId] = useState<string | null>(() => localStorage.getItem(SELECTED_WHATSAPP_STORAGE_KEY));
  const [syncingGmailId, setSyncingGmailId] = useState<string | null>(null);

  const integrations = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get<{ data: Integration[] }>('/integrations'),
  });
  const channelAccounts = useQuery({
    queryKey: ['channel-accounts'],
    queryFn: () => api.get<{ data: ChannelAccount[] }>('/channel-accounts'),
  });
  const whatsAppAccounts = (channelAccounts.data?.data ?? []).filter((account) => account.channel === 'WHATSAPP' && account.provider.toLowerCase() === 'baileys');
  const gmailAccounts = (channelAccounts.data?.data ?? []).filter((account) => account.channel === 'EMAIL' && account.provider.toLowerCase() === 'gmail_oauth');
  const selectedWhatsApp = whatsAppAccounts.find((account) => account.id === selectedWhatsAppId);
  const whatsappStatus = useQuery({
    queryKey: ['baileys-status', selectedWhatsAppId],
    queryFn: () => api.get<BaileysStatus>(`/channel-accounts/${selectedWhatsAppId}/baileys/status`),
    enabled: Boolean(selectedWhatsAppId),
    refetchInterval: 3_000,
  });
  const createWhatsApp = useMutation({
    mutationFn: () => api.post<ChannelAccount>('/channel-accounts', { name: whatsappName, channel: 'WHATSAPP', provider: 'baileys', isDefault: true, configuration: {}, credentials: {} }),
    onSuccess: (account) => {
      selectWhatsAppAccount(account.id);
      void queryClient.invalidateQueries({ queryKey: ['channel-accounts'] });
    },
  });
  const connectWhatsApp = useMutation({
    mutationFn: () => api.post<BaileysStatus>(`/channel-accounts/${selectedWhatsAppId}/baileys/connect`),
    onSuccess: (status) => queryClient.setQueryData(['baileys-status', selectedWhatsAppId], status),
  });
  const disconnectWhatsApp = useMutation({
    mutationFn: () => api.post<BaileysStatus>(`/channel-accounts/${selectedWhatsAppId}/baileys/disconnect`),
    onSuccess: (status) => queryClient.setQueryData(['baileys-status', selectedWhatsAppId], status),
  });
  const connectGmail = useMutation({
    mutationFn: () => api.get<{ url: string }>('/channel-accounts/gmail/oauth/url'),
    onSuccess: (result) => {
      window.location.href = result.url;
    },
  });
  const syncGmail = useMutation({
    mutationFn: (id: string) => api.post<{ imported: number; unmatched: number; scanned: number }>(`/channel-accounts/${id}/gmail/sync`),
    onMutate: (id) => setSyncingGmailId(id),
    onSettled: () => setSyncingGmailId(null),
  });

  useEffect(() => {
    if (whatsAppAccounts.length === 0) {
      if (selectedWhatsAppId) selectWhatsAppAccount(null);
      return;
    }
    if (selectedWhatsAppId && whatsAppAccounts.some((account) => account.id === selectedWhatsAppId)) return;
    const defaultAccount = whatsAppAccounts.find((account) => account.isDefault) ?? whatsAppAccounts[0];
    selectWhatsAppAccount(defaultAccount?.id ?? null);
  }, [selectedWhatsAppId, whatsAppAccounts]);

  function selectWhatsAppAccount(accountId: string | null) {
    setSelectedWhatsAppId(accountId);
    if (accountId) localStorage.setItem(SELECTED_WHATSAPP_STORAGE_KEY, accountId);
    else localStorage.removeItem(SELECTED_WHATSAPP_STORAGE_KEY);
  }

  const grouped = useMemo(() => {
    const map = new Map<Category, Integration[]>();
    for (const category of CATEGORIES) map.set(category, []);
    for (const integration of integrations.data?.data ?? []) {
      map.get(integration.category)?.push(integration);
    }
    return map;
  }, [integrations.data?.data]);

  const save = useMutation({
    mutationFn: () => api.post('/integrations', {
      name: form.name,
      category: form.category,
      provider: form.provider,
      isDefault: form.isDefault,
      enabled: form.enabled,
      credentials: parseKeyValue(form.credentialsText),
      configuration: parseJson(form.configurationText),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const handleCategory = (category: Category) => {
    setForm({
      ...form,
      category,
      provider: PROVIDER_HINTS[category],
      name: `${PROVIDER_HINTS[category]} integration`,
      credentialsText: defaultCredentials(category),
      configurationText: defaultConfiguration(category),
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Store channel provider credentials with encrypted server-side storage. LLM API keys are server-only in .env.
        </p>
      </div>

      <section className="rounded-lg border border-gray-300 bg-white p-5">
        <h2 className="font-semibold">LLM API</h2>
        <p className="mt-1 text-sm text-gray-500">Configured only on the API server with .env variables. The key is never entered in this UI or sent to the browser.</p>
        <div className="mt-3 rounded-md bg-gray-100 p-3 font-mono text-sm text-gray-700">LLM_PROVIDER=openai-compatible<br />OPENAI_API_KEY=your_openrouter_key_here<br />LLM_BASE_URL=https://openrouter.ai/api/v1<br />LLM_CHAT_MODEL=openrouter/free<br />LLM_EMBEDDING_MODEL=local-hash</div>
        <p className="mt-2 text-xs text-gray-500">After changing these values, restart the API/dev server. Otherwise the running API keeps using the old environment and AI messages fall back to the template.</p>
      </section>

      <section className="rounded-lg border border-gray-300 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">WhatsApp with Baileys</h2>
            <p className="mt-1 text-sm text-gray-500">Connect one WhatsApp Web session for this organization. Session keys are encrypted and isolated by organization.</p>
          </div>
          {whatsappStatus.data && <span className={`rounded px-2 py-1 text-xs font-semibold ${whatsappStatus.data.status === 'CONNECTED' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{whatsappStatus.data.status}</span>}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          {whatsAppAccounts.length > 0
            ? <select className="input-field" value={selectedWhatsAppId ?? ''} onChange={(event) => selectWhatsAppAccount(event.target.value || null)}><option value="">Select WhatsApp account</option>{whatsAppAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.isDefault ? ' (default)' : ''}</option>)}</select>
            : <input className="input-field" value={whatsappName} onChange={(event) => setWhatsappName(event.target.value)} placeholder="Account name" />}
          {whatsAppAccounts.length === 0
            ? <button className="btn-primary" disabled={!whatsappName.trim() || createWhatsApp.isPending} onClick={() => createWhatsApp.mutate()}>{createWhatsApp.isPending ? 'Creating...' : 'Create Account'}</button>
            : <div className="flex gap-2"><button className="btn-primary" disabled={!selectedWhatsAppId || connectWhatsApp.isPending || whatsappStatus.data?.status === 'CONNECTED'} onClick={() => connectWhatsApp.mutate()}>{connectWhatsApp.isPending ? 'Connecting...' : 'Connect'}</button><button className="btn-secondary" disabled={!selectedWhatsAppId || disconnectWhatsApp.isPending} onClick={() => disconnectWhatsApp.mutate()}>Disconnect</button></div>}
        </div>
        {selectedWhatsApp && <p className="mt-3 text-sm text-gray-600">Selected account: {selectedWhatsApp.name}</p>}
        {whatsappStatus.data?.phoneNumber && <p className="mt-3 text-sm text-gray-600">Connected number: {whatsappStatus.data.phoneNumber}</p>}
        {whatsappStatus.data?.lastError && <p className="mt-3 text-sm text-red-600">{whatsappStatus.data.lastError}</p>}
        {whatsappStatus.data?.qrDataUrl && <div className="mt-4 flex flex-wrap items-center gap-5 rounded-lg bg-gray-100 p-4"><img className="h-64 w-64 bg-white" src={whatsappStatus.data.qrDataUrl} alt="WhatsApp pairing QR code" /><div className="max-w-sm text-sm text-gray-600"><div className="font-semibold text-gray-900">Scan with WhatsApp</div><p className="mt-1">Open WhatsApp on your phone, choose Linked devices, then Link a device. This QR is temporary and is never written to the database.</p></div></div>}
      </section>

      <section className="rounded-lg border border-gray-300 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Gmail OAuth</h2>
            <p className="mt-1 text-sm text-gray-500">Connect Gmail for email outreach and inbox sync. OAuth tokens are stored encrypted server-side.</p>
          </div>
          <button className="btn-primary" disabled={connectGmail.isPending} onClick={() => connectGmail.mutate()}>
            {connectGmail.isPending ? 'Opening Google...' : 'Connect Gmail'}
          </button>
        </div>
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <div className="font-semibold text-gray-900">Google setup checklist</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Open Google Cloud Console and create/select a project.</li>
            <li>Enable the Gmail API for that project.</li>
            <li>Configure the OAuth consent screen and add your test Gmail user while testing.</li>
            <li>Create an OAuth Client ID with type Web application.</li>
            <li>Add this authorized redirect URI: <span className="font-mono text-gray-900">http://localhost:3000/api/channel-accounts/gmail/oauth/callback</span></li>
            <li>Copy the Client ID and Client Secret into the API <span className="font-mono">.env</span>, then restart the API.</li>
          </ol>
          <div className="mt-3 rounded bg-white p-3 font-mono text-xs text-gray-700">
            GOOGLE_CLIENT_ID=your_google_client_id<br />
            GOOGLE_CLIENT_SECRET=your_google_client_secret<br />
            GOOGLE_OAUTH_REDIRECT_URL=http://localhost:3000/api/channel-accounts/gmail/oauth/callback
          </div>
        </div>
        <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {gmailAccounts.map((account) => (
            <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div>
                <div className="font-medium">{account.name}</div>
                <div className="text-gray-500">{account.isDefault ? 'Default email account' : 'Connected email account'}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">CONNECTED</span>
                <button className="btn-secondary" disabled={syncGmail.isPending && syncingGmailId === account.id} onClick={() => syncGmail.mutate(account.id)}>
                  {syncGmail.isPending && syncingGmailId === account.id ? 'Syncing...' : 'Sync inbox'}
                </button>
              </div>
            </div>
          ))}
          {gmailAccounts.length === 0 ? <div className="p-3 text-sm text-gray-500">No Gmail account connected yet.</div> : null}
        </div>
        {connectGmail.isError ? <p className="mt-3 text-sm text-red-600">{connectGmail.error instanceof Error ? connectGmail.error.message : 'Could not start Gmail OAuth.'}</p> : null}
        {syncGmail.data ? <p className="mt-3 text-sm text-green-700">Gmail sync scanned {syncGmail.data.scanned}, imported {syncGmail.data.imported}, unmatched {syncGmail.data.unmatched}.</p> : null}
        {syncGmail.isError ? <p className="mt-3 text-sm text-red-600">{syncGmail.error instanceof Error ? syncGmail.error.message : 'Could not sync Gmail inbox.'}</p> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          {CATEGORIES.map((category) => (
            <div key={category} className="rounded-lg border border-gray-800">
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                <div>
                  <h2 className="font-medium">{category}</h2>
                  <p className="text-xs text-gray-500">{categoryHelp(category)}</p>
                </div>
                <button className="btn-secondary" onClick={() => handleCategory(category)}>
                  Add
                </button>
              </div>
              <div className="divide-y divide-gray-800">
                {(grouped.get(category) ?? []).map((integration) => (
                  <div key={integration.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{integration.name}</span>
                        {integration.isDefault && <span className="rounded bg-brand-600/20 px-2 py-0.5 text-xs text-brand-300">Default</span>}
                        <span className={`rounded px-2 py-0.5 text-xs ${integration.enabled ? 'bg-green-900/30 text-green-300' : 'bg-gray-800 text-gray-400'}`}>
                          {integration.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-500">{integration.provider}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                        {integration.credentialKeys.map((key) => (
                          <span key={key} className="rounded border border-gray-800 px-2 py-1">
                            {key}: {integration.credentials[key]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <div>{integration.lastTestStatus ?? 'Not tested'}</div>
                      <div>{new Date(integration.updatedAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
                {(grouped.get(category) ?? []).length === 0 && (
                  <div className="p-4 text-sm text-gray-500">No integration saved.</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <form
          className="space-y-4 rounded-lg border border-gray-800 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div>
            <h2 className="font-medium">Add Integration</h2>
            <p className="mt-1 text-xs text-gray-500">
              Secrets are sent once, encrypted by the API, and shown back only as masked values.
            </p>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-gray-400">Category</span>
            <select className="input-field" value={form.category} onChange={(event) => handleCategory(event.target.value as Category)}>
              {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-gray-400">Name</span>
            <input className="input-field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-gray-400">Provider</span>
            <input className="input-field" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })} />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-gray-400">Credentials</span>
            <textarea
              className="input-field min-h-28 font-mono"
              value={form.credentialsText}
              onChange={(event) => setForm({ ...form, credentialsText: event.target.value })}
              placeholder="apiKey=sk-..."
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-gray-400">Configuration JSON</span>
            <textarea
              className="input-field min-h-28 font-mono"
              value={form.configurationText}
              onChange={(event) => setForm({ ...form, configurationText: event.target.value })}
            />
          </label>

          <div className="flex gap-4 text-sm text-gray-300">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
              Default
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
              Enabled
            </label>
          </div>

          {save.error && (
            <div className="rounded border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
              {save.error instanceof Error ? save.error.message : 'Could not save integration'}
            </div>
          )}

          <button className="btn-primary w-full" disabled={save.isPending}>
            {save.isPending ? 'Saving...' : 'Save Integration'}
          </button>
        </form>
      </section>
    </div>
  );
}

function parseKeyValue(value: string) {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=');
        if (index === -1) return [line, ''];
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
      .filter(([key, secret]) => key && secret),
  );
}

function parseJson(value: string) {
  return value.trim() ? JSON.parse(value) as Record<string, unknown> : {};
}

function categoryHelp(category: Category) {
  const help: Record<Category, string> = {
    AI: 'LLM and embedding providers such as OpenAI.',
    WHATSAPP: 'Baileys WhatsApp Web connection or another WhatsApp provider.',
    SMS: 'SMS providers for outbound and inbound text messaging.',
    EMAIL: 'Email providers for campaign sending and inbound events.',
    VOICE: 'Call control providers such as Twilio Voice or Exotel.',
    STT: 'Speech-to-text transcription providers.',
    TTS: 'Text-to-speech voice generation providers.',
  };
  return help[category];
}

function defaultCredentials(category: Category) {
  const defaults: Record<Category, string> = {
    AI: 'apiKey=',
    WHATSAPP: '',
    SMS: 'accountSid=\nauthToken=\nfromNumber=',
    EMAIL: 'apiKey=\nfromEmail=',
    VOICE: 'accountSid=\nauthToken=\nfromNumber=',
    STT: 'apiKey=',
    TTS: 'apiKey=\nvoiceId=',
  };
  return defaults[category];
}

function defaultConfiguration(category: Category) {
  const defaults: Record<Category, string> = {
    AI: '{\n  "model": "gpt-4.1-mini",\n  "embeddingModel": "text-embedding-3-small"\n}',
    WHATSAPP: '{\n  "provider": "baileys"\n}',
    SMS: '{}',
    EMAIL: '{}',
    VOICE: '{\n  "recordingEnabled": true,\n  "disclosureText": "This call may be recorded and handled by an AI assistant for quality and follow-up."\n}',
    STT: '{\n  "model": "nova-3",\n  "language": "multi"\n}',
    TTS: '{\n  "model": "eleven_multilingual_v2"\n}',
  };
  return defaults[category];
}
