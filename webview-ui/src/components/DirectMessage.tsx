import React from 'react';
import { useChatStore } from '../store/chatStore';
import { useAgentStore, type AgentState } from '../store/agentStore';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { PixelAgent } from './PixelAgent';

interface DirectMessageProps {
  agent: AgentState;
}

export function DirectMessage({ agent }: DirectMessageProps) {
  const { dmMessages, streamingContent, sendDmMessage } = useChatStore();
  const { apiKeyStatus } = useAgentStore();

  const messages = dmMessages[agent.id] ?? [];
  const isStreaming = !!streamingContent[agent.id];
  const hasApiKey = apiKeyStatus[agent.provider];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--vscode-panel-border)' }}>
        <PixelAgent seed={agent.avatarSeed} status={agent.status} size={32} />
        <div>
          <h2 className="text-sm font-semibold">{agent.name}</h2>
          <p className="text-xs opacity-50">{agent.role} · {agent.status}</p>
        </div>
        {agent.currentTaskId && (
          <span className="ml-auto text-xs opacity-50">Working on task...</span>
        )}
      </div>

      {/* Mission */}
      {agent.mission && (
        <div className="px-4 py-2 text-xs opacity-50 border-b italic" style={{ borderColor: 'var(--vscode-panel-border)' }}>
          Mission: {agent.mission}
        </div>
      )}

      {!hasApiKey && (
        <div className="mx-4 mt-3 px-3 py-2 rounded text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
          ⚠️ No {agent.provider} API key configured. Go to Settings.
        </div>
      )}

      {/* Messages */}
      <MessageList
        messages={messages}
        streamingContent={streamingContent[agent.id]}
        agentName={agent.name}
      />

      {/* Input */}
      <ChatInput
        onSend={(content) => sendDmMessage(agent.id, content)}
        disabled={isStreaming || !hasApiKey}
        placeholder={`Message ${agent.name}...`}
      />
    </div>
  );
}
