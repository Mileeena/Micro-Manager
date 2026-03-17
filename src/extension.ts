import * as vscode from 'vscode';
import { MicroManagerPanel } from './panels/MicroManagerPanel';
import { AgencyWorkspace } from './services/AgencyWorkspace';
import { SecretService } from './services/SecretService';
import { FileSystemService } from './services/FileSystemService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(
      'Micro Manager requires an open workspace folder. Please open a folder first.'
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
    vscode.window.showErrorMessage(`Micro Manager: Failed to initialize workspace: ${String(err)}`);
    return;
  }

  // Register the open command
  const openCommand = vscode.commands.registerCommand('microManager.open', () => {
    MicroManagerPanel.createOrShow(context, agencyWorkspace, secretService, fsService);
  });

  context.subscriptions.push(openCommand);

  // Show welcome notification on first activation
  const hasShownWelcome = context.globalState.get<boolean>('micro-manager.welcomed');
  if (!hasShownWelcome) {
    const choice = await vscode.window.showInformationMessage(
      '🤖 Micro Manager is ready! Open the board to get started.',
      'Open Board'
    );
    if (choice === 'Open Board') {
      MicroManagerPanel.createOrShow(context, agencyWorkspace, secretService, fsService);
    }
    await context.globalState.update('micro-manager.welcomed', true);
  }
}

export function deactivate(): void {
  MicroManagerPanel.currentPanel?.dispose();
}
