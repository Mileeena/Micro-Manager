import * as vscode from 'vscode';
import * as path from 'path';

export class FileSystemService {
  constructor(private readonly workspaceRoot: vscode.Uri) {}

  /** Resolve a path relative to workspace root. Throws if path escapes workspace. */
  resolve(relativePath: string): vscode.Uri {
    const resolved = path.posix.normalize(relativePath.replace(/\\/g, '/'));
    if (resolved.startsWith('..')) {
      throw new Error(`Path escapes workspace root: ${relativePath}`);
    }
    return vscode.Uri.joinPath(this.workspaceRoot, resolved);
  }

  async readFile(relativePath: string): Promise<string> {
    const uri = this.resolve(relativePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf-8');
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const uri = this.resolve(relativePath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const uri = this.resolve(relativePath);
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  async createDirectory(relativePath: string): Promise<void> {
    const uri = this.resolve(relativePath);
    await vscode.workspace.fs.createDirectory(uri);
  }

  async listDir(relativePath: string): Promise<[string, vscode.FileType][]> {
    const uri = this.resolve(relativePath);
    return vscode.workspace.fs.readDirectory(uri);
  }

  async readFileAbsolute(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf-8');
  }
}
