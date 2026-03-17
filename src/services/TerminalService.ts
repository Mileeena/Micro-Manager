import * as vscode from 'vscode';
import { AgencyWorkspace } from './AgencyWorkspace';

/** Commands that look like package installation (blocked in strict mode) */
const PACKAGE_INSTALL_PATTERN = /^(npm\s+install|npm\s+i\s|yarn\s+add|pnpm\s+add|pip\s+install|pip3\s+install|gem\s+install|cargo\s+add)/i;

export type CommandResult = 'allowed' | 'denied' | 'blocked-network';

export interface AgentCommandContext {
  id: string;
  name: string;
  allowedCommands: string[];
  onAllowForAgent: (cmd: string) => Promise<void>;
}

export class TerminalService {
  private terminal: vscode.Terminal | null = null;

  constructor(private readonly workspace: AgencyWorkspace) {}

  async executeCommand(command: string, agent?: AgentCommandContext): Promise<CommandResult> {
    // Network policy check
    const policy = await this.workspace.getNetworkPolicy();
    if (policy === 'strict' && PACKAGE_INSTALL_PATTERN.test(command.trim())) {
      vscode.window.showWarningMessage(
        `[Micro Manager] Blocked \`${command}\` — network policy is set to Strict.`
      );
      return 'blocked-network';
    }

    // Check agent's personal allowed commands first
    if (agent) {
      const agentAllows = agent.allowedCommands.some(
        allowed => command.trim() === allowed.trim() || command.trim().startsWith(allowed.trim())
      );
      if (agentAllows) {
        await this.runInTerminal(command);
        return 'allowed';
      }
    }

    // Check global whitelist
    const isWhitelisted = await this.workspace.isWhitelisted(command);
    if (isWhitelisted) {
      await this.runInTerminal(command);
      return 'allowed';
    }

    // Ask user with per-agent option
    const agentLabel = agent ? ` (from ${agent.name})` : '';
    const allowForAgentLabel = agent ? `Allow for ${agent.name}` : undefined;

    const choices = [
      'Allow Once',
      ...(allowForAgentLabel ? [allowForAgentLabel] : []),
      'Allow Always',
      'Deny',
    ];

    const choice = await vscode.window.showInformationMessage(
      `🤖 Agent${agentLabel} wants to run: \`${command}\``,
      { modal: false },
      ...choices
    );

    if (!choice || choice === 'Deny') {
      return 'denied';
    }

    if (choice === 'Allow Always') {
      await this.workspace.addToWhitelist(command);
    } else if (choice === allowForAgentLabel && agent) {
      await agent.onAllowForAgent(command);
      // Update in-memory agent allowedCommands
      agent.allowedCommands.push(command);
    }

    await this.runInTerminal(command);
    return 'allowed';
  }

  private async runInTerminal(command: string): Promise<void> {
    if (!this.terminal || this.terminal.exitStatus !== undefined) {
      this.terminal = vscode.window.createTerminal({
        name: 'Micro Manager',
        cwd: this.workspace.workspaceUri,
      });
    }
    this.terminal.show(true); // preserve focus
    this.terminal.sendText(command);
  }

  dispose(): void {
    this.terminal?.dispose();
  }
}
