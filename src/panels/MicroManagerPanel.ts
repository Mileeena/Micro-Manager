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
  AgentState,
  ChatMessage,
  Task,
} from '../types';

export class MicroManagerPanel {
  public static currentPanel: MicroManagerPanel | undefined;
  private static readonly viewType = 'microManager';

  private readonly panel: vscode.WebviewPanel;
  private readonly orchestrator: OrchestratorAgent;
  private readonly agentManager: AgentManager;
  private readonly agentRunner: AgentRunner;
  private readonly terminalService: TerminalService;
  private disposables: vscode.Disposable[] = [];

  // In-memory chat history
  private orchestratorMessages: ChatMessage[] = [];
  private dmMessages: Map<string, ChatMessage[]> = new Map();

  // Supervisor: how many times each task has been kicked by the Manager
  private taskRetryCount: Map<string, number> = new Map();

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
      MicroManagerPanel.viewType,
      'Micro Manager',
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

    if (MicroManagerPanel.currentPanel) {
      MicroManagerPanel.currentPanel.panel.reveal(column);
      return;
    }

    MicroManagerPanel.currentPanel = new MicroManagerPanel(
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
        // No echo back — webview already added the message optimistically in sendOrchestratorMessage()

        try {
          const agents = this.agentManager.getAllAgents();
          const { responseText, newTasks } = await this.orchestrator.handleMessage(
            msg.content,
            agents,
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

        // Store user message server-side only — the webview already added it optimistically
        const userMsg: ChatMessage = {
          id: uuidv4(),
          agentId: msg.agentId,
          role: 'user',
          content: msg.content,
          timestamp: new Date().toISOString(),
        };
        this.dmMessages.get(msg.agentId)!.push(userMsg);
        // No echo back — would cause duplication since store adds message before sending

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

      case 'decomposeTask': {
        const board = await this.workspace.readBoard();
        let foundTask: Task | null = null;
        for (const col of Object.values(board.columns)) {
          foundTask = col.find(t => t.id === msg.taskId) ?? null;
          if (foundTask) break;
        }
        if (!foundTask) break;

        // Notify webview that decomposition is starting
        this.postMessage({ type: 'decomposing', taskId: msg.taskId });

        try {
          const agents = this.agentManager.getAllAgents();
          const subtasks = await this.orchestrator.decomposeTask(foundTask, agents);

          // Add history entry to original task
          await this.workspace.addTaskHistory(msg.taskId, {
            timestamp: new Date().toISOString(),
            event: 'decomposed',
            detail: `Decomposed into ${subtasks.length} subtasks: ${subtasks.map(t => `"${t.title}"`).join(', ')}`,
          });

          const updatedBoard = await this.workspace.readBoard();
          this.postMessage({ type: 'boardUpdate', board: updatedBoard });
          this.postMessage({
            type: 'taskDecomposed',
            originalTaskId: msg.taskId,
            subtaskIds: subtasks.map(t => t.id),
          });

          // Post a system message to orchestrator chat
          const systemMsg = this.orchestrator.buildChatMessage('system',
            `Decomposed "${foundTask.title}" into ${subtasks.length} subtasks:\n${subtasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n')}`
          );
          this.orchestratorMessages.push(systemMsg);
          this.postMessage({ type: 'chatMessage', message: systemMsg });
        } catch (err) {
          this.postMessage({ type: 'error', message: `Decomposition failed: ${String(err)}` });
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
          await this.workspace.addTaskHistory(msg.taskId, {
            timestamp: new Date().toISOString(), event: 'moved',
            detail: `Moved from ${msg.fromColumn} → ${msg.toColumn}`,
          });
          this.postMessage({ type: 'boardUpdate', board });

          // Auto-start: if moved to 'todo' or 'in-progress' and has an assigned agent
          if (
            (msg.toColumn === 'todo' || msg.toColumn === 'in-progress') &&
            task.assignedAgentId
          ) {
            const agent = this.agentManager.getAgent(task.assignedAgentId);
            if (agent && agent.status === 'idle') {
              this.agentRunner.runTask(agent, task, this.buildRunCallbacks()).catch(err => {
                this.postMessage({ type: 'error', message: `Agent error: ${String(err)}` });
              });
            }
          }
        }
        break;
      }

      case 'createTask': {
        const board = await this.workspace.readBoard();
        const now = new Date().toISOString();
        const newTask: Task = {
          id: uuidv4(),
          title: msg.title,
          description: msg.description,
          columnId: msg.columnId ?? 'backlog' as const,
          createdAt: now,
          tags: [],
          history: [{ timestamp: now, event: 'created', detail: 'Task created' }],
        };
        board.columns[newTask.columnId].push(newTask);
        await this.workspace.writeBoard(board);
        await this.workspace.addTaskHistory(newTask.id, {
          timestamp: new Date().toISOString(), event: 'created',
          detail: `Task created in ${newTask.columnId}`,
        });
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
        const agentName = msg.agentId ? (this.agentManager.getAgent(msg.agentId)?.name ?? msg.agentId) : 'nobody';
        await this.workspace.addTaskHistory(msg.taskId, {
          timestamp: new Date().toISOString(),
          event: msg.agentId ? 'assigned' : 'unassigned',
          detail: msg.agentId ? `Assigned to ${agentName}` : 'Unassigned',
        });
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

        this.agentRunner.runTask(agent, task, this.buildRunCallbacks()).catch(err => {
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

      case 'setOrchestratorSettings':
        await this.workspace.setOrchestratorSettings({ provider: msg.provider, model: msg.model });
        break;

      case 'updateAgentSettings': {
        await this.workspace.updateAgentProfileSettings(msg.agentId, msg.provider, msg.model);
        this.agentManager.updateAgentSettings(msg.agentId, msg.provider, msg.model);
        this.postMessage({ type: 'agentSettingsUpdated', agentId: msg.agentId, provider: msg.provider, model: msg.model });
        break;
      }

      case 'updateAgentAllowedCommands': {
        // Persist to .md profile + update in-memory
        const agentFile = this.agentManager.getAgent(msg.agentId);
        if (agentFile) {
          // Write the full new list to the .md profile
          const filePath = `.agency/agents/${msg.agentId}.md`;
          const content = await this.fsService.readFile(filePath).catch(() => '');
          if (content) {
            let updated = content;
            if (/\*\*Allowed Commands:\*\*/m.test(updated)) {
              updated = updated.replace(
                /\*\*Allowed Commands:\*\*.*$/m,
                `**Allowed Commands:** ${msg.allowedCommands.join(', ')}`
              );
            } else {
              updated += `\n**Allowed Commands:** ${msg.allowedCommands.join(', ')}`;
            }
            await this.fsService.writeFile(filePath, updated);
          }
          this.agentManager.updateAgentAllowedCommands(msg.agentId, msg.allowedCommands);
        }
        break;
      }

      case 'setTaskBlockers': {
        const board = await this.workspace.readBoard();
        for (const col of Object.values(board.columns)) {
          const task = col.find(t => t.id === msg.taskId);
          if (task) {
            task.blockedBy = msg.blockedBy.length > 0 ? msg.blockedBy : undefined;
            break;
          }
        }
        await this.workspace.writeBoard(board);
        await this.workspace.addTaskHistory(msg.taskId, {
          timestamp: new Date().toISOString(),
          event: msg.blockedBy.length > 0 ? 'blocker_added' : 'blocker_cleared',
          detail: msg.blockedBy.length > 0 ? `Blocked by ${msg.blockedBy.length} task(s)` : 'All blockers cleared',
        });
        this.postMessage({ type: 'boardUpdate', board });
        break;
      }

      case 'createAgent': {
        const content = [
          `# ${msg.name}`,
          '',
          `**Role:** ${msg.role}`,
          `**Mission:** ${msg.mission}`,
          `**Metrics:** Task completion rate`,
          `**Provider:** ${msg.provider}`,
          `**Model:** ${msg.model}`,
        ].join('\n');
        const id = `${msg.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}`;
        await this.workspace.writeAgentProfile(id, content);
        const agents = await this.agentManager.loadAgents();
        this.postMessage({ type: 'init', board: await this.workspace.readBoard(), agents, orchestratorMessages: this.orchestratorMessages, dmMessages: {}, networkPolicy: await this.workspace.getNetworkPolicy(), orchestrator: await this.workspace.getOrchestratorSettings() });
        vscode.window.showInformationMessage(`Agent "${msg.name}" created!`);
        break;
      }
    }
  }

  /** Shared AgentRunner callbacks — used by both runAgentOnTask and auto-start */
  private buildRunCallbacks() {
    return {
      onStatusChange: (agentId: string, status: 'thinking' | 'coding' | 'waiting' | 'idle' | 'error', taskId?: string) => {
        this.agentManager.setStatus(agentId, status, taskId);
        this.postMessage({ type: 'agentStatusUpdate', agentId, status, currentTaskId: taskId });
      },
      onChunk: (agentId: string, chunk: string) => {
        this.postMessage({ type: 'streamChunk', agentId, chunk });
      },
      onMessageComplete: (message: ChatMessage) => {
        if (!this.dmMessages.has(message.agentId)) {
          this.dmMessages.set(message.agentId, []);
        }
        this.dmMessages.get(message.agentId)!.push(message);
        // Signal the webview that this streaming turn is done so the input is re-enabled
        this.postMessage({ type: 'streamEnd', agentId: message.agentId });
      },
      onBoardUpdate: async () => {
        const updated = await this.workspace.readBoard();
        this.postMessage({ type: 'boardUpdate', board: updated });
      },
      onTaskIncomplete: async (agentId: string, task: Task, lastResponse: string) => {
        await this.supervisorKick(agentId, task, lastResponse);
      },
      onHistoryEntry: (taskId: string, entry: import('../types').TaskHistoryEntry) => {
        this.workspace.addTaskHistory(taskId, entry).catch(() => {/* non-critical */});
      },
    };
  }

  /** Manager supervisor: called when an agent loop ends without completing the task */
  private async supervisorKick(agentId: string, task: Task, lastResponse: string): Promise<void> {
    const MAX_KICKS = 2;
    const retries = this.taskRetryCount.get(task.id) ?? 0;

    const postSystemMsg = (content: string) => {
      const msg: ChatMessage = {
        id: uuidv4(),
        agentId,
        role: 'system',
        content,
        timestamp: new Date().toISOString(),
      };
      if (!this.dmMessages.has(agentId)) this.dmMessages.set(agentId, []);
      this.dmMessages.get(agentId)!.push(msg);
      this.postMessage({ type: 'chatMessage', message: msg });
    };

    if (retries >= MAX_KICKS) {
      postSystemMsg(
        `🤖 Manager: I've given "${task.title}" ${MAX_KICKS} extra pushes with no completion. ` +
        `Consider breaking it into smaller tasks, clarifying the requirements, or assigning a different agent.`
      );
      this.taskRetryCount.delete(task.id);
      return;
    }

    this.taskRetryCount.set(task.id, retries + 1);

    const agent = this.agentManager.getAgent(agentId);
    if (!agent) return;

    try {
      postSystemMsg(`🤖 Manager: Task not complete — analyzing and sending follow-up instructions... (attempt ${retries + 1}/${MAX_KICKS})`);

      const kickText = await this.orchestrator.generateKickMessage(agent, task, lastResponse);

      // Update the system message with the actual kick content
      postSystemMsg(`🤖 Manager kick ${retries + 1}/${MAX_KICKS}: ${kickText}`);

      // Re-run the agent with the Manager's guidance injected into the task description
      const kickedTask: Task = {
        ...task,
        description: `${task.description}\n\n**Manager Instructions:** ${kickText}`,
      };

      this.agentRunner.runTask(agent, kickedTask, this.buildRunCallbacks()).catch(err => {
        this.postMessage({ type: 'error', message: `Agent error (after kick): ${String(err)}` });
      });
    } catch (err) {
      postSystemMsg(`🤖 Manager: Failed to generate kick instructions — ${String(err)}`);
    }
  }

  private async sendInitState(): Promise<void> {
    const [board, agents, networkPolicy, orchestrator] = await Promise.all([
      this.workspace.readBoard(),
      this.agentManager.loadAgents(),
      this.workspace.getNetworkPolicy(),
      this.workspace.getOrchestratorSettings(),
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
      orchestrator,
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
  <title>Micro Manager</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    MicroManagerPanel.currentPanel = undefined;
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
