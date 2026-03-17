import * as vscode from 'vscode';
import { AgentProvider } from '../types';

const KEY_PREFIX = 'scrumMastermind.apiKey.';

export class SecretService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async setApiKey(provider: AgentProvider, key: string): Promise<void> {
    await this.secrets.store(`${KEY_PREFIX}${provider}`, key);
  }

  async getApiKey(provider: AgentProvider): Promise<string | undefined> {
    return this.secrets.get(`${KEY_PREFIX}${provider}`);
  }

  async deleteApiKey(provider: AgentProvider): Promise<void> {
    await this.secrets.delete(`${KEY_PREFIX}${provider}`);
  }

  async hasApiKey(provider: AgentProvider): Promise<boolean> {
    const key = await this.getApiKey(provider);
    return !!key && key.trim().length > 0;
  }
}
