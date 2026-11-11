import type {Env} from '../../types/env.js';
import {emojiReply, type ReplyMessage} from '../reply.js';
import {emojiPickRandom} from './service.js';

/** 回复末尾的暗号：[#标签] 或 [/分类]。不认裸 [名字]，免得误伤 [图片] 之类。 */
const TRAILING_SIGNAL = /[ \t]*\[\s*([/#])([^\]\s]{1,16})\s*\][ \t]*$/u;

/** 同一会话两张表情图之间至少隔这么久，别刷屏。 */
const COOLDOWN_MS = 90_000;
const lastSentAt = new Map<string, number>();
const MAX_TRACKED = 500;

interface Signal {
    kind: 'tag' | 'category';
    value: string;
}

function stripTrailingSignals(content: string): {content: string; signal: Signal | null} {
    let text = content;
    let signal: Signal | null = null;
    for (;;) {
        const match = TRAILING_SIGNAL.exec(text.trimEnd());
        if (!match) break;
        // 连写多个时从后往前剥，最终留下最靠前的那个
        signal = {kind: match[1] === '/' ? 'category' : 'tag', value: match[2] ?? ''};
        text = text.trimEnd().slice(0, match.index);
    }
    return {content: text.trimEnd(), signal};
}

function remember(key: string, now: number): void {
    if (lastSentAt.size >= MAX_TRACKED) {
        for (const [k, at] of lastSentAt) {
            if (now - at > COOLDOWN_MS) lastSentAt.delete(k);
        }
        if (lastSentAt.size >= MAX_TRACKED) lastSentAt.clear();
    }
    lastSentAt.set(key, now);
}

/**
 * 把 agent 回复末尾的 [#标签] / [/分类] 换成一张表情图。
 * 暗号一定会被剥掉；冷却中、库里没有、没接库，就只发文字。
 */
export async function applyEmojiSignal(
    env: Env,
    replies: ReplyMessage[],
    options: {chatKey: string; now?: number},
): Promise<ReplyMessage[]> {
    let lastTextIndex = -1;
    for (let index = replies.length - 1; index >= 0; index -= 1) {
        if (replies[index]?.type === 'text') {
            lastTextIndex = index;
            break;
        }
    }
    if (lastTextIndex < 0) return replies;

    const target = replies[lastTextIndex];
    if (!target || target.type !== 'text') return replies;
    const stripped = stripTrailingSignals(target.content);
    if (!stripped.signal) return replies;

    const next = replies.slice();
    if (stripped.content) {
        next[lastTextIndex] = {...target, content: stripped.content};
    } else {
        next.splice(lastTextIndex, 1);
    }

    const now = options.now ?? Date.now();
    const last = lastSentAt.get(options.chatKey) ?? 0;
    if (now - last < COOLDOWN_MS) return next;
    if (!env.XBOT_DB) return next;

    try {
        const picked = await emojiPickRandom(
            env,
            stripped.signal.kind === 'category'
                ? {category: stripped.signal.value}
                : {tag: stripped.signal.value},
        );
        if (!picked.ok || !picked.item.md5) return next;
        remember(options.chatKey, now);
        next.push(emojiReply(picked.item.md5, picked.item.imgUrl || undefined));
    } catch {
        // 配图是锦上添花，库出问题不影响正文
    }
    return next;
}
