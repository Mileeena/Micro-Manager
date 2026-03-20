import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecretService } from '../services/SecretService';

// Create a mock SecretStorage object
function makeMockSecrets() {
  const store: Record<string, string> = {};
  return {
    store: vi.fn(async (key: string, value: string) => { store[key] = value; }),
    get: vi.fn(async (key: string) => store[key]),
    delete: vi.fn(async (key: string) => { delete store[key]; }),
    onDidChange: vi.fn(),
    _store: store, // expose for assertions
  };
}

describe('SecretService', () => {
  let mockSecrets: ReturnType<typeof makeMockSecrets>;
  let service: SecretService;

  beforeEach(() => {
    mockSecrets = makeMockSecrets();
    service = new SecretService(mockSecrets as any);
  });

  describe('setApiKey', () => {
    it('stores with prefix microManager.apiKey.', async () => {
      await service.setApiKey('anthropic', 'sk-test-key');
      expect(mockSecrets.store).toHaveBeenCalledWith(
        'microManager.apiKey.anthropic',
        'sk-test-key'
      );
    });

    it('stores each provider under its own key', async () => {
      await service.setApiKey('anthropic', 'anthropic-key');
      await service.setApiKey('openai', 'openai-key');
      await service.setApiKey('openrouter', 'openrouter-key');
      expect(mockSecrets.store).toHaveBeenCalledWith('microManager.apiKey.anthropic', 'anthropic-key');
      expect(mockSecrets.store).toHaveBeenCalledWith('microManager.apiKey.openai', 'openai-key');
      expect(mockSecrets.store).toHaveBeenCalledWith('microManager.apiKey.openrouter', 'openrouter-key');
    });
  });

  describe('getApiKey', () => {
    it('retrieves stored key using prefixed storage key', async () => {
      await service.setApiKey('anthropic', 'my-secret');
      const result = await service.getApiKey('anthropic');
      expect(mockSecrets.get).toHaveBeenCalledWith('microManager.apiKey.anthropic');
      expect(result).toBe('my-secret');
    });

    it('returns undefined when no key has been stored', async () => {
      const result = await service.getApiKey('openai');
      expect(result).toBeUndefined();
    });
  });

  describe('hasApiKey', () => {
    it('returns false when key is missing', async () => {
      const result = await service.hasApiKey('anthropic');
      expect(result).toBe(false);
    });

    it('returns false when key is empty string', async () => {
      await service.setApiKey('anthropic', '');
      const result = await service.hasApiKey('anthropic');
      expect(result).toBe(false);
    });

    it('returns false when key is only whitespace', async () => {
      await service.setApiKey('anthropic', '   ');
      const result = await service.hasApiKey('anthropic');
      expect(result).toBe(false);
    });

    it('returns true when a non-empty key is set', async () => {
      await service.setApiKey('anthropic', 'sk-real-key');
      const result = await service.hasApiKey('anthropic');
      expect(result).toBe(true);
    });

    it('returns true for each provider independently', async () => {
      await service.setApiKey('openai', 'openai-key');
      expect(await service.hasApiKey('openai')).toBe(true);
      expect(await service.hasApiKey('anthropic')).toBe(false);
      expect(await service.hasApiKey('openrouter')).toBe(false);
    });
  });

  describe('deleteApiKey', () => {
    it('removes key from storage using prefixed key', async () => {
      await service.setApiKey('anthropic', 'key-to-delete');
      await service.deleteApiKey('anthropic');
      expect(mockSecrets.delete).toHaveBeenCalledWith('microManager.apiKey.anthropic');
    });

    it('key is no longer retrievable after deletion', async () => {
      await service.setApiKey('anthropic', 'key-to-delete');
      await service.deleteApiKey('anthropic');
      const result = await service.getApiKey('anthropic');
      expect(result).toBeUndefined();
    });

    it('hasApiKey returns false after deletion', async () => {
      await service.setApiKey('openrouter', 'temp-key');
      expect(await service.hasApiKey('openrouter')).toBe(true);
      await service.deleteApiKey('openrouter');
      expect(await service.hasApiKey('openrouter')).toBe(false);
    });
  });
});
