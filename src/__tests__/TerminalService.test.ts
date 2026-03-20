import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalService, AgentCommandContext } from '../services/TerminalService';
import * as vscode from 'vscode';

// Build a minimal AgencyWorkspace mock
function makeWorkspaceMock(overrides: Record<string, any> = {}) {
  return {
    getNetworkPolicy: vi.fn().mockResolvedValue('open'),
    isWhitelisted: vi.fn().mockResolvedValue(false),
    addToWhitelist: vi.fn().mockResolvedValue(undefined),
    workspaceUri: { fsPath: '/workspace', toString: () => '/workspace' },
    ...overrides,
  };
}

// Build a minimal AgentCommandContext
function makeAgent(overrides: Partial<AgentCommandContext> = {}): AgentCommandContext {
  return {
    id: 'dev',
    name: 'Developer',
    allowedCommands: [],
    onAllowForAgent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('TerminalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Network policy: strict ─────────────────────────────────────────────────

  describe('blocked-network (strict policy)', () => {
    it('blocks npm install when networkPolicy=strict', async () => {
      const workspace = makeWorkspaceMock({ getNetworkPolicy: vi.fn().mockResolvedValue('strict') });
      const service = new TerminalService(workspace as any);

      const result = await service.executeCommand('npm install lodash');

      expect(result).toBe('blocked-network');
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('network policy is set to Strict')
      );
    });

    it('blocks yarn add when networkPolicy=strict', async () => {
      const workspace = makeWorkspaceMock({ getNetworkPolicy: vi.fn().mockResolvedValue('strict') });
      const service = new TerminalService(workspace as any);

      const result = await service.executeCommand('yarn add react');
      expect(result).toBe('blocked-network');
    });

    it('blocks pip install when networkPolicy=strict', async () => {
      const workspace = makeWorkspaceMock({ getNetworkPolicy: vi.fn().mockResolvedValue('strict') });
      const service = new TerminalService(workspace as any);

      const result = await service.executeCommand('pip install numpy');
      expect(result).toBe('blocked-network');
    });

    it('allows npm run build (not a package install) even in strict mode', async () => {
      const workspace = makeWorkspaceMock({ getNetworkPolicy: vi.fn().mockResolvedValue('strict') });
      const service = new TerminalService(workspace as any);
      // showInformationMessage mock returns undefined → 'Deny' path but we want to check it isn't blocked-network
      (vscode.window.showInformationMessage as any).mockResolvedValue('Allow Once');

      const result = await service.executeCommand('npm run build');
      expect(result).not.toBe('blocked-network');
    });
  });

  // ─── Agent personal allowedCommands ─────────────────────────────────────────

  describe('agent personal allowedCommands', () => {
    it('allows command that exactly matches agent allowedCommands entry', async () => {
      const workspace = makeWorkspaceMock();
      const service = new TerminalService(workspace as any);
      const agent = makeAgent({ allowedCommands: ['npm run test'] });

      const result = await service.executeCommand('npm run test', agent);

      expect(result).toBe('allowed');
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('allows command that starts with an allowedCommands entry', async () => {
      const workspace = makeWorkspaceMock();
      const service = new TerminalService(workspace as any);
      const agent = makeAgent({ allowedCommands: ['git'] });

      const result = await service.executeCommand('git commit -m "fix"', agent);

      expect(result).toBe('allowed');
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('does not allow command if no agent allowed entry matches', async () => {
      const workspace = makeWorkspaceMock();
      const service = new TerminalService(workspace as any);
      const agent = makeAgent({ allowedCommands: ['git'] });
      (vscode.window.showInformationMessage as any).mockResolvedValue('Deny');

      const result = await service.executeCommand('rm -rf dist', agent);

      expect(result).toBe('denied');
    });
  });

  // ─── Global whitelist ───────────────────────────────────────────────────────

  describe('global whitelist', () => {
    it('allows command present in global whitelist without prompting', async () => {
      const workspace = makeWorkspaceMock({ isWhitelisted: vi.fn().mockResolvedValue(true) });
      const service = new TerminalService(workspace as any);

      const result = await service.executeCommand('npm run build');

      expect(result).toBe('allowed');
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });
  });

  // ─── User prompt ────────────────────────────────────────────────────────────

  describe('user prompt when not whitelisted', () => {
    it('shows information message prompt when command is not whitelisted', async () => {
      const workspace = makeWorkspaceMock();
      const service = new TerminalService(workspace as any);
      (vscode.window.showInformationMessage as any).mockResolvedValue('Allow Once');

      await service.executeCommand('custom-script.sh');

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('custom-script.sh'),
        expect.any(Object),
        expect.stringContaining('Allow Once'),
        expect.stringContaining('Allow Always'),
        expect.stringContaining('Deny')
      );
    });

    it('returns allowed when user picks Allow Once', async () => {
      const workspace = makeWorkspaceMock();
      const service = new TerminalService(workspace as any);
      (vscode.window.showInformationMessage as any).mockResolvedValue('Allow Once');

      const result = await service.executeCommand('custom-script.sh');
      expect(result).toBe('allowed');
    });

    it('saves to global whitelist when user picks Allow Always', async () => {
      const workspace = makeWorkspaceMock();
      const service = new TerminalService(workspace as any);
      (vscode.window.showInformationMessage as any).mockResolvedValue('Allow Always');

      const result = await service.executeCommand('make deploy');

      expect(result).toBe('allowed');
      expect(workspace.addToWhitelist).toHaveBeenCalledWith('make deploy');
    });

    it('returns denied when user picks Deny', async () => {
      const workspace = makeWorkspaceMock();
      const service = new TerminalService(workspace as any);
      (vscode.window.showInformationMessage as any).mockResolvedValue('Deny');

      const result = await service.executeCommand('rm -rf /');
      expect(result).toBe('denied');
      expect(workspace.addToWhitelist).not.toHaveBeenCalled();
    });

    it('returns denied when user dismisses the prompt (undefined)', async () => {
      const workspace = makeWorkspaceMock();
      const service = new TerminalService(workspace as any);
      (vscode.window.showInformationMessage as any).mockResolvedValue(undefined);

      const result = await service.executeCommand('risky-command');
      expect(result).toBe('denied');
    });
  });

  // ─── Allow for Agent ────────────────────────────────────────────────────────

  describe('Allow for Agent choice', () => {
    it('calls onAllowForAgent when user picks Allow for <AgentName>', async () => {
      const workspace = makeWorkspaceMock();
      const service = new TerminalService(workspace as any);
      const agent = makeAgent({ name: 'Developer' });
      (vscode.window.showInformationMessage as any).mockResolvedValue('Allow for Developer');

      const result = await service.executeCommand('npm run lint', agent);

      expect(result).toBe('allowed');
      expect(agent.onAllowForAgent).toHaveBeenCalledWith('npm run lint');
      // Should also add to agent's in-memory list
      expect(agent.allowedCommands).toContain('npm run lint');
    });

    it('does not call addToWhitelist when Allow for Agent is chosen', async () => {
      const workspace = makeWorkspaceMock();
      const service = new TerminalService(workspace as any);
      const agent = makeAgent({ name: 'Developer' });
      (vscode.window.showInformationMessage as any).mockResolvedValue('Allow for Developer');

      await service.executeCommand('npm run lint', agent);

      expect(workspace.addToWhitelist).not.toHaveBeenCalled();
    });
  });
});
