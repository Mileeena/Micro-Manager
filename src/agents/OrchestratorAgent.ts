import { v4 as uuidv4 } from 'uuid';
import { AgencyWorkspace } from '../services/AgencyWorkspace';
import { callLLM, injectBible } from '../services/LLMRouter';
import { SecretService } from '../services/SecretService';
import { BoardState, ChatMessage, ColumnId, Task } from '../types';

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Scrum Master AI — an expert project manager and software architect.
Your job is to help users organize their work into actionable Kanban tasks.

When a user describes work to be done, respond in TWO parts:
1. A brief conversational acknowledgment
2. If tasks can be created, output a JSON block (and ONLY valid JSON in the block):

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

Valid suggestedColumn values: "backlog", "todo", "in-progress", "done"

If the user is just chatting or asking questions (not requesting work), respond conversationally without a JSON block.

Always be concise, technical, and helpful. Focus on breaking down complex work into concrete, actionable tasks.`;

interface ParsedOrchestratorResponse {
  text: string;
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
    onChunk: (chunk: string) => void
  ): Promise<{ responseText: string; newTasks: Task[] }> {
    const bible = await this.workspace.readBible();
    const systemPrompt = injectBible(ORCHESTRATOR_SYSTEM_PROMPT, bible);

    const apiKey = await this.secrets.getApiKey('anthropic');
    if (!apiKey) {
      throw new Error('No Anthropic API key configured. Please add your key in Settings.');
    }

    this.conversationHistory.push({ role: 'user', content: userMessage });

    let fullResponse = '';
    const response = await callLLM({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
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

    if (parsed.tasks.length > 0) {
      const board = await this.workspace.readBoard();
      for (const taskDef of parsed.tasks) {
        const task: Task = {
          id: uuidv4(),
          title: taskDef.title,
          description: taskDef.description,
          columnId: taskDef.suggestedColumn,
          createdAt: new Date().toISOString(),
          tags: [],
        };
        board.columns[task.columnId].push(task);
        newTasks.push(task);
      }
      await this.workspace.writeBoard(board);
    }

    return { responseText: response, newTasks };
  }

  private parseResponse(response: string): ParsedOrchestratorResponse {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) {
      return { text: response, tasks: [] };
    }
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const tasks = (parsed.tasks ?? []) as Array<{
        title: string;
        description: string;
        suggestedColumn: string;
      }>;
      const validColumns = new Set<string>(['backlog', 'todo', 'in-progress', 'done']);
      return {
        text: response,
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

  buildChatMessage(role: 'user' | 'assistant', content: string): ChatMessage {
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
