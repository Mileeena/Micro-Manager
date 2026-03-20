import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentState, Task } from '../types';

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

vi.mock('../services/LLMRouter', () => ({
  callLLM: vi.fn(),
  injectBible: vi.fn((prompt: string, bible: string) =>
    bible ? `${bible}\n---\n${prompt}` : prompt
  ),
}));

import { callLLM } from '../services/LLMRouter';
import { OrchestratorAgent } from '../agents/OrchestratorAgent';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockWorkspace() {
  return {
    readBible: vi.fn().mockResolvedValue(''),
    readBoard: vi.fn().mockResolvedValue({
      columns: { backlog: [], todo: [], 'in-progress': [], done: [] },
      epics: [],
      updatedAt: '2024-01-01T00:00:00.000Z',
    }),
    writeBoard: vi.fn().mockResolvedValue(undefined),
    getOrchestratorSettings: vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    }),
  };
}

function createMockSecrets() {
  return {
    getApiKey: vi.fn().mockResolvedValue('test-key'),
  };
}

function makeLLMReturn(text: string) {
  (callLLM as any).mockImplementation(async ({ onChunk }: any) => {
    onChunk?.(text);
    return text;
  });
}

const mockAgents: AgentState[] = [];

const mockTask: Task = {
  id: 'task-1',
  title: 'Build feature',
  description: 'Implement something',
  columnId: 'todo',
  createdAt: '2024-01-01T00:00:00.000Z',
  tags: [],
};

