import { v4 as uuidv4 } from 'uuid';
import { AgencyWorkspace } from '../services/AgencyWorkspace';
import { callLLM, injectBible } from '../services/LLMRouter';
import { SecretService } from '../services/SecretService';
import { AgentState, BoardState, ChatMessage, ColumnId, Epic, Task } from '../types';

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Manager AI — an expert project manager and software architect.
You have full visibility into the project board, all tasks, all epics, and all agent statuses (provided in each message).
Use this context to answer questions about project status, progress, and agent workload.

When a user describes work to be done, respond in TWO parts:
1. A brief conversational acknowledgment (1-2 sentences)
2. If tasks can be created, output a JSON block (ONLY valid JSON):

For SIMPLE work (1-3 tasks, no big feature arc):
\`\`\`json
{
  "tasks": [
    {
      "title": "Short task title",
      "description": "Detailed description of what needs to be done",
      "suggestedColumn": "backlog"
    }
  ]
}
\`\`\`

For COMPLEX features that deserve an Epic (user story grouping, 3+ related tasks):
\`\`\`json
{
  "epic": {
    "title": "Epic title — the overarching feature or goal",
    "description": "What this epic delivers and why it matters"
  },
  "tasks": [
    {
      "title": "Subtask 1",
      "description": "Specific deliverable",
      "suggestedColumn": "backlog"
    }
  ]
}
\`\`\`

Valid suggestedColumn values: "backlog", "todo", "in-progress", "done"

If the user is chatting, asking about project status, or asking about agents — answer conversationally using the board context. Do NOT output a JSON block.

Always be concise, technical, and helpful.`;

interface ParsedOrchestratorResponse {
  text: string;
  epicDef?: { title: string; description: string };
  tasks: Array<{ title: string; description: string; suggestedColumn: ColumnId }>;
}

export class OrchestratorAgent {
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(
    private readonly workspace: AgencyWorkspace,
    private readonly secrets: SecretService
  ) {}

