import React, { useState } from 'react';
import { useAgentStore, type AgentState } from '../store/agentStore';
import { PixelAgent } from './PixelAgent';
import { CreateAgentPanel } from './CreateAgentPanel';

interface AgentSidebarProps {
  onSelectAgent: (agent: AgentState) => void;
  selectedAgentId?: string;
}

export function AgentSidebar({ onSelectAgent, selectedAgentId }: AgentSidebarProps) {
  const { agents } = useAgentStore();
  const [showCreate, setShowCreate] = useState(false);

  if (showCreate) {
    return <CreateAgentPanel onClose={() => setShowCreate(false)} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--vscode-panel-border)' }}
      >
        <span className="text-xs font-semibold opacity-50 uppercase tracking-wider">Agents</span>
        <button
          onClick={() => setShowCreate(true)}
          className="text-xs px-2 py-0.5 rounded hover:opacity-90"
          style={{ backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
          title="Add new agent"
        >
          + Add
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-2">
        {agents.length === 0 ? (
          <div className="p-3 text-xs opacity-50 text-center">
            <div className="mb-2">No agents yet</div>
            <button
              onClick={() => setShowCreate(true)}
              className="underline opacity-70 hover:opacity-100"
            >
              + Create your first agent
            </button>
          </div>
        ) : (
          agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => onSelectAgent(agent)}
              className={`w-full flex items-center gap-3 px-2 py-2 rounded text-left hover:bg-white hover:bg-opacity-5 transition-colors ${selectedAgentId === agent.id ? 'bg-white bg-opacity-10' : ''}`}
            >
              <PixelAgent seed={agent.avatarSeed} status={agent.status} size={28} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{agent.name}</div>
                <div className="text-xs opacity-50 truncate">{agent.role}</div>
              </div>
              <StatusBadge status={agent.status} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AgentState['status'] }) {
  const config: Record<string, { color: string; label: string }> = {
    idle:     { color: 'text-gray-400',   label: '' },
    thinking: { color: 'text-yellow-400', label: '●' },
    coding:   { color: 'text-green-400',  label: '●' },
    waiting:  { color: 'text-blue-400',   label: '●' },
    error:    { color: 'text-red-400',    label: '!' },
  };
  const c = config[status] ?? { color: '', label: '' };
  if (!c.label) return null;
  return <span className={`text-xs ${c.color}`}>{c.label}</span>;
}
