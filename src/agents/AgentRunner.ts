import { v4 as uuidv4 } from 'uuid';
import { AgencyWorkspace } from '../services/AgencyWorkspace';
import { FileSystemService } from '../services/FileSystemService';
import { callLLM, injectBible } from '../services/LLMRouter';
import { SecretService } from '../services/SecretService';
import { TerminalService } from '../services/TerminalService';
import { codeValidator } from '../services/CodeValidator';
import { AgentAction, AgentState, ChatMessage, ColumnId, Task } from '../types';

/** Tags the agent uses to trigger actions in its responses */
const ACTION_PATTERNS = {
  READ_FILE: /<READ_FILE\s+path="([^"]+)"\s*\/?>/g,
  WRITE_FILE: /<WRITE_FILE\s+path="([^"]+)">([\s\S]*?)<\/WRITE_FILE>/g,
  RUN_COMMAND: /<RUN_COMMAND\s+cmd="([^"]+)"\s*\/?>/g,
  CREATE_TASK: /<CREATE_TASK\s+title="([^"]+)"\s+description="([^"]+)"\s*\/?>/g,
  MOVE_TASK: /<MOVE_TASK\s+taskId="([^"]+)"\s+toColumn="([^"]+)"\s*\/?>/g,
};

function buildAgentSystemPrompt(agent: AgentState, task: Task): string {
  return `You are ${agent.name}, a ${agent.role}.
Mission: ${agent.mission}

You are working on the following task:
**Title:** ${task.title}
**Description:** ${task.description}

You have access to workspace tools. Use XML tags to trigger actions:

- Read a file:       <READ_FILE path="src/index.ts" />
- Write a file:      <WRITE_FILE path="src/foo.ts">...content...</WRITE_FILE>
- Run a command:     <RUN_COMMAND cmd="npm run build" />
- Create a task:     <CREATE_TASK title="Fix bug" description="..." />
- Move a task:       <MOVE_TASK taskId="${task.id}" toColumn="done" />

Think step by step. Describe what you're doing before each action tag.
When the task is complete, use <MOVE_TASK taskId="${task.id}" toColumn="done" /> to mark it done.`;
}

export type AgentRunnerCallbacks = {
  onStatusChange: (agentId: string, status: 'thinking' | 'coding' | 'waiting' | 'idle' | 'error', taskId?: string) => void;
  onChunk: (agentId: string, chunk: string) => void;
  onMessageComplete: (message: ChatMessage) => void;
  onBoardUpdate: () => void;
  /** Fired when the agentic loop ends without the task being moved to 'done' */
  onTaskIncomplete?: (agentId: string, task: Task, lastResponse: string) => void;
  /** Fired to record a task history entry */
  onHistoryEntry?: (taskId: string, entry: import('../types').TaskHistoryEntry) => void;
};

export class AgentRunner {
  constructor(
    private readonly workspace: AgencyWorkspace,
    private readonly fsService: FileSystemService,
    private readonly terminalService: TerminalService,
    private readonly secrets: SecretService
  ) {}

  async runTask(agent: AgentState, task: Task, callbacks: AgentRunnerCallbacks): Promise<void> {
    const { onStatusChange, onChunk, onMessageComplete, onBoardUpdate } = callbacks;

    try {
      onStatusChange(agent.id, 'thinking', task.id);
      callbacks.onHistoryEntry?.(task.id, {
        timestamp: new Date().toISOString(),
        event: 'agent_started',
        detail: `Agent ${agent.name} started working`,
      });

      const bible = await this.workspace.readBible();
      const systemPrompt = injectBible(buildAgentSystemPrompt(agent, task), bible);

      const apiKey = await this.secrets.getApiKey(agent.provider);
      if (!apiKey) {
        throw new Error(`No API key configured for provider: ${agent.provider}`);
      }

      const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: `Please work on this task: ${task.title}\n\n${task.description}` },
      ];

      // Agentic loop: keep running until task is moved to done or max iterations
      let iterations = 0;
      const MAX_ITERATIONS = 10;
      let taskCompleted = false;
      let lastAgentResponse = '';

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        onStatusChange(agent.id, 'thinking', task.id);

        let responseText = '';
        await callLLM({
          provider: agent.provider,
          model: agent.model,
          systemPrompt,
          messages: conversationHistory,
          apiKey,
          onChunk: (chunk) => {
            responseText += chunk;
            onChunk(agent.id, chunk);
          },
        });

        lastAgentResponse = responseText;

        onMessageComplete({
          id: uuidv4(),
          agentId: agent.id,
          role: 'assistant',
          content: responseText,
          timestamp: new Date().toISOString(),
        });

        conversationHistory.push({ role: 'assistant', content: responseText });

        // Parse and execute actions
        const actions = this.parseActions(responseText);
        if (actions.length === 0) break; // No more actions — agent stopped responding with tool calls

        const toolResults: string[] = [];
        let taskDone = false;

        for (const action of actions) {
          onStatusChange(agent.id, 'coding', task.id);
          const result = await this.executeAction(action, agent, callbacks, task);
          toolResults.push(result);

          // Check if task was moved to done
          if (action.type === 'MOVE_TASK' && action.toColumn === 'done') {
            taskDone = true;
            taskCompleted = true;
            callbacks.onHistoryEntry?.(task.id, {
              timestamp: new Date().toISOString(),
              event: 'agent_completed',
              detail: `Agent ${agent.name} completed task`,
            });
            onBoardUpdate();
          }
          if (action.type === 'CREATE_TASK' || action.type === 'MOVE_TASK') {
            onBoardUpdate();
          }
        }

        if (taskDone) break;

        // Feed tool results back for next iteration
        if (toolResults.length > 0) {
          conversationHistory.push({
            role: 'user',
            content: `Tool results:\n${toolResults.join('\n\n')}`,
          });
        }
      }

      // If the loop ended without completing the task, notify the supervisor
      if (!taskCompleted && callbacks.onTaskIncomplete) {
        callbacks.onTaskIncomplete(agent.id, task, lastAgentResponse);
      }

      onStatusChange(agent.id, 'idle');
    } catch (err) {
      onStatusChange(agent.id, 'error');
      throw err;
    }
  }

  private parseActions(text: string): AgentAction[] {
    const actions: AgentAction[] = [];

    let match: RegExpExecArray | null;

    const readPattern = new RegExp(ACTION_PATTERNS.READ_FILE.source, 'g');
    while ((match = readPattern.exec(text)) !== null) {
      actions.push({ type: 'READ_FILE', path: match[1] });
    }

    const writePattern = new RegExp(ACTION_PATTERNS.WRITE_FILE.source, 'gs');
    while ((match = writePattern.exec(text)) !== null) {
      actions.push({ type: 'WRITE_FILE', path: match[1], content: match[2] });
    }

    const runPattern = new RegExp(ACTION_PATTERNS.RUN_COMMAND.source, 'g');
    while ((match = runPattern.exec(text)) !== null) {
      actions.push({ type: 'RUN_COMMAND', cmd: match[1] });
    }

    const createPattern = new RegExp(ACTION_PATTERNS.CREATE_TASK.source, 'g');
    while ((match = createPattern.exec(text)) !== null) {
      actions.push({ type: 'CREATE_TASK', title: match[1], description: match[2] });
    }

    const movePattern = new RegExp(ACTION_PATTERNS.MOVE_TASK.source, 'g');
    while ((match = movePattern.exec(text)) !== null) {
      actions.push({ type: 'MOVE_TASK', taskId: match[1], toColumn: match[2] as ColumnId });
    }

    return actions;
  }

  private async executeAction(action: AgentAction, agent: AgentState, callbacks: AgentRunnerCallbacks, task: Task): Promise<string> {
    const agentId = agent.id;
    switch (action.type) {
      case 'READ_FILE': {
        try {
          const content = await this.fsService.readFile(action.path);
          await this.workspace.writeLog({ agentId, action: 'READ_FILE', details: { path: action.path } });
          return `<file path="${action.path}">\n${content}\n</file>`;
        } catch (e) {
          return `<error>Could not read ${action.path}: ${String(e)}</error>`;
        }
      }
      case 'WRITE_FILE': {
        try {
          const { clean, errors, wasStripped } = await codeValidator.validateAndClean(action.content, action.path);
          await this.fsService.writeFile(action.path, clean);
          await this.workspace.writeLog({ agentId, action: 'WRITE_FILE', details: { path: action.path, wasStripped } });
          if (errors.length > 0) {
            callbacks.onHistoryEntry?.(task.id, {
              timestamp: new Date().toISOString(),
              event: 'validation_error',
              detail: `Syntax error in ${action.path}: ${errors[0]}`,
            });
            return `<validation_error path="${action.path}">Syntax errors found:\n${errors.join('\n')}\nPlease fix these errors and rewrite the file with <WRITE_FILE>.</validation_error>`;
          }
          if (wasStripped) {
            callbacks.onHistoryEntry?.(task.id, {
              timestamp: new Date().toISOString(),
              event: 'validation_fixed',
              detail: `Stripped markdown fences from ${action.path}`,
            });
          }
          return `<success>Wrote ${action.path}${wasStripped ? ' (markdown fences stripped)' : ''}</success>`;
        } catch (e) {
          return `<error>Could not write ${action.path}: ${String(e)}</error>`;
        }
      }
      case 'RUN_COMMAND': {
        const result = await this.terminalService.executeCommand(action.cmd, {
          id: agent.id,
          name: agent.name,
          allowedCommands: [...agent.allowedCommands],
          onAllowForAgent: async (cmd) => {
            await this.workspace.addToAgentCommandWhitelist(agent.id, cmd);
            // Also update in-memory list for this run
            if (!agent.allowedCommands.includes(cmd)) {
              agent.allowedCommands.push(cmd);
            }
          },
        });
        await this.workspace.writeLog({ agentId, action: 'RUN_COMMAND', details: { cmd: action.cmd, result } });
        return `<command_result status="${result}">${action.cmd}</command_result>`;
      }
      case 'CREATE_TASK': {
        const board = await this.workspace.readBoard();
        const newTask: Task = {
          id: uuidv4(),
          title: action.title,
          description: action.description,
          columnId: 'backlog',
          createdAt: new Date().toISOString(),
          tags: [],
        };
        board.columns.backlog.push(newTask);
        await this.workspace.writeBoard(board);
        return `<success>Created task "${action.title}" in backlog</success>`;
      }
      case 'MOVE_TASK': {
        const board = await this.workspace.readBoard();
        let moved = false;
        for (const col of Object.keys(board.columns) as ColumnId[]) {
          const idx = board.columns[col].findIndex(t => t.id === action.taskId);
          if (idx !== -1) {
            const [task] = board.columns[col].splice(idx, 1);
            task.columnId = action.toColumn;
            board.columns[action.toColumn].push(task);
            moved = true;
            break;
          }
        }
        if (moved) {
          await this.workspace.writeBoard(board);
          return `<success>Moved task to ${action.toColumn}</success>`;
        }
        return `<error>Task not found: ${action.taskId}</error>`;
      }
      default:
        return '<error>Unknown action</error>';
    }
  }
}
