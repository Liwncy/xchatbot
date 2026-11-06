import type {PluginContext} from '../../../core/context.js';
import type {IncomingMessage} from '../../../core/message.js';
import type {TextReply} from '../../../core/reply.js';
import {logger} from '../../../utils/logger.js';
import {callCfTool, rollPercent} from '../../channel/ambient/guard.js';
import type {AmbientListener} from '../../channel/ambient/types.js';
import {
    isChimeCooling,
    loadChimeConfig,
    nekoGamePlatform,
    readNekoGroup,
    startChimeCooldown,
} from './neko-store.js';

/**
 * 猫娘附身后会自己开口：
 * - 有人 @ 到猫娘本人 → 概率冒出来回一句（mention）
 * - 猫娘本人说话     → 概率用猫娘口气接一句（speak）
 * 状态低时她会改成撒娇求照顾，由 cf-mcp-tools 的 neko_chime 决定。
 *
 * 这里只做便宜的判断：开关和猫娘在 KV 里，概率、冷却也在 KV，掷中了才调一次工具。
 */

type Scenario = 'mention' | 'speak';

const prepared = new WeakMap<IncomingMessage, {ownerId: string; scenario: Scenario}>();

function scenarioOf(message: IncomingMessage, ownerId: string): Scenario | null {
    if (message.senderId.trim() === ownerId) return 'speak';
    if (message.mentions?.some((item) => item.id.trim() === ownerId)) return 'mention';
    return null;
}

function displayName(senderName?: string): string {
    const name = senderName?.trim() ?? '';
    return !name || /^wxid_/iu.test(name) ? '' : name;
}

export const nekoAmbientListener: AmbientListener = {
    name: 'neko',

    async match(message, ctx) {
        const group = await readNekoGroup(ctx.env, message.platform, message.chatId);
        // 缓存里还没有猫娘（刚开、还没人发过口令）就先不管。
        if (!group?.ownerId) return false;
        const scenario = scenarioOf(message, group.ownerId);
        if (!scenario) return false;
        prepared.set(message, {ownerId: group.ownerId, scenario});
        return true;
    },

    async handle(message, ctx: PluginContext) {
        const hit = prepared.get(message);
        if (!hit) return null;
        const {env} = ctx;
        const {platform, chatId} = message;

        const config = await loadChimeConfig(env, platform, chatId);
        const percent = hit.scenario === 'speak' ? config.speakPercent : config.mentionPercent;
        if (!rollPercent(percent)) return null;
        if (await isChimeCooling(env, platform, chatId)) return null;

        const result = await callCfTool(env, 'neko_chime', {
            platform: nekoGamePlatform(env),
            chatId,
            trigger: hit.scenario,
            userId: message.senderId,
            targetId: hit.ownerId,
            text: message.content?.trim() ?? '',
        });
        const line = result?.ok ? result.text?.trim() : '';
        if (!line) return null;

        // 先占冷却再回，避免同一时刻进来的几条消息一起接话。
        await startChimeCooldown(env, platform, chatId, config.cooldownMinutes);
        const raw = result?.raw as {kind?: string; source?: string} | undefined;
        logger.info('猫娘接话', {scenario: hit.scenario, kind: raw?.kind, source: raw?.source, chatId});

        const from = message.senderId.trim();
        const name = displayName(message.senderName);
        const reply: TextReply = hit.scenario === 'mention' && from
            ? {type: 'text', content: name ? `@${name} ${line}` : line, mentions: [from]}
            : {type: 'text', content: line};
        return reply;
    },
};
