import React, { useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAgentStore, type AgentState, type AgentProvider } from '../store/agentStore';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { PixelAgent } from './PixelAgent';

interface DirectMessageProps {
  agent: AgentState;
}

const PROVIDERS: AgentProvider[] = ['anthropic', 'openai', 'openrouter'];

const PROVIDER_LABELS: Record<AgentProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

export function DirectMessage({ agent }: DirectMessageProps) {
  const { dmMessages, streamingContent, sendDmMessage } = useChatStore();
  const { apiKeyStatus, updateAgentSettings } = useAgentStore();

  const [editingModel, setEditingModel] = useState(false);
  const [draftProvider, setDraftProvider] = useState<AgentProvider>(agent.provider);
  const [draftModel, setDraftModel] = useState(agent.model);

  const messages = dmMessages[agent.id] ?? [];
  const isStreaming = !!streamingContent[agent.id];
  const hasApiKey = apiKeyStatus[agent.provider];

  function handleSaveModel() {
    updateAgentSettings(agent.id, draftProvider, draftModel.trim() || agent.model);
    setEditingModel(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: 'var(--vscode-panel-border)' }}
      >
        <PixelAgent seed={agent.avatarSeed} status={agent.status} size={32} />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold">{agent.name}</h2>
          <p className="text-xs opacity-50 truncate">
            {agent.role} · {PROVIDER_LABELS[agent.provider]} ·{' '}
            <span className="font-mono">{agent.model}</span>
          </p>
        </div>
        <button
          onClick={() => { setDraftProvider(agent.provider); setDraftModel(agent.model); setEditingModel(v => !v); }}
          className="text-xs px-2 py-1 rounded opacity-60 hover:opacity-100 flex-shrink-0"
          style={{ backgroundColor: 'var(--vscode-input-background)' }}
          title="Change model"
        >
          ⚙ Model
        </button>
      </div>

      {/* Inline model editor */}
      {editingModel && (
        <div
          className="px-4 py-3 border-b flex flex-col gap-2"
          style={{ borderColor: 'var(--vscode-panel-border)', backgroundColor: 'var(--vscode-input-background)' }}
        >
          <div className="text-xs font-semibold opacity-60 uppercase tracking-wider">Model settings</div>
          <div className="flex gap-2 items-center">
            <label className="text-xs opacity-60 w-16 flex-shrink-0">Provider</label>
            <select
              value={draftProvider}
              onChange={e => setDraftProvider(e.target.value as AgentProvider)}
              className="flex-1 text-xs px-2 py-1 rounded border bg-transparent"
              style={{ borderColor: 'var(--vscode-panel-border)', color: 'var(--vscode-editor-foreground)', backgroundColor: 'var(--vscode-editor-background)' }}
            >
              {PROVIDERS.map(p => (
                <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs opacity-60 w-16 flex-shrink-0">Model</label>
            <input
              type="text"
              value={draftModel}
              onChange={e => setDraftModel(e.target.value)}
              className="flex-1 text-xs px-2 py-1 rounded border bg-transparent"
              style={{ borderColor: 'var(--vscode-panel-border)', color: 'var(--vscode-editor-foreground)', backgroundColor: 'var(--vscode-editor-background)' }}
              placeholder="e.g. anthropic/claude-sonnet-4-5"
              onKeyDown={e => { if (e.key === 'Enter') handleSaveModel(); if (e.key === 'Escape') setEditingModel(false); }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveModel}
              className="text-xs px-3 py-1 rounded"
              style={{ backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
            >
              Save
            </button>
            <button
              onClick={() => setEditingModel(false)}
              className="text-xs px-3 py-1 rounded opacity-60 hover:opacity-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Mission */}
      {agent.mission && (
        <div
          className="px-4 py-2 text-xs opacity-50 border-b italic"
          style={{ borderColor: 'var(--vscode-panel-border)' }}
        >
          Mission: {agent.mission}
        </div>
      )}

      {/* API key warning */}
      {!hasApiKey && (
        <div
          className="mx-4 mt-3 px-3 py-2 rounded text-xs"
          style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          ⚠️ No {PROVIDER_LABELS[agent.provider]} API key configured. Go to <strong>Settings</strong>.
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
