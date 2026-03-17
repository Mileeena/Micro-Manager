import React from 'react';
import { useChatStore } from '../store/chatStore';
import { useAgentStore } from '../store/agentStore';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

export function OrchestratorChat() {
  const { orchestratorMessages, streamingContent, sendOrchestratorMessage } = useChatStore();
  const { apiKeyStatus } = useAgentStore();

  const isStreaming = !!streamingContent['orchestrator'];
  const hasApiKey = apiKeyStatus['anthropic'];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--vscode-panel-border)' }}>
        <div className="text-lg">🧠</div>
        <div>
          <h2 className="text-sm font-semibold">Scrum Master</h2>
          <p className="text-xs opacity-50">AI Orchestrator · Breaks requests into Kanban tasks</p>
        </div>
      </div>

      {/* API key warning */}
      {!hasApiKey && (
        <div className="mx-4 mt-3 px-3 py-2 rounded text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
          ⚠️ No Anthropic API key configured. Go to <strong>Settings</strong> to add your key.
        </div>
      )}

      {/* Messages */}
      <MessageList
        messages={orchestratorMessages}
        streamingContent={streamingContent['orchestrator']}
        agentName="Scrum Master"
      />

      {/* Input */}
      <ChatInput
        onSend={sendOrchestratorMessage}
        disabled={isStreaming || !hasApiKey}
        placeholder="Describe what needs to be built... (e.g. 'Add user authentication')"
      />
    </div>
  );
}
