/**
 * 当前这条消息交给哪颗大脑。门禁 / 口令 / 正文拼装不跟大脑走。
 *
 * 默认 openclaw，避免线上无配置时切到 SnailAI。
 */
import type {Env} from '../types/env.js';

export type AgentBrain = 'openclaw' | 'snailai';

export function resolveAgentBrain(env: Env): AgentBrain {
    const raw = env.AGENT_BRAIN?.trim().toLowerCase() ?? '';
    if (raw === 'snailai' || raw === 'snail-ai' || raw === 'snail') return 'snailai';
    return 'openclaw';
}
