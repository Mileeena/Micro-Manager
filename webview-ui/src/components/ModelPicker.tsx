import React, { useState } from 'react';
import type { AgentProvider } from '../store/agentStore';

interface ModelPreset {
  label: string;
  model: string;
  tag?: string; // short badge shown next to name
}

const PRESETS: Record<AgentProvider, ModelPreset[]> = {
  anthropic: [
    { label: 'Claude Opus 4.5',   model: 'claude-opus-4-5' },
    { label: 'Claude Sonnet 4.5', model: 'claude-sonnet-4-5' },
    { label: 'Claude Haiku 4.5',  model: 'claude-haiku-4-5', tag: 'fast' },
  ],
  openai: [
    { label: 'GPT-4o',      model: 'gpt-4o' },
    { label: 'GPT-4o mini', model: 'gpt-4o-mini', tag: 'cheap' },
    { label: 'o3-mini',     model: 'o3-mini' },
    { label: 'o4-mini',     model: 'o4-mini' },
  ],
  openrouter: [
    // — Anthropic —
    { label: 'Claude Sonnet 4.5',    model: 'anthropic/claude-sonnet-4-5' },
    { label: 'Claude Haiku 3.5',     model: 'anthropic/claude-haiku-3-5',   tag: 'cheap' },
    // — OpenAI —
    { label: 'GPT-4o',               model: 'openai/gpt-4o' },
    { label: 'GPT-4o mini',          model: 'openai/gpt-4o-mini',           tag: 'cheap' },
    // — Google —
    { label: 'Gemini 2.0 Flash',     model: 'google/gemini-2.0-flash-001',  tag: 'fast' },
    { label: 'Gemma 3 27B',          model: 'google/gemma-3-27b-it',        tag: 'cheap' },
    // — DeepSeek —
    { label: 'DeepSeek V3',          model: 'deepseek/deepseek-chat-v3-0324' },
    { label: 'DeepSeek R1',          model: 'deepseek/deepseek-r1',         tag: 'reason' },
    // — Qwen (cheap / fast) —
    { label: 'Qwen2.5 72B',          model: 'qwen/qwen-2.5-72b-instruct',   tag: 'cheap' },
    { label: 'Qwen2.5 Coder 32B',    model: 'qwen/qwen-2.5-coder-32b-instruct', tag: 'code' },
    { label: 'Qwen3 30B A3B',        model: 'qwen/qwen3-30b-a3b',           tag: 'cheap' },
    { label: 'Qwen3 235B A22B',      model: 'qwen/qwen3-235b-a22b',         tag: 'smart' },
    // — Meta Llama —
    { label: 'Llama 3.3 70B',        model: 'meta-llama/llama-3.3-70b-instruct' },
    { label: 'Llama 3.1 8B',         model: 'meta-llama/llama-3.1-8b-instruct',  tag: 'cheap' },
    // — Mistral —
    { label: 'Mistral Small 3.1',    model: 'mistralai/mistral-small-3.1-24b-instruct', tag: 'cheap' },
    { label: 'Mistral 7B',           model: 'mistralai/mistral-7b-instruct', tag: 'cheap' },
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
          className="absolute left-0 right-0 mt-1 rounded border shadow-lg z-50 overflow-y-auto"
          style={{
            maxHeight: '280px',
            backgroundColor: 'var(--vscode-editor-background)',
            borderColor: 'var(--vscode-panel-border)',
          }}
        >
          {presets.map(p => (
            <button
              key={p.model}
              type="button"
              onClick={() => { onModelChange(p.model); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-white hover:bg-opacity-10 flex items-center gap-2"
              style={{ color: 'var(--vscode-editor-foreground)' }}
            >
              <span className="font-medium flex-shrink-0">{p.label}</span>
              {p.tag && (
                <span
                  className="text-xs px-1 py-0 rounded flex-shrink-0"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', opacity: 0.7, fontSize: '0.65rem' }}
                >
                  {p.tag}
                </span>
              )}
              <span className="opacity-30 font-mono ml-auto truncate text-right">{p.model}</span>
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
