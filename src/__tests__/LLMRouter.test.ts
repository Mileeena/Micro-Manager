import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callLLM, injectBible } from '../services/LLMRouter';
import type { LLMCallParams } from '../types';

// ─── Mock @anthropic-ai/sdk ──────────────────────────────────────────────────
// We use a mutable container object so that the factory closure captures a
// stable reference. The inner `streamFn` field is replaced per-test.

vi.mock('@anthropic-ai/sdk', () => {
  const streamFn = vi.fn();
  // Use regular function (not arrow) so Vitest can call it with `new`
  const AnthropicMock = vi.fn().mockImplementation(function () {
    return { messages: { stream: streamFn } };
  });
  // Attach the inner fn to the constructor so tests can reach it via import
  (AnthropicMock as any).streamFn = streamFn;
  return { default: AnthropicMock };
});

// ─── Mock openai ─────────────────────────────────────────────────────────────

vi.mock('openai', () => {
  const createFn = vi.fn();
  // Use regular function (not arrow) so Vitest can call it with `new`
  const OpenAIMock = vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: createFn } } };
  });
  (OpenAIMock as any).createFn = createFn;
  return { default: OpenAIMock };
});

// ─── Import the mocked modules so we can access the inner fns ─────────────────

import AnthropicMock from '@anthropic-ai/sdk';
import OpenAIMock from 'openai';

// Cast to access the attached fn properties
const mockAnthropicStream: ReturnType<typeof vi.fn> = (AnthropicMock as any).streamFn;
const mockOpenAICreate: ReturnType<typeof vi.fn> = (OpenAIMock as any).createFn;

// ─── Async generator helpers ──────────────────────────────────────────────────

async function* makeAnthropicChunks(texts: string[]) {
  for (const text of texts) {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
  }
}

async function* makeOpenAIChunks(deltas: (string | null)[]) {
  for (const delta of deltas) {
    yield { choices: [{ delta: { content: delta } }] };
  }
}

// ─── Base params ─────────────────────────────────────────────────────────────

const baseParams: Omit<LLMCallParams, 'provider'> = {
  model: 'claude-sonnet-4-6',
  systemPrompt: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello!' }],
  apiKey: 'test-api-key',
};

// ─── injectBible tests ────────────────────────────────────────────────────────

describe('injectBible', () => {
  it('prepends BIBLE content to the system prompt', () => {
    const result = injectBible('You are a coder.', '## Bible content');
    expect(result).toContain('### PROJECT BIBLE');
    expect(result).toContain('## Bible content');
    expect(result).toContain('You are a coder.');
    expect(result.indexOf('PROJECT BIBLE')).toBeLessThan(result.indexOf('You are a coder.'));
  });

  it('returns system prompt unchanged when bibleContent is empty', () => {
    const result = injectBible('You are a coder.', '');
    expect(result).toBe('You are a coder.');
  });

  it('returns system prompt unchanged when bibleContent is only whitespace', () => {
    const result = injectBible('You are a coder.', '   \n  ');
    expect(result).toBe('You are a coder.');
  });

  it('trims bible content before injecting', () => {
    const result = injectBible('Prompt', '\n\nBible text\n\n');
    expect(result).toContain('Bible text');
    expect(result).not.toContain('### PROJECT BIBLE\n\n\n');
  });

  it('separates bible from system prompt with a divider', () => {
    const result = injectBible('System prompt here.', 'Bible content here.');
    expect(result).toContain('---');
    const dividerIdx = result.indexOf('---');
    const promptIdx = result.indexOf('System prompt here.');
    expect(dividerIdx).toBeLessThan(promptIdx);
  });
});

// ─── callLLM tests ─────────────────────────────────────────────────────────────

