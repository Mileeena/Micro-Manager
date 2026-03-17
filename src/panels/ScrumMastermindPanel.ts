import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AgencyWorkspace } from '../services/AgencyWorkspace';
import { FileSystemService } from '../services/FileSystemService';
import { SecretService } from '../services/SecretService';
import { TerminalService } from '../services/TerminalService';
import { AgentManager } from '../agents/AgentManager';
import { AgentRunner } from '../agents/AgentRunner';
import { OrchestratorAgent } from '../agents/OrchestratorAgent';
import {
  ExtensionMessage,
  WebviewMessage,
  AgentProvider,
  ChatMessage,
} from '../types';

export class ScrumMastermindPanel {
  public static currentPanel: ScrumMastermindPanel | undefined;
  private static readonly viewType = 'scrumMastermind';

  private readonly panel: vscode.WebviewPanel;
  private readonly orchestrator: OrchestratorAgent;
  private readonly agentManager: AgentManager;
  private readonly agentRunner: AgentRunner;
  private readonly terminalService: TerminalService;
  private disposables: vscode.Disposable[] = [];

  // In-memory chat history
  private orchestratorMessages: ChatMessage[] = [];
  private dmMessages: Map<string, ChatMessage[]> = new Map();

  private constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly workspace: AgencyWorkspace,
    private readonly secrets: SecretService,
    private readonly fsService: FileSystemService
  ) {
    this.terminalService = new TerminalService(workspace);
    this.orchestrator = new OrchestratorAgent(workspace, secrets);
    this.agentManager = new AgentManager(workspace);
    this.agentRunner = new AgentRunner(workspace, fsService, this.terminalService, secrets);

    this.panel = vscode.window.createWebviewPanel(
      ScrumMastermindPanel.viewType,
      'Scrum Mastermind',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg');
    this.panel.webview.html = this.getHtmlContent();

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleWebviewMessage(msg),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    workspace: AgencyWorkspace,
    secrets: SecretService,
    fsService: FileSystemService
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (ScrumMastermindPanel.currentPanel) {
      ScrumMastermindPanel.currentPanel.panel.reveal(column);
      return;
    }

    ScrumMastermindPanel.currentPanel = new ScrumMastermindPanel(
      context.extensionUri,
      workspace,
      secrets,
      fsService
    );
  }

  private async handleWebviewMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.sendInitState();
        break;

      case 'orchestratorMessage': {
        const userMsg = this.orchestrator.buildChatMessage('user', msg.content);
        this.orchestratorMessages.push(userMsg);
        this.postMessage({ type: 'chatMessage', message: userMsg });

        try {
          const { responseText, newTasks } = await this.orchestrator.handleMessage(
            msg.content,
            (chunk) => this.postMessage({ type: 'streamChunk', agentId: 'orchestrator', chunk })
          );
          this.postMessage({ type: 'streamEnd', agentId: 'orchestrator' });

          const assistantMsg = this.orchestrator.buildChatMessage('assistant', responseText);
          this.orchestratorMessages.push(assistantMsg);

          if (newTasks.length > 0) {
            const board = await this.workspace.readBoard();
            this.postMessage({ type: 'boardUpdate', board });
          }
        } catch (err) {
          this.postMessage({ type: 'error', message: String(err) });
        }
        break;
      }

      case 'dmMessage': {
        if (!this.dmMessages.has(msg.agentId)) {
          this.dmMessages.set(msg.agentId, []);
        }
        const agent = this.agentManager.getAgent(msg.agentId);
        if (!agent) break;

        const userMsg: ChatMessage = {
          id: uuidv4(),
          agentId: msg.agentId,
          role: 'user',
          content: msg.content,
          timestamp: new Date().toISOString(),
        };
        this.dmMessages.get(msg.agentId)!.push(userMsg);
        this.postMessage({ type: 'chatMessage', message: userMsg });

        // Run a single-turn DM response (not the full task loop)
        try {
          const { callLLM, injectBible } = await import('../services/LLMRouter');
          const bible = await this.workspace.readBible();
          const sysPrompt = injectBible(
            `You are ${agent.name}, a ${agent.role}. ${agent.mission}`,
            bible
          );
          const apiKey = await this.secrets.getApiKey(agent.provider);
          if (!apiKey) throw new Error(`No API key for ${agent.provider}`);

          this.agentManager.setStatus(agent.id, 'thinking');
          this.postMessage({ type: 'agentStatusUpdate', agentId: agent.id, status: 'thinking' });

          let responseText = '';
          await callLLM({
            provider: agent.provider,
            model: agent.model,
            systemPrompt: sysPrompt,
            messages: [{ role: 'user', content: msg.content }],
            apiKey,
            onChunk: (chunk) => {
              responseText += chunk;
              this.postMessage({ type: 'streamChunk', agentId: agent.id, chunk });
            },
          });

          this.postMessage({ type: 'streamEnd', agentId: agent.id });
          this.agentManager.setStatus(agent.id, 'idle');
          this.postMessage({ type: 'agentStatusUpdate', agentId: agent.id, status: 'idle' });

          const assistantMsg: ChatMessage = {
            id: uuidv4(),
            agentId: agent.id,
            role: 'assistant',
            content: responseText,
            timestamp: new Date().toISOString(),
          };
          this.dmMessages.get(agent.id)!.push(assistantMsg);
        } catch (err) {
          this.agentManager.setStatus(agent.id, 'error');
          this.postMessage({ type: 'agentStatusUpdate', agentId: agent.id, status: 'error' });
          this.postMessage({ type: 'error', message: String(err) });
        }
        break;
      }

      case 'moveTask': {
        const board = await this.workspace.readBoard();
        const fromCol = board.columns[msg.fromColumn];
        const idx = fromCol.findIndex(t => t.id === msg.taskId);
        if (idx !== -1) {
          const [task] = fromCol.splice(idx, 1);
          task.columnId = msg.toColumn;
          board.columns[msg.toColumn].push(task);
          await this.workspace.writeBoard(board);
          this.postMessage({ type: 'boardUpdate', board });
        }
        break;
      }

      case 'createTask': {
        const board = await this.workspace.readBoard();
        const newTask = {
          id: uuidv4(),
          title: msg.title,
          description: msg.description,
          columnId: msg.columnId ?? 'backlog' as const,
          createdAt: new Date().toISOString(),
          tags: [],
        };
        board.columns[newTask.columnId].push(newTask);
        await this.workspace.writeBoard(board);
        this.postMessage({ type: 'boardUpdate', board });
        break;
      }

      case 'assignTask': {
        const board = await this.workspace.readBoard();
        for (const col of Object.values(board.columns)) {
          const task = col.find(t => t.id === msg.taskId);
          if (task) { task.assignedAgentId = msg.agentId; break; }
        }
        await this.workspace.writeBoard(board);
        this.postMessage({ type: 'boardUpdate', board });
        break;
      }

      case 'runAgentOnTask': {
        const agent = this.agentManager.getAgent(msg.agentId);
        const board = await this.workspace.readBoard();
        let task = null;
        for (const col of Object.values(board.columns)) {
          task = col.find(t => t.id === msg.taskId) ?? null;
          if (task) break;
        }
        if (!agent || !task) break;

        this.agentRunner.runTask(agent, task, {
          onStatusChange: (agentId, status, taskId) => {
            this.agentManager.setStatus(agentId, status, taskId);
            this.postMessage({ type: 'agentStatusUpdate', agentId, status, currentTaskId: taskId });
          },
          onChunk: (agentId, chunk) => {
            this.postMessage({ type: 'streamChunk', agentId, chunk });
          },
          onMessageComplete: (message) => {
            if (!this.dmMessages.has(message.agentId)) {
              this.dmMessages.set(message.agentId, []);
            }
            this.dmMessages.get(message.agentId)!.push(message);
          },
          onBoardUpdate: async () => {
            const updated = await this.workspace.readBoard();
            this.postMessage({ type: 'boardUpdate', board: updated });
          },
        }).catch(err => {
          this.postMessage({ type: 'error', message: `Agent error: ${String(err)}` });
        });
        break;
      }

      case 'saveApiKey':
        await this.secrets.setApiKey(msg.provider, msg.key);
        this.postMessage({ type: 'apiKeyStatus', provider: msg.provider, hasKey: true });
        vscode.window.showInformationMessage(`API key saved for ${msg.provider}`);
        break;

      case 'deleteApiKey':
        await this.secrets.deleteApiKey(msg.provider);
        this.postMessage({ type: 'apiKeyStatus', provider: msg.provider, hasKey: false });
        break;

      case 'checkApiKey': {
        const hasKey = await this.secrets.hasApiKey(msg.provider);
        this.postMessage({ type: 'apiKeyStatus', provider: msg.provider, hasKey });
        break;
      }

      case 'setNetworkPolicy':
        await this.workspace.setNetworkPolicy(msg.policy);
        break;
    }
  }

  private async sendInitState(): Promise<void> {
    const [board, agents, networkPolicy] = await Promise.all([
      this.workspace.readBoard(),
      this.agentManager.loadAgents(),
      this.workspace.getNetworkPolicy(),
    ]);

    const dmMessagesObj: Record<string, ChatMessage[]> = {};
    for (const [id, msgs] of this.dmMessages) {
      dmMessagesObj[id] = msgs;
    }

    const msg: ExtensionMessage = {
      type: 'init',
      board,
      agents,
      orchestratorMessages: this.orchestratorMessages,
      dmMessages: dmMessagesObj,
      networkPolicy,
    };
    this.postMessage(msg);

    // Check which API keys are configured
    for (const provider of ['anthropic', 'openai', 'openrouter'] as AgentProvider[]) {
      const hasKey = await this.secrets.hasApiKey(provider);
      this.postMessage({ type: 'apiKeyStatus', provider, hasKey });
    }
  }

  public postMessage(msg: ExtensionMessage): void {
    this.panel.webview.postMessage(msg);
  }

  private getHtmlContent(): string {
    const webview = this.panel.webview;
    const distUri = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'index.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'index.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}" />
  <title>Scrum Mastermind</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    ScrumMastermindPanel.currentPanel = undefined;
    this.terminalService.dispose();
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
