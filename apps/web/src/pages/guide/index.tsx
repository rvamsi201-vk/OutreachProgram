const flows = [
  {
    title: '1. Start With Settings',
    body: 'Add server-side keys in .env first, restart the API, then connect WhatsApp or Gmail from Settings. WhatsApp uses Baileys QR. Gmail uses Google OAuth.',
    checks: ['Settings shows WhatsApp CONNECTED before WhatsApp sends work', 'Gmail replies require a connected Gmail account and manual Sync inbox', 'LLM keys stay in .env, never browser settings'],
  },
  {
    title: '2. Add Leads',
    body: 'Import leads from CRM/CSV or add them manually. Leads must have the right contact for the channel you want to use.',
    checks: ['WHATSAPP contact for WhatsApp campaigns', 'EMAIL contact for Gmail sync and email conversations', 'Tags and filters help select the right audience'],
  },
  {
    title: '3. Add Knowledge',
    body: 'Knowledge is the company and product brain for AI agents. Put product details, pricing boundaries, FAQs, allowed claims, and objection handling here.',
    checks: ['Keep facts specific and current', 'Do not put API keys or private credentials in knowledge', 'Attach the knowledge base while creating the agent'],
  },
  {
    title: '4. Create An AI Agent',
    body: 'The agent decides how AI talks to leads. Choose channels, tone, objective, must-collect fields, allowed claims, and restrictions.',
    checks: ['Select WhatsApp for WhatsApp campaigns', 'Select Email for email outreach', 'Add restrictions for legal, pricing, medical, or discount claims'],
  },
  {
    title: '5. Create A Campaign Template',
    body: 'A campaign is a reusable template. It does not send until you start a run. Add channel steps and enable AI personalization when each message should be freshly written.',
    checks: ['Fallback message is used only if AI fails or is not configured', 'Use the field picker for lead/company placeholders', 'Open the template to see previous runs'],
  },
  {
    title: '6. Start A Run',
    body: 'A run is one launch of a template. Choose audience, schedule, sending days, time window, and caps. Always preview before starting.',
    checks: ['Preview shows matched, eligible, excluded, and reason groups', 'Select all applies to the current filtered list', 'Status appears under the campaign after launch'],
  },
  {
    title: '7. Work From Inbox',
    body: 'Inbox combines WhatsApp, SMS, Voice, and Email conversations. Replies are matched to leads by phone or email.',
    checks: ['Manual WhatsApp messages require a connected Baileys account', 'Inbound WhatsApp needs the sender number to match a lead contact', 'Gmail replies appear after Sync inbox'],
  },
  {
    title: '8. Track Usage And Safety',
    body: 'Token Usage shows where AI tokens were spent. Lead detail shows suppression status like OPTED_OUT and DO_NOT_CONTACT.',
    checks: ['Failed AI calls show the error message', 'Suppressed leads are excluded from campaigns', 'Daily contact caps prevent repeated sends to the same lead'],
  },
];

const setupCards = [
  {
    label: 'Demo login after seed',
    value: 'admin@demo.local / Demo@12345',
  },
  {
    label: 'Local URLs',
    value: 'Web: localhost:5173, API: localhost:3000',
  },
  {
    label: 'Seed command',
    value: 'pnpm db:seed',
  },
];

export function UserGuidePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold">User Guide</h1>
        <p className="mt-2 max-w-3xl text-[#6f6a60]">
          Use this page as the operating flow for AI Outreach CRM: connect channels, import leads,
          teach the AI, launch a run, and manage replies from Inbox.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {setupCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-[#ded9cf] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6f6a60]">{card.label}</p>
            <p className="mt-2 break-words text-lg font-semibold">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-[#ded9cf] bg-white">
        <div className="border-b border-[#e7e2d8] p-5">
          <h2 className="text-xl font-semibold">Complete Flow</h2>
          <p className="mt-1 text-sm text-[#6f6a60]">
            Follow these in order when setting up a fresh workspace or explaining the CRM to a new user.
          </p>
        </div>

        <div className="divide-y divide-[#ece7de]">
          {flows.map((flow) => (
            <article key={flow.title} className="grid gap-4 p-5 lg:grid-cols-[280px_1fr]">
              <div>
                <h3 className="text-lg font-semibold">{flow.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#6f6a60]">{flow.body}</p>
              </div>
              <ul className="grid gap-2">
                {flow.checks.map((check) => (
                  <li key={check} className="rounded-md bg-[#f7f6f2] px-4 py-3 text-sm text-[#2b2b27]">
                    {check}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#ded9cf] bg-[#171717] p-5 text-white">
        <h2 className="text-xl font-semibold">Quick Debug Rules</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <p className="rounded-md bg-white/10 p-4 text-sm">If a lead is excluded, open Preview audience and read the exact reason.</p>
          <p className="rounded-md bg-white/10 p-4 text-sm">If WhatsApp replies do not appear, verify the lead contact matches the sender number with country code.</p>
          <p className="rounded-md bg-white/10 p-4 text-sm">If AI uses fallback text, check Token Usage for the failed AI call and fix the .env/model issue.</p>
          <p className="rounded-md bg-white/10 p-4 text-sm">If Gmail replies do not appear, click Sync inbox and confirm the sender email exists on a lead.</p>
        </div>
      </section>
    </div>
  );
}
