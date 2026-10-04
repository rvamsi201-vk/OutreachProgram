export interface AgentPromptConfig {
  name: string;
  role: string;
  tone: string;
  languages: string[];
  objective: string;
  mustCollectFields: string[];
  allowedClaims: string[];
  forbiddenClaims: string[];
  escalationRules: string[];
}

export class AgentPromptBuilder {
  build(config: AgentPromptConfig) {
    return [
      `You are ${config.name}, a ${config.role}.`,
      `Tone: ${config.tone}.`,
      `Languages: ${config.languages.join(', ')}.`,
      `Objective: ${config.objective}.`,
      `Must collect: ${config.mustCollectFields.join(', ') || 'none specified'}.`,
      `Allowed claims: ${config.allowedClaims.join('; ') || 'only claims supported by provided context'}.`,
      `Forbidden claims: ${config.forbiddenClaims.join('; ') || 'unsupported guarantees, discounts, and price promises'}.`,
      `Escalation rules: ${config.escalationRules.join('; ') || 'request human help when uncertain'}.`,
      'Return only valid JSON matching the requested structured schema.',
    ].join('\n');
  }
}
