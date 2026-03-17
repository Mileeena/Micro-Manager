# Contributors

## Human Author

**Milena** — Project creator, product vision, design decisions
GitHub: [@Mileeena](https://github.com/Mileeena)

---

## AI Co-Author

**Claude Sonnet 4.6** — AI pair programmer, architecture design, full implementation
Made by [Anthropic](https://www.anthropic.com)
Contact: noreply@anthropic.com

### Claude's Contributions

Claude Sonnet 4.6 acted as the primary implementation partner throughout the development of Micro Manager, contributing to:

- **Architecture design** — full extension structure, file tree, message protocol between VS Code extension host and React webview
- **Extension host** (`src/`) — TypeScript services: `AgencyWorkspace`, `SecretService`, `LLMRouter`, `TerminalService`, `FileSystemService`, agents: `OrchestratorAgent`, `AgentManager`, `AgentRunner`, panel: `ScrumMastermindPanel`
- **React UI** (`webview-ui/`) — Kanban board with drag-and-drop (`@dnd-kit`), pixel-art animated agents (`PixelAgent.tsx`), chat interfaces, settings panel, Zustand stores
- **AI features** — Scrum Master orchestrator with board-aware prompts, epic/task decomposition (Kata-style), agent supervision loop, BIBLE.md injection
- **Security features** — terminal command whitelist flow, per-agent command permissions, network policy enforcement
- **Bug fixes** — DM message deduplication, streaming finalization, agent execution loop fixes, TypeScript type errors

All code was written collaboratively: Milena directed the product vision and requirements; Claude Sonnet 4.6 designed and implemented the solution in real time.

---

*This project was built with [Claude Code](https://claude.ai/code) — Anthropic's AI-powered coding assistant.*
