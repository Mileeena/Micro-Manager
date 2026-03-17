import { useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import { useAgentStore } from '../store/agentStore';
import { useChatStore } from '../store/chatStore';
import { vscode } from '../vscode';

type ExtensionMessage =
  | {
      type: 'init';
      board: any;
      agents: any[];
      orchestratorMessages: any[];
      dmMessages: Record<string, any[]>;
      networkPolicy: 'open' | 'strict';
      orchestrator: { provider: any; model: string };
    }
  | { type: 'boardUpdate'; board: any }
  | { type: 'agentStatusUpdate'; agentId: string; status: any; currentTaskId?: string }
  | { type: 'chatMessage'; message: any }
  | { type: 'streamChunk'; agentId: string; chunk: string }
  | { type: 'streamEnd'; agentId: string }
  | { type: 'error'; message: string }
  | { type: 'apiKeyStatus'; provider: any; hasKey: boolean }
  | { type: 'agentSettingsUpdated'; agentId: string; provider: any; model: string };

export function useVSCodeMessages(): void {
  const { setBoard } = useBoardStore();
  const {
    setAgents, updateStatus, setApiKeyStatus, setNetworkPolicy,
    setOrchestratorSettingsLocal,
  } = useAgentStore();
  const { setOrchestratorMessages, setDmMessages, addMessage, appendChunk, finalizeStream } = useChatStore();

  useEffect(() => {
    function handler(event: MessageEvent): void {
      const msg = event.data as ExtensionMessage;
      switch (msg.type) {
        case 'init':
          setBoard(msg.board);
          setAgents(msg.agents);
          setOrchestratorMessages(msg.orchestratorMessages);
          setDmMessages(msg.dmMessages);
          setNetworkPolicy(msg.networkPolicy);
          setOrchestratorSettingsLocal(msg.orchestrator);
          break;
        case 'boardUpdate':
          setBoard(msg.board);
          break;
        case 'agentStatusUpdate':
          updateStatus(msg.agentId, msg.status, msg.currentTaskId);
          break;
        case 'chatMessage':
          addMessage(msg.message);
          break;
        case 'streamChunk':
          appendChunk(msg.agentId, msg.chunk);
          break;
        case 'streamEnd':
          finalizeStream(msg.agentId);
          break;
        case 'apiKeyStatus':
          setApiKeyStatus(msg.provider, msg.hasKey);
          break;
        case 'agentSettingsUpdated':
          // Уже обновлено оптимистично в store
          break;
        case 'error':
          console.error('[Scrum Mastermind]', msg.message);
          break;
      }
    }

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);
}
