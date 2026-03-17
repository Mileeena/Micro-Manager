import React, { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { useBoardStore, type ColumnId, type Task } from '../store/boardStore';

export function KanbanBoard() {
  const { board, moveTask, createTask } = useBoardStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const COLUMNS: ColumnId[] = ['backlog', 'todo', 'in-progress', 'done'];

  function findTask(id: string): { task: Task; column: ColumnId } | null {
    for (const col of COLUMNS) {
      const task = board.columns[col].find(t => t.id === id);
      if (task) return { task, column: col };
    }
    return null;
  }

  function handleDragStart({ active }: DragStartEvent) {
    const found = findTask(String(active.id));
    if (found) setActiveTask(found.task);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveTask(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const found = findTask(activeId);
    if (!found) return;

    // over could be a column id or a task id
    let targetColumn: ColumnId = found.column;
    if (COLUMNS.includes(overId as ColumnId)) {
      targetColumn = overId as ColumnId;
    } else {
      const overFound = findTask(overId);
      if (overFound) targetColumn = overFound.column;
    }

    if (targetColumn !== found.column) {
      moveTask(activeId, found.column, targetColumn);
    }
  }

  function handleCreateTask() {
    if (!newTitle.trim()) return;
    createTask(newTitle.trim(), newDesc.trim());
    setNewTitle('');
    setNewDesc('');
    setShowCreateForm(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--vscode-panel-border)' }}>
        <h2 className="text-sm font-semibold opacity-70">KANBAN BOARD</h2>
        <button
          onClick={() => setShowCreateForm(v => !v)}
          className="text-xs px-3 py-1 rounded"
          style={{ backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
        >
          + New Task
        </button>
      </div>

      {/* Create task form */}
      {showCreateForm && (
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--vscode-panel-border)', backgroundColor: 'var(--vscode-input-background)' }}>
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full text-sm bg-transparent outline-none border-b mb-2 pb-1"
            style={{ borderColor: 'var(--vscode-panel-border)', color: 'var(--vscode-editor-foreground)' }}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateTask(); if (e.key === 'Escape') setShowCreateForm(false); }}
          />
          <textarea
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)..."
            rows={2}
            className="w-full text-xs bg-transparent outline-none resize-none"
            style={{ color: 'var(--vscode-editor-foreground)' }}
          />
          <div className="flex gap-2 mt-2">
            <button onClick={handleCreateTask} className="text-xs px-3 py-1 rounded" style={{ backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>
              Create
            </button>
            <button onClick={() => setShowCreateForm(false)} className="text-xs px-3 py-1 rounded opacity-60 hover:opacity-100">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full" style={{ minWidth: 'max-content' }}>
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col}
                columnId={col}
                tasks={board.columns[col] ?? []}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask && (
              <div className="rotate-2 scale-105">
                <TaskCard task={activeTask} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
