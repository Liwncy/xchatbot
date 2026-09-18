import type {DirectoryPerson} from '../types.js';
import type {ApiResponse} from './types.js';

export function isDirectoryMiss(result: ApiResponse): boolean {
    if (result.code !== -1) return false;
    const message = result.message ?? '';
    return message.includes('用户不存在')
        || message.includes('被搜账号状态异常')
        || message.includes('无法显示');
}

export function mapDirectoryPeople(data: unknown): DirectoryPerson[] {
    const people: DirectoryPerson[] = [];
    for (const entry of extractEntries(data)) {
        const person = mapPerson(entry);
        if (person) people.push(person);
    }
    return people;
}

function extractEntries(data: unknown): Array<Record<string, unknown>> {
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

function mapPerson(entry: Record<string, unknown>): DirectoryPerson | null {
    const id = unwrapString(entry.username);
    const nickname = unwrapString(entry.nickname);
    if (!id || !nickname) return null;
    const region = [unwrapString(entry.country), unwrapString(entry.province), unwrapString(entry.city)]
        .filter(Boolean)
        .join(' / ');
    return {
        id,
        nickname,
        alias: unwrapString(entry.alias) || undefined,
        avatarUrl: unwrapString(entry.small_avatar_url) || unwrapString(entry.big_avatar_url) || undefined,
        region: region || undefined,
        sign: unwrapString(entry.signature) || unwrapString(entry.sign) || undefined,
        gender: toNumber(entry.gender) || undefined,
        verified: toNumber(entry.verify_flag) > 0,
        cardReady: Boolean(unwrapString(entry.antispam_ticket)),
    };
}

function unwrapString(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    return typeof record.value === 'string' ? record.value.trim() : '';
}

function toNumber(value: unknown): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}
