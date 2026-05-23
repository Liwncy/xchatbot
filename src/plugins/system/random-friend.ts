import type {TextMessage} from '../types.js';
import {WechatApi} from '../../wechat/api.js';
import {buildWechatContactCardXml} from '../../wechat/index.js';
import {logger} from '../../utils/logger.js';
import type {ApiResponse, SearchContactResponse, SendMessageResponse} from '../../wechat/api-types.js';

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

const MOBILE_PREFIX_WEIGHTS = [
    {prefix: '130', weight: 1},
    {prefix: '131', weight: 1},
    {prefix: '132', weight: 1},
    {prefix: '133', weight: 1},
    {prefix: '135', weight: 1},
    {prefix: '136', weight: 1},
    {prefix: '137', weight: 1},
    {prefix: '138', weight: 1},
    {prefix: '139', weight: 1},
    {prefix: '147', weight: 2},
    {prefix: '150', weight: 2},
    {prefix: '151', weight: 2},
    {prefix: '152', weight: 2},
    {prefix: '155', weight: 2},
    {prefix: '156', weight: 2},
    {prefix: '157', weight: 2},
    {prefix: '158', weight: 2},
    {prefix: '159', weight: 2},
    {prefix: '166', weight: 4},
    {prefix: '167', weight: 4},
    {prefix: '170', weight: 2},
    {prefix: '171', weight: 4},
    {prefix: '172', weight: 4},
    {prefix: '173', weight: 4},
    {prefix: '175', weight: 4},
    {prefix: '176', weight: 4},
    {prefix: '177', weight: 4},
    {prefix: '178', weight: 4},
    {prefix: '180', weight: 4},
    {prefix: '181', weight: 4},
    {prefix: '182', weight: 4},
    {prefix: '183', weight: 4},
    {prefix: '184', weight: 4},
    {prefix: '185', weight: 4},
    {prefix: '186', weight: 4},
    {prefix: '187', weight: 4},
    {prefix: '188', weight: 4},
    {prefix: '189', weight: 4},
    {prefix: '190', weight: 5},
    {prefix: '191', weight: 5},
    {prefix: '193', weight: 5},
    {prefix: '195', weight: 5},
    {prefix: '196', weight: 5},
    {prefix: '197', weight: 5},
    {prefix: '198', weight: 5},
    {prefix: '199', weight: 5},
] as const;

const SEARCH_MAX_ATTEMPTS = 12;
const SEARCH_FROM_SCENE = 1;
const SEARCH_SCENE = 2;
const DEFAULT_CARD_SCENE = 17;
const MIN_CANDIDATE_QUALITY_SCORE = 4;

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

interface CandidateQualityResult {
    passed: boolean;
    score: number;
    reasons: string[];
}

interface RandomFriendSendOutcome {
    mode: 'card-xml' | 'card-api';
    delivered: number;
    messageIds: number[];
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
    const prefix = pickWeightedMobilePrefix();
    return `${prefix}${randomDigits(8)}`;
}

function pickWeightedMobilePrefix(): string {
    const totalWeight = MOBILE_PREFIX_WEIGHTS.reduce((sum, item) => sum + item.weight, 0);
    let hit = Math.floor(Math.random() * totalWeight);
    for (const item of MOBILE_PREFIX_WEIGHTS) {
        if (hit < item.weight) return item.prefix;
        hit -= item.weight;
    }
    return MOBILE_PREFIX_WEIGHTS[MOBILE_PREFIX_WEIGHTS.length - 1]?.prefix ?? '188';
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
        country: unwrapString(entry.country),
        bigAvatarUrl: unwrapString(entry.big_avatar_url),
        smallAvatarUrl: unwrapString(entry.small_avatar_url),
        antispamTicket: unwrapString(entry.antispam_ticket),
        scene: toNumber(entry.scene, DEFAULT_CARD_SCENE) || DEFAULT_CARD_SCENE,
    };
}

function isPhoneLikeText(value: string): boolean {
    return /^1\d{10}$/.test(value);
}

function isWxidLikeText(value: string): boolean {
    return /^wxid[_a-zA-Z0-9-]+$/i.test(value) || /^v3_/i.test(value);
}

