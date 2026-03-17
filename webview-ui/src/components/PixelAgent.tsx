import React, { useMemo } from 'react';
import type { AgentStatus } from '../store/agentStore';

interface PixelAgentProps {
  seed: string;
  status: AgentStatus;
  size?: number;
  showLabel?: boolean;
  name?: string;
  onClick?: () => void;
}

/** Deterministic color palette from seed string */
function seedToColors(seed: string): { body: string; accent: string; eye: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash % 360);
  const accentHue = (hue + 150) % 360;
  return {
    body: `hsl(${hue}, 65%, 55%)`,
    accent: `hsl(${accentHue}, 70%, 60%)`,
    eye: '#ffffff',
  };
}

/**
 * 8×8 pixel sprite data for a simple robot character.
 * Each row is 8 bits (1 = body, 2 = accent, 3 = eye/highlight, 0 = transparent).
 */
const SPRITE: number[][] = [
  [0, 0, 1, 1, 1, 1, 0, 0], // top of head
  [0, 1, 1, 1, 1, 1, 1, 0], // head
  [0, 1, 3, 1, 1, 3, 1, 0], // eyes
  [0, 1, 1, 1, 1, 1, 1, 0], // lower head
  [1, 2, 1, 1, 1, 1, 2, 1], // shoulders
  [1, 1, 1, 1, 1, 1, 1, 1], // body
  [0, 1, 2, 0, 0, 2, 1, 0], // legs
  [0, 1, 1, 0, 0, 1, 1, 0], // feet
];

const STATUS_DOT_COLOR: Record<AgentStatus, string> = {
  idle: '#6b7280',
  thinking: '#f59e0b',
  coding: '#22c55e',
  waiting: '#3b82f6',
  error: '#ef4444',
};

const STATUS_ANIMATION: Record<AgentStatus, string> = {
  idle: '',
  thinking: 'animate-pixel-pulse',
  coding: 'animate-pixel-type',
  waiting: 'animate-pixel-bob',
  error: '',
};

export function PixelAgent({ seed, status, size = 32, showLabel = false, name, onClick }: PixelAgentProps) {
  const colors = useMemo(() => seedToColors(seed), [seed]);
  const pixelSize = size / 8;

  return (
    <div
      className={`flex flex-col items-center gap-1 cursor-pointer select-none ${onClick ? 'hover:opacity-90' : ''}`}
      onClick={onClick}
      title={`${name ?? seed} — ${status}`}
    >
      {/* Pixel sprite */}
      <div className={`relative ${STATUS_ANIMATION[status]}`} style={{ imageRendering: 'pixelated' }}>
        <div
          style={{
            width: size,
            height: size,
            display: 'grid',
            gridTemplateColumns: `repeat(8, ${pixelSize}px)`,
            gridTemplateRows: `repeat(8, ${pixelSize}px)`,
          }}
        >
          {SPRITE.flat().map((cell, i) => {
            let bg = 'transparent';
            if (cell === 1) bg = colors.body;
            else if (cell === 2) bg = colors.accent;
            else if (cell === 3) bg = colors.eye;
            return (
              <div
                key={i}
                style={{
                  width: pixelSize,
                  height: pixelSize,
                  backgroundColor: bg,
                }}
              />
            );
          })}
        </div>

        {/* Status dot */}
        <div
          className="absolute -bottom-1 -right-1 rounded-full border border-black"
          style={{
            width: Math.max(6, pixelSize * 1.5),
            height: Math.max(6, pixelSize * 1.5),
            backgroundColor: STATUS_DOT_COLOR[status],
          }}
        />
      </div>

      {/* Optional name label */}
      {showLabel && name && (
        <span className="text-xs text-center truncate max-w-full" style={{ maxWidth: size * 2, color: 'var(--vscode-editor-foreground)' }}>
          {name}
        </span>
      )}
    </div>
  );
}
