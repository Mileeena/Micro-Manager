import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgencyWorkspace } from '../services/AgencyWorkspace';
import type { BoardState, Task, TaskHistoryEntry } from '../types';

// The vscode module is aliased to the mock in vitest.config.ts
import * as vscode from 'vscode';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWorkspaceFolder(fsPath = '/workspace'): vscode.WorkspaceFolder {
  return {
    uri: {
      fsPath,
      path: fsPath,
      scheme: 'file',
      authority: '',
      query: '',
      fragment: '',
      with: vi.fn(),
      toJSON: vi.fn(),
      toString: () => fsPath,
    } as any,
    name: 'test-workspace',
    index: 0,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: 'A test task',
    columnId: 'backlog',
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeBoardJson(overrides: Partial<BoardState> = {}): string {
  const board: BoardState = {
    columns: { backlog: [], todo: [], 'in-progress': [], done: [] },
    epics: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  return JSON.stringify(board);
}

/** Encode string to Uint8Array the same way Buffer does */
function encode(text: string): Uint8Array {
  return Buffer.from(text, 'utf-8');
}

describe('AgencyWorkspace', () => {
  let workspace: AgencyWorkspace;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: Uri.joinPath returns a simple object
    (vscode.Uri.joinPath as any).mockImplementation((...args: any[]) => {
      const parts = args.map((a: any) => (typeof a === 'string' ? a : a.path ?? a.fsPath ?? String(a)));
      const joined = parts.join('/');
      return { fsPath: joined, path: joined, toString: () => joined };
    });

    workspace = new AgencyWorkspace(makeWorkspaceFolder());
  });

  // ─── readBoard() ────────────────────────────────────────────────────────────

  describe('readBoard()', () => {
    it('returns DEFAULT_BOARD when file read fails', async () => {
      (vscode.workspace.fs.readFile as any).mockRejectedValue(new Error('FileNotFound'));

      const board = await workspace.readBoard();

      expect(board.columns).toBeDefined();
      expect(board.columns.backlog).toEqual([]);
      expect(board.columns.todo).toEqual([]);
      expect(board.columns['in-progress']).toEqual([]);
      expect(board.columns.done).toEqual([]);
      expect(board.epics).toEqual([]);
    });

    it('parses valid JSON board from file', async () => {
      const task = makeTask({ id: 'task-abc', title: 'My task', columnId: 'todo' });
      const boardJson = makeBoardJson({ columns: { backlog: [], todo: [task], 'in-progress': [], done: [] } });
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(boardJson));

      const board = await workspace.readBoard();

      expect(board.columns.todo).toHaveLength(1);
      expect(board.columns.todo[0].id).toBe('task-abc');
    });

    it('adds epics:[] migration when field is missing from old board file', async () => {
      // Old board without epics field
      const oldBoard = {
        columns: { backlog: [], todo: [], 'in-progress': [], done: [] },
        updatedAt: new Date().toISOString(),
        // Note: no 'epics' field
      };
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(JSON.stringify(oldBoard)));

      const board = await workspace.readBoard();

      expect(board.epics).toEqual([]);
    });

    it('preserves epics when already present', async () => {
      const epic = { id: 'e1', title: 'Feature X', description: '', status: 'active' as const, createdAt: '' };
      const boardJson = makeBoardJson({ epics: [epic] });
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(boardJson));

      const board = await workspace.readBoard();

      expect(board.epics).toHaveLength(1);
      expect(board.epics[0].id).toBe('e1');
    });
  });

  // ─── writeBoard() ───────────────────────────────────────────────────────────

  describe('writeBoard()', () => {
    it('stringifies board and writes to .agency/board.json path', async () => {
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);
      const board: BoardState = {
        columns: { backlog: [], todo: [], 'in-progress': [], done: [] },
        epics: [],
        updatedAt: new Date().toISOString(),
      };

      await workspace.writeBoard(board);

      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      const [uriArg, bytesArg] = (vscode.workspace.fs.writeFile as any).mock.calls[0];
      const written = Buffer.from(bytesArg).toString('utf-8');
      const parsed = JSON.parse(written);
      expect(parsed.columns).toBeDefined();
      expect(parsed.epics).toEqual([]);
    });

    it('writes to a path containing board.json', async () => {
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);
      const board: BoardState = {
        columns: { backlog: [], todo: [], 'in-progress': [], done: [] },
        epics: [],
        updatedAt: new Date().toISOString(),
      };

      await workspace.writeBoard(board);

      const [uriArg] = (vscode.workspace.fs.writeFile as any).mock.calls[0];
      const uriStr = uriArg.toString();
      expect(uriStr).toContain('board.json');
    });

    it('updates updatedAt timestamp on write', async () => {
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);
      const originalUpdatedAt = '2020-01-01T00:00:00.000Z';
      const board: BoardState = {
        columns: { backlog: [], todo: [], 'in-progress': [], done: [] },
        epics: [],
        updatedAt: originalUpdatedAt,
      };

      await workspace.writeBoard(board);

      // The board passed in has its updatedAt mutated by writeBoard
      expect(board.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  // ─── getNetworkPolicy() ──────────────────────────────────────────────────────

  describe('getNetworkPolicy()', () => {
    it('returns open by default when whitelist file is missing', async () => {
      (vscode.workspace.fs.readFile as any).mockRejectedValue(new Error('FileNotFound'));

      const policy = await workspace.getNetworkPolicy();
      expect(policy).toBe('open');
    });

    it('returns policy stored in whitelist file', async () => {
      const store = { commands: [], networkPolicy: 'strict', orchestrator: { provider: 'anthropic', model: 'x' } };
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(JSON.stringify(store)));

      const policy = await workspace.getNetworkPolicy();
      expect(policy).toBe('strict');
    });
  });

  // ─── isWhitelisted() ────────────────────────────────────────────────────────

  describe('isWhitelisted()', () => {
    it('returns false when command is not in whitelist', async () => {
      const store = { commands: [], networkPolicy: 'open', orchestrator: { provider: 'anthropic', model: 'x' } };
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(JSON.stringify(store)));

      const result = await workspace.isWhitelisted('npm install');
      expect(result).toBe(false);
    });

    it('returns true for a command that matches an entry in the whitelist', async () => {
      const store = {
        commands: [{ command: 'npm run build', addedAt: new Date().toISOString() }],
        networkPolicy: 'open',
        orchestrator: { provider: 'anthropic', model: 'x' },
      };
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(JSON.stringify(store)));

      const result = await workspace.isWhitelisted('npm run build');
      expect(result).toBe(true);
    });
  });

  // ─── addToWhitelist() ────────────────────────────────────────────────────────

  describe('addToWhitelist()', () => {
    it('adds a command to the whitelist store', async () => {
      const store = { commands: [], networkPolicy: 'open', orchestrator: { provider: 'anthropic', model: 'x' } };
      // readFile for read, then writeFile for write
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(JSON.stringify(store)));
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);

      await workspace.addToWhitelist('npm run test');

      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      const [, bytesArg] = (vscode.workspace.fs.writeFile as any).mock.calls[0];
      const written = JSON.parse(Buffer.from(bytesArg).toString('utf-8'));
      expect(written.commands.some((e: any) => e.command === 'npm run test')).toBe(true);
    });

    it('does not add duplicate command to whitelist', async () => {
      const store = {
        commands: [{ command: 'npm run build', addedAt: new Date().toISOString() }],
        networkPolicy: 'open',
        orchestrator: { provider: 'anthropic', model: 'x' },
      };
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(JSON.stringify(store)));
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);

      await workspace.addToWhitelist('npm run build');

      // writeFile should NOT have been called since command already exists
      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  // ─── parseAgentProfile() via readAgentProfiles() ─────────────────────────────

  describe('readAgentProfiles() / parseAgentProfile()', () => {
    it('parses a developer agent markdown profile correctly', async () => {
      const profileContent = `# Developer Agent

**Role:** Full-Stack Developer
**Mission:** Implement features and fix bugs.
**Metrics:** Task completion rate
**Provider:** anthropic
**Model:** claude-sonnet-4-6
**Allowed Commands:** git commit, npm run test
`;
      // First readDirectory call returns one .md file
      (vscode.workspace.fs.readDirectory as any).mockResolvedValue([
        ['developer.md', 1], // FileType.File = 1
      ]);
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(profileContent));

      const profiles = await workspace.readAgentProfiles();

      expect(profiles).toHaveLength(1);
      expect(profiles[0].id).toBe('developer');
      expect(profiles[0].name).toBe('Developer Agent');
      expect(profiles[0].role).toBe('Full-Stack Developer');
      expect(profiles[0].provider).toBe('anthropic');
      expect(profiles[0].model).toBe('claude-sonnet-4-6');
      expect(profiles[0].allowedCommands).toContain('git commit');
      expect(profiles[0].allowedCommands).toContain('npm run test');
    });

    it('returns empty array when agents directory listing fails', async () => {
      (vscode.workspace.fs.readDirectory as any).mockRejectedValue(new Error('Dir not found'));

      const profiles = await workspace.readAgentProfiles();
      expect(profiles).toEqual([]);
    });

    it('skips non-.md files in agents directory', async () => {
      (vscode.workspace.fs.readDirectory as any).mockResolvedValue([
        ['notes.txt', 1],
        ['developer.md', 1],
      ]);
      const profileContent = `# Dev\n**Role:** Developer\n**Mission:** Code\n**Metrics:** Speed\n**Provider:** anthropic\n**Model:** claude-sonnet-4-6\n`;
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(profileContent));

      const profiles = await workspace.readAgentProfiles();
      // Only one profile (the .md file)
      expect(profiles).toHaveLength(1);
    });

    it('uses filename (without .md) as profile id', async () => {
      (vscode.workspace.fs.readDirectory as any).mockResolvedValue([
        ['my-custom-agent.md', 1],
      ]);
      const profileContent = `# Custom Agent\n**Role:** Helper\n**Mission:** Assist\n**Metrics:** None\n**Provider:** openai\n**Model:** gpt-4\n`;
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(profileContent));

      const profiles = await workspace.readAgentProfiles();
      expect(profiles[0].id).toBe('my-custom-agent');
    });

    it('defaults allowedCommands to empty array when not specified', async () => {
      (vscode.workspace.fs.readDirectory as any).mockResolvedValue([
        ['agent.md', 1],
      ]);
      const profileContent = `# Agent\n**Role:** Helper\n**Mission:** Help\n**Metrics:** None\n**Provider:** openai\n**Model:** gpt-4\n`;
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(profileContent));

      const profiles = await workspace.readAgentProfiles();
      expect(profiles[0].allowedCommands).toEqual([]);
    });
  });

  // ─── addTaskHistory() ────────────────────────────────────────────────────────

  describe('addTaskHistory()', () => {
    it('appends a history entry to the matching task in the board', async () => {
      const task = makeTask({ id: 'task-1', columnId: 'backlog' });
      const boardJson = makeBoardJson({
        columns: { backlog: [task], todo: [], 'in-progress': [], done: [] },
      });
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(boardJson));
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);

      const entry: TaskHistoryEntry = {
        timestamp: new Date().toISOString(),
        event: 'agent_started',
        detail: 'Agent began working on task',
      };

      await workspace.addTaskHistory('task-1', entry);

      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      const [, bytesArg] = (vscode.workspace.fs.writeFile as any).mock.calls[0];
      const written = JSON.parse(Buffer.from(bytesArg).toString('utf-8')) as BoardState;
      const savedTask = written.columns.backlog[0];
      expect(savedTask.history).toBeDefined();
      expect(savedTask.history).toHaveLength(1);
      expect(savedTask.history![0].event).toBe('agent_started');
    });

    it('initializes history array when task has no prior history', async () => {
      const task = makeTask({ id: 'task-2', columnId: 'todo', history: undefined });
      const boardJson = makeBoardJson({
        columns: { backlog: [], todo: [task], 'in-progress': [], done: [] },
      });
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(boardJson));
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);

      const entry: TaskHistoryEntry = {
        timestamp: new Date().toISOString(),
        event: 'moved',
        detail: 'Moved to in-progress',
      };

      await workspace.addTaskHistory('task-2', entry);

      const [, bytesArg] = (vscode.workspace.fs.writeFile as any).mock.calls[0];
      const written = JSON.parse(Buffer.from(bytesArg).toString('utf-8')) as BoardState;
      expect(written.columns.todo[0].history).toHaveLength(1);
    });

    it('appends to existing history entries', async () => {
      const existingEntry: TaskHistoryEntry = {
        timestamp: new Date().toISOString(),
        event: 'created',
        detail: 'Task was created',
      };
      const task = makeTask({ id: 'task-3', columnId: 'backlog', history: [existingEntry] });
      const boardJson = makeBoardJson({
        columns: { backlog: [task], todo: [], 'in-progress': [], done: [] },
      });
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(boardJson));
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);

      const newEntry: TaskHistoryEntry = {
        timestamp: new Date().toISOString(),
        event: 'assigned',
        detail: 'Assigned to dev agent',
      };

      await workspace.addTaskHistory('task-3', newEntry);

      const [, bytesArg] = (vscode.workspace.fs.writeFile as any).mock.calls[0];
      const written = JSON.parse(Buffer.from(bytesArg).toString('utf-8')) as BoardState;
      expect(written.columns.backlog[0].history).toHaveLength(2);
      expect(written.columns.backlog[0].history![1].event).toBe('assigned');
    });

    it('silently ignores when task id does not exist in any column', async () => {
      const boardJson = makeBoardJson();
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(boardJson));
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);

      const entry: TaskHistoryEntry = {
        timestamp: new Date().toISOString(),
        event: 'moved',
        detail: 'Moved',
      };

      // Should not throw
      await expect(workspace.addTaskHistory('nonexistent-id', entry)).resolves.toBeUndefined();
      // writeFile should not be called since task wasn't found
      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });

    it('does not throw when board read fails', async () => {
      (vscode.workspace.fs.readFile as any).mockRejectedValue(new Error('IO Error'));

      const entry: TaskHistoryEntry = {
        timestamp: new Date().toISOString(),
        event: 'moved',
        detail: 'test',
      };

      // addTaskHistory swallows errors — should not throw
      await expect(workspace.addTaskHistory('any-id', entry)).resolves.toBeUndefined();
    });
  });

  // ─── readWhitelist() migration ───────────────────────────────────────────────

  describe('readWhitelist() migration', () => {
    it('adds orchestrator field when missing from old whitelist files', async () => {
      const oldStore = { commands: [], networkPolicy: 'open' };
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encode(JSON.stringify(oldStore)));

      const store = await workspace.readWhitelist();

      expect(store.orchestrator).toBeDefined();
      expect(store.orchestrator.provider).toBeDefined();
      expect(store.orchestrator.model).toBeDefined();
    });

    it('returns DEFAULT_WHITELIST when read fails', async () => {
      (vscode.workspace.fs.readFile as any).mockRejectedValue(new Error('FileNotFound'));

      const store = await workspace.readWhitelist();

      expect(store.commands).toEqual([]);
      expect(store.networkPolicy).toBe('open');
      expect(store.orchestrator).toBeDefined();
    });
  });

  // ─── workspaceUri getter ─────────────────────────────────────────────────────

  describe('workspaceUri getter', () => {
    it('returns the workspace folder URI', () => {
      const folder = makeWorkspaceFolder('/my/project');
      const ws = new AgencyWorkspace(folder);
      expect(ws.workspaceUri).toBe(folder.uri);
    });
  });
});
