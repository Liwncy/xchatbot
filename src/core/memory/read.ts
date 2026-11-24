import type {Env} from '../../types/env.js';
import {resolveOwnerId} from '../bot.js';
import {logger} from '../../utils/logger.js';
import {
    digestRev,
    renderPersonCard,
    renderRoomCard,
    settleMemoryItems,
    type MemoryLayer,
} from './card.js';
import {
    PEOPLE_SCOPE,
    getMemoryCard,
    personKey,
    readMemoryHead,
    writeMemoryCard,
} from './store.js';

const DAY_SECONDS = 86400;

export interface MemoryView {
    roomRev: string;
    roomText: string;
    speakerRev: string;
    speakerText: string;
}

interface Head {
    rev: string;
    text: string;
}

/**
 * 读一张卡的版本和正文。整理只在这个聊天有新发言时才会跑，
 * 所以一张卡可能几天没人碰，里面的条目早该淡了、正文还是旧的。
 * 隔了一天以上就在这里按时间重算一遍，写回去，再给出去。
 */
async function readFresh(
    env: Env,
    sessionId: string,
    subject: string,
    layer: MemoryLayer,
    subjectForOwner: string,
    ownerId: string,
    now: number,
): Promise<Head> {
    const head = await readMemoryHead(env, sessionId, subject);
    if (!head) return {rev: '', text: ''};
    if (now - head.updatedAt < DAY_SECONDS) return {rev: head.rev, text: head.promptText};
    try {
        const card = await getMemoryCard(env, sessionId, subject);
        if (!card) return {rev: '', text: ''};
        const items = settleMemoryItems(card.items, layer, subjectForOwner, ownerId, now);
        const text = (layer === 'room' ? renderRoomCard : renderPersonCard)(items);
        const rev = await digestRev(text);
        // 没变也写一次，把「上次整理的时间」推到现在，不然这张卡每条入站都重算
        await writeMemoryCard(env, sessionId, {
            subject,
            rev,
            items: text ? items : [],
            promptText: text,
            updatedAt: now,
        });
        return {rev, text};
    } catch (error) {
        logger.warn('记忆卡按时间重算没成', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
        });
        return {rev: head.rev, text: head.promptText};
    }
}

/**
 * 房间卡按聊天，人的卡按人：同一个人在哪个群、在私聊，用的是同一张。
 * `platform` 用来认主人、也用来给人的卡分平台。
 */
export async function readMemoryPrompt(
    env: Env,
    sessionId: string,
    speakerId: string,
    platform: string,
): Promise<MemoryView> {
    const id = sessionId.trim();
    const speaker = speakerId.trim();
    const ownerId = resolveOwnerId(env, platform);
    const now = Math.floor(Date.now() / 1000);
    const room = id
        ? await readFresh(env, id, '', 'room', '', ownerId, now)
        : {rev: '', text: ''};
    const person = speaker
        ? await readFresh(env, PEOPLE_SCOPE, personKey(platform, speaker), 'person', speaker, ownerId, now)
        : {rev: '', text: ''};
    return {
        roomRev: room.rev,
        roomText: room.text,
        speakerRev: person.rev,
        speakerText: person.text,
    };
}
