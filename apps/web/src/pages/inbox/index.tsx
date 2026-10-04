import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api-client.js';
import type { Conversation, Message } from '../leads/types.js';

const channelTabs = [
  { value: 'ALL', label: 'All' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'SMS', label: 'SMS' },
  { value: 'VOICE', label: 'Voice' },
  { value: 'EMAIL', label: 'Email' },
] as const;

type ChannelTab = (typeof channelTabs)[number]['value'];

const channelDescriptions: Record<ChannelTab, string> = {
  ALL: 'Every client conversation in one queue',
  WHATSAPP: 'Baileys WhatsApp messages and AI replies',
  SMS: 'Text conversations from SMS providers',
  VOICE: 'Call conversations, transcripts, and voice handoffs',
  EMAIL: 'Email replies and outbound threads',
};

export function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedChannel, setSelectedChannel] = useState<ChannelTab>('ALL');
  const [selectedId, setSelectedId] = useState('');
  const [content, setContent] = useState('');

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<{ data: Conversation[] }>('/conversations'),
    refetchInterval: 7000,
  });
  const allConversations = conversations.data?.data ?? [];
  const filteredConversations = useMemo(() => (
    selectedChannel === 'ALL'
      ? allConversations
      : allConversations.filter((conversation) => conversation.channel === selectedChannel)
  ), [allConversations, selectedChannel]);
  const channelCounts = useMemo(() => allConversations.reduce<Record<string, number>>((counts, conversation) => {
    counts.ALL = (counts.ALL ?? 0) + 1;
    counts[conversation.channel] = (counts[conversation.channel] ?? 0) + 1;
    return counts;
  }, { ALL: 0 }), [allConversations]);

  useEffect(() => {
    if (selectedId && filteredConversations.some((conversation) => conversation.id === selectedId)) return;
    setSelectedId(filteredConversations[0]?.id ?? '');
  }, [filteredConversations, selectedId]);

  const selected = allConversations.find((item) => item.id === selectedId);
  const messages = useQuery({
    queryKey: ['conversation-messages', selectedId],
    queryFn: () => api.get<{ data: Message[] }>(`/conversations/${selectedId}/messages`),
    enabled: Boolean(selectedId),
    refetchInterval: 7000,
  });
  const reply = useMutation({
    mutationFn: () => api.post(`/conversations/${selectedId}/messages`, { content }),
    onSuccess: () => {
      setContent('');
      void queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  return (
    <div className="flex h-full min-h-screen">
      <aside className="w-80 border-r border-gray-800 bg-gray-950">
        <div className="border-b border-gray-800 p-4">
          <h1 className="text-xl font-semibold">Inbox</h1>
          <p className="text-sm text-gray-500">{channelDescriptions[selectedChannel]}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {channelTabs.map((tab) => (
              <button
                key={tab.value}
                className={`rounded-md border px-3 py-2 text-left text-sm ${selectedChannel === tab.value ? 'border-brand-600 bg-brand-600 text-black' : 'border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800'}`}
                onClick={() => setSelectedChannel(tab.value)}
              >
                <span className="block font-medium">{tab.label}</span>
                <span className="text-xs opacity-70">{channelCounts[tab.value] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {conversations.isLoading ? <p className="p-4 text-sm text-gray-500">Loading conversations...</p> : null}
          {filteredConversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`block w-full px-4 py-3 text-left hover:bg-gray-900 ${conversation.id === selectedId ? 'bg-gray-900' : ''}`}
              onClick={() => setSelectedId(conversation.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-gray-200">{conversation.leadName}</span>
                {conversation.unreadCount ? <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs">{conversation.unreadCount}</span> : null}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>{channelLabel(conversation.channel)}</span>
                <span>{conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleTimeString() : 'New'}</span>
              </div>
            </button>
          ))}
          {!conversations.isLoading && filteredConversations.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No {selectedChannel === 'ALL' ? '' : `${channelLabel(selectedChannel).toLowerCase()} `}conversations yet.</p>
          ) : null}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <header className="border-b border-gray-800 p-4">
              <h2 className="text-lg font-semibold">{selected.leadName}</h2>
              <p className="text-sm text-gray-500">{selected.leadCompany || 'No company'} - {channelLabel(selected.channel)}</p>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.isLoading ? <p className="text-sm text-gray-500">Loading messages...</p> : null}
              {messages.isError ? <p className="text-sm text-red-400">Could not load messages.</p> : null}
              {messages.data?.data.map((message) => (
                <div key={message.id} className={`flex ${message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xl rounded-lg px-4 py-3 text-sm ${message.direction === 'OUTBOUND' ? 'bg-brand-700 text-white' : 'bg-gray-900 text-gray-200'}`}>
                    <div>{message.content}</div>
                    <div className="mt-1 text-xs opacity-70">{message.senderType} - {new Date(message.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {messages.data?.data.length === 0 ? <p className="text-sm text-gray-500">No messages yet. Send the first reply request.</p> : null}
            </div>
            <footer className="border-t border-gray-800 p-4">
              <div className="flex gap-3">
                <textarea
                  className="input-field min-h-20 flex-1"
                  placeholder={selected.channel === 'VOICE' ? 'Voice replies are logged here. Use a voice provider flow to call back.' : `Type ${channelLabel(selected.channel).toLowerCase()} reply...`}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  disabled={selected.channel === 'VOICE'}
                />
                <button className="btn-primary self-end" disabled={selected.channel === 'VOICE' || !content.trim() || reply.isPending} onClick={() => reply.mutate()}>Send</button>
              </div>
              {reply.isError ? (
                <p className="mt-2 text-sm text-red-600">
                  {reply.error instanceof Error ? reply.error.message : 'Could not send this message.'}
                </p>
              ) : null}
            </footer>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500">Select a conversation.</div>
        )}
      </main>
    </div>
  );
}

function channelLabel(channel: string) {
  switch (channel) {
    case 'WHATSAPP':
      return 'WhatsApp';
    case 'SMS':
      return 'SMS';
    case 'VOICE':
      return 'Voice';
    case 'EMAIL':
      return 'Email';
    default:
      return channel;
  }
}
