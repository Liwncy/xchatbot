import type {IncomingMessage} from '../message.js';
import type {DistributionRule} from './types.js';

export function distributionSearchText(message: IncomingMessage): string {
    const articles = message.app?.articles ?? [];
    return [
        message.content,
        message.app?.title,
        message.app?.desc,
        message.app?.url,
        ...articles.flatMap((item) => [item.title, item.desc, item.url]),
    ].filter((value): value is string => Boolean(value?.trim())).join('\n');
}

export function matchesDistributionRule(rule: DistributionRule, message: IncomingMessage): boolean {
    if (rule.status !== 'active') return false;
    if (rule.chatIds.length > 0 && !rule.chatIds.includes(message.chatId)) return false;
    if (rule.messageTypes.length > 0 && !rule.messageTypes.includes(message.type)) return false;

    const text = distributionSearchText(message);
    if (rule.keywords.length > 0) {
        const lower = text.toLocaleLowerCase();
        if (!rule.keywords.some((keyword) => lower.includes(keyword.toLocaleLowerCase()))) return false;
    }
    if (rule.pattern && !new RegExp(rule.pattern, 'iu').test(text)) return false;
    return true;
}
