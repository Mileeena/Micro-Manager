import { create } from 'zustand';
import { vscode } from '../vscode';

export interface ChatMessage {
  id: string;
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

interface ChatStore {
  orchestratorMessages: ChatMessage[];
  dmMessages: Record<string, ChatMessage[]>;
  streamingContent: Record<string, string>; // agentId → partial streamed content
  addMessage: (message: ChatMessage) => void;
  setOrchestratorMessages: (msgs: ChatMessage[]) => void;
  setDmMessages: (msgs: Record<string, ChatMessage[]>) => void;
  appendChunk: (agentId: string, chunk: string) => void;
  finalizeStream: (agentId: string) => void;
  sendOrchestratorMessage: (content: string) => void;
  sendDmMessage: (agentId: string, content: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  orchestratorMessages: [],
  dmMessages: {},
  streamingContent: {},

  addMessage: (message) => {
    if (message.agentId === 'orchestrator') {
      set((state) => ({
        orchestratorMessages: [...state.orchestratorMessages, message],
      }));
    } else {
      set((state) => ({
        dmMessages: {
          ...state.dmMessages,
          [message.agentId]: [...(state.dmMessages[message.agentId] ?? []), message],
        },
      }));
    }
  },

  setOrchestratorMessages: (msgs) => set({ orchestratorMessages: msgs }),

  setDmMessages: (msgs) => set({ dmMessages: msgs }),

  appendChunk: (agentId, chunk) =>
    set((state) => ({
      streamingContent: {
        ...state.streamingContent,
        [agentId]: (state.streamingContent[agentId] ?? '') + chunk,
      },
    })),

  finalizeStream: (agentId) => {
    const { streamingContent } = get();
    const content = streamingContent[agentId];

    // Always remove the streaming key so isStreaming becomes false,
    // even if the content is empty (agent may have sent nothing).
    const clearKey = (state: { streamingContent: Record<string, string> }) => {
      const updated = { ...state.streamingContent };
      delete updated[agentId];
      return { streamingContent: updated };
    };

    if (!content) {
      set((state) => clearKey(state));
      return;
    }

    const message: ChatMessage = {
      id: `stream-${Date.now()}`,
      agentId,
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
    };

    if (agentId === 'orchestrator') {
      set((state) => ({
        orchestratorMessages: [...state.orchestratorMessages, message],
        ...clearKey(state),
      }));
    } else {
      set((state) => ({
        dmMessages: {
          ...state.dmMessages,
          [agentId]: [...(state.dmMessages[agentId] ?? []), message],
        },
        ...clearKey(state),
      }));
    }
  },

  sendOrchestratorMessage: (content) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      agentId: 'orchestrator',
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      orchestratorMessages: [...state.orchestratorMessages, userMsg],
    }));
    vscode.postMessage({ type: 'orchestratorMessage', content });
  },

  sendDmMessage: (agentId, content) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      agentId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      dmMessages: {
        ...state.dmMessages,
        [agentId]: [...(state.dmMessages[agentId] ?? []), userMsg],
      },
    }));
    vscode.postMessage({ type: 'dmMessage', agentId, content });
  },
}));
