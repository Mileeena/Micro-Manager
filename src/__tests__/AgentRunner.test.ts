import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentState, Task } from '../types';
import type { AgentRunnerCallbacks } from '../agents/AgentRunner';

vi.mock('uuid', () => ({ v4: () => 'test-uuid-123' }));

vi.mock('../services/LLMRouter', () => ({
  callLLM: vi.fn(),
  injectBible: vi.fn((prompt: string, bible: string) =>
    bible ? `${bible}\n---\n${prompt}` : prompt
  ),
}));

vi.mock('../services/CodeValidator', () => ({
  codeValidator: {
    validateAndClean: vi.fn(() =>
      Promise.resolve({ clean: 'content', errors: [], wasStripped: false })
    ),
  },
}));

import { callLLM } from '../services/LLMRouter';
import { codeValidator } from '../services/CodeValidator';
import { AgentRunner } from '../agents/AgentRunner';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockAgent: AgentState = {
  id: 'agent-1',
  name: 'TestAgent',
  role: 'developer',
  mission: 'Write code',
  metrics: '',
  provider: 'anthropic' as const,
  model: 'claude-sonnet-4-6',
  status: 'idle',
  avatarSeed: 'test',
  allowedCommands: [],
};

const mockTask: Task = {
  id: 'task-1',
  title: 'Test Task',
  description: 'Do something',
  columnId: 'todo',
  createdAt: '2024-01-01T00:00:00.000Z',
  tags: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockAgentRunner() {
  const workspace = {
    readBible: vi.fn(() => Promise.resolve('')),
    readBoard: vi.fn(() =>
      Promise.resolve({
        columns: {
          backlog: [],
          todo: [{ ...mockTask }],
          'in-progress': [],
          done: [],
        },
        epics: [],
        updatedAt: '2024-01-01T00:00:00.000Z',
      })
    ),
    writeBoard: vi.fn(() => Promise.resolve()),
    writeLog: vi.fn(() => Promise.resolve()),
    addToAgentCommandWhitelist: vi.fn(() => Promise.resolve()),
    getNetworkPolicy: vi.fn(() => Promise.resolve('open')),
    isWhitelisted: vi.fn(() => Promise.resolve(false)),
    addToWhitelist: vi.fn(() => Promise.resolve()),
  };

  const fsService = {
    readFile: vi.fn(() => Promise.resolve('file content')),
    writeFile: vi.fn(() => Promise.resolve()),
    exists: vi.fn(() => Promise.resolve(true)),
  };

  const terminalService = {
    executeCommand: vi.fn(() => Promise.resolve('allowed' as const)),
  };

  const secrets = {
    getApiKey: vi.fn(() => Promise.resolve('test-key')),
  };

  const callbacks: AgentRunnerCallbacks = {
    onStatusChange: vi.fn(),
    onChunk: vi.fn(),
    onMessageComplete: vi.fn(),
    onBoardUpdate: vi.fn(),
    onTaskIncomplete: vi.fn(),
    onHistoryEntry: vi.fn(),
  };

  const runner = new AgentRunner(
    workspace as any,
    fsService as any,
    terminalService as any,
    secrets as any
  );

  return { runner, workspace, fsService, terminalService, secrets, callbacks };
}

function mockLLMResponses(responses: string[]) {
  let callCount = 0;
  (callLLM as any).mockImplementation(async ({ onChunk }: any) => {
    const text =
      responses[callCount] !== undefined
        ? responses[callCount]
        : responses[responses.length - 1];
    callCount++;
    if (onChunk) text.split('').forEach((c: string) => onChunk(c));
    return text;
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgentRunner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls onStatusChange with thinking at start', async () => {
    const { runner, callbacks } = createMockAgentRunner();
    mockLLMResponses([`<MOVE_TASK taskId="task-1" toColumn="done" />`]);

    await runner.runTask(mockAgent, mockTask, callbacks);

    expect(callbacks.onStatusChange).toHaveBeenCalledWith('agent-1', 'thinking', 'task-1');
  });

  it('calls onHistoryEntry with agent_started event', async () => {
    const { runner, callbacks } = createMockAgentRunner();
    mockLLMResponses([`<MOVE_TASK taskId="task-1" toColumn="done" />`]);

    await runner.runTask(mockAgent, mockTask, callbacks);

    expect(callbacks.onHistoryEntry).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ event: 'agent_started' })
    );
  });

  it('executes READ_FILE action and reads the specified file', async () => {
    const { runner, fsService, callbacks } = createMockAgentRunner();
    mockLLMResponses([
      `<READ_FILE path="src/test.ts" />`,
      `<MOVE_TASK taskId="task-1" toColumn="done" />`,
    ]);

    await runner.runTask(mockAgent, mockTask, callbacks);

    expect(fsService.readFile).toHaveBeenCalledWith('src/test.ts');
  });

  it('executes WRITE_FILE action using validated content', async () => {
    const { runner, fsService, callbacks } = createMockAgentRunner();
    (codeValidator.validateAndClean as any).mockResolvedValue({
      clean: 'const x = 1;',
      errors: [],
      wasStripped: false,
    });
    mockLLMResponses([
      `<WRITE_FILE path="src/out.ts">const x = 1;</WRITE_FILE>`,
      `<MOVE_TASK taskId="task-1" toColumn="done" />`,
    ]);

    await runner.runTask(mockAgent, mockTask, callbacks);

    expect(fsService.writeFile).toHaveBeenCalledWith('src/out.ts', 'const x = 1;');
  });

  it('returns validation error when WRITE_FILE content has syntax errors', async () => {
    const { runner, callbacks } = createMockAgentRunner();
    (codeValidator.validateAndClean as any).mockResolvedValue({
      clean: 'def broken',
      errors: ['SyntaxError: invalid syntax'],
      wasStripped: false,
    });
    // First call: write bad file; second call: move done
    mockLLMResponses([
      `<WRITE_FILE path="test.py">def broken</WRITE_FILE>`,
      `<MOVE_TASK taskId="task-1" toColumn="done" />`,
    ]);

    await runner.runTask(mockAgent, mockTask, callbacks);

    // Agent should have been given a second chance (second callLLM call happened)
    expect(callLLM).toHaveBeenCalledTimes(2);
  });

  it('calls onTaskIncomplete when response has no actions (loop exits)', async () => {
    const { runner, callbacks } = createMockAgentRunner();
    mockLLMResponses(['I am thinking about what to do...']);

    await runner.runTask(mockAgent, mockTask, callbacks);

    expect(callbacks.onTaskIncomplete).toHaveBeenCalledWith(
      'agent-1',
      mockTask,
      'I am thinking about what to do...'
    );
  });

  it('does not call onTaskIncomplete when task completed via MOVE_TASK', async () => {
    const { runner, callbacks } = createMockAgentRunner();
    mockLLMResponses([`<MOVE_TASK taskId="task-1" toColumn="done" />`]);

    await runner.runTask(mockAgent, mockTask, callbacks);

    expect(callbacks.onTaskIncomplete).not.toHaveBeenCalled();
  });

  it('rejects when no API key configured', async () => {
    const { runner, secrets, callbacks } = createMockAgentRunner();
    (secrets.getApiKey as any).mockResolvedValue(null);

    await expect(runner.runTask(mockAgent, mockTask, callbacks)).rejects.toThrow(/No API key/);
  });

  it('calls onStatusChange with error when exception is thrown', async () => {
    const { runner, secrets, callbacks } = createMockAgentRunner();
    (secrets.getApiKey as any).mockRejectedValue(new Error('Secrets unavailable'));

    await expect(runner.runTask(mockAgent, mockTask, callbacks)).rejects.toThrow();
    expect(callbacks.onStatusChange).toHaveBeenCalledWith('agent-1', 'error');
  });

  it('calls onMessageComplete after each LLM response', async () => {
    const { runner, callbacks } = createMockAgentRunner();
    mockLLMResponses([`<MOVE_TASK taskId="task-1" toColumn="done" />`]);

    await runner.runTask(mockAgent, mockTask, callbacks);

    expect(callbacks.onMessageComplete).toHaveBeenCalled();
  });
});
