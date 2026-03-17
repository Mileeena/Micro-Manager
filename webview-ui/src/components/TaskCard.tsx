import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PixelAgent } from './PixelAgent';
import type { Task } from '../store/boardStore';
import { useBoardStore } from '../store/boardStore';
import { useAgentStore } from '../store/agentStore';

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const [menuMode, setMenuMode] = useState<null | 'assign' | 'run'>(null);
  const { agents, runAgentOnTask } = useAgentStore();
  const { assignTask } = useBoardStore();
  const assignedAgent = agents.find(a => a.id === task.assignedAgentId);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function stopProp(e: React.MouseEvent) { e.stopPropagation(); }

  function toggleMenu(mode: 'assign' | 'run', e: React.MouseEvent) {
    e.stopPropagation();
    setMenuMode(prev => prev === mode ? null : mode);
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="rounded-md p-3 mb-2 cursor-grab active:cursor-grabbing shadow-sm border"
      style={{
        ...style,
        backgroundColor: 'var(--vscode-input-background)',
        borderColor: 'var(--vscode-panel-border)',
        color: 'var(--vscode-editor-foreground)',
      }}
    >
      {/* Title row */}
      <div className="flex items-start gap-2">
        <h4 className="text-sm font-semibold leading-tight flex-1">{task.title}</h4>

        {/* Assigned agent avatar */}
        {assignedAgent && (
          <div className="flex-shrink-0 cursor-pointer" onClick={(e) => toggleMenu('run', e)}>
            <PixelAgent seed={assignedAgent.avatarSeed} status={assignedAgent.status} size={22} name={assignedAgent.name} />
          </div>
        )}
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs mt-1 opacity-60 line-clamp-2">{task.description}</p>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 mt-2" onClick={stopProp}>
        <button
          onClick={(e) => toggleMenu('assign', e)}
          className="text-xs opacity-50 hover:opacity-90 flex items-center gap-1"
          title="Assign agent"
        >
          👤 {assignedAgent ? assignedAgent.name : 'Assign'}
        </button>

        {assignedAgent && (
          <button
            onClick={(e) => toggleMenu('run', e)}
            className="text-xs opacity-50 hover:opacity-90 flex items-center gap-1 ml-auto"
            title="Run agent on this task"
          >
            ▶ Run
          </button>
        )}
      </div>

      {/* Assign menu */}
      {menuMode === 'assign' && (
        <div
          className="mt-2 rounded border text-xs overflow-hidden"
          style={{ backgroundColor: 'var(--vscode-editor-background)', borderColor: 'var(--vscode-focusBorder)' }}
          onClick={stopProp}
        >
          <div className="px-2 py-1.5 font-semibold opacity-60 border-b" style={{ borderColor: 'var(--vscode-panel-border)' }}>
            Assign to agent
          </div>
          {agents.length === 0 && (
            <div className="px-3 py-2 opacity-40">No agents yet — create one in the Agents tab</div>
          )}
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => { assignTask(task.id, agent.id); setMenuMode(null); }}
              className={`flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-white hover:bg-opacity-10 ${task.assignedAgentId === agent.id ? 'bg-white bg-opacity-10' : ''}`}
            >
              <PixelAgent seed={agent.avatarSeed} status={agent.status} size={16} />
              <span>{agent.name}</span>
              <span className="ml-auto opacity-40">{agent.role}</span>
              {task.assignedAgentId === agent.id && <span className="text-green-400">✓</span>}
            </button>
          ))}
          {task.assignedAgentId && (
            <button
              onClick={() => { assignTask(task.id, ''); setMenuMode(null); }}
              className="w-full text-left px-2 py-1.5 opacity-50 hover:opacity-80 border-t"
              style={{ borderColor: 'var(--vscode-panel-border)' }}
            >
              ✕ Unassign
            </button>
          )}
        </div>
      )}

      {/* Run menu */}
      {menuMode === 'run' && (
        <div
          className="mt-2 rounded border text-xs overflow-hidden"
          style={{ backgroundColor: 'var(--vscode-editor-background)', borderColor: 'var(--vscode-focusBorder)' }}
          onClick={stopProp}
        >
          <div className="px-2 py-1.5 font-semibold opacity-60 border-b" style={{ borderColor: 'var(--vscode-panel-border)' }}>
            Run agent on task
          </div>
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => { runAgentOnTask(agent.id, task.id); setMenuMode(null); }}
              disabled={agent.status !== 'idle'}
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-white hover:bg-opacity-10 disabled:opacity-40"
            >
              <PixelAgent seed={agent.avatarSeed} status={agent.status} size={16} />
              <span>{agent.name}</span>
              {agent.status !== 'idle' && <span className="ml-auto opacity-50 italic">{agent.status}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
