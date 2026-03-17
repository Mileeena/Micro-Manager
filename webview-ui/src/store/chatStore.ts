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
    if (!content) return;

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
        streamingContent: { ...state.streamingContent, [agentId]: '' },
      }));
    } else {
      set((state) => ({
        dmMessages: {
          ...state.dmMessages,
          [agentId]: [...(state.dmMessages[agentId] ?? []), message],
        },
        streamingContent: { ...state.streamingContent, [agentId]: '' },
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
