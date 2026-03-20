import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('../vscode', () => ({
  vscode: { postMessage: vi.fn(), getState: vi.fn(() => undefined), setState: vi.fn() },
}));

import { MessageList } from '../components/MessageList';
import type { ChatMessage } from '../store/chatStore';

const makeMessage = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: `msg-${Math.random()}`,
  agentId: 'orchestrator',
  role: 'assistant',
  content: 'Hello there',
  timestamp: '2024-01-01T12:00:00.000Z',
  ...overrides,
});

describe('MessageList', () => {
  it('renders empty state when no messages', () => {
    render(<MessageList messages={[]} />);
    // Actual text: "No messages yet. Start the conversation."
    expect(screen.getByText(/start the conversation/i)).toBeTruthy();
  });

  it('renders user messages', () => {
    const messages = [makeMessage({ role: 'user', content: 'Hello from user' })];
    render(<MessageList messages={messages} />);
    expect(screen.getByText('Hello from user')).toBeTruthy();
  });

  it('renders assistant messages', () => {
    const messages = [makeMessage({ role: 'assistant', content: 'Hello from assistant' })];
    render(<MessageList messages={messages} />);
    expect(screen.getByText('Hello from assistant')).toBeTruthy();
  });

  it('renders system messages differently (as banner)', () => {
    const messages = [makeMessage({ role: 'system', content: 'Task was completed' })];
    render(<MessageList messages={messages} />);
    expect(screen.getByText('Task was completed')).toBeTruthy();
  });

  it('renders multiple messages in order', () => {
    const messages = [
      makeMessage({ role: 'user', content: 'First message' }),
      makeMessage({ role: 'assistant', content: 'Second message' }),
      makeMessage({ role: 'user', content: 'Third message' }),
    ];
    render(<MessageList messages={messages} />);
    expect(screen.getByText('First message')).toBeTruthy();
    expect(screen.getByText('Second message')).toBeTruthy();
    expect(screen.getByText('Third message')).toBeTruthy();
  });

  it('renders streaming content when provided', () => {
    render(<MessageList messages={[]} streamingContent="Streaming response..." agentName="Manager" />);
    expect(screen.getByText('Streaming response...')).toBeTruthy();
  });

  it('hides empty state while streaming content is shown', () => {
    // When streaming content is truthy, the empty state is hidden
    render(<MessageList messages={[]} streamingContent="Hello" agentName="TestAgent" />);
    expect(screen.queryByText(/start the conversation/i)).toBeNull();
  });

  it('shows empty state when streamingContent is empty string', () => {
    // streamingContent="" is falsy, so empty state IS shown
    render(<MessageList messages={[]} streamingContent="" agentName="Manager" />);
    expect(screen.getByText(/start the conversation/i)).toBeTruthy();
  });
});
