import * as vscode from 'vscode';
import { BoardState, AgentProfile, WhitelistStore, OrchestratorSettings } from '../types';
import { FileSystemService } from './FileSystemService';

const AGENCY_DIR = '.agency';
const BOARD_FILE = '.agency/board.json';
const BIBLE_FILE = '.agency/BIBLE.md';
const WHITELIST_FILE = '.agency/whitelist.json';
const AGENTS_DIR = '.agency/agents';
const LOGS_DIR = '.agency/logs';

const BIBLE_TEMPLATE = `# Project Bible

> Edit this file to give your AI agents persistent context about this project.
> Its contents are injected into the system prompt of EVERY agent.

## Project Overview

[Describe what this project does and its goals]

## Tech Stack

[List the main technologies, frameworks, and libraries used]

## Coding Standards

[List naming conventions, formatting rules, architecture patterns]

## Important Files

[List key files and what they do]

## Current Focus

[What the team is working on right now]
`;

const DEFAULT_BOARD: BoardState = {
  columns: {
    backlog: [],
    todo: [],
    'in-progress': [],
    done: [],
  },
  updatedAt: new Date().toISOString(),
};

const DEFAULT_WHITELIST: WhitelistStore = {
  commands: [],
  networkPolicy: 'open',
  orchestrator: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-5' },
};

const DEVELOPER_AGENT_TEMPLATE = `# Developer Agent

**Role:** Full-Stack Developer
**Mission:** Implement features and fix bugs based on Kanban tasks. Write clean, tested code following the project's coding standards.
**Metrics:** Task completion rate, code quality, test coverage
**Provider:** anthropic
**Model:** claude-sonnet-4-6
`;

export class AgencyWorkspace {
  private readonly fs: FileSystemService;

  constructor(private readonly workspaceFolder: vscode.WorkspaceFolder) {
    this.fs = new FileSystemService(workspaceFolder.uri);
  }

  async initialize(): Promise<void> {
    // Create .agency/ directory structure
    if (!(await this.fs.exists(AGENCY_DIR))) {
      await this.fs.createDirectory(AGENCY_DIR);
    }
    if (!(await this.fs.exists(AGENTS_DIR))) {
      await this.fs.createDirectory(AGENTS_DIR);
    }
    if (!(await this.fs.exists(LOGS_DIR))) {
      await this.fs.createDirectory(LOGS_DIR);
    }

    // Initialize files if they don't exist
    if (!(await this.fs.exists(BOARD_FILE))) {
      await this.writeBoard(DEFAULT_BOARD);
    }
    if (!(await this.fs.exists(BIBLE_FILE))) {
      await this.fs.writeFile(BIBLE_FILE, BIBLE_TEMPLATE);
    }
    if (!(await this.fs.exists(WHITELIST_FILE))) {
      await this.writeWhitelist(DEFAULT_WHITELIST);
    }

    // Create a default developer agent profile
    const devProfile = `${AGENTS_DIR}/developer.md`;
    if (!(await this.fs.exists(devProfile))) {
      await this.fs.writeFile(devProfile, DEVELOPER_AGENT_TEMPLATE);
    }
  }

  // ─── Board ─────────────────────────────────────────────────────────────────

  async readBoard(): Promise<BoardState> {
    try {
      const raw = await this.fs.readFile(BOARD_FILE);
      return JSON.parse(raw) as BoardState;
    } catch {
      return { ...DEFAULT_BOARD, updatedAt: new Date().toISOString() };
    }
  }

  async writeBoard(board: BoardState): Promise<void> {
    board.updatedAt = new Date().toISOString();
    await this.fs.writeFile(BOARD_FILE, JSON.stringify(board, null, 2));
  }

  // ─── BIBLE ─────────────────────────────────────────────────────────────────

  async readBible(): Promise<string> {
    try {
      return await this.fs.readFile(BIBLE_FILE);
    } catch {
      return '';
    }
  }

  // ─── Agent Profiles ────────────────────────────────────────────────────────

  async readAgentProfiles(): Promise<AgentProfile[]> {
    try {
      const entries = await this.fs.listDir(AGENTS_DIR);
      const profiles: AgentProfile[] = [];

      for (const [name, type] of entries) {
        if (type === vscode.FileType.File && name.endsWith('.md')) {
          const content = await this.fs.readFile(`${AGENTS_DIR}/${name}`);
          const profile = this.parseAgentProfile(name, content);
          if (profile) profiles.push(profile);
        }
      }
      return profiles;
    } catch {
      return [];
    }
  }

