import { vi } from 'vitest';

export const window = {
  showInformationMessage: vi.fn().mockResolvedValue(undefined),
  showErrorMessage: vi.fn().mockResolvedValue(undefined),
  showWarningMessage: vi.fn().mockResolvedValue(undefined),
  createTerminal: vi.fn(() => ({
    show: vi.fn(),
    sendText: vi.fn(),
    exitStatus: undefined,
    dispose: vi.fn(),
  })),
  createWebviewPanel: vi.fn(() => ({
    webview: {
      html: '',
      onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
      postMessage: vi.fn(),
      asWebviewUri: vi.fn((uri: any) => uri),
      cspSource: 'vscode-resource:',
    },
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    iconPath: undefined,
    reveal: vi.fn(),
    dispose: vi.fn(),
  })),
  activeTextEditor: undefined,
};

export const workspace = {
  fs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createDirectory: vi.fn(),
    stat: vi.fn(),
    readDirectory: vi.fn(),
    delete: vi.fn(),
  },
  workspaceFolders: [],
};

export const Uri = {
  joinPath: vi.fn((...args: string[]) => ({ fsPath: args.join('/'), toString: () => args.join('/') })),
  file: vi.fn((p: string) => ({ fsPath: p, toString: () => p })),
  parse: vi.fn((p: string) => ({ fsPath: p, toString: () => p })),
};

export const ViewColumn = { One: 1, Two: 2 };

export const commands = {
  registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
};

export class EventEmitter {
  event = vi.fn();
  fire = vi.fn();
  dispose = vi.fn();
}

export const ExtensionContext = {};

export const SecretStorage = {};

// Re-export common enums
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };
