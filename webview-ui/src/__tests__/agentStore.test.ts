import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../vscode', () => ({
  vscode: {
    postMessage: vi.fn(),
    getState: vi.fn(() => undefined),
    setState: vi.fn(),
  },
}));

import { useAgentStore, AgentState, AgentProvider } from '../store/agentStore';
import { vscode } from '../vscode';

const makeAgent = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Test Agent',
  role: 'Developer',
  mission: 'Write code',
  metrics: '',
  avatarSeed: 'seed123',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  status: 'idle',
  ...overrides,
});

describe('agentStore', () => {
  beforeEach(() => {
    useAgentStore.setState({
      agents: [],
      networkPolicy: 'open',
      apiKeyStatus: { anthropic: false, openai: false, openrouter: false },
      orchestrator: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-5' },
    });
    vi.clearAllMocks();
  });

  it('initial state: agents=[], apiKeyStatus all false, networkPolicy=open', () => {
    const state = useAgentStore.getState();
    expect(state.agents).toEqual([]);
    expect(state.apiKeyStatus).toEqual({ anthropic: false, openai: false, openrouter: false });
    expect(state.networkPolicy).toBe('open');
  });

  it('setAgents() replaces agent list', () => {
    const agents = [makeAgent({ id: 'agent-1' }), makeAgent({ id: 'agent-2', name: 'Agent Two' })];
    useAgentStore.getState().setAgents(agents);
    expect(useAgentStore.getState().agents).toEqual(agents);
    expect(useAgentStore.getState().agents).toHaveLength(2);
  });

  it('updateStatus() updates agent status by id', () => {
    useAgentStore.getState().setAgents([makeAgent({ id: 'agent-1', status: 'idle' })]);
    useAgentStore.getState().updateStatus('agent-1', 'thinking');
    const agent = useAgentStore.getState().agents.find(a => a.id === 'agent-1');
    expect(agent?.status).toBe('thinking');
  });

  it('updateStatus() sets currentTaskId when provided', () => {
    useAgentStore.getState().setAgents([makeAgent({ id: 'agent-1' })]);
    useAgentStore.getState().updateStatus('agent-1', 'coding', 'task-99');
    const agent = useAgentStore.getState().agents.find(a => a.id === 'agent-1');
    expect(agent?.status).toBe('coding');
    expect(agent?.currentTaskId).toBe('task-99');
  });

  it('updateStatus() does not affect other agents', () => {
    useAgentStore.getState().setAgents([
      makeAgent({ id: 'agent-1', status: 'idle' }),
      makeAgent({ id: 'agent-2', status: 'idle' }),
    ]);
    useAgentStore.getState().updateStatus('agent-1', 'error');
    const agent2 = useAgentStore.getState().agents.find(a => a.id === 'agent-2');
    expect(agent2?.status).toBe('idle');
  });

  it('setApiKeyStatus() sets true for provider', () => {
    useAgentStore.getState().setApiKeyStatus('anthropic', true);
    expect(useAgentStore.getState().apiKeyStatus.anthropic).toBe(true);
    expect(useAgentStore.getState().apiKeyStatus.openai).toBe(false);
    expect(useAgentStore.getState().apiKeyStatus.openrouter).toBe(false);
  });

  it('setApiKeyStatus() sets false for provider', () => {
    useAgentStore.setState({
      apiKeyStatus: { anthropic: true, openai: true, openrouter: true },
    });
    useAgentStore.getState().setApiKeyStatus('openai', false);
    expect(useAgentStore.getState().apiKeyStatus.openai).toBe(false);
    expect(useAgentStore.getState().apiKeyStatus.anthropic).toBe(true);
  });

  it('setNetworkPolicy() calls vscode.postMessage with setNetworkPolicy', () => {
    useAgentStore.getState().setNetworkPolicy('strict');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'setNetworkPolicy',
      policy: 'strict',
    });
    expect(useAgentStore.getState().networkPolicy).toBe('strict');
  });

  it('saveApiKey() calls vscode.postMessage with saveApiKey', () => {
    useAgentStore.getState().saveApiKey('anthropic', 'sk-test-key');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'saveApiKey',
      provider: 'anthropic',
      key: 'sk-test-key',
    });
  });

  it('deleteApiKey() calls vscode.postMessage with deleteApiKey', () => {
    useAgentStore.getState().deleteApiKey('openai');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'deleteApiKey',
      provider: 'openai',
    });
  });

  it('runAgentOnTask() calls vscode.postMessage with runAgentOnTask', () => {
    useAgentStore.getState().runAgentOnTask('agent-1', 'task-5');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'runAgentOnTask',
      agentId: 'agent-1',
      taskId: 'task-5',
    });
  });
});
