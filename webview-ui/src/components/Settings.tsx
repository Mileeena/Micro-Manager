import React, { useState } from 'react';
import { useAgentStore, type AgentProvider } from '../store/agentStore';

export function Settings() {
  const { apiKeyStatus, networkPolicy, saveApiKey, deleteApiKey, setNetworkPolicy } = useAgentStore();
  const [keyInputs, setKeyInputs] = useState<Record<AgentProvider, string>>({
    anthropic: '',
    openai: '',
    openrouter: '',
  });

  const PROVIDERS: { id: AgentProvider; label: string; description: string }[] = [
    { id: 'anthropic', label: 'Anthropic (Claude)', description: 'Powers the default Scrum Master and agents' },
    { id: 'openai', label: 'OpenAI', description: 'For agents configured with provider: openai' },
    { id: 'openrouter', label: 'OpenRouter', description: 'Universal router — supports all models' },
  ];

  function handleSave(provider: AgentProvider) {
    const key = keyInputs[provider].trim();
    if (!key) return;
    saveApiKey(provider, key);
    setKeyInputs(prev => ({ ...prev, [provider]: '' }));
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-base font-semibold mb-6">Settings</h2>

      {/* API Keys */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold opacity-70 mb-3 uppercase tracking-wider">API Keys</h3>
        <p className="text-xs opacity-50 mb-4">
          Keys are stored securely in VS Code's encrypted SecretStorage. They are never written to disk or any workspace files.
        </p>

        <div className="space-y-4">
          {PROVIDERS.map(({ id, label, description }) => (
            <div key={id} className="rounded-lg p-4 border" style={{ borderColor: 'var(--vscode-panel-border)', backgroundColor: 'var(--vscode-input-background)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{label}</span>
                {apiKeyStatus[id] ? (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    ✓ Configured
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Not configured</span>
                )}
              </div>
              <p className="text-xs opacity-50 mb-3">{description}</p>

              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyInputs[id]}
                  onChange={e => setKeyInputs(prev => ({ ...prev, [id]: e.target.value }))}
                  placeholder={apiKeyStatus[id] ? '••••••••••••••••' : `Enter ${label} API key...`}
                  className="flex-1 text-sm px-2 py-1 rounded bg-transparent outline-none border"
                  style={{
                    borderColor: 'var(--vscode-panel-border)',
                    backgroundColor: 'var(--vscode-editor-background)',
                    color: 'var(--vscode-editor-foreground)',
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(id); }}
                />
                <button
                  onClick={() => handleSave(id)}
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

      {/* Network Policy */}
      <section>
        <h3 className="text-sm font-semibold opacity-70 mb-3 uppercase tracking-wider">Network Policy</h3>
        <p className="text-xs opacity-50 mb-4">
          Controls whether agents can suggest package installations.
        </p>

        <div className="space-y-2">
          {[
            { value: 'open', label: 'Open Mode', desc: 'Agents can suggest any command including npm install, pip install, etc.' },
            { value: 'strict', label: 'Strict Mode', desc: 'Package installation commands are blocked. Only whitelisted commands run automatically.' },
          ].map(({ value, label, desc }) => (
            <label
              key={value}
              className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-white hover:bg-opacity-5"
              style={{
                borderColor: networkPolicy === value ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)',
                backgroundColor: networkPolicy === value ? 'rgba(var(--vscode-focusBorder), 0.05)' : 'var(--vscode-input-background)',
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

      {/* Info */}
      <section className="mt-8 text-xs opacity-40">
        <p>Edit <code>.agency/BIBLE.md</code> in your workspace to give agents persistent project context.</p>
        <p className="mt-1">Add agent profiles as Markdown files in <code>.agency/agents/</code>.</p>
      </section>
    </div>
  );
}
