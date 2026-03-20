import { create } from 'zustand';
import { vscode } from '../vscode';

export type ColumnId = 'backlog' | 'todo' | 'in-progress' | 'done';

export type TaskEvent =
  | 'created' | 'moved' | 'assigned' | 'unassigned'
  | 'agent_started' | 'agent_completed' | 'agent_iteration'
  | 'decomposed' | 'blocker_added' | 'blocker_cleared'
  | 'validation_error' | 'validation_fixed';

export interface TaskHistoryEntry {
  timestamp: string;
  event: TaskEvent;
  detail: string;
}

export interface Epic {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'done';
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  columnId: ColumnId;
  assignedAgentId?: string;
  epicId?: string;
  blockedBy?: string[];
  createdAt: string;
  tags: string[];
  history?: TaskHistoryEntry[];
}

export interface BoardState {
  columns: Record<ColumnId, Task[]>;
  epics: Epic[];
  updatedAt: string;
}

interface BoardStore {
  board: BoardState;
  decomposingTaskIds: Set<string>;
  setBoard: (board: BoardState) => void;
  moveTask: (taskId: string, fromColumn: ColumnId, toColumn: ColumnId) => void;
  assignTask: (taskId: string, agentId: string) => void;
  createTask: (title: string, description: string, columnId?: ColumnId) => void;
  setTaskBlockers: (taskId: string, blockedBy: string[]) => void;
  decomposeTask: (taskId: string) => void;
  setDecomposing: (taskId: string, isDecomposing: boolean) => void;
}

const emptyBoard: BoardState = {
  columns: { backlog: [], todo: [], 'in-progress': [], done: [] },
  epics: [],
  updatedAt: new Date().toISOString(),
};

export const useBoardStore = create<BoardStore>((set, get) => ({
  board: emptyBoard,
  decomposingTaskIds: new Set<string>(),

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

  setTaskBlockers: (taskId, blockedBy) => {
    const { board } = get();
    const newColumns = { ...board.columns };
    for (const col of Object.keys(newColumns) as ColumnId[]) {
      const task = newColumns[col].find(t => t.id === taskId);
      if (task) {
        task.blockedBy = blockedBy.length > 0 ? blockedBy : undefined;
        break;
      }
    }
    set({ board: { ...board, columns: newColumns } });
    vscode.postMessage({ type: 'setTaskBlockers', taskId, blockedBy });
  },

  decomposeTask: (taskId) => {
    set(state => ({
      decomposingTaskIds: new Set([...state.decomposingTaskIds, taskId]),
    }));
    vscode.postMessage({ type: 'decomposeTask', taskId });
  },

  setDecomposing: (taskId, isDecomposing) => {
    set(state => {
      const next = new Set(state.decomposingTaskIds);
      if (isDecomposing) next.add(taskId);
      else next.delete(taskId);
      return { decomposingTaskIds: next };
    });
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
