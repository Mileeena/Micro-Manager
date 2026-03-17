import React, { useState } from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { OrchestratorChat } from './components/OrchestratorChat';
import { DirectMessage } from './components/DirectMessage';
import { AgentSidebar } from './components/AgentSidebar';
import { CreateAgentPanel } from './components/CreateAgentPanel';
import { Settings } from './components/Settings';
import { useVSCodeMessages } from './hooks/useVSCodeMessage';
import type { AgentState } from './store/agentStore';

type Tab = 'board' | 'chat' | 'dms' | 'settings';

export function App() {
  useVSCodeMessages();

  const [activeTab, setActiveTab] = useState<Tab>('board');
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  const [showCreateAgent, setShowCreateAgent] = useState(false);

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'board', label: 'Board', icon: '▦' },
    { id: 'chat', label: 'Manager', icon: '🧠' },
    { id: 'dms', label: 'Agents', icon: '🤖' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  function handleSelectAgent(agent: AgentState) {
    setSelectedAgent(agent);
    setActiveTab('dms');
  }

  return (
    <div
      className="flex flex-col h-screen text-sm"
      style={{
        backgroundColor: 'var(--vscode-editor-background)',
        color: 'var(--vscode-editor-foreground)',
        fontFamily: 'var(--vscode-font-family)',
      }}
    >
      {/* Create Agent Modal */}
      {showCreateAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowCreateAgent(false)}
        >
          <div
            className="w-[480px] rounded-lg overflow-hidden shadow-2xl border flex flex-col"
            style={{
              height: 'min(85vh, 640px)',
              backgroundColor: 'var(--vscode-editor-background)',
              borderColor: 'var(--vscode-focusBorder)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <CreateAgentPanel onClose={() => setShowCreateAgent(false)} />
          </div>
        </div>
      )}
      {/* Top nav */}
      <nav
        className="flex items-center border-b flex-shrink-0"
        style={{ borderColor: 'var(--vscode-panel-border)', backgroundColor: 'var(--vscode-titleBar-activeBackground, var(--vscode-editor-background))' }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-current font-semibold'
                : 'border-transparent opacity-60 hover:opacity-90'
            }`}
            style={{ borderBottomColor: activeTab === tab.id ? 'var(--vscode-focusBorder)' : 'transparent' }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'board' && <KanbanBoard />}
        {activeTab === 'chat' && <OrchestratorChat />}
        {activeTab === 'dms' && (
          <div className="flex h-full">
            {/* Agent list sidebar */}
            <div
              className="w-48 flex-shrink-0 border-r overflow-y-auto"
              style={{ borderColor: 'var(--vscode-panel-border)', backgroundColor: 'var(--vscode-sideBar-background)' }}
            >
              <AgentSidebar onSelectAgent={handleSelectAgent} selectedAgentId={selectedAgent?.id} onShowCreateAgent={() => setShowCreateAgent(true)} />
            </div>
            {/* DM panel */}
            <div className="flex-1 overflow-hidden">
              {selectedAgent ? (
                <DirectMessage agent={selectedAgent} />
              ) : (
                <div className="flex items-center justify-center h-full text-sm opacity-30">
                  Select an agent to open a direct message
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  );
}
