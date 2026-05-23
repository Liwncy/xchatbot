import type {TextMessage} from '../types.js';
import {WechatApi} from '../../wechat/api.js';
import {sendWechatContactCardXmlMessage} from '../../wechat/index.js';
import {logger} from '../../utils/logger.js';
import type {ApiResponse, SearchContactResponse} from '../../wechat/api-types.js';

const RANDOM_FRIEND_KEYWORDS = [
    '随机朋友',
    '随机好友',
    '随机名片',
    '交个朋友',
    '蕉个朋友',
    '捞个好友',
    '捞个朋友',
    '来个好友',
    '来个朋友',
] as const;

const MOBILE_PREFIXES = [
    '130', '131', '132', '133', '135', '136', '137', '138', '139',
    '147', '150', '151', '152', '155', '156', '157', '158', '159',
    '166', '167', '170', '171', '172', '173', '175', '176', '177', '178',
    '180', '181', '182', '183', '184', '185', '186', '187', '188', '189',
    '190', '191', '193', '195', '196', '197', '198', '199',
] as const;

const SEARCH_MAX_ATTEMPTS = 12;
const SEARCH_FROM_SCENE = 1;
const SEARCH_SCENE = 1;
const DEFAULT_CARD_SCENE = 17;

interface RandomFriendCandidate {
    username: string;
    nickname: string;
    alias: string;
    province: string;
    city: string;
    sign: string;
    gender: number;
    verifyFlag: number;
    country: string;
    bigAvatarUrl: string;
    smallAvatarUrl: string;
    antispamTicket: string;
    scene: number;
}

function isRandomFriendCommand(content: string): boolean {
    const normalized = content.trim();
    return RANDOM_FRIEND_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function unwrapString(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    return typeof record.value === 'string' ? record.value.trim() : '';
}

function toNumber(value: unknown, fallback = 0): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function randomDigits(length: number): string {
    let result = '';
    for (let i = 0; i < length; i += 1) {
        result += Math.floor(Math.random() * 10);
    }
    return result;
}

function generateRandomPhone(): string {
    const prefix = MOBILE_PREFIXES[Math.floor(Math.random() * MOBILE_PREFIXES.length)];
    return `${prefix}${randomDigits(8)}`;
}

function extractSearchEntries(data: unknown): Array<Record<string, unknown>> {
    if (!data || typeof data !== 'object') return [];
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.contact_list)) {
        return record.contact_list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
    }
    if (record.username || record.nickname || record.antispam_ticket) {
        return [record];
    }
    return [];
}

function normalizeSearchCandidate(entry: Record<string, unknown>): RandomFriendCandidate | null {
    const username = unwrapString(entry.username);
    const nickname = unwrapString(entry.nickname);
    if (!username || !nickname) return null;
    return {
        username,
        nickname,
        alias: unwrapString(entry.alias),
        province: unwrapString(entry.province),
        city: unwrapString(entry.city),
        sign: unwrapString(entry.signature) || unwrapString(entry.sign),
        gender: toNumber(entry.gender),
        verifyFlag: toNumber(entry.verify_flag),
        country: unwrapString(entry.country) || 'CN',
        bigAvatarUrl: unwrapString(entry.big_avatar_url),
        smallAvatarUrl: unwrapString(entry.small_avatar_url),
        antispamTicket: unwrapString(entry.antispam_ticket),
        scene: toNumber(entry.scene, DEFAULT_CARD_SCENE) || DEFAULT_CARD_SCENE,
    };
}

function pickRandomFriendCandidate(response: ApiResponse<SearchContactResponse>): RandomFriendCandidate | null {
    const entries = extractSearchEntries(response.data);
    for (const entry of entries) {
        const candidate = normalizeSearchCandidate(entry);
        if (candidate) return candidate;
    }
    return null;
}

function ensureWechatApiSuccess(op: string, result: {code?: unknown; message?: unknown}): void {
    if (typeof result.code === 'number' && result.code !== 0) {
        throw new Error(`${op} failed: code=${result.code}, message=${String(result.message ?? '')}`);
    }
}

async function sendCardMessage(
    api: WechatApi,
    receiver: string,
    candidate: RandomFriendCandidate,
): Promise<void> {
    const cardResult = await api.sendCard({
        receiver,
        card_username: candidate.username,
        card_nickname: candidate.nickname,
        card_alias: candidate.alias,
    });
    ensureWechatApiSuccess('sendCard', cardResult);
}

async function sendCardXmlMessage(
    api: WechatApi,
    receiver: string,
    candidate: RandomFriendCandidate,
): Promise<void> {
    await sendWechatContactCardXmlMessage(api, receiver, candidate);
}

async function searchRandomFriend(api: WechatApi): Promise<{candidate: RandomFriendCandidate | null; phone: string; attempts: number}> {
    let lastPhone = '';
    for (let attempt = 1; attempt <= SEARCH_MAX_ATTEMPTS; attempt += 1) {
        const phone = generateRandomPhone();
        lastPhone = phone;
        const result = await api.searchContacts({
            keyword: phone,
            from_scene: SEARCH_FROM_SCENE,
            search_scene: SEARCH_SCENE,
        });
        ensureWechatApiSuccess('searchContacts', result);
        const candidate = pickRandomFriendCandidate(result);
        if (candidate) {
            return {candidate, phone, attempts: attempt};
        }
    }
    return {candidate: null, phone: lastPhone, attempts: SEARCH_MAX_ATTEMPTS};
}

export const randomFriendPlugin: TextMessage = {
    type: 'text',
    name: 'random-friend',
    description: '发送“蕉个朋友”“捞个好友”等随机搜索手机号并回到当前会话一张联系人名片',
    match: (content) => isRandomFriendCommand(content),
    handle: async (message, env) => {
        const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
        if (!apiBaseUrl) {
            return {type: 'text', content: 'WECHAT_API_BASE_URL 未配置，无法执行随机朋友'};
        }

        const receiver = message.source === 'group'
            ? (message.room?.id?.trim() ?? '')
            : (message.from?.trim() ?? '');
        if (!receiver) {
            return {type: 'text', content: '无法识别当前消息来源会话，随机朋友发送失败'};
        }

        const api = new WechatApi(apiBaseUrl);
        try {
            const {candidate, phone, attempts} = await searchRandomFriend(api);
            if (!candidate) {
                return {
                    type: 'text',
                    content: `随机拨号 ${attempts} 次都没搜到可用联系人，最后一个号码是 ${phone}，稍后再试试手气吧。`,
                };
            }

            try {
                await sendCardMessage(api, receiver, candidate);
            } catch (cardError) {
                logger.warn('随机朋友 sendCard 发送失败，回退原始名片 XML', {
                    receiver,
                    username: candidate.username,
                    error: cardError instanceof Error ? cardError.message : String(cardError),
                });
                await sendCardXmlMessage(api, receiver, candidate);
            }

            return null;
        } catch (error) {
            logger.error('随机朋友插件处理失败', {
                receiver,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                type: 'text',
                content: error instanceof Error ? `随机朋友插件异常：${error.message}` : '随机朋友插件异常，请稍后重试。',
            };
        }
    },
};

