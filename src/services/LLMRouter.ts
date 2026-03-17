import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { LLMCallParams } from '../types';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Unified LLM routing for Claude (Anthropic), OpenAI, and OpenRouter.
 * BIBLE.md content is automatically prepended to the system prompt by the caller.
 */
export async function callLLM(params: LLMCallParams): Promise<string> {
  const { provider, model, systemPrompt, messages, apiKey, onChunk } = params;

  if (provider === 'anthropic') {
    return callClaude({ model, systemPrompt, messages, apiKey, onChunk });
  }
  if (provider === 'openai') {
    return callOpenAI({ model, systemPrompt, messages, apiKey, onChunk });
  }
  if (provider === 'openrouter') {
    return callOpenRouter({ model, systemPrompt, messages, apiKey, onChunk });
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

type StreamParams = Omit<LLMCallParams, 'provider'>;

async function callClaude({ model, systemPrompt, messages, apiKey, onChunk }: StreamParams): Promise<string> {
  const client = new Anthropic({ apiKey });

  const stream = await client.messages.stream({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });

  let fullText = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      fullText += chunk.delta.text;
      onChunk?.(chunk.delta.text);
    }
  }
  return fullText;
}

async function callOpenAI({ model, systemPrompt, messages, apiKey, onChunk }: StreamParams): Promise<string> {
  const client = new OpenAI({ apiKey });

  const stream = await client.chat.completions.create({
    model,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      fullText += delta;
      onChunk?.(delta);
    }
  }
  return fullText;
}

async function callOpenRouter({ model, systemPrompt, messages, apiKey, onChunk }: StreamParams): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/scrum-mastermind',
      'X-Title': 'Scrum Mastermind',
    },
  });

  const stream = await client.chat.completions.create({
    model,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      fullText += delta;
      onChunk?.(delta);
    }
  }
  return fullText;
}

/** Inject BIBLE.md content at the top of any system prompt */
export function injectBible(systemPrompt: string, bibleContent: string): string {
  if (!bibleContent.trim()) return systemPrompt;
  return `### PROJECT BIBLE\n\n${bibleContent.trim()}\n\n---\n\n${systemPrompt}`;
}