const mockAgent: AgentState = {
  id: 'a1',
  name: 'Dev',
  role: 'developer',
  mission: 'Code',
  metrics: '',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  status: 'idle',
  avatarSeed: 'dev',
  allowedCommands: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrchestratorAgent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ─── parseResponse ─────────────────────────────────────────────────────────

  describe('parseResponse', () => {
    it('extracts tasks from JSON block', () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const response = 'Great plan!\n```json\n{"tasks":[{"title":"Task A","description":"Do A","suggestedColumn":"backlog"},{"title":"Task B","description":"Do B","suggestedColumn":"todo"}]}\n```';
      const result = (orchestrator as any).parseResponse(response);

      expect(result.tasks.length).toBe(2);
      expect(result.tasks[0].title).toBe('Task A');
      expect(result.tasks[1].title).toBe('Task B');
    });

    it('extracts epic + tasks', () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const response = '```json\n{"epic":{"title":"My Epic","description":"A big feature"},"tasks":[{"title":"Sub 1","description":"Part 1","suggestedColumn":"backlog"}]}\n```';
      const result = (orchestrator as any).parseResponse(response);

      expect(result.epicDef).toBeDefined();
      expect(result.epicDef.title).toBe('My Epic');
      expect(result.tasks.length).toBe(1);
    });

    it('returns empty tasks for plain text response', () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const result = (orchestrator as any).parseResponse('Just a plain text response with no JSON.');

      expect(result.tasks).toEqual([]);
    });

    it('falls back to backlog for invalid suggestedColumn', () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const response = '```json\n{"tasks":[{"title":"T","description":"D","suggestedColumn":"invalid_column"}]}\n```';
      const result = (orchestrator as any).parseResponse(response);

      expect(result.tasks[0].suggestedColumn).toBe('backlog');
    });

    it('returns empty tasks when JSON is malformed', () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const result = (orchestrator as any).parseResponse('```json\n{broken json\n```');

      expect(result.tasks).toEqual([]);
    });

    it('handles missing tasks field gracefully', () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const result = (orchestrator as any).parseResponse('```json\n{"epic":{"title":"E","description":"D"}}\n```');

      expect(result.tasks).toEqual([]);
      expect(result.epicDef).toBeDefined();
    });
  });

  // ─── handleMessage ──────────────────────────────────────────────────────────

  describe('handleMessage', () => {
    it('calls callLLM with correct provider', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);
      makeLLMReturn('Hello');

      await orchestrator.handleMessage('Hi there', mockAgents, vi.fn());

      expect(callLLM).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic' }));
    });

    it('accumulates conversation history across multiple calls', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);
      makeLLMReturn('Hello back');

      await orchestrator.handleMessage('First message', mockAgents, vi.fn());

      let capturedMessages: any[] = [];
      (callLLM as any).mockImplementation(async ({ messages, onChunk }: any) => {
        capturedMessages = [...messages]; // snapshot before assistant push mutates the array
        onChunk?.('Second response');
        return 'Second response';
      });

      await orchestrator.handleMessage('Second message', mockAgents, vi.fn());

      // user1, assistant1, user2 — captured before the assistant push
      expect(capturedMessages.length).toBe(3);
    });

    it('creates tasks when JSON block returned', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const jsonResponse = 'Sure!\n```json\n{"tasks":[{"title":"T1","description":"D1","suggestedColumn":"backlog"}]}\n```';
      makeLLMReturn(jsonResponse);

      const result = await orchestrator.handleMessage('Create a task', mockAgents, vi.fn());

      expect(result.newTasks.length).toBe(1);
      expect(result.newTasks[0].title).toBe('T1');
      expect(ws.writeBoard).toHaveBeenCalled();
    });

    it('creates epic and tasks when epic present in JSON', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const jsonResponse = '```json\n{"epic":{"title":"Big Feature","description":"A major feature"},"tasks":[{"title":"Sub 1","description":"D1","suggestedColumn":"backlog"}]}\n```';
      makeLLMReturn(jsonResponse);

      const result = await orchestrator.handleMessage('Build big feature', mockAgents, vi.fn());

      expect(result.newEpic).toBeDefined();
      expect(result.newEpic!.title).toBe('Big Feature');
      expect(result.newTasks.length).toBe(1);
      expect(result.newTasks[0].epicId).toBe(result.newEpic!.id);
    });

    it('throws when no API key is configured', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      sec.getApiKey.mockResolvedValue(null);
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      await expect(
        orchestrator.handleMessage('Hello', mockAgents, vi.fn())
      ).rejects.toThrow(/No.*API key/);
    });
  });

  // ─── generateKickMessage ────────────────────────────────────────────────────

  describe('generateKickMessage', () => {
    it('returns fallback message when no API key', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      sec.getApiKey.mockResolvedValue(null);
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const result = await orchestrator.generateKickMessage(mockAgent, mockTask, 'I got stuck');

      expect(result).toContain('MOVE_TASK');
    });

    it('calls LLM and returns trimmed response', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      (callLLM as any).mockImplementation(async ({ onChunk }: any) => {
        onChunk?.('Fix it now');
        return 'Fix it now';
      });

      const result = await orchestrator.generateKickMessage(mockAgent, mockTask, 'I got stuck');

      expect(result).toBe('Fix it now');
    });

    it('returns fallback if LLM returns empty string', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      (callLLM as any).mockImplementation(async () => '');

      const result = await orchestrator.generateKickMessage(mockAgent, mockTask, 'stuck');

      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ─── decomposeTask ──────────────────────────────────────────────────────────

  describe('decomposeTask', () => {
    it('creates subtasks from LLM JSON array and writes to board', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const jsonArray = '[{"title":"Sub1","description":"D1"},{"title":"Sub2","description":"D2"}]';
      (callLLM as any).mockImplementation(async ({ onChunk }: any) => {
        onChunk?.(jsonArray);
        return jsonArray;
      });

      const result = await orchestrator.decomposeTask(mockTask, mockAgents);

      expect(result.length).toBe(2);
      expect(result[0].title).toBe('Sub1');
      expect(ws.writeBoard).toHaveBeenCalled();
    });

    it('falls back to 2 generic subtasks on JSON parse error', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      // Must contain brackets to trigger JSON.parse → then throw → catch → fallback
      makeLLMReturn('[{broken: json, "missing": quote}]');

      const result = await orchestrator.decomposeTask(mockTask, mockAgents);

      expect(result.length).toBe(2);
      expect(result[0].title).toContain(mockTask.title);
    });

    it('subtasks inherit epicId from parent task', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const jsonArray = '[{"title":"Sub1","description":"D1"}]';
      makeLLMReturn(jsonArray);

      const taskWithEpic = { ...mockTask, epicId: 'epic-42' };
      const result = await orchestrator.decomposeTask(taskWithEpic, mockAgents);

      expect(result[0].epicId).toBe('epic-42');
    });

    it('subtasks are placed in backlog column', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      makeLLMReturn('[{"title":"S1","description":"D1"}]');

      const result = await orchestrator.decomposeTask(mockTask, mockAgents);

      expect(result[0].columnId).toBe('backlog');
    });

    it('throws when no API key configured for decomposition', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      sec.getApiKey.mockResolvedValue(null);
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      await expect(orchestrator.decomposeTask(mockTask, mockAgents)).rejects.toThrow();
    });
  });

  // ─── clearHistory ───────────────────────────────────────────────────────────

  describe('clearHistory', () => {
    it('clears conversation history so next call starts fresh', async () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      makeLLMReturn('First response');
      await orchestrator.handleMessage('First message', mockAgents, vi.fn());

      orchestrator.clearHistory();

      let capturedMessages: any[] = [];
      (callLLM as any).mockImplementation(async ({ messages, onChunk }: any) => {
        capturedMessages = [...messages]; // snapshot before assistant push
        onChunk?.('Second response');
        return 'Second response';
      });

      await orchestrator.handleMessage('Second message', mockAgents, vi.fn());

      // After clear, only 1 message (the new user message, before assistant push)
      expect(capturedMessages.length).toBe(1);
    });
  });

  // ─── buildChatMessage ───────────────────────────────────────────────────────

  describe('buildChatMessage', () => {
    it('creates message with correct fields', () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const message = orchestrator.buildChatMessage('user', 'hello');

      expect(message.id).toBe('mock-uuid');
      expect(message.agentId).toBe('orchestrator');
      expect(message.role).toBe('user');
      expect(message.content).toBe('hello');
      expect(message.timestamp).toBeDefined();
    });

    it('creates assistant message correctly', () => {
      const ws = createMockWorkspace();
      const sec = createMockSecrets();
      const orchestrator = new OrchestratorAgent(ws as any, sec as any);

      const message = orchestrator.buildChatMessage('assistant', 'response text');

      expect(message.role).toBe('assistant');
      expect(message.content).toBe('response text');
    });
  });
});
