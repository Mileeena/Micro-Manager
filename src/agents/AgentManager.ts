import { AgencyWorkspace } from '../services/AgencyWorkspace';
import { AgentProfile, AgentProvider, AgentState, AgentStatus } from '../types';

export class AgentManager {
  private agentStates: Map<string, AgentState> = new Map();

  constructor(private readonly workspace: AgencyWorkspace) {}

  async loadAgents(): Promise<AgentState[]> {
    const profiles = await this.workspace.readAgentProfiles();
    for (const profile of profiles) {
      const existing = this.agentStates.get(profile.id);
      this.agentStates.set(profile.id, {
        ...profile,
        status: existing?.status ?? 'idle',
        currentTaskId: existing?.currentTaskId,
      });
    }
    return this.getAllAgents();
  }

  getAllAgents(): AgentState[] {
    return Array.from(this.agentStates.values());
  }

  getAgent(id: string): AgentState | undefined {
    return this.agentStates.get(id);
  }

  setStatus(agentId: string, status: AgentStatus, currentTaskId?: string): void {
    const agent = this.agentStates.get(agentId);
    if (agent) {
      agent.status = status;
      agent.currentTaskId = currentTaskId;
    }
  }

  updateAgentSettings(agentId: string, provider: AgentProvider, model: string): void {
    const agent = this.agentStates.get(agentId);
    if (agent) {
      agent.provider = provider;
      agent.model = model;
    }
  }

  updateAgentAllowedCommands(agentId: string, allowedCommands: string[]): void {
    const agent = this.agentStates.get(agentId);
    if (agent) {
      agent.allowedCommands = allowedCommands;
    }
  }

  async createAgentProfile(name: string, role: string, mission: string): Promise<AgentProfile> {
    const id = name.toLowerCase().replace(/\s+/g, '-');
    const content = `# ${name}\n\n**Role:** ${role}\n**Mission:** ${mission}\n**Metrics:** Task completion rate\n**Provider:** anthropic\n**Model:** claude-sonnet-4-6\n`;

    await this.workspace.writeAgentProfile(id, content);

    const profile: AgentProfile = {
      id,
      name,
      role,
      mission,
      metrics: 'Task completion rate',
      avatarSeed: id,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      allowedCommands: [],
    };

    this.agentStates.set(id, { ...profile, status: 'idle' });
    return profile;
  }
}
