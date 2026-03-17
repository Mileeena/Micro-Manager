import { create } from 'zustand';
import { vscode } from '../vscode';

export type ColumnId = 'backlog' | 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  columnId: ColumnId;
  assignedAgentId?: string;
  createdAt: string;
  tags: string[];
}

export interface BoardState {
  columns: Record<ColumnId, Task[]>;
  updatedAt: string;
}

interface BoardStore {
  board: BoardState;
  setBoard: (board: BoardState) => void;
  moveTask: (taskId: string, fromColumn: ColumnId, toColumn: ColumnId) => void;
  assignTask: (taskId: string, agentId: string) => void;
  createTask: (title: string, description: string, columnId?: ColumnId) => void;
}

const emptyBoard: BoardState = {
  columns: { backlog: [], todo: [], 'in-progress': [], done: [] },
  updatedAt: new Date().toISOString(),
};

export const useBoardStore = create<BoardStore>((set, get) => ({
  board: emptyBoard,

  setBoard: (board) => set({ board }),

  moveTask: (taskId, fromColumn, toColumn) => {
    const { board } = get();
    const fromTasks = [...board.columns[fromColumn]];
    const idx = fromTasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;

    const [task] = fromTasks.splice(idx, 1);
    task.columnId = toColumn;
    const toTasks = [...board.columns[toColumn], task];

    const newBoard = {
      ...board,
      columns: { ...board.columns, [fromColumn]: fromTasks, [toColumn]: toTasks },
    };
    set({ board: newBoard });

    // Notify extension
    vscode.postMessage({ type: 'moveTask', taskId, fromColumn, toColumn });
  },

  assignTask: (taskId, agentId) => {
    const { board } = get();
    const newColumns = { ...board.columns };
    for (const col of Object.keys(newColumns) as ColumnId[]) {
      const task = newColumns[col].find(t => t.id === taskId);
      if (task) {
        task.assignedAgentId = agentId;
        break;
      }
    }
    set({ board: { ...board, columns: newColumns } });
    vscode.postMessage({ type: 'assignTask', taskId, agentId });
  },

  createTask: (title, description, columnId = 'backlog') => {
    vscode.postMessage({ type: 'createTask', title, description, columnId });
  },
}));

export const COLUMN_LABELS: Record<ColumnId, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  'in-progress': 'In Progress',
  done: 'Done',
};

export const COLUMN_COLORS: Record<ColumnId, string> = {
  backlog: 'border-gray-500',
  todo: 'border-blue-500',
  'in-progress': 'border-yellow-500',
  done: 'border-green-500',
};
