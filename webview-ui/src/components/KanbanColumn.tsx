import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import type { Task, ColumnId } from '../store/boardStore';
import { COLUMN_LABELS, COLUMN_COLORS } from '../store/boardStore';

interface KanbanColumnProps {
  columnId: ColumnId;
  tasks: Task[];
}

export function KanbanColumn({ columnId, tasks }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  const borderColor = COLUMN_COLORS[columnId];

  return (
    <div
      className={`flex flex-col rounded-lg border-t-2 ${borderColor} min-h-64 flex-1 min-w-48`}
      style={{ backgroundColor: 'var(--vscode-sideBar-background)' }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-semibold opacity-80">{COLUMN_LABELS[columnId]}</h3>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: 'var(--vscode-input-background)', opacity: 0.8 }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 transition-colors rounded-b-lg ${isOver ? 'bg-white bg-opacity-5' : ''}`}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs opacity-30">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}
