import React, { useEffect, useRef } from 'react';
import type { ChatMessage } from '../store/chatStore';

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent?: string;
  agentName?: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isUser ? 'rounded-br-none' : 'rounded-bl-none'}`}
        style={{
          backgroundColor: isUser ? 'var(--vscode-button-background)' : 'var(--vscode-input-background)',
          color: isUser ? 'var(--vscode-button-foreground)' : 'var(--vscode-editor-foreground)',
        }}
      >
        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        <div className="text-xs opacity-40 mt-1 text-right">{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  );
}

export function MessageList({ messages, streamingContent, agentName }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {messages.length === 0 && !streamingContent && (
        <div className="flex items-center justify-center h-full text-sm opacity-30">
          No messages yet. Start the conversation.
        </div>
      )}

      {messages.map(msg => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}

      {/* Streaming response */}
      {streamingContent && (
        <div className="flex justify-start mb-3">
          <div
            className="max-w-[85%] rounded-lg rounded-bl-none px-3 py-2 text-sm"
            style={{ backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-editor-foreground)' }}
          >
            <div className="whitespace-pre-wrap break-words">{streamingContent}</div>
            <span className="inline-block w-1.5 h-4 bg-current opacity-70 ml-0.5 animate-pulse" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
