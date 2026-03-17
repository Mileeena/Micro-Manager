import React, { useState } from 'react';
import { useAgentStore, type AgentProvider } from '../store/agentStore';
import { ModelPicker } from './ModelPicker';

interface AgentTemplate {
  emoji: string;
  name: string;
  role: string;
  mission: string;
  defaultProvider: AgentProvider;
  defaultModel: string;
}

// Шаблоны в стиле msitarzewski/agency-agents
const TEMPLATES: AgentTemplate[] = [
  {
    emoji: '💻',
    name: 'Developer',
    role: 'Full-Stack Developer',
    mission: 'Implement features and fix bugs. Write clean, tested code following the project coding standards.',
    defaultProvider: 'openrouter',
    defaultModel: 'anthropic/claude-sonnet-4-5',
  },
  {
    emoji: '🔧',
    name: 'Backend Engineer',
    role: 'Backend Engineer',
    mission: 'Design and build APIs, services, and databases. Focus on performance, security, and scalability.',
    defaultProvider: 'openrouter',
    defaultModel: 'anthropic/claude-sonnet-4-5',
  },
  {
    emoji: '🎨',
    name: 'Frontend Developer',
    role: 'Frontend Developer',
    mission: 'Build UI components and pages. Focus on UX, accessibility, and performance.',
    defaultProvider: 'openrouter',
    defaultModel: 'openai/gpt-4o',
  },
  {
    emoji: '🚀',
    name: 'DevOps',
    role: 'DevOps Engineer',
    mission: 'Manage CI/CD pipelines, infrastructure, containers, and deployments. Keep things running.',
    defaultProvider: 'openrouter',
    defaultModel: 'anthropic/claude-sonnet-4-5',
  },
  {
    emoji: '🧪',
    name: 'QA Engineer',
    role: 'QA Engineer',
    mission: 'Write and run tests. Find bugs before users do. Ensure code quality and coverage.',
    defaultProvider: 'openrouter',
    defaultModel: 'openai/gpt-4o-mini',
  },
  {
    emoji: '🔍',
    name: 'Code Reviewer',
    role: 'Senior Code Reviewer',
    mission: 'Review pull requests for quality, security, and best practices. Give actionable feedback.',
    defaultProvider: 'openrouter',
    defaultModel: 'anthropic/claude-opus-4-5',
  },
  {
    emoji: '📊',
    name: 'Data Analyst',
    role: 'Data Analyst',
    mission: 'Analyze data, write queries, and produce insights. Build dashboards and reports.',
    defaultProvider: 'openrouter',
    defaultModel: 'google/gemini-2.0-flash-001',
  },
  {
    emoji: '✍️',
    name: 'Tech Writer',
    role: 'Technical Writer',
    mission: 'Write documentation, READMEs, API docs, and guides. Make complex things understandable.',
    defaultProvider: 'openrouter',
    defaultModel: 'openai/gpt-4o',
  },
];

interface CreateAgentPanelProps {
  onClose: () => void;
}

