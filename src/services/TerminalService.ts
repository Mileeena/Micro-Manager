import * as vscode from 'vscode';
import { AgencyWorkspace } from './AgencyWorkspace';

/** Commands that look like package installation (blocked in strict mode) */
const PACKAGE_INSTALL_PATTERN = /^(npm\s+install|npm\s+i\s|yarn\s+add|pnpm\s+add|pip\s+install|pip3\s+install|gem\s+install|cargo\s+add)/i;

export type CommandResult = 'allowed' | 'denied' | 'blocked-network';

export class TerminalService {
  private terminal: vscode.Terminal | null = null;

  constructor(private readonly workspace: AgencyWorkspace) {}

  async executeCommand(command: string): Promise<CommandResult> {
    // Network policy check
    const policy = await this.workspace.getNetworkPolicy();
    if (policy === 'strict' && PACKAGE_INSTALL_PATTERN.test(command.trim())) {
      vscode.window.showWarningMessage(
        `[Scrum Mastermind] Blocked \`${command}\` — network policy is set to Strict.`
      );
      return 'blocked-network';
    }

    // Whitelist check
    const isWhitelisted = await this.workspace.isWhitelisted(command);
    if (isWhitelisted) {
      await this.runInTerminal(command);
      return 'allowed';
    }

    // Ask user
    const choice = await vscode.window.showInformationMessage(
      `🤖 Agent wants to run: \`${command}\``,
      { modal: false },
      'Allow Once',
      'Allow Always',
      'Deny'
    );

    if (!choice || choice === 'Deny') {
      return 'denied';
    }

    if (choice === 'Allow Always') {
      await this.workspace.addToWhitelist(command);
    }

    await this.runInTerminal(command);
    return 'allowed';
  }

  private async runInTerminal(command: string): Promise<void> {
    if (!this.terminal || this.terminal.exitStatus !== undefined) {
      this.terminal = vscode.window.createTerminal({
        name: 'Scrum Mastermind',
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
