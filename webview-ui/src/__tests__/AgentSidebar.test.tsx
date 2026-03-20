import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('../vscode', () => ({
  vscode: { postMessage: vi.fn(), getState: vi.fn(() => undefined), setState: vi.fn() },
}));

// Mock PixelAgent (canvas not supported in jsdom)
vi.mock('../components/PixelAgent', () => ({
  PixelAgent: ({ name }: { name?: string }) => <span data-testid="pixel-agent">{name ?? 'agent'}</span>,
}));

import { AgentSidebar } from '../components/AgentSidebar';
import { useAgentStore, type AgentState } from '../store/agentStore';

const makeAgent = (overrides: Partial<AgentState> = {}): AgentState => ({
  id: 'agent-1',
  name: 'Alice',
  role: 'developer',
  mission: 'Write code',
  metrics: '',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  status: 'idle',
  avatarSeed: 'alice',
  ...overrides,
});

describe('AgentSidebar', () => {
  const mockOnSelectAgent = vi.fn();
  const mockOnShowCreateAgent = vi.fn();

  beforeEach(() => {
    useAgentStore.setState({
      agents: [],
      apiKeyStatus: { anthropic: false, openai: false, openrouter: false },
      networkPolicy: 'open',
      orchestrator: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    });
    vi.clearAllMocks();
  });

  it('shows empty state when no agents', () => {
    render(
      <AgentSidebar
        onSelectAgent={mockOnSelectAgent}
        onShowCreateAgent={mockOnShowCreateAgent}
      />
    );
    expect(screen.getByText(/No agents yet/i)).toBeTruthy();
  });

  it('shows "Create your first agent" link when no agents', () => {
    render(
      <AgentSidebar
        onSelectAgent={mockOnSelectAgent}
        onShowCreateAgent={mockOnShowCreateAgent}
      />
    );
    expect(screen.getByText(/Create your first agent/i)).toBeTruthy();
  });

  it('renders agent names in the list', () => {
    useAgentStore.setState({
      agents: [
        makeAgent({ id: 'a1', name: 'Alice', role: 'developer' }),
        makeAgent({ id: 'a2', name: 'Bob', role: 'tester' }),
      ],
      apiKeyStatus: { anthropic: false, openai: false, openrouter: false },
      networkPolicy: 'open',
      orchestrator: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    });
    render(
      <AgentSidebar
        onSelectAgent={mockOnSelectAgent}
        onShowCreateAgent={mockOnShowCreateAgent}
      />
    );
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('renders agent roles', () => {
    useAgentStore.setState({
      agents: [makeAgent({ id: 'a1', name: 'Alice', role: 'developer' })],
      apiKeyStatus: { anthropic: false, openai: false, openrouter: false },
      networkPolicy: 'open',
      orchestrator: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    });
    render(
      <AgentSidebar
        onSelectAgent={mockOnSelectAgent}
        onShowCreateAgent={mockOnShowCreateAgent}
      />
    );
    expect(screen.getByText('developer')).toBeTruthy();
  });

  it('clicking an agent calls onSelectAgent', () => {
    const alice = makeAgent({ id: 'a1', name: 'Alice' });
    useAgentStore.setState({
      agents: [alice],
      apiKeyStatus: { anthropic: false, openai: false, openrouter: false },
      networkPolicy: 'open',
      orchestrator: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    });
    render(
      <AgentSidebar
        onSelectAgent={mockOnSelectAgent}
        onShowCreateAgent={mockOnShowCreateAgent}
      />
    );
    fireEvent.click(screen.getByText('Alice'));
    expect(mockOnSelectAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('clicking Add button calls onShowCreateAgent', () => {
    render(
      <AgentSidebar
        onSelectAgent={mockOnSelectAgent}
        onShowCreateAgent={mockOnShowCreateAgent}
      />
    );
    fireEvent.click(screen.getByText('+ Add'));
    expect(mockOnShowCreateAgent).toHaveBeenCalled();
  });

  it('highlights selected agent', () => {
    useAgentStore.setState({
      agents: [makeAgent({ id: 'a1', name: 'Alice' })],
      apiKeyStatus: { anthropic: false, openai: false, openrouter: false },
      networkPolicy: 'open',
      orchestrator: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    });
    render(
      <AgentSidebar
        onSelectAgent={mockOnSelectAgent}
        selectedAgentId="a1"
        onShowCreateAgent={mockOnShowCreateAgent}
      />
    );
    // The selected agent button should have bg-opacity-10 class
    const agentBtn = screen.getByText('Alice').closest('button');
    expect(agentBtn?.className).toContain('bg-opacity-10');
  });

  it('shows no status badge dot for idle status (idle renders nothing)', () => {
    useAgentStore.setState({
      agents: [makeAgent({ id: 'a1', name: 'Alice', status: 'idle' })],
      apiKeyStatus: { anthropic: false, openai: false, openrouter: false },
      networkPolicy: 'open',
      orchestrator: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    });
    render(
      <AgentSidebar
        onSelectAgent={mockOnSelectAgent}
        onShowCreateAgent={mockOnShowCreateAgent}
      />
    );
    // idle → StatusBadge renders null (no dot)
    expect(screen.queryByText('●')).toBeNull();
  });

  it('shows status badge dot (●) for thinking status', () => {
    useAgentStore.setState({
      agents: [makeAgent({ id: 'a1', name: 'Alice', status: 'thinking' })],
      apiKeyStatus: { anthropic: false, openai: false, openrouter: false },
      networkPolicy: 'open',
      orchestrator: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    });
    render(
      <AgentSidebar
        onSelectAgent={mockOnSelectAgent}
        onShowCreateAgent={mockOnShowCreateAgent}
      />
    );
    expect(screen.getByText('●')).toBeTruthy();
  });
});
