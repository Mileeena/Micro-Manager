import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../vscode', () => ({
  vscode: {
    postMessage: vi.fn(),
    getState: vi.fn(() => undefined),
    setState: vi.fn(),
  },
}));

import { useChatStore, ChatMessage } from '../store/chatStore';
import { vscode } from '../vscode';

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  agentId: 'orchestrator',
  role: 'assistant',
  content: 'Hello',
  timestamp: new Date().toISOString(),
  ...overrides,
});

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      orchestratorMessages: [],
      dmMessages: {},
      streamingContent: {},
    });
    vi.clearAllMocks();
  });

  it('initial state: orchestratorMessages=[], dmMessages={}, streamingContent={}', () => {
    const state = useChatStore.getState();
    expect(state.orchestratorMessages).toEqual([]);
    expect(state.dmMessages).toEqual({});
    expect(state.streamingContent).toEqual({});
  });

  it('addMessage() adds to orchestratorMessages when agentId=orchestrator', () => {
    const msg = makeMessage({ agentId: 'orchestrator', content: 'Test message' });
    useChatStore.getState().addMessage(msg);
    const { orchestratorMessages } = useChatStore.getState();
    expect(orchestratorMessages).toHaveLength(1);
    expect(orchestratorMessages[0]).toEqual(msg);
  });

  it('addMessage() adds to dmMessages[agentId] for other agents', () => {
    const msg = makeMessage({ agentId: 'agent-1', content: 'DM message' });
    useChatStore.getState().addMessage(msg);
    const { dmMessages, orchestratorMessages } = useChatStore.getState();
    expect(orchestratorMessages).toHaveLength(0);
    expect(dmMessages['agent-1']).toHaveLength(1);
    expect(dmMessages['agent-1'][0]).toEqual(msg);
  });

  it('addMessage() appends to existing dmMessages for the same agent', () => {
    const msg1 = makeMessage({ id: 'msg-1', agentId: 'agent-1', content: 'First' });
    const msg2 = makeMessage({ id: 'msg-2', agentId: 'agent-1', content: 'Second' });
    useChatStore.getState().addMessage(msg1);
    useChatStore.getState().addMessage(msg2);
    const { dmMessages } = useChatStore.getState();
    expect(dmMessages['agent-1']).toHaveLength(2);
  });

  it('sendOrchestratorMessage() adds user message to orchestratorMessages', () => {
    useChatStore.getState().sendOrchestratorMessage('Hello orchestrator');
    const { orchestratorMessages } = useChatStore.getState();
    expect(orchestratorMessages).toHaveLength(1);
    expect(orchestratorMessages[0].role).toBe('user');
    expect(orchestratorMessages[0].content).toBe('Hello orchestrator');
    expect(orchestratorMessages[0].agentId).toBe('orchestrator');
  });

  it('sendOrchestratorMessage() calls vscode.postMessage with orchestratorMessage', () => {
    useChatStore.getState().sendOrchestratorMessage('Tell me a story');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'orchestratorMessage',
      content: 'Tell me a story',
    });
  });

  it('sendDmMessage() adds user message to dmMessages', () => {
    useChatStore.getState().sendDmMessage('agent-2', 'Hey agent!');
    const { dmMessages } = useChatStore.getState();
    expect(dmMessages['agent-2']).toHaveLength(1);
    expect(dmMessages['agent-2'][0].role).toBe('user');
    expect(dmMessages['agent-2'][0].content).toBe('Hey agent!');
    expect(dmMessages['agent-2'][0].agentId).toBe('agent-2');
  });

  it('sendDmMessage() calls vscode.postMessage with dmMessage', () => {
    useChatStore.getState().sendDmMessage('agent-3', 'Do the thing');
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: 'dmMessage',
      agentId: 'agent-3',
      content: 'Do the thing',
    });
  });

  it('appendChunk() accumulates content for agentId', () => {
    useChatStore.getState().appendChunk('agent-1', 'Hello ');
    useChatStore.getState().appendChunk('agent-1', 'world');
    const { streamingContent } = useChatStore.getState();
    expect(streamingContent['agent-1']).toBe('Hello world');
  });

  it('appendChunk() creates new key if not exists', () => {
    useChatStore.getState().appendChunk('agent-new', 'First chunk');
    const { streamingContent } = useChatStore.getState();
    expect(streamingContent['agent-new']).toBe('First chunk');
  });

  it('appendChunk() keeps separate content per agent', () => {
    useChatStore.getState().appendChunk('agent-1', 'alpha');
    useChatStore.getState().appendChunk('agent-2', 'beta');
    const { streamingContent } = useChatStore.getState();
    expect(streamingContent['agent-1']).toBe('alpha');
    expect(streamingContent['agent-2']).toBe('beta');
  });

  it('finalizeStream() creates assistant message from accumulated content', () => {
    useChatStore.getState().appendChunk('orchestrator', 'Finalized content');
    useChatStore.getState().finalizeStream('orchestrator');
    const { orchestratorMessages } = useChatStore.getState();
    expect(orchestratorMessages).toHaveLength(1);
    expect(orchestratorMessages[0].role).toBe('assistant');
    expect(orchestratorMessages[0].content).toBe('Finalized content');
    expect(orchestratorMessages[0].agentId).toBe('orchestrator');
  });

  it('finalizeStream() clears streaming key after finalization', () => {
    useChatStore.getState().appendChunk('agent-1', 'some content');
    useChatStore.getState().finalizeStream('agent-1');
    const { streamingContent } = useChatStore.getState();
    expect(streamingContent).not.toHaveProperty('agent-1');
  });

  it('finalizeStream() with empty content still clears streaming key (no message added)', () => {
    // Set an empty string in streaming content by setting state directly
    useChatStore.setState({ streamingContent: { 'agent-empty': '' } });
    useChatStore.getState().finalizeStream('agent-empty');
    const { streamingContent, dmMessages } = useChatStore.getState();
    expect(streamingContent).not.toHaveProperty('agent-empty');
    expect(dmMessages['agent-empty']).toBeUndefined();
  });

  it('finalizeStream() for orchestrator adds to orchestratorMessages', () => {
    useChatStore.getState().appendChunk('orchestrator', 'Orchestrator response');
    useChatStore.getState().finalizeStream('orchestrator');
    const { orchestratorMessages, dmMessages } = useChatStore.getState();
    expect(orchestratorMessages).toHaveLength(1);
    expect(orchestratorMessages[0].content).toBe('Orchestrator response');
    expect(Object.keys(dmMessages)).toHaveLength(0);
  });

  it('finalizeStream() for agent adds to dmMessages[agentId]', () => {
    useChatStore.getState().appendChunk('agent-5', 'Agent response here');
    useChatStore.getState().finalizeStream('agent-5');
    const { dmMessages, orchestratorMessages } = useChatStore.getState();
    expect(orchestratorMessages).toHaveLength(0);
    expect(dmMessages['agent-5']).toHaveLength(1);
    expect(dmMessages['agent-5'][0].content).toBe('Agent response here');
    expect(dmMessages['agent-5'][0].role).toBe('assistant');
  });

  it('finalizeStream() when key does not exist clears nothing and adds no message', () => {
    // No content was accumulated for this agent
    useChatStore.getState().finalizeStream('ghost-agent');
    const { streamingContent, orchestratorMessages, dmMessages } = useChatStore.getState();
    expect(streamingContent).not.toHaveProperty('ghost-agent');
    expect(orchestratorMessages).toHaveLength(0);
    expect(dmMessages['ghost-agent']).toBeUndefined();
  });
});
