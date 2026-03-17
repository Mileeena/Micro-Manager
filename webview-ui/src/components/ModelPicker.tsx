import React, { useState } from 'react';
import type { AgentProvider } from '../store/agentStore';

const PRESETS: Record<AgentProvider, { label: string; model: string }[]> = {
  anthropic: [
    { label: 'Claude Opus 4.5', model: 'claude-opus-4-5' },
    { label: 'Claude Sonnet 4.5', model: 'claude-sonnet-4-5' },
    { label: 'Claude Haiku 4.5', model: 'claude-haiku-4-5' },
  ],
  openai: [
    { label: 'GPT-4o', model: 'gpt-4o' },
    { label: 'GPT-4o mini', model: 'gpt-4o-mini' },
    { label: 'o3-mini', model: 'o3-mini' },
  ],
  openrouter: [
    { label: 'Claude Sonnet 4.5', model: 'anthropic/claude-sonnet-4-5' },
    { label: 'Claude Opus 4.5', model: 'anthropic/claude-opus-4-5' },
    { label: 'GPT-4o', model: 'openai/gpt-4o' },
    { label: 'Gemini 2.0 Flash', model: 'google/gemini-2.0-flash-001' },
    { label: 'Llama 3.3 70B', model: 'meta-llama/llama-3.3-70b-instruct' },
    { label: 'DeepSeek V3', model: 'deepseek/deepseek-chat-v3-0324' },
  ],
};

interface ModelPickerProps {
  provider: AgentProvider;
  model: string;
  onModelChange: (model: string) => void;
}

export function ModelPicker({ provider, model, onModelChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const presets = PRESETS[provider] ?? [];

  return (
    <div className="relative">
      {/* Input + toggle */}
      <div className="flex gap-1">
        <input
          type="text"
          value={model}
          onChange={e => onModelChange(e.target.value)}
          className="flex-1 text-sm px-2 py-1 rounded border bg-transparent"
          style={{
            borderColor: 'var(--vscode-panel-border)',
            color: 'var(--vscode-editor-foreground)',
            backgroundColor: 'var(--vscode-editor-background)',
          }}
          placeholder="model name..."
        />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="text-xs px-2 py-1 rounded border flex-shrink-0"
          style={{
            borderColor: 'var(--vscode-panel-border)',
            backgroundColor: open ? 'var(--vscode-button-background)' : 'var(--vscode-editor-background)',
            color: open ? 'var(--vscode-button-foreground)' : 'var(--vscode-editor-foreground)',
          }}
          title="Show presets"
        >
          ▾ Presets
        </button>
      </div>

      {/* Dropdown presets */}
      {open && (
        <div
          className="absolute left-0 right-0 mt-1 rounded border shadow-lg z-50"
          style={{
            backgroundColor: 'var(--vscode-editor-background)',
            borderColor: 'var(--vscode-panel-border)',
          }}
        >
          {presets.map(p => (
            <button
              key={p.model}
              type="button"
              onClick={() => { onModelChange(p.model); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-white hover:bg-opacity-10 flex items-center justify-between"
              style={{ color: 'var(--vscode-editor-foreground)' }}
            >
              <span className="font-medium">{p.label}</span>
              <span className="opacity-50 font-mono ml-2 truncate">{p.model}</span>
            </button>
          ))}
          {presets.length === 0 && (
            <div className="px-3 py-2 text-xs opacity-40">No presets for this provider</div>
          )}
        </div>
      )}
    </div>
  );
}
