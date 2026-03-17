import React, { useState } from 'react';
import { useAgentStore, type AgentProvider } from '../store/agentStore';

const PROVIDERS: { id: AgentProvider; label: string; description: string }[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', description: 'Direct Anthropic API — claude-* models' },
  { id: 'openai', label: 'OpenAI', description: 'Direct OpenAI API — gpt-* models' },
  { id: 'openrouter', label: 'OpenRouter', description: 'Universal router — любой провайдер через один ключ' },
];

const PROVIDER_LABELS: Record<AgentProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

// Подсказки моделей для каждого провайдера
const MODEL_SUGGESTIONS: Record<AgentProvider, string[]> = {
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  openrouter: [
    'anthropic/claude-sonnet-4-5',
    'anthropic/claude-opus-4-5',
    'openai/gpt-4o',
    'google/gemini-2.0-flash-001',
    'meta-llama/llama-3.3-70b-instruct',
    'deepseek/deepseek-chat-v3-0324',
  ],
};

export function Settings() {
  const {
    apiKeyStatus, networkPolicy, orchestrator,
    saveApiKey, deleteApiKey, setNetworkPolicy, setOrchestratorSettings,
  } = useAgentStore();

  const [keyInputs, setKeyInputs] = useState<Record<AgentProvider, string>>({
    anthropic: '', openai: '', openrouter: '',
  });
  const [orchProvider, setOrchProvider] = useState<AgentProvider>(orchestrator.provider);
  const [orchModel, setOrchModel] = useState(orchestrator.model);

  function handleSaveKey(provider: AgentProvider) {
    const key = keyInputs[provider].trim();
    if (!key) return;
    saveApiKey(provider, key);
    setKeyInputs(prev => ({ ...prev, [provider]: '' }));
  }

  function handleSaveOrchestrator() {
    setOrchestratorSettings(orchProvider, orchModel.trim() || orchestrator.model);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto overflow-y-auto h-full">
      <h2 className="text-base font-semibold mb-6">Settings</h2>

      {/* ── Orchestrator Model ── */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold opacity-70 mb-3 uppercase tracking-wider">Scrum Master Model</h3>
        <p className="text-xs opacity-50 mb-4">
          Выбери провайдера и модель для AI-оркестратора (Scrum Master).
        </p>

        <div
          className="rounded-lg p-4 border space-y-3"
          style={{ borderColor: 'var(--vscode-panel-border)', backgroundColor: 'var(--vscode-input-background)' }}
        >
          <div className="flex gap-2 items-center">
            <label className="text-xs opacity-60 w-20 flex-shrink-0">Provider</label>
            <select
              value={orchProvider}
              onChange={e => {
                const p = e.target.value as AgentProvider;
                setOrchProvider(p);
                setOrchModel(MODEL_SUGGESTIONS[p][0]);
              }}
              className="flex-1 text-sm px-2 py-1 rounded border bg-transparent"
              style={{ borderColor: 'var(--vscode-panel-border)', color: 'var(--vscode-editor-foreground)', backgroundColor: 'var(--vscode-editor-background)' }}
            >
              {PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            {!apiKeyStatus[orchProvider] && (
              <span className="text-xs text-yellow-400 flex-shrink-0">⚠ No key</span>
            )}
          </div>

          <div className="flex gap-2 items-center">
            <label className="text-xs opacity-60 w-20 flex-shrink-0">Model</label>
            <input
              type="text"
              value={orchModel}
              onChange={e => setOrchModel(e.target.value)}
              list="orch-model-suggestions"
              className="flex-1 text-sm px-2 py-1 rounded border bg-transparent"
              style={{ borderColor: 'var(--vscode-panel-border)', color: 'var(--vscode-editor-foreground)', backgroundColor: 'var(--vscode-editor-background)' }}
              placeholder="Название модели..."
              onKeyDown={e => { if (e.key === 'Enter') handleSaveOrchestrator(); }}
            />
            <datalist id="orch-model-suggestions">
              {MODEL_SUGGESTIONS[orchProvider].map(m => <option key={m} value={m} />)}
            </datalist>
          </div>

          <button
            onClick={handleSaveOrchestrator}
            className="text-xs px-3 py-1 rounded"
            style={{ backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
          >
            Save Orchestrator Settings
          </button>

          <p className="text-xs opacity-40 pt-1">
            Текущее: <span className="font-mono">{PROVIDER_LABELS[orchestrator.provider]} / {orchestrator.model}</span>
          </p>
        </div>
      </section>

      {/* ── API Keys ── */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold opacity-70 mb-3 uppercase tracking-wider">API Keys</h3>
        <p className="text-xs opacity-50 mb-4">
          Ключи хранятся в зашифрованном VS Code SecretStorage — никогда не пишутся на диск.
        </p>

        <div className="space-y-4">
          {PROVIDERS.map(({ id, label, description }) => (
            <div
              key={id}
              className="rounded-lg p-4 border"
              style={{ borderColor: 'var(--vscode-panel-border)', backgroundColor: 'var(--vscode-input-background)' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{label}</span>
                {apiKeyStatus[id]
                  ? <span className="text-xs text-green-400">✓ Configured</span>
                  : <span className="text-xs text-gray-400">Not configured</span>
                }
              </div>
              <p className="text-xs opacity-50 mb-3">{description}</p>

              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyInputs[id]}
                  onChange={e => setKeyInputs(prev => ({ ...prev, [id]: e.target.value }))}
                  placeholder={apiKeyStatus[id] ? '••••••••••••••••' : `Enter ${label} API key...`}
                  className="flex-1 text-sm px-2 py-1 rounded bg-transparent outline-none border"
                  style={{ borderColor: 'var(--vscode-panel-border)', backgroundColor: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)' }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveKey(id); }}
                />
                <button
                  onClick={() => handleSaveKey(id)}
                  disabled={!keyInputs[id].trim()}
                  className="text-xs px-3 py-1 rounded disabled:opacity-40"
                  style={{ backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
                >
                  Save
                </button>
                {apiKeyStatus[id] && (
                  <button
                    onClick={() => deleteApiKey(id)}
                    className="text-xs px-3 py-1 rounded opacity-60 hover:opacity-100"
                    style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#f87171' }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Network Policy ── */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold opacity-70 mb-3 uppercase tracking-wider">Network Policy</h3>
        <p className="text-xs opacity-50 mb-4">
          Контролирует, могут ли агенты предлагать установку пакетов.
        </p>

        <div className="space-y-2">
          {[
            { value: 'open', label: 'Open Mode', desc: 'Агенты могут предлагать любые команды, включая npm install, pip install и т.д.' },
            { value: 'strict', label: 'Strict Mode', desc: 'Команды установки пакетов заблокированы. Только команды из whitelist выполняются автоматически.' },
          ].map(({ value, label, desc }) => (
            <label
              key={value}
              className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-white hover:bg-opacity-5"
              style={{
                borderColor: networkPolicy === value ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)',
                backgroundColor: 'var(--vscode-input-background)',
              }}
            >
              <input
                type="radio"
                name="networkPolicy"
                value={value}
                checked={networkPolicy === value}
                onChange={() => setNetworkPolicy(value as 'open' | 'strict')}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs opacity-50">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* ── Info ── */}
      <section className="text-xs opacity-40 pb-8">
        <p>Редактируй <code>.agency/BIBLE.md</code> — контекст проекта для всех агентов.</p>
        <p className="mt-1">Профили агентов — Markdown-файлы в <code>.agency/agents/</code>.</p>
        <p className="mt-1">Для агентов через DirectMessage нажми кнопку <strong>⚙ Model</strong> в шапке чата.</p>
      </section>
    </div>
  );
}
