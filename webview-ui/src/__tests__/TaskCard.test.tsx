import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ─── Mock vscode ──────────────────────────────────────────────────────────────
vi.mock('../vscode', () => ({
  vscode: {
    postMessage: vi.fn(),
    getState: vi.fn(() => undefined),
    setState: vi.fn(),
  },
}));

// ─── Mock @dnd-kit (TaskCard uses useSortable) ────────────────────────────────
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  SortableContext: ({ children }: any) => <>{children}</>,
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

// ─── Mock PixelAgent (canvas ops not supported in jsdom) ─────────────────────
vi.mock('../components/PixelAgent', () => ({
  PixelAgent: ({ name }: { name?: string }) => <span data-testid="pixel-agent">{name ?? 'agent'}</span>,
}));

import { TaskCard } from '../components/TaskCard';
import { useBoardStore, type Task, type BoardState } from '../store/boardStore';
import { useAgentStore } from '../store/agentStore';
import { vscode } from '../vscode';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseTask: Task = {
  id: 'task-1',
  title: 'Fix the bug',
  description: 'There is a bug in the login flow',
  columnId: 'todo',
  tags: [],
  createdAt: '2024-01-01T00:00:00.000Z',
};

const emptyBoard: BoardState = {
  columns: { backlog: [], todo: [baseTask], 'in-progress': [], done: [] },
  epics: [],
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const emptyAgentState = {
  agents: [],
  apiKeyStatus: { anthropic: false, openai: false, openrouter: false },
  networkPolicy: 'open' as const,
  orchestrator: { provider: 'anthropic' as const, model: 'claude-sonnet-4-6' },
};

function resetStores() {
  useBoardStore.setState({
    board: emptyBoard,
    decomposingTaskIds: new Set<string>(),
  });
  useAgentStore.setState(emptyAgentState);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TaskCard', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it('renders task title', () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.getByText('Fix the bug')).toBeTruthy();
  });

  it('renders task description', () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.getByText('There is a bug in the login flow')).toBeTruthy();
  });

  it('renders the Decompose button', () => {
    render(<TaskCard task={baseTask} />);
    const btn = screen.getByTestId('decompose-btn');
    expect(btn).toBeTruthy();
  });

  it('does not show blocked indicator when task has no blockers', () => {
    render(<TaskCard task={baseTask} />);
    // ⛔ should not appear as a title indicator
    const card = screen.getByText('Fix the bug').closest('[class*="rounded-md"]');
    expect(card).toBeTruthy();
    // blockedBy is undefined — border should not be red
    // We test that the title is still rendered correctly
    expect(screen.queryByTitle(/Blocked by:/)).toBeNull();
  });

  it('shows blocked indicator when task has blockers', () => {
    const blockedTask: Task = {
      ...baseTask,
      blockedBy: ['task-2'],
    };
    useBoardStore.setState({
      board: {
        columns: {
          backlog: [{ id: 'task-2', title: 'Other task', description: '', columnId: 'backlog', tags: [], createdAt: '' }],
          todo: [blockedTask],
          'in-progress': [],
          done: [],
        },
        epics: [],
        updatedAt: '',
      },
      decomposingTaskIds: new Set(),
    });
    render(<TaskCard task={blockedTask} />);
    expect(screen.getByTitle(/Blocked by:/)).toBeTruthy();
  });

  it('shows epic stripe when task has epicId', () => {
    const epicBoard: BoardState = {
      columns: { backlog: [], todo: [{ ...baseTask, epicId: 'epic-1' }], 'in-progress': [], done: [] },
      epics: [{ id: 'epic-1', title: 'My Epic', description: 'Epic desc', status: 'active', createdAt: '' }],
      updatedAt: '',
    };
    useBoardStore.setState({ board: epicBoard, decomposingTaskIds: new Set() });
    render(<TaskCard task={{ ...baseTask, epicId: 'epic-1' }} />);
    expect(screen.getByText('My Epic')).toBeTruthy();
  });

  it('does not show epic stripe when task has no epicId', () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.queryByText('My Epic')).toBeNull();
  });

  it('clicking Decompose button calls decomposeTask with task id', () => {
    render(<TaskCard task={baseTask} />);
    const btn = screen.getByTestId('decompose-btn');
    fireEvent.click(btn);
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'decomposeTask',
      taskId: 'task-1',
    });
  });

  it('Decompose button is disabled while decomposing', () => {
    useBoardStore.setState({
      board: emptyBoard,
      decomposingTaskIds: new Set(['task-1']),
    });
    render(<TaskCard task={baseTask} />);
    const btn = screen.getByTestId('decompose-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('shows spinner icon when task is decomposing', () => {
    useBoardStore.setState({
      board: emptyBoard,
      decomposingTaskIds: new Set(['task-1']),
    });
    render(<TaskCard task={baseTask} />);
    expect(screen.getByLabelText('Decomposing...')).toBeTruthy();
  });

  it('does NOT show history button when task has no history', () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.queryByTestId('history-btn')).toBeNull();
  });

  it('shows history button when task has history entries', () => {
    const taskWithHistory: Task = {
      ...baseTask,
      history: [
        { timestamp: '2024-01-01T00:00:00.000Z', event: 'created', detail: 'Task created' },
      ],
    };
    render(<TaskCard task={taskWithHistory} />);
    expect(screen.getByTestId('history-btn')).toBeTruthy();
  });

  it('shows history panel when history button clicked', () => {
    const taskWithHistory: Task = {
      ...baseTask,
      history: [
        { timestamp: '2024-01-01T00:00:00.000Z', event: 'created', detail: 'Task was created' },
        { timestamp: '2024-01-02T00:00:00.000Z', event: 'moved', detail: 'Moved to todo' },
      ],
    };
    render(<TaskCard task={taskWithHistory} />);
    fireEvent.click(screen.getByTestId('history-btn'));
    expect(screen.getByTestId('history-panel')).toBeTruthy();
    expect(screen.getByText('Task was created')).toBeTruthy();
    expect(screen.getByText('Moved to todo')).toBeTruthy();
  });

  it('hides history panel when history button clicked again', () => {
    const taskWithHistory: Task = {
      ...baseTask,
      history: [
        { timestamp: '2024-01-01T00:00:00.000Z', event: 'created', detail: 'Task was created' },
      ],
    };
    render(<TaskCard task={taskWithHistory} />);
    const histBtn = screen.getByTestId('history-btn');
    fireEvent.click(histBtn); // open
    expect(screen.getByTestId('history-panel')).toBeTruthy();
    fireEvent.click(histBtn); // close
    expect(screen.queryByTestId('history-panel')).toBeNull();
  });

  it('shows assigned agent name in Assign button when agent assigned', () => {
    useAgentStore.setState({
      ...emptyAgentState,
      agents: [{
        id: 'agent-1', name: 'Alice', role: 'developer', mission: 'code',
        provider: 'anthropic', model: 'claude-sonnet-4-6',
        status: 'idle', avatarSeed: 'alice', metrics: '',
      }],
    });
    render(<TaskCard task={{ ...baseTask, assignedAgentId: 'agent-1' }} />);
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('shows "Assign" text when no agent is assigned', () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.getByText(/Assign/)).toBeTruthy();
  });

  it('shows agent assign dropdown when Assign button clicked', () => {
    useAgentStore.setState({
      ...emptyAgentState,
      agents: [{
        id: 'agent-1', name: 'Bob', role: 'tester', mission: 'test',
        provider: 'anthropic', model: 'claude-sonnet-4-6',
        status: 'idle', avatarSeed: 'bob', metrics: '',
      }],
    });
    render(<TaskCard task={baseTask} />);
    fireEvent.click(screen.getByText(/Assign/));
    expect(screen.getByText('Assign to agent')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });
});
