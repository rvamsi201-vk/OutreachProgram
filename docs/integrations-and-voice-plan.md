# Integrations And Voice Plan

## Phase 1: Isolation And Settings

Goal: make every organization's external provider credentials tenant-owned, encrypted, and manageable from the app before wiring live providers.

Delivered foundations:

- `organization_integrations` stores per-organization credentials for AI, WhatsApp, SMS, email, voice, STT, and TTS providers.
- Credentials are encrypted server-side and never returned raw to the frontend.
- Settings UI shows masked credential summaries and credential key names only.
- Integration API routes always filter by authenticated `organizationId`.
- New RLS policies cover integrations and voice data tables.
- Voice transcript and agent-turn tables store speech-to-text and text-to-speech metadata under the owning organization.

## Phase 2: Live Providers

Goal: connect the saved credentials to real provider implementations.

Recommended first providers:

- WhatsApp: Meta WhatsApp Cloud API.
- AI: OpenAI Responses API for text and structured outputs.
- Embeddings: OpenAI embeddings for RAG.
- STT: Deepgram Nova or OpenAI transcription, selected per latency and language needs.
- TTS: ElevenLabs for natural outbound voices, with OpenAI TTS as a lower-friction fallback.
- Voice transport: Twilio Voice or Exotel, depending on target geography and phone-number availability.

Phase 2 implementation should add connection tests, webhook verification per provider, provider-specific send/transcribe/synthesize services, and a human-approval mode before AI sends live outbound replies.
