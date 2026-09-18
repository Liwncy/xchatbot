import type {DirectoryPerson} from '../../../adapter/types.js';
import {logger} from '../../../utils/logger.js';

export const RANDOM_FRIEND_KEYWORDS = [
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
const MIN_CANDIDATE_QUALITY_SCORE = 4;

export interface RandomFriendHit {
    candidate: DirectoryPerson | null;
    phone: string;
    attempts: number;
}

export function isRandomFriendCommand(content: string): boolean {
    const normalized = content.trim();
    return RANDOM_FRIEND_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function generateRandomPhone(): string {
    return `${pickWeightedMobilePrefix()}${randomDigits(8)}`;
}

export function evaluateCandidateQuality(candidate: DirectoryPerson): {
    passed: boolean;
    score: number;
    reasons: string[];
} {
    let score = 0;
    let blocked = false;
    const reasons: string[] = [];

    if (candidate.id.endsWith('@chatroom')) {
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

    if (candidate.avatarUrl) {
        score += 1;
    } else {
        reasons.push('缺少头像');
    }

    if (candidate.cardReady) {
        score += 1;
    } else {
        reasons.push('缺少名片票据');
    }

    if (candidate.alias) score += 1;
    if (candidate.sign) score += 1;

    if (candidate.region) {
        score += 1;
    } else {
        reasons.push('地区资料过少');
    }

    if (candidate.verified) score += 1;

    return {passed: !blocked && score >= MIN_CANDIDATE_QUALITY_SCORE, score, reasons};
}

export function pickRandomFriendCandidate(people: DirectoryPerson[]): DirectoryPerson | null {
    for (const candidate of people) {
        const quality = evaluateCandidateQuality(candidate);
        if (quality.passed) return candidate;
        logger.debug('随机朋友候选被跳过', {
            id: candidate.id,
            nickname: candidate.nickname,
            score: quality.score,
            reasons: quality.reasons,
        });
    }
    return null;
}

export async function searchRandomFriend(
    search: (keyword: string) => Promise<DirectoryPerson[]>,
): Promise<RandomFriendHit> {
    let lastPhone = '';
    for (let attempt = 1; attempt <= SEARCH_MAX_ATTEMPTS; attempt += 1) {
        const phone = generateRandomPhone();
        lastPhone = phone;
        const people = await search(phone);
        if (people.length === 0) {
            logger.debug('随机朋友未命中', {attempt, phone});
            continue;
        }
        const candidate = pickRandomFriendCandidate(people);
        if (candidate) return {candidate, phone, attempts: attempt};
    }
    return {candidate: null, phone: lastPhone, attempts: SEARCH_MAX_ATTEMPTS};
}

function randomDigits(length: number): string {
    let result = '';
    for (let i = 0; i < length; i += 1) {
        result += Math.floor(Math.random() * 10);
    }
    return result;
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

function isPhoneLikeText(value: string): boolean {
    return /^1\d{10}$/u.test(value);
}

function isWxidLikeText(value: string): boolean {
    return /^wxid[_a-zA-Z0-9-]+$/iu.test(value) || /^v3_/iu.test(value);
}
