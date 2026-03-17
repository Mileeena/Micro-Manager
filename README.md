# Scrum Mastermind

A VS Code extension that turns any repository into an AI workspace. Features a drag-and-drop Kanban board, an AI Scrum Master orchestrator, and a team of autonomous "pixel agents" with animated avatars that write code, read files, and execute terminal commands.

## Features

- **Kanban Board** — Drag tasks between Backlog / To Do / In Progress / Done
- **AI Scrum Master** — Describe work in plain English; the orchestrator breaks it into Kanban tickets automatically
- **Pixel Agents** — Animated 8×8 pixel-art avatars with live status indicators (thinking / coding / waiting / error)
- **Direct Messages** — Click any agent avatar to open a DM chat
- **Human-in-the-Loop Terminal** — Agents request terminal commands; non-whitelisted commands require your approval
- **Secure Secrets** — API keys stored in VS Code SecretStorage, never written to disk
- **BIBLE.md** — Project context file auto-injected into every agent's system prompt

## Quick Start

1. Install the extension
2. Open a workspace folder
3. Run command: `Scrum Mastermind: Open Board` (or press `Ctrl+Shift+S`)
4. Go to **Settings** and add your Anthropic API key
5. Open the **Scrum Master** tab and describe what you want to build

## Workspace Structure

The extension creates a `.agency/` folder in your project root:

```
.agency/
├── board.json          ← Kanban state
├── BIBLE.md            ← Edit this! Project context for all agents
├── whitelist.json      ← Auto-approved terminal commands
├── agents/
│   └── developer.md   ← Agent profiles (add more .md files here)
└── logs/
    └── YYYY-MM-DD.jsonl
```

## Agent Profiles

Create `.md` files in `.agency/agents/` to define new agents:

```markdown
# Backend Developer

**Role:** Backend Engineer
**Mission:** Build and maintain APIs and database schemas
**Metrics:** API response time, test coverage
**Provider:** anthropic
**Model:** claude-sonnet-4-6
```

Supported providers: `anthropic`, `openai`, `openrouter`

## Whitelist Flow

When an agent wants to run a terminal command:

- **In whitelist** → runs automatically
- **Not in whitelist** → VS Code notification: `[Allow Once]` / `[Allow Always]` / `[Deny]`
- **Strict mode** → package install commands (`npm install`, `pip install`, etc.) are always blocked

## Development

```bash
npm install
cd webview-ui && npm install && cd ..
npm run build   # production build
npm run watch   # development watch mode
```

Press `F5` in VS Code to launch the Extension Development Host.
