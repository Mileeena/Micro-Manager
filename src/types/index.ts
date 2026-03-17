// ─── Board & Tasks ────────────────────────────────────────────────────────────

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

// ─── Agents ───────────────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'thinking' | 'coding' | 'waiting' | 'error';
export type AgentProvider = 'anthropic' | 'openai' | 'openrouter';
export type NetworkPolicy = 'open' | 'strict';

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  mission: string;
  metrics: string;
  avatarSeed: string;
  provider: AgentProvider;
  model: string;
}

export interface AgentState extends AgentProfile {
  status: AgentStatus;
  currentTaskId?: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  /** 'orchestrator' for the Scrum Master, or an agent id for DMs */
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// ─── Whitelist & Settings ─────────────────────────────────────────────────────

export interface WhitelistEntry {
  command: string;
  addedAt: string;
}

export interface OrchestratorSettings {
  provider: AgentProvider;
  model: string;
}

export interface WhitelistStore {
  commands: WhitelistEntry[];
  networkPolicy: NetworkPolicy;
  orchestrator: OrchestratorSettings;
}

// ─── Extension ↔ Webview Message Protocol ────────────────────────────────────

export type ExtensionMessage =
  | {
      type: 'init';
      board: BoardState;
      agents: AgentState[];
      orchestratorMessages: ChatMessage[];
      dmMessages: Record<string, ChatMessage[]>;
      networkPolicy: NetworkPolicy;
      orchestrator: OrchestratorSettings;
    }
  | { type: 'boardUpdate'; board: BoardState }
  | { type: 'agentStatusUpdate'; agentId: string; status: AgentStatus; currentTaskId?: string }
  | { type: 'chatMessage'; message: ChatMessage }
  | { type: 'streamChunk'; agentId: string; chunk: string }
  | { type: 'streamEnd'; agentId: string }
  | { type: 'error'; message: string }
  | { type: 'apiKeyStatus'; provider: AgentProvider; hasKey: boolean }
  | { type: 'agentSettingsUpdated'; agentId: string; provider: AgentProvider; model: string };

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'moveTask'; taskId: string; toColumn: ColumnId; fromColumn: ColumnId }
  | { type: 'orchestratorMessage'; content: string }
  | { type: 'dmMessage'; agentId: string; content: string }
  | { type: 'createTask'; title: string; description: string; columnId?: ColumnId }
  | { type: 'assignTask'; taskId: string; agentId: string }
  | { type: 'runAgentOnTask'; taskId: string; agentId: string }
  | { type: 'saveApiKey'; provider: AgentProvider; key: string }
  | { type: 'deleteApiKey'; provider: AgentProvider }
  | { type: 'checkApiKey'; provider: AgentProvider }
  | { type: 'setNetworkPolicy'; policy: NetworkPolicy }
  | { type: 'setOrchestratorSettings'; provider: AgentProvider; model: string }
  | { type: 'updateAgentSettings'; agentId: string; provider: AgentProvider; model: string }
  | { type: 'createAgent'; name: string; role: string; mission: string; provider: AgentProvider; model: string };

// ─── LLM ─────────────────────────────────────────────────────────────────────

export interface LLMCallParams {
  provider: AgentProvider;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  apiKey: string;
  onChunk?: (chunk: string) => void;
}

// ─── Agent Actions (parsed from LLM output) ───────────────────────────────────

export type AgentAction =
  | { type: 'READ_FILE'; path: string }
  | { type: 'WRITE_FILE'; path: string; content: string }
  | { type: 'RUN_COMMAND'; cmd: string }
  | { type: 'CREATE_TASK'; title: string; description: string }
  | { type: 'MOVE_TASK'; taskId: string; toColumn: ColumnId };
