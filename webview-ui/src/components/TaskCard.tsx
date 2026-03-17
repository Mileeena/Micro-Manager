import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PixelAgent } from './PixelAgent';
import type { Task } from '../store/boardStore';
import { useAgentStore } from '../store/agentStore';

interface TaskCardProps {
  task: Task;
  onRunAgent?: (taskId: string, agentId: string) => void;
}

export function TaskCard({ task, onRunAgent }: TaskCardProps) {
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const { agents, runAgentOnTask } = useAgentStore();
  const assignedAgent = agents.find(a => a.id === task.assignedAgentId);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function handleRunAgent(agentId: string) {
    runAgentOnTask(agentId, task.id);
    setShowAgentMenu(false);
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="rounded-md p-3 mb-2 cursor-grab active:cursor-grabbing shadow-sm border border-opacity-20"
      style={{
        ...style,
        backgroundColor: 'var(--vscode-input-background)',
        borderColor: 'var(--vscode-panel-border)',
        color: 'var(--vscode-editor-foreground)',
      }}
    >
      {/* Task header */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-tight flex-1">{task.title}</h4>
        {assignedAgent && (
          <div className="flex-shrink-0" onClick={(e) => { e.stopPropagation(); setShowAgentMenu(v => !v); }}>
            <PixelAgent
              seed={assignedAgent.avatarSeed}
              status={assignedAgent.status}
              size={24}
              name={assignedAgent.name}
            />
          </div>
        )}
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs mt-1 opacity-70 line-clamp-2">{task.description}</p>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tags.map(tag => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500 bg-opacity-20 text-blue-400">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Agent menu */}
      {showAgentMenu && (
        <div
          className="mt-2 p-2 rounded border text-xs"
          style={{ backgroundColor: 'var(--vscode-editor-background)', borderColor: 'var(--vscode-panel-border)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="font-semibold mb-1 opacity-70">Run agent on this task:</div>
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => handleRunAgent(agent.id)}
              className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-white hover:bg-opacity-10"
              disabled={agent.status !== 'idle'}
            >
              <PixelAgent seed={agent.avatarSeed} status={agent.status} size={16} />
              <span>{agent.name}</span>
              {agent.status !== 'idle' && <span className="opacity-50 ml-auto">{agent.status}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
