import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileSystemService } from '../services/FileSystemService';

// The vscode module is aliased in vitest.config.ts to the mock at __mocks__/vscode.ts
import * as vscode from 'vscode';

describe('FileSystemService', () => {
  const mockWorkspaceRoot = {
    fsPath: '/workspace',
    toString: () => '/workspace',
    scheme: 'file',
    authority: '',
    path: '/workspace',
    query: '',
    fragment: '',
    with: vi.fn(),
    toJSON: vi.fn(),
  };

  let fs: FileSystemService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the Uri.joinPath mock to return a proper-looking URI
    (vscode.Uri.joinPath as any).mockImplementation((...args: any[]) => {
      const parts = args.map((a: any) => (typeof a === 'string' ? a : a.path ?? a.fsPath ?? String(a)));
      const joined = parts.join('/');
      return { fsPath: joined, path: joined, toString: () => joined };
    });
    fs = new FileSystemService(mockWorkspaceRoot as any);
  });

  // ─── resolve() ──────────────────────────────────────────────────────────────

  describe('resolve()', () => {
    it('throws when path attempts directory traversal', () => {
      expect(() => fs.resolve('../../etc/passwd')).toThrow('Path escapes workspace root');
    });

    it('throws when path starts with ../', () => {
      expect(() => fs.resolve('../sibling')).toThrow('Path escapes workspace root');
    });

    it('does not throw for a normal relative path', () => {
      expect(() => fs.resolve('.agency/board.json')).not.toThrow();
    });

    it('calls vscode.Uri.joinPath with workspace root and resolved path', () => {
      fs.resolve('some/file.ts');
      expect(vscode.Uri.joinPath).toHaveBeenCalled();
    });
  });

  // ─── readFile() ─────────────────────────────────────────────────────────────

  describe('readFile()', () => {
    it('decodes Uint8Array bytes to utf-8 string', async () => {
      const content = 'Hello, World!';
      const encoded = Buffer.from(content, 'utf-8');
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encoded);

      const result = await fs.readFile('some/file.txt');
      expect(result).toBe('Hello, World!');
    });

    it('decodes non-ASCII characters correctly', async () => {
      const content = 'こんにちは';
      const encoded = Buffer.from(content, 'utf-8');
      (vscode.workspace.fs.readFile as any).mockResolvedValue(encoded);

      const result = await fs.readFile('greeting.txt');
      expect(result).toBe('こんにちは');
    });

    it('calls vscode.workspace.fs.readFile with the resolved URI', async () => {
      (vscode.workspace.fs.readFile as any).mockResolvedValue(Buffer.from('content', 'utf-8'));
      await fs.readFile('.agency/board.json');
      expect(vscode.workspace.fs.readFile).toHaveBeenCalled();
    });

    it('propagates errors thrown by vscode.workspace.fs.readFile', async () => {
      (vscode.workspace.fs.readFile as any).mockRejectedValue(new Error('File not found'));
      await expect(fs.readFile('missing.txt')).rejects.toThrow('File not found');
    });
  });

  // ─── writeFile() ────────────────────────────────────────────────────────────

  describe('writeFile()', () => {
    it('encodes string content to Uint8Array before writing', async () => {
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);

      await fs.writeFile('output.txt', 'Hello');

      const [, bytesArg] = (vscode.workspace.fs.writeFile as any).mock.calls[0];
      // The written bytes should decode back to the original string
      expect(Buffer.from(bytesArg).toString('utf-8')).toBe('Hello');
    });

    it('encodes JSON content correctly', async () => {
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);
      const json = JSON.stringify({ key: 'value' }, null, 2);

      await fs.writeFile('data.json', json);

      const [, bytesArg] = (vscode.workspace.fs.writeFile as any).mock.calls[0];
      expect(Buffer.from(bytesArg).toString('utf-8')).toBe(json);
    });

    it('calls vscode.workspace.fs.writeFile with resolved URI', async () => {
      (vscode.workspace.fs.writeFile as any).mockResolvedValue(undefined);
      await fs.writeFile('file.txt', 'data');
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
    });

    it('throws when path escapes workspace', async () => {
      await expect(fs.writeFile('../../etc/passwd', 'evil')).rejects.toThrow('Path escapes workspace root');
    });
  });

  // ─── exists() ───────────────────────────────────────────────────────────────

  describe('exists()', () => {
    it('returns true when stat() succeeds', async () => {
      (vscode.workspace.fs.stat as any).mockResolvedValue({ type: 1, size: 100 });
      const result = await fs.exists('.agency/board.json');
      expect(result).toBe(true);
    });

    it('returns false when stat() throws (file not found)', async () => {
      (vscode.workspace.fs.stat as any).mockRejectedValue(new Error('FileNotFound'));
      const result = await fs.exists('.agency/missing.json');
      expect(result).toBe(false);
    });

    it('returns false for paths that escape workspace', async () => {
      // resolve() throws, exists() should return false not throw
      const result = await fs.exists('../../etc/passwd');
      expect(result).toBe(false);
    });
  });

  // ─── createDirectory() ──────────────────────────────────────────────────────

  describe('createDirectory()', () => {
    it('calls vscode.workspace.fs.createDirectory with resolved URI', async () => {
      (vscode.workspace.fs.createDirectory as any).mockResolvedValue(undefined);
      await fs.createDirectory('.agency');
      expect(vscode.workspace.fs.createDirectory).toHaveBeenCalled();
    });
  });

  // ─── listDir() ──────────────────────────────────────────────────────────────

  describe('listDir()', () => {
    it('returns entries from vscode.workspace.fs.readDirectory', async () => {
      const mockEntries: [string, number][] = [['file.md', 1], ['subdir', 2]];
      (vscode.workspace.fs.readDirectory as any).mockResolvedValue(mockEntries);
      const result = await fs.listDir('.agency/agents');
      expect(result).toEqual(mockEntries);
    });
  });
});