function evaluateCandidateQuality(candidate: RandomFriendCandidate): CandidateQualityResult {
    let score = 0;
    let blocked = false;
    const reasons: string[] = [];

    if (candidate.username.endsWith('@chatroom')) {
        blocked = true;
        reasons.push('命中群聊账号');
    }

    const nickname = candidate.nickname.trim();
    if (!nickname) {
        reasons.push('昵称为空');
    } else if (isPhoneLikeText(nickname) || isWxidLikeText(nickname)) {
        reasons.push('昵称像占位标识');
    } else {
        score += 2;
    }

    if (candidate.bigAvatarUrl || candidate.smallAvatarUrl) {
        score += 1;
    } else {
        reasons.push('缺少头像');
    }

    if (candidate.antispamTicket) {
        score += 1;
    } else {
        reasons.push('缺少名片票据');
    }

    if (candidate.alias) {
        score += 1;
    }

    if (candidate.sign) {
        score += 1;
    }

    if (candidate.province || candidate.city || candidate.country) {
        score += 1;
    } else {
        reasons.push('地区资料过少');
    }

    if (candidate.verifyFlag > 0) {
        score += 1;
    }

    const passed = !blocked && score >= MIN_CANDIDATE_QUALITY_SCORE;
    return {passed, score, reasons};
}

function pickRandomFriendCandidate(response: ApiResponse<SearchContactResponse>): RandomFriendCandidate | null {
    const entries = extractSearchEntries(response.data);
    for (const entry of entries) {
        const candidate = normalizeSearchCandidate(entry);
        if (!candidate) continue;
        const quality = evaluateCandidateQuality(candidate);
        if (quality.passed) {
            return candidate;
        }
        logger.debug('随机朋友候选联系人被质量过滤跳过', {
            username: candidate.username,
            nickname: candidate.nickname,
            score: quality.score,
            reasons: quality.reasons,
        });
    }
    return null;
}

function ensureWechatApiSuccess(op: string, result: {code?: unknown; message?: unknown}): void {
    if (typeof result.code === 'number' && result.code !== 0) {
        throw new Error(`${op} failed: code=${result.code}, message=${String(result.message ?? '')}`);
    }
}

function ensureWechatSendMessageDelivered(op: string, result: ApiResponse<SendMessageResponse>): number[] {
    ensureWechatApiSuccess(op, result);
    const list = Array.isArray(result.data?.list) ? result.data.list : [];
    if (list.length === 0) {
        throw new Error(`${op} failed: empty send result list`);
    }

    const failedItems = list.filter((item) => typeof item?.code === 'number' && item.code !== 0);
    if (failedItems.length > 0) {
        const detail = failedItems
            .map((item) => `code=${item.code},id=${item.id},newId=${item.new_id}`)
            .join('; ');
        throw new Error(`${op} failed: delivery rejected: ${detail}`);
    }

    return list
        .flatMap((item) => [item.id, item.new_id])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function isSearchContactNotFound(result: {code?: unknown; message?: unknown}): boolean {
    if (result.code !== -1) return false;
    const message = String(result.message ?? '');
    return message.includes('用户不存在');
}

async function sendCardMessage(
    api: WechatApi,
    receiver: string,
    candidate: RandomFriendCandidate,
): Promise<RandomFriendSendOutcome> {
    const cardResult = await api.sendCard({
        receiver,
        card_username: candidate.username,
        card_nickname: candidate.nickname,
        card_alias: candidate.alias,
    });
    const messageIds = ensureWechatSendMessageDelivered('sendCard', cardResult);
    return {
        mode: 'card-api',
        delivered: messageIds.length,
        messageIds,
    };
}

async function sendCardXmlMessage(
    api: WechatApi,
    receiver: string,
    candidate: RandomFriendCandidate,
): Promise<RandomFriendSendOutcome> {
    const textResult = await api.sendText({
        receiver,
        content: buildWechatContactCardXml(candidate),
        type: 42,
    });
    const messageIds = ensureWechatSendMessageDelivered('sendText(type=42)', textResult);
    return {
        mode: 'card-xml',
        delivered: messageIds.length,
        messageIds,
    };
}

async function deliverRandomFriendCard(
    api: WechatApi,
    receiver: string,
    candidate: RandomFriendCandidate,
): Promise<RandomFriendSendOutcome> {
    try {
        return await sendCardXmlMessage(api, receiver, candidate);
    } catch (xmlError) {
        logger.warn('随机朋友原始名片 XML 发送失败，回退 sendCard 接口', {
            receiver,
            username: candidate.username,
            error: xmlError instanceof Error ? xmlError.message : String(xmlError),
        });
        return sendCardMessage(api, receiver, candidate);
    }
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
        if (isSearchContactNotFound(result)) {
            logger.debug('随机朋友搜索未命中，继续尝试下一个手机号', {
                attempt,
                phone,
                code: result.code,
                message: result.message,
            });
            continue;
        }
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

            const sendOutcome = await deliverRandomFriendCard(api, receiver, candidate);
            logger.info('随机朋友命中并已发送联系人名片', {
                receiver,
                phone,
                attempts,
                username: candidate.username,
                nickname: candidate.nickname,
                sendMode: sendOutcome.mode,
                messageIds: sendOutcome.messageIds,
            });

            return {
                type: 'text',
                content: `捞到一个朋友啦：${phone}（已发送名片，方式：${sendOutcome.mode}）`,
            };
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