  async handleMessage(
    userMessage: string,
    agents: AgentState[],
    onChunk: (chunk: string) => void
  ): Promise<{ responseText: string; newTasks: Task[]; newEpic?: Epic }> {
    const [bible, board] = await Promise.all([
      this.workspace.readBible(),
      this.workspace.readBoard(),
    ]);

    const boardContext = this.buildBoardContext(board, agents);
    const systemPrompt = injectBible(ORCHESTRATOR_SYSTEM_PROMPT, bible) + boardContext;

    const { provider, model } = await this.workspace.getOrchestratorSettings();
    const apiKey = await this.secrets.getApiKey(provider);
    if (!apiKey) {
      throw new Error(`No ${provider} API key configured. Please add your key in Settings.`);
    }

    this.conversationHistory.push({ role: 'user', content: userMessage });

    let fullResponse = '';
    const response = await callLLM({
      provider,
      model,
      systemPrompt,
      messages: this.conversationHistory,
      apiKey,
      onChunk: (chunk) => {
        fullResponse += chunk;
        onChunk(chunk);
      },
    });

    this.conversationHistory.push({ role: 'assistant', content: response });

    const parsed = this.parseResponse(response);
    const newTasks: Task[] = [];
    let newEpic: Epic | undefined;

    if (parsed.tasks.length > 0) {
      const freshBoard = await this.workspace.readBoard();

      // Create epic if requested
      if (parsed.epicDef) {
        newEpic = {
          id: uuidv4(),
          title: parsed.epicDef.title,
          description: parsed.epicDef.description,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        freshBoard.epics.push(newEpic);
      }

      for (const taskDef of parsed.tasks) {
        const task: Task = {
          id: uuidv4(),
          title: taskDef.title,
          description: taskDef.description,
          columnId: taskDef.suggestedColumn,
          epicId: newEpic?.id,
          createdAt: new Date().toISOString(),
          tags: [],
        };
        freshBoard.columns[task.columnId].push(task);
        newTasks.push(task);
      }
      await this.workspace.writeBoard(freshBoard);
    }

    return { responseText: response, newTasks, newEpic };
  }

  /** Build a concise board snapshot to inject as context for the Manager */
  private buildBoardContext(board: BoardState, agents: AgentState[]): string {
    const lines: string[] = ['\n\n---\n## Current Board State\n'];

    const colLabels: Record<string, string> = {
      backlog: 'Backlog',
      todo: 'To Do',
      'in-progress': 'In Progress',
      done: 'Done',
    };

    for (const [colId, label] of Object.entries(colLabels)) {
      const tasks = board.columns[colId as keyof typeof board.columns] ?? [];
      const summaries = tasks.map(t => {
        const agent = agents.find(a => a.id === t.assignedAgentId);
        const agentNote = agent ? ` → ${agent.name}` : '';
        const blockedNote = t.blockedBy?.length ? ' ⛔' : '';
        return `"${t.title}"${agentNote}${blockedNote}`;
      });
      lines.push(`**${label}** (${tasks.length}): ${summaries.length ? summaries.join(', ') : 'empty'}`);
    }

    if (board.epics.length > 0) {
      lines.push('\n**Epics:**');
      for (const epic of board.epics) {
        const epicTasks = Object.values(board.columns)
          .flat()
          .filter(t => t.epicId === epic.id);
        const done = epicTasks.filter(t => t.columnId === 'done').length;
        lines.push(`• ${epic.title} [${done}/${epicTasks.length} done]`);
      }
    }

    if (agents.length > 0) {
      lines.push('\n**Agents:**');
      for (const a of agents) {
        const taskNote = a.currentTaskId
          ? ` — working on task ${a.currentTaskId}`
          : '';
        lines.push(`• ${a.name} (${a.role}): **${a.status}**${taskNote}`);
      }
    } else {
      lines.push('\n**Agents:** none created yet');
    }

    lines.push('---');
    return lines.join('\n');
  }

  private parseResponse(response: string): ParsedOrchestratorResponse {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) {
      return { text: response, tasks: [] };
    }
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const validColumns = new Set<string>(['backlog', 'todo', 'in-progress', 'done']);

      const tasks = (parsed.tasks ?? []) as Array<{
        title: string;
        description: string;
        suggestedColumn: string;
      }>;

      const epicDef = parsed.epic as { title: string; description: string } | undefined;

      return {
        text: response,
        epicDef,
        tasks: tasks.map(t => ({
          title: t.title,
          description: t.description,
          suggestedColumn: (validColumns.has(t.suggestedColumn) ? t.suggestedColumn : 'backlog') as ColumnId,
        })),
      };
    } catch {
      return { text: response, tasks: [] };
    }
  }

  /**
   * Called by the supervisor loop when an agent finishes without completing its task.
   * Returns a short, direct instruction to unblock the agent.
   */
  async generateKickMessage(
    agent: AgentState,
    task: Task,
    lastAgentResponse: string
  ): Promise<string> {
    const { provider, model } = await this.workspace.getOrchestratorSettings();
    const apiKey = await this.secrets.getApiKey(provider);

    // Fallback in case no API key is configured for the orchestrator
    if (!apiKey) {
      return 'Please complete the task directly. Make all decisions yourself, do not ask for preferences. Implement the solution now and use <MOVE_TASK> to mark it done when finished.';
    }

    const kickPrompt = `You are the Manager. One of your agents stalled on a task instead of completing it.

Agent: ${agent.name} (${agent.role})
Task title: "${task.title}"
Task description: ${task.description}

The agent's last message (which did NOT complete the task):
"""
${lastAgentResponse.slice(0, 800)}
"""

Write 2–3 sentences of DIRECT, SPECIFIC instructions to unblock this agent.
Rules:
- Do NOT ask any questions
- Make every decision for the agent — pick the most reasonable approach
- Tell them exactly what to do next and remind them to use <MOVE_TASK taskId="${task.id}" toColumn="done" /> when done
- Be concise and action-oriented`;

    let kickText = '';
    await callLLM({
      provider,
      model,
      systemPrompt: 'You are a decisive, no-nonsense Manager. Be brief, direct, and action-oriented. Never ask questions.',
      messages: [{ role: 'user', content: kickPrompt }],
      apiKey,
      onChunk: (chunk) => { kickText += chunk; },
    });

    return kickText.trim() || 'Proceed with your best judgment. Implement the solution directly without asking for input, then mark the task done with <MOVE_TASK>.';
  }

  /**
   * Decompose a task into smaller subtasks using AI.
   * Returns the created subtasks (saved to board).
   */
  async decomposeTask(task: Task, agents: AgentState[]): Promise<Task[]> {
    const { provider, model } = await this.workspace.getOrchestratorSettings();
    const apiKey = await this.secrets.getApiKey(provider);
    if (!apiKey) {
      throw new Error(`No ${provider} API key configured for decomposition.`);
    }

    const bible = await this.workspace.readBible();
    const systemPrompt = injectBible(
      `You are the Manager AI. Your job is to break down a complex task into 3-7 smaller, actionable subtasks.
Respond ONLY with a JSON array of subtasks. No other text. Example:
[
  { "title": "Set up project structure", "description": "Create folders and config files" },
  { "title": "Implement core logic", "description": "Write the main algorithm" }
]
Each subtask should be concrete, actionable, and completable by a single developer in one session.`,
      bible
    );

    const prompt = `Decompose this task into smaller subtasks:

Title: ${task.title}
Description: ${task.description}

Current agents available: ${agents.map(a => `${a.name} (${a.role})`).join(', ') || 'none'}

Return ONLY a JSON array of subtasks.`;

    let responseText = '';
    await callLLM({
      provider,
      model,
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      apiKey,
      onChunk: (chunk) => { responseText += chunk; },
    });

    // Parse JSON array from response
    let subtaskDefs: Array<{ title: string; description: string }> = [];
    try {
      // Try direct parse first
      const cleaned = responseText.trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        subtaskDefs = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: create 2 generic subtasks
      subtaskDefs = [
        { title: `${task.title} — Part 1`, description: `First half of: ${task.description}` },
        { title: `${task.title} — Part 2`, description: `Second half of: ${task.description}` },
      ];
    }

    // Save subtasks to board
    const board = await this.workspace.readBoard();
    const now = new Date().toISOString();
    const newTasks: Task[] = subtaskDefs.slice(0, 7).map(def => ({
      id: uuidv4(),
      title: def.title || 'Subtask',
      description: def.description || '',
      columnId: 'backlog' as ColumnId,
      epicId: task.epicId, // inherit epic
      createdAt: now,
      tags: [],
      history: [{ timestamp: now, event: 'created' as const, detail: `Created by decomposing "${task.title}"` }],
    }));

    for (const t of newTasks) {
      board.columns.backlog.push(t);
    }
    await this.workspace.writeBoard(board);

    return newTasks;
  }

  buildChatMessage(role: 'user' | 'assistant' | 'system', content: string): ChatMessage {
    return {
      id: uuidv4(),
      agentId: 'orchestrator',
      role,
      content,
      timestamp: new Date().toISOString(),
    };
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }
}
