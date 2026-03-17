import * as vscode from 'vscode';
import { ScrumMastermindPanel } from './panels/ScrumMastermindPanel';
import { AgencyWorkspace } from './services/AgencyWorkspace';
import { SecretService } from './services/SecretService';
import { FileSystemService } from './services/FileSystemService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(
      'Scrum Mastermind requires an open workspace folder. Please open a folder first.'
    );
    return;
  }

  const workspaceFolder = workspaceFolders[0];
  const secretService = new SecretService(context.secrets);
  const agencyWorkspace = new AgencyWorkspace(workspaceFolder);
  const fsService = new FileSystemService(workspaceFolder.uri);

  // Initialize .agency/ folder structure
  try {
    await agencyWorkspace.initialize();
  } catch (err) {
    vscode.window.showErrorMessage(`Scrum Mastermind: Failed to initialize workspace: ${String(err)}`);
    return;
  }

  // Register the open command
  const openCommand = vscode.commands.registerCommand('scrumMastermind.open', () => {
    ScrumMastermindPanel.createOrShow(context, agencyWorkspace, secretService, fsService);
  });

  context.subscriptions.push(openCommand);

  // Show welcome notification on first activation
  const hasShownWelcome = context.globalState.get<boolean>('scrum-mastermind.welcomed');
  if (!hasShownWelcome) {
    const choice = await vscode.window.showInformationMessage(
      '🤖 Scrum Mastermind is ready! Open the board to get started.',
      'Open Board'
    );
    if (choice === 'Open Board') {
      ScrumMastermindPanel.createOrShow(context, agencyWorkspace, secretService, fsService);
    }
    await context.globalState.update('scrum-mastermind.welcomed', true);
  }
}

export function deactivate(): void {
  ScrumMastermindPanel.currentPanel?.dispose();
}
