import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/auth-context.js';
import { ProtectedRoute } from './components/protected-route.js';
import { AppLayout } from './components/layout.js';
import { LoginPage } from './pages/auth/login.js';
import { RegisterPage } from './pages/auth/register.js';
import { DashboardPage } from './pages/dashboard/index.js';
import { LeadsPage } from './pages/leads/index.js';
import { LeadDetailPage } from './pages/leads/detail.js';
import { LeadImportPage } from './pages/leads/import.js';
import { InboxPage } from './pages/inbox/index.js';
import { CampaignsPage } from './pages/campaigns/index.js';
import { NewCampaignPage } from './pages/campaigns/new.js';
import { CampaignDetailPage } from './pages/campaigns/detail.js';
import { NewCampaignRunPage } from './pages/campaigns/run-new.js';
import { AgentsPage } from './pages/agents/index.js';
import { VoiceAgentsPage } from './pages/voice-agents/index.js';
import { KnowledgePage } from './pages/knowledge/index.js';
import { PipelinePage } from './pages/pipeline/index.js';
import { TasksPage } from './pages/tasks/index.js';
import { SettingsPage } from './pages/settings/index.js';
import { TokenUsagePage } from './pages/token-usage/index.js';
import { UserGuidePage } from './pages/guide/index.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/import" element={<LeadImportPage />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/campaigns/new" element={<NewCampaignPage />} />
              <Route path="/campaigns/:id/edit" element={<NewCampaignPage />} />
              <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
              <Route path="/campaigns/:id/runs/new" element={<NewCampaignRunPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/voice-agents" element={<VoiceAgentsPage />} />
              <Route path="/knowledge" element={<KnowledgePage />} />
              <Route path="/pipeline" element={<PipelinePage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/team" element={<PlaceholderPage title="Team" />} />
              <Route path="/token-usage" element={<TokenUsagePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/guide" element={<UserGuidePage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-200">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">
          This page will be implemented in a later phase.
        </p>
      </div>
    </div>
  );
}
