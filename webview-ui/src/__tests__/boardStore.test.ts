import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../vscode', () => ({
  vscode: {
    postMessage: vi.fn(),
    getState: vi.fn(() => undefined),
    setState: vi.fn(),
  },
}));

import { useBoardStore, BoardState, Task, ColumnId } from '../store/boardStore';
import { vscode } from '../vscode';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Test Task',
  description: 'A test task',
  columnId: 'backlog',
  tags: [],
  createdAt: new Date().toISOString(),
  ...overrides,
});

const makeBoard = (taskOverrides: Partial<Task> = {}): BoardState => ({
  columns: {
    backlog: [makeTask(taskOverrides)],
    todo: [],
    'in-progress': [],
    done: [],
  },
  epics: [],
  updatedAt: new Date().toISOString(),
});

const initialState = {
  board: {
    columns: { backlog: [], todo: [], 'in-progress': [], done: [] },
    epics: [],
    updatedAt: useBoardStore.getState().board.updatedAt,
  },
};

describe('boardStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useBoardStore.setState({
      board: {
        columns: { backlog: [], todo: [], 'in-progress': [], done: [] },
        epics: [],
        updatedAt: new Date().toISOString(),
      },
    });
    // Clear all mocks
    vi.clearAllMocks();
  });

  it('initial state has 4 empty columns and empty epics', () => {
    const { board } = useBoardStore.getState();
    expect(board.columns).toHaveProperty('backlog');
    expect(board.columns).toHaveProperty('todo');
    expect(board.columns).toHaveProperty('in-progress');
    expect(board.columns).toHaveProperty('done');
    expect(board.columns.backlog).toEqual([]);
    expect(board.columns.todo).toEqual([]);
    expect(board.columns['in-progress']).toEqual([]);
    expect(board.columns.done).toEqual([]);
    expect(board.epics).toEqual([]);
  });

  it('setBoard() replaces entire board state', () => {
    const newBoard = makeBoard();
    useBoardStore.getState().setBoard(newBoard);
    const { board } = useBoardStore.getState();
    expect(board).toEqual(newBoard);
    expect(board.columns.backlog).toHaveLength(1);
    expect(board.columns.backlog[0].id).toBe('task-1');
  });

  it('moveTask() moves task from one column to another', () => {
    useBoardStore.getState().setBoard(makeBoard({ id: 'task-1', columnId: 'backlog' }));
    useBoardStore.getState().moveTask('task-1', 'backlog', 'todo');
    const { board } = useBoardStore.getState();
    expect(board.columns.backlog).toHaveLength(0);
    expect(board.columns.todo).toHaveLength(1);
    expect(board.columns.todo[0].id).toBe('task-1');
  });

  it('moveTask() updates task.columnId', () => {
    useBoardStore.getState().setBoard(makeBoard({ id: 'task-1', columnId: 'backlog' }));
    useBoardStore.getState().moveTask('task-1', 'backlog', 'in-progress');
    const { board } = useBoardStore.getState();
    const movedTask = board.columns['in-progress'][0];
    expect(movedTask.columnId).toBe('in-progress');
  });

  it('moveTask() calls vscode.postMessage with correct message type', () => {
    useBoardStore.getState().setBoard(makeBoard({ id: 'task-1', columnId: 'backlog' }));
    useBoardStore.getState().moveTask('task-1', 'backlog', 'done');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'moveTask',
      taskId: 'task-1',
      fromColumn: 'backlog',
      toColumn: 'done',
    });
  });

  it('moveTask() does nothing when task not found in fromColumn', () => {
    useBoardStore.getState().setBoard(makeBoard({ id: 'task-1', columnId: 'backlog' }));
    useBoardStore.getState().moveTask('nonexistent', 'backlog', 'todo');
    const { board } = useBoardStore.getState();
    expect(board.columns.backlog).toHaveLength(1);
    expect(board.columns.todo).toHaveLength(0);
    expect(vscode.postMessage).not.toHaveBeenCalled();
  });

  it('assignTask() updates task assignedAgentId', () => {
    useBoardStore.getState().setBoard(makeBoard({ id: 'task-1' }));
    useBoardStore.getState().assignTask('task-1', 'agent-42');
    const { board } = useBoardStore.getState();
    const task = board.columns.backlog[0];
    expect(task.assignedAgentId).toBe('agent-42');
  });

  it('assignTask() calls vscode.postMessage', () => {
    useBoardStore.getState().setBoard(makeBoard({ id: 'task-1' }));
    useBoardStore.getState().assignTask('task-1', 'agent-99');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'assignTask',
      taskId: 'task-1',
      agentId: 'agent-99',
    });
  });

  it('setTaskBlockers() sets blockedBy on task', () => {
    useBoardStore.getState().setBoard(makeBoard({ id: 'task-1' }));
    useBoardStore.getState().setTaskBlockers('task-1', ['task-2', 'task-3']);
    const { board } = useBoardStore.getState();
    const task = board.columns.backlog[0];
    expect(task.blockedBy).toEqual(['task-2', 'task-3']);
  });

  it('setTaskBlockers() with empty array clears blockedBy (sets to undefined)', () => {
    useBoardStore.getState().setBoard(makeBoard({ id: 'task-1', blockedBy: ['task-2'] }));
    useBoardStore.getState().setTaskBlockers('task-1', []);
    const { board } = useBoardStore.getState();
    const task = board.columns.backlog[0];
    expect(task.blockedBy).toBeUndefined();
  });

  it('createTask() calls vscode.postMessage with type createTask', () => {
    useBoardStore.getState().createTask('New Task', 'A description', 'todo');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'createTask',
      title: 'New Task',
      description: 'A description',
      columnId: 'todo',
    });
  });

  it('createTask() defaults columnId to backlog when not provided', () => {
    useBoardStore.getState().createTask('Another Task', 'Another desc');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'createTask',
      title: 'Another Task',
      description: 'Another desc',
      columnId: 'backlog',
    });
  });

  it('decomposeTask() posts decomposeTask message to vscode', () => {
    useBoardStore.getState().decomposeTask('task-99');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'decomposeTask',
      taskId: 'task-99',
    });
  });

  it('decomposeTask() adds taskId to decomposingTaskIds', () => {
    useBoardStore.setState({ decomposingTaskIds: new Set() });
    useBoardStore.getState().decomposeTask('task-42');
    const { decomposingTaskIds } = useBoardStore.getState();
    expect(decomposingTaskIds.has('task-42')).toBe(true);
  });

  it('setDecomposing(taskId, false) removes taskId from decomposingTaskIds', () => {
    useBoardStore.setState({ decomposingTaskIds: new Set(['task-42', 'task-99']) });
    useBoardStore.getState().setDecomposing('task-42', false);
    const { decomposingTaskIds } = useBoardStore.getState();
    expect(decomposingTaskIds.has('task-42')).toBe(false);
    expect(decomposingTaskIds.has('task-99')).toBe(true);
  });

  it('setDecomposing(taskId, true) adds taskId to decomposingTaskIds', () => {
    useBoardStore.setState({ decomposingTaskIds: new Set() });
    useBoardStore.getState().setDecomposing('task-5', true);
    const { decomposingTaskIds } = useBoardStore.getState();
    expect(decomposingTaskIds.has('task-5')).toBe(true);
  });
});