describe('callLLM', () => {
  beforeEach(() => {
    mockAnthropicStream.mockReset();
    mockOpenAICreate.mockReset();
    (AnthropicMock as any).mockClear();
    (OpenAIMock as any).mockClear();
  });

  // ─── Unknown provider ───────────────────────────────────────────────────────

  it('throws for unknown provider', async () => {
    await expect(
      callLLM({ ...baseParams, provider: 'unknown' as any })
    ).rejects.toThrow('Unknown LLM provider: unknown');
  });

  // ─── Anthropic routing ──────────────────────────────────────────────────────

  describe('anthropic provider', () => {
    it('routes to Anthropic and returns concatenated text', async () => {
      mockAnthropicStream.mockReturnValue(makeAnthropicChunks(['Hello', ', ', 'World']));

      const result = await callLLM({ ...baseParams, provider: 'anthropic' });
      expect(result).toBe('Hello, World');
    });

    it('calls onChunk for each text delta chunk', async () => {
      mockAnthropicStream.mockReturnValue(makeAnthropicChunks(['chunk1', 'chunk2', 'chunk3']));
      const onChunk = vi.fn();

      await callLLM({ ...baseParams, provider: 'anthropic', onChunk });

      expect(onChunk).toHaveBeenCalledTimes(3);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'chunk1');
      expect(onChunk).toHaveBeenNthCalledWith(2, 'chunk2');
      expect(onChunk).toHaveBeenNthCalledWith(3, 'chunk3');
    });

    it('does not call onChunk for non-text_delta chunks', async () => {
      async function* mixedChunks() {
        yield { type: 'message_start', message: {} };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'real text' } };
        yield { type: 'message_delta', delta: { stop_reason: 'end_turn' } };
      }
      mockAnthropicStream.mockReturnValue(mixedChunks());
      const onChunk = vi.fn();

      const result = await callLLM({ ...baseParams, provider: 'anthropic', onChunk });

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(result).toBe('real text');
    });

    it('passes systemPrompt as system field to Anthropic stream', async () => {
      mockAnthropicStream.mockReturnValue(makeAnthropicChunks([]));

      await callLLM({ ...baseParams, provider: 'anthropic', systemPrompt: 'Custom system prompt' });

      expect(mockAnthropicStream).toHaveBeenCalledWith(expect.objectContaining({
        system: 'Custom system prompt',
      }));
    });

    it('passes model to Anthropic stream call', async () => {
      mockAnthropicStream.mockReturnValue(makeAnthropicChunks([]));

      await callLLM({ ...baseParams, provider: 'anthropic', model: 'claude-opus-4-6' });

      expect(mockAnthropicStream).toHaveBeenCalledWith(expect.objectContaining({
        model: 'claude-opus-4-6',
      }));
    });

    it('passes user messages to Anthropic stream call', async () => {
      mockAnthropicStream.mockReturnValue(makeAnthropicChunks([]));
      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there' },
      ];

      await callLLM({ ...baseParams, provider: 'anthropic', messages });

      expect(mockAnthropicStream).toHaveBeenCalledWith(expect.objectContaining({
        messages: expect.arrayContaining([
          { role: 'user', content: 'Hello' },
        ]),
      }));
    });

    it('returns empty string when no text chunks received', async () => {
      mockAnthropicStream.mockReturnValue(makeAnthropicChunks([]));

      const result = await callLLM({ ...baseParams, provider: 'anthropic' });
      expect(result).toBe('');
    });

    it('constructs Anthropic client with provided apiKey', async () => {
      mockAnthropicStream.mockReturnValue(makeAnthropicChunks([]));

      await callLLM({ ...baseParams, provider: 'anthropic', apiKey: 'sk-ant-test' });

      expect(AnthropicMock).toHaveBeenCalledWith({ apiKey: 'sk-ant-test' });
    });
  });

  // ─── OpenAI routing ─────────────────────────────────────────────────────────

  describe('openai provider', () => {
    it('routes to OpenAI and returns concatenated text', async () => {
      mockOpenAICreate.mockReturnValue(makeOpenAIChunks(['Hi', ' there', '!']));

      const result = await callLLM({ ...baseParams, provider: 'openai' });
      expect(result).toBe('Hi there!');
    });

    it('calls onChunk for each OpenAI streaming delta', async () => {
      mockOpenAICreate.mockReturnValue(makeOpenAIChunks(['a', 'b', 'c']));
      const onChunk = vi.fn();

      await callLLM({ ...baseParams, provider: 'openai', onChunk });

      expect(onChunk).toHaveBeenCalledTimes(3);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'a');
      expect(onChunk).toHaveBeenNthCalledWith(2, 'b');
      expect(onChunk).toHaveBeenNthCalledWith(3, 'c');
    });

    it('skips null/undefined delta content', async () => {
      mockOpenAICreate.mockReturnValue(makeOpenAIChunks(['hello', null, 'world']));
      const onChunk = vi.fn();

      const result = await callLLM({ ...baseParams, provider: 'openai', onChunk });

      expect(result).toBe('helloworld');
      expect(onChunk).toHaveBeenCalledTimes(2);
    });

    it('passes stream:true to OpenAI create call', async () => {
      mockOpenAICreate.mockReturnValue(makeOpenAIChunks([]));

      await callLLM({ ...baseParams, provider: 'openai' });

      expect(mockOpenAICreate).toHaveBeenCalledWith(expect.objectContaining({
        stream: true,
      }));
    });

    it('includes system message in OpenAI messages array', async () => {
      mockOpenAICreate.mockReturnValue(makeOpenAIChunks([]));

      await callLLM({ ...baseParams, provider: 'openai', systemPrompt: 'Be concise.' });

      expect(mockOpenAICreate).toHaveBeenCalledWith(expect.objectContaining({
        messages: expect.arrayContaining([
          { role: 'system', content: 'Be concise.' },
        ]),
      }));
    });
  });

  // ─── OpenRouter routing ──────────────────────────────────────────────────────

  describe('openrouter provider', () => {
    it('routes to OpenRouter (via OpenAI client) and returns concatenated text', async () => {
      mockOpenAICreate.mockReturnValue(makeOpenAIChunks(['OpenRouter', ' response']));

      const result = await callLLM({ ...baseParams, provider: 'openrouter' });
      expect(result).toBe('OpenRouter response');
    });

    it('calls onChunk for each OpenRouter streaming delta', async () => {
      mockOpenAICreate.mockReturnValue(makeOpenAIChunks(['x', 'y']));
      const onChunk = vi.fn();

      await callLLM({ ...baseParams, provider: 'openrouter', onChunk });

      expect(onChunk).toHaveBeenCalledTimes(2);
    });

    it('constructs OpenAI client with OpenRouter base URL', async () => {
      mockOpenAICreate.mockReturnValue(makeOpenAIChunks([]));

      await callLLM({ ...baseParams, provider: 'openrouter', apiKey: 'or-key' });

      expect(OpenAIMock).toHaveBeenCalledWith(expect.objectContaining({
        apiKey: 'or-key',
        baseURL: 'https://openrouter.ai/api/v1',
      }));
    });

    it('passes stream:true to OpenRouter create call', async () => {
      mockOpenAICreate.mockReturnValue(makeOpenAIChunks([]));

      await callLLM({ ...baseParams, provider: 'openrouter' });

      expect(mockOpenAICreate).toHaveBeenCalledWith(expect.objectContaining({
        stream: true,
      }));
    });
  });
});