  /** Parse msitarzewski/agency-agents style markdown profile */
  private parseAgentProfile(filename: string, content: string): AgentProfile | null {
    try {
      const nameMatch = content.match(/^#\s+(.+)$/m);
      const roleMatch = content.match(/\*\*Role:\*\*\s+(.+)$/m);
      const missionMatch = content.match(/\*\*Mission:\*\*\s+([\s\S]+?)(?=\*\*|$)/m);
      const metricsMatch = content.match(/\*\*Metrics:\*\*\s+(.+)$/m);
      const providerMatch = content.match(/\*\*Provider:\*\*\s+(.+)$/m);
      const modelMatch = content.match(/\*\*Model:\*\*\s+(.+)$/m);

      const id = filename.replace('.md', '');
      const name = nameMatch?.[1]?.trim() ?? id;

      return {
        id,
        name,
        role: roleMatch?.[1]?.trim() ?? 'Agent',
        mission: missionMatch?.[1]?.trim() ?? '',
        metrics: metricsMatch?.[1]?.trim() ?? '',
        avatarSeed: id,
        provider: (providerMatch?.[1]?.trim() as 'anthropic' | 'openai' | 'openrouter') ?? 'anthropic',
        model: modelMatch?.[1]?.trim() ?? 'claude-sonnet-4-6',
      };
    } catch {
      return null;
    }
  }

  async writeAgentProfile(id: string, content: string): Promise<void> {
    await this.fs.writeFile(`${AGENTS_DIR}/${id}.md`, content);
  }

  // ─── Whitelist ─────────────────────────────────────────────────────────────

  async readWhitelist(): Promise<WhitelistStore> {
    try {
      const raw = await this.fs.readFile(WHITELIST_FILE);
      const store = JSON.parse(raw) as WhitelistStore;
      // Migrate old files that don't have orchestrator field
      if (!store.orchestrator) {
        store.orchestrator = { ...DEFAULT_WHITELIST.orchestrator };
      }
      return store;
    } catch {
      return { ...DEFAULT_WHITELIST };
    }
  }

  async writeWhitelist(store: WhitelistStore): Promise<void> {
    await this.fs.writeFile(WHITELIST_FILE, JSON.stringify(store, null, 2));
  }

  async addToWhitelist(command: string): Promise<void> {
    const store = await this.readWhitelist();
    if (!store.commands.some(e => e.command === command)) {
      store.commands.push({ command, addedAt: new Date().toISOString() });
      await this.writeWhitelist(store);
    }
  }

  async isWhitelisted(command: string): Promise<boolean> {
    const store = await this.readWhitelist();
    return store.commands.some(e => e.command === command);
  }

  async getNetworkPolicy(): Promise<'open' | 'strict'> {
    const store = await this.readWhitelist();
    return store.networkPolicy;
  }

  async setNetworkPolicy(policy: 'open' | 'strict'): Promise<void> {
    const store = await this.readWhitelist();
    store.networkPolicy = policy;
    await this.writeWhitelist(store);
  }

  async getOrchestratorSettings(): Promise<OrchestratorSettings> {
    const store = await this.readWhitelist();
    return store.orchestrator;
  }

  async setOrchestratorSettings(settings: OrchestratorSettings): Promise<void> {
    const store = await this.readWhitelist();
    store.orchestrator = settings;
    await this.writeWhitelist(store);
  }

  async updateAgentProfileSettings(id: string, provider: string, model: string): Promise<void> {
    const filePath = `${AGENTS_DIR}/${id}.md`;
    try {
      let content = await this.fs.readFile(filePath);
      // Replace or append Provider and Model lines
      if (/\*\*Provider:\*\*/m.test(content)) {
        content = content.replace(/\*\*Provider:\*\*.*$/m, `**Provider:** ${provider}`);
      } else {
        content += `\n**Provider:** ${provider}`;
      }
      if (/\*\*Model:\*\*/m.test(content)) {
        content = content.replace(/\*\*Model:\*\*.*$/m, `**Model:** ${model}`);
      } else {
        content += `\n**Model:** ${model}`;
      }
      await this.fs.writeFile(filePath, content);
    } catch {
      // File might not exist yet — ignore
    }
  }

  // ─── Logs ──────────────────────────────────────────────────────────────────

  async writeLog(entry: { agentId: string; action: string; details: unknown }): Promise<void> {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const logFile = `${LOGS_DIR}/${date}.jsonl`;
      const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';

      let existing = '';
      try {
        existing = await this.fs.readFile(logFile);
      } catch {
        // File doesn't exist yet
      }
      await this.fs.writeFile(logFile, existing + line);
    } catch {
      // Log failures are non-fatal
    }
  }

  get workspaceUri(): vscode.Uri {
    return this.workspaceFolder.uri;
  }
}
