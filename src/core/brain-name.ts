export type AgentBrain = 'openclaw' | 'snailai' | 'qwenpaw' | 'hermes';

const DISPLAY: Record<AgentBrain, string> = {
    hermes: 'Hermes',
    openclaw: 'OpenClaw',
    snailai: 'SnailAI',
    qwenpaw: 'QwenPaw',
};

export function parseBrainName(raw: string | undefined): AgentBrain | null {
    const key = raw?.trim().toLowerCase() ?? '';
    if (key === 'openclaw') return 'openclaw';
    if (key === 'snailai' || key === 'snail-ai' || key === 'snail') return 'snailai';
    if (key === 'qwenpaw' || key === 'qwen-paw' || key === 'agentscope') return 'qwenpaw';
    if (key === 'hermes') return 'hermes';
    return null;
}

export function brainDisplayName(key: AgentBrain, stored?: string): string {
    const name = stored?.trim() ?? '';
    return name || DISPLAY[key];
}