export function CreateAgentPanel({ onClose }: CreateAgentPanelProps) {
  const { createAgent } = useAgentStore();
  const [selected, setSelected] = useState<AgentTemplate | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [mission, setMission] = useState('');
  const [provider, setProvider] = useState<AgentProvider>('openrouter');
  const [model, setModel] = useState('anthropic/claude-sonnet-4-5');
  const [isCustom, setIsCustom] = useState(false);

  function pickTemplate(t: AgentTemplate) {
    setSelected(t);
    setName(t.name);
    setRole(t.role);
    setMission(t.mission);
    setProvider(t.defaultProvider);
    setModel(t.defaultModel);
    setIsCustom(false);
  }

  function handleCreate() {
    if (!name.trim()) return;
    createAgent(name.trim(), role.trim(), mission.trim(), provider, model);
    onClose();
  }

  const PROVIDER_LABELS: Record<AgentProvider, string> = {
    anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter',
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--vscode-panel-border)' }}
      >
        <h2 className="text-sm font-semibold">Add Agent</h2>
        <button onClick={onClose} className="text-xs opacity-60 hover:opacity-100 px-2 py-1">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Template grid */}
        <div>
          <div className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-2">
            Choose a template
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map(t => (
              <button
                key={t.name}
                onClick={() => pickTemplate(t)}
                className="flex items-center gap-2 p-2 rounded border text-left hover:bg-white hover:bg-opacity-5 transition-colors"
                style={{
                  borderColor: selected?.name === t.name ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)',
                  backgroundColor: selected?.name === t.name ? 'rgba(255,255,255,0.05)' : 'var(--vscode-input-background)',
                }}
              >
                <span className="text-base">{t.emoji}</span>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{t.name}</div>
                  <div className="text-xs opacity-40 truncate">{t.role}</div>
                </div>
              </button>
            ))}
            <button
              onClick={() => { setIsCustom(true); setSelected(null); setName(''); setRole(''); setMission(''); }}
              className="flex items-center gap-2 p-2 rounded border text-left hover:bg-white hover:bg-opacity-5"
              style={{
                borderColor: isCustom ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)',
                backgroundColor: 'var(--vscode-input-background)',
              }}
            >
              <span className="text-base">✨</span>
              <div>
                <div className="text-xs font-medium">Custom</div>
                <div className="text-xs opacity-40">From scratch</div>
              </div>
            </button>
          </div>
        </div>

        {/* Config form — shown when template selected or custom */}
        {(selected || isCustom) && (
          <div className="space-y-3 border rounded-lg p-4" style={{ borderColor: 'var(--vscode-panel-border)' }}>
            <div className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-1">Configure</div>

            {[
              { label: 'Name', value: name, set: setName, placeholder: 'Agent name...' },
              { label: 'Role', value: role, set: setRole, placeholder: 'e.g. Senior Backend Engineer' },
            ].map(f => (
              <div key={f.label} className="flex gap-2 items-center">
                <label className="text-xs opacity-60 w-16 flex-shrink-0">{f.label}</label>
                <input
                  type="text"
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  className="flex-1 text-xs px-2 py-1 rounded border bg-transparent"
                  style={{ borderColor: 'var(--vscode-panel-border)', color: 'var(--vscode-editor-foreground)', backgroundColor: 'var(--vscode-editor-background)' }}
                />
              </div>
            ))}

            <div className="flex gap-2 items-start">
              <label className="text-xs opacity-60 w-16 flex-shrink-0 mt-1">Mission</label>
              <textarea
                value={mission}
                onChange={e => setMission(e.target.value)}
                rows={3}
                placeholder="Describe what this agent does..."
                className="flex-1 text-xs px-2 py-1 rounded border bg-transparent resize-none"
                style={{ borderColor: 'var(--vscode-panel-border)', color: 'var(--vscode-editor-foreground)', backgroundColor: 'var(--vscode-editor-background)' }}
              />
            </div>

            <div className="flex gap-2 items-center">
              <label className="text-xs opacity-60 w-16 flex-shrink-0">Provider</label>
              <select
                value={provider}
                onChange={e => setProvider(e.target.value as AgentProvider)}
                className="flex-1 text-xs px-2 py-1 rounded border bg-transparent"
                style={{ borderColor: 'var(--vscode-panel-border)', color: 'var(--vscode-editor-foreground)', backgroundColor: 'var(--vscode-editor-background)' }}
              >
                {(Object.keys(PROVIDER_LABELS) as AgentProvider[]).map(p => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 items-center">
              <label className="text-xs opacity-60 w-16 flex-shrink-0">Model</label>
              <div className="flex-1">
                <ModelPicker provider={provider} model={model} onModelChange={setModel} />
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="w-full text-xs py-1.5 rounded font-semibold disabled:opacity-40 mt-2"
              style={{ backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
            >
              Create Agent
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
