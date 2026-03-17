import { create } from 'zustand';
import { vscode } from '../vscode';

export type AgentStatus = 'idle' | 'thinking' | 'coding' | 'waiting' | 'error';
export type AgentProvider = 'anthropic' | 'openai' | 'openrouter';
export type NetworkPolicy = 'open' | 'strict';

export interface AgentState {
  id: string;
  name: string;
  role: string;
  mission: string;
  metrics: string;
  avatarSeed: string;
  provider: AgentProvider;
  model: string;
  status: AgentStatus;
  currentTaskId?: string;
}

export interface OrchestratorSettings {
  provider: AgentProvider;
  model: string;
}

interface AgentStore {
  agents: AgentState[];
  networkPolicy: NetworkPolicy;
  apiKeyStatus: Record<AgentProvider, boolean>;
  orchestrator: OrchestratorSettings;
  setAgents: (agents: AgentState[]) => void;
  updateStatus: (agentId: string, status: AgentStatus, currentTaskId?: string) => void;
  updateAgentSettings: (agentId: string, provider: AgentProvider, model: string) => void;
  setNetworkPolicy: (policy: NetworkPolicy) => void;
  setApiKeyStatus: (provider: AgentProvider, hasKey: boolean) => void;
  saveApiKey: (provider: AgentProvider, key: string) => void;
  deleteApiKey: (provider: AgentProvider) => void;
  runAgentOnTask: (agentId: string, taskId: string) => void;
  setOrchestratorSettings: (provider: AgentProvider, model: string) => void;
  setOrchestratorSettingsLocal: (settings: OrchestratorSettings) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  networkPolicy: 'open',
  apiKeyStatus: { anthropic: false, openai: false, openrouter: false },
  orchestrator: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-5' },

  setAgents: (agents) => set({ agents }),

  updateStatus: (agentId, status, currentTaskId) =>
    set((state) => ({
      agents: state.agents.map(a =>
        a.id === agentId ? { ...a, status, currentTaskId } : a
      ),
    })),

  updateAgentSettings: (agentId, provider, model) => {
    set((state) => ({
      agents: state.agents.map(a =>
        a.id === agentId ? { ...a, provider, model } : a
      ),
    }));
    vscode.postMessage({ type: 'updateAgentSettings', agentId, provider, model });
  },

  setNetworkPolicy: (policy) => {
    set({ networkPolicy: policy });
    vscode.postMessage({ type: 'setNetworkPolicy', policy });
  },

  setApiKeyStatus: (provider, hasKey) =>
    set((state) => ({
      apiKeyStatus: { ...state.apiKeyStatus, [provider]: hasKey },
    })),

  saveApiKey: (provider, key) => {
    vscode.postMessage({ type: 'saveApiKey', provider, key });
  },

  deleteApiKey: (provider) => {
    vscode.postMessage({ type: 'deleteApiKey', provider });
  },

  runAgentOnTask: (agentId, taskId) => {
    vscode.postMessage({ type: 'runAgentOnTask', agentId, taskId });
  },

  setOrchestratorSettings: (provider, model) => {
    set({ orchestrator: { provider, model } });
    vscode.postMessage({ type: 'setOrchestratorSettings', provider, model });
  },

  // Только локально (из init-сообщения)
  setOrchestratorSettingsLocal: (settings) => set({ orchestrator: settings }),
}));
