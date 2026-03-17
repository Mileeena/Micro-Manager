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

// Stable color per epic ID
function epicColor(epicId: string): string {
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < epicId.length; i++) hash = epicId.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function TaskCard({ task }: TaskCardProps) {
  const [menuMode, setMenuMode] = useState<null | 'assign' | 'run' | 'blockers'>(null);
  const { agents, runAgentOnTask } = useAgentStore();
  const { board, assignTask, setTaskBlockers } = useBoardStore();
  const assignedAgent = agents.find(a => a.id === task.assignedAgentId);
  const epic = board.epics.find(e => e.id === task.epicId);

  // All tasks from all columns except this one — for blocker picker
  const allOtherTasks = Object.values(board.columns)
    .flat()
    .filter(t => t.id !== task.id);

  const isBlocked = (task.blockedBy?.length ?? 0) > 0;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function stopProp(e: React.MouseEvent) { e.stopPropagation(); }

  function toggleMenu(mode: 'assign' | 'run' | 'blockers', e: React.MouseEvent) {
    e.stopPropagation();
    setMenuMode(prev => prev === mode ? null : mode);
  }

  function toggleBlocker(blockerId: string) {
    const current = task.blockedBy ?? [];
    const next = current.includes(blockerId)
      ? current.filter(id => id !== blockerId)
      : [...current, blockerId];
    setTaskBlockers(task.id, next);
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="rounded-md mb-2 cursor-grab active:cursor-grabbing shadow-sm border overflow-hidden"
      style={{
        ...style,
        backgroundColor: 'var(--vscode-input-background)',
        borderColor: isBlocked ? '#ef4444' : 'var(--vscode-panel-border)',
        color: 'var(--vscode-editor-foreground)',
      }}
    >
      {/* Epic stripe */}
      {epic && (
        <div
          className="px-2 py-0.5 text-xs font-medium truncate flex items-center gap-1"
          style={{
            backgroundColor: epicColor(epic.id) + '22',
            color: epicColor(epic.id),
            borderBottom: `1px solid ${epicColor(epic.id)}44`,
          }}
          title={epic.description}
        >
          <span style={{ fontSize: '0.6rem' }}>◆</span>
          {epic.title}
        </div>
      )}

      <div className="p-3">
        {/* Title row */}
        <div className="flex items-start gap-2">
          <h4 className="text-sm font-semibold leading-tight flex-1">{task.title}</h4>

          {/* Blocked indicator */}
          {isBlocked && (
            <span
              className="text-xs flex-shrink-0 text-red-400"
              title={`Blocked by: ${task.blockedBy!.map(id => allOtherTasks.find(t => t.id === id)?.title ?? id).join(', ')}`}
            >
              ⛔
            </span>
          )}

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

          <button
            onClick={(e) => toggleMenu('blockers', e)}
            className={`text-xs flex items-center gap-1 ${isBlocked ? 'text-red-400 opacity-80 hover:opacity-100' : 'opacity-30 hover:opacity-70'}`}
            title="Set blockers"
          >
            ⛔{isBlocked ? ` ${task.blockedBy!.length}` : ''}
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

        {/* Blockers menu */}
        {menuMode === 'blockers' && (
          <div
            className="mt-2 rounded border text-xs overflow-hidden"
            style={{ backgroundColor: 'var(--vscode-editor-background)', borderColor: 'var(--vscode-focusBorder)' }}
            onClick={stopProp}
          >
            <div className="px-2 py-1.5 font-semibold opacity-60 border-b" style={{ borderColor: 'var(--vscode-panel-border)' }}>
              ⛔ Blocked by…
            </div>
            {allOtherTasks.length === 0 && (
              <div className="px-3 py-2 opacity-40">No other tasks on the board</div>
            )}
            {allOtherTasks.map(other => {
              const isChecked = task.blockedBy?.includes(other.id) ?? false;
              return (
                <button
                  key={other.id}
                  onClick={() => toggleBlocker(other.id)}
                  className="flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-white hover:bg-opacity-10"
                >
                  <span className={`w-4 text-center ${isChecked ? 'text-red-400' : 'opacity-30'}`}>{isChecked ? '⛔' : '○'}</span>
                  <span className="flex-1 truncate">{other.title}</span>
                  <span className="opacity-40 flex-shrink-0 text-xs">{other.columnId}</span>
                </button>
              );
            })}
            {isBlocked && (
              <button
                onClick={() => setTaskBlockers(task.id, [])}
                className="w-full text-left px-2 py-1.5 opacity-50 hover:opacity-80 border-t text-red-400"
                style={{ borderColor: 'var(--vscode-panel-border)' }}
              >
                ✕ Clear all blockers
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
    </div>
  );
}
