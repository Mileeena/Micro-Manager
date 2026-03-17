import React from 'react';
import { useAgentStore, type AgentState } from '../store/agentStore';
import { PixelAgent } from './PixelAgent';

interface AgentSidebarProps {
  onSelectAgent: (agent: AgentState) => void;
  selectedAgentId?: string;
}

export function AgentSidebar({ onSelectAgent, selectedAgentId }: AgentSidebarProps) {
  const { agents } = useAgentStore();

  if (agents.length === 0) {
    return (
      <div className="p-4 text-xs opacity-50">
        No agents found. Create a <code>.md</code> file in <code>.agency/agents/</code> to add an agent.
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="text-xs font-semibold opacity-50 uppercase tracking-wider px-2 pb-2">Agents</div>
      {agents.map(agent => (
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
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: AgentState['status'] }) {
  const config = {
    idle: { color: 'text-gray-400', label: '' },
    thinking: { color: 'text-yellow-400', label: '●' },
    coding: { color: 'text-green-400', label: '●' },
    waiting: { color: 'text-blue-400', label: '●' },
    error: { color: 'text-red-400', label: '!' },
  }[status];

  if (!config.label) return null;
  return <span className={`text-xs ${config.color}`}>{config.label}</span>;
}
