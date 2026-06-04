import type {TextReply} from '../../types/reply.js';
import type {ApiResponse, SendAppMessageResponse, SendMessageResponse} from '../api-types.js';
import type {WechatApi} from '../api.js';

const DEFAULT_CARD_SCENE = 17;
const DEFAULT_IMAGE_STATUS = 3;

export interface BuildWechatContactCardOptions {
    username: string;
    nickname: string;
    alias?: string;
    province?: string;
    city?: string;
    sign?: string;
    gender?: number;
    verifyFlag?: number;
    country?: string;
    bigAvatarUrl?: string;
    smallAvatarUrl?: string;
    antispamTicket?: string;
    scene?: number;
}

function xmlEscapeAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&apos;');
}

function ensureWechatApiSuccess(op: string, result: {code?: unknown; message?: unknown}): void {
    if (typeof result.code === 'number' && result.code !== 0) {
        throw new Error(`${op} failed: code=${result.code}, message=${String(result.message ?? '')}`);
    }
}

function ensureWechatSendMessageDelivered(op: string, result: ApiResponse<SendMessageResponse>): void {
    ensureWechatApiSuccess(op, result);
    const list = Array.isArray(result.data?.list) ? result.data.list : [];
    if (list.length === 0) {
        throw new Error(`${op} failed: empty send result list`);
    }
    const failedItems = list.filter((item) => typeof item?.code === 'number' && item.code !== 0);
    if (failedItems.length === 0) return;
    const detail = failedItems
        .map((item) => `code=${item.code},id=${item.id},newId=${item.new_id}`)
        .join('; ');
    throw new Error(`${op} failed: delivery rejected: ${detail}`);
}

function serializeWechatContactCardMsg(options: BuildWechatContactCardOptions): string {
    const attrs: Record<string, string | number> = {
        bigheadimgurl: options.bigAvatarUrl?.trim() ?? '',
        smallheadimgurl: options.smallAvatarUrl?.trim() ?? '',
        username: options.username.trim(),
        nickname: options.nickname.trim(),
        fullpy: '',
        shortpy: '',
        alias: options.alias?.trim() ?? '',
        imagestatus: DEFAULT_IMAGE_STATUS,
        scene: Number.isFinite(options.scene) ? Number(options.scene) : DEFAULT_CARD_SCENE,
        province: options.province?.trim() ?? '',
        city: options.city?.trim() ?? '',
        sign: options.sign?.trim() ?? '',
        sex: Number.isFinite(options.gender) ? Number(options.gender) : 0,
        certflag: Number.isFinite(options.verifyFlag) ? Number(options.verifyFlag) : 0,
        certinfo: '',
        brandIconUrl: '',
        brandHomeUrl: '',
        brandSubscriptConfigUrl: '',
        brandFlags: 0,
        regionCode: options.country?.trim() || 'CN',
        brandType: 0,
        biznamecardinfo: '',
        antispamticket: options.antispamTicket?.trim() ?? '',
    };

    const serialized = Object.entries(attrs)
        .map(([key, value]) => `${key}="${xmlEscapeAttribute(String(value ?? ''))}"`)
        .join(' ');
    return `<msg ${serialized} />`;
}

export function buildWechatContactCardXml(options: BuildWechatContactCardOptions): string {
    return `<?xml version="1.0"?>\n${serializeWechatContactCardMsg(options)}`;
}

export function buildWechatContactCardForwardXml(options: BuildWechatContactCardOptions): string {
    return serializeWechatContactCardMsg(options);
}

export function buildWechatContactCardMessageContent(
    options: BuildWechatContactCardOptions,
    sharerUsername?: string,
): string {
    const xml = buildWechatContactCardXml(options);
    const sharer = sharerUsername?.trim();
    if (!sharer) return xml;
    return `${sharer}:\n${xml}`;
}

export function buildWechatContactCardXmlReply(
    options: BuildWechatContactCardOptions,
    extras?: Pick<TextReply, 'to' | 'mentions'>,
): TextReply {
    return {
        type: 'text',
        content: buildWechatContactCardMessageContent(options),
        ...extras,
    };
}

export async function sendWechatContactCardXmlMessage(
    api: WechatApi,
    receiver: string,
    options: BuildWechatContactCardOptions,
    sharerUsername?: string,
): Promise<void> {
    const result = await api.sendText({
        receiver,
        content: buildWechatContactCardMessageContent(options, sharerUsername),
        type: 42,
    });
    ensureWechatSendMessageDelivered('sendText(type=42)', result as ApiResponse<SendMessageResponse>);
}

export async function sendWechatContactCardForwardMessage(
    api: WechatApi,
    receiver: string,
    options: BuildWechatContactCardOptions,
): Promise<void> {
    const result = await api.forwardMessage({
        receiver,
        type: 42,
        xml: buildWechatContactCardForwardXml(options),
    });
    ensureWechatApiSuccess('forwardMessage(type=42)', result as ApiResponse<SendAppMessageResponse>);
}

export async function sendWechatContactCardAppMessage(
    api: WechatApi,
    receiver: string,
    options: BuildWechatContactCardOptions,
): Promise<void> {
    const result = await api.sendApp({
        receiver,
        type: 42,
        xml: buildWechatContactCardForwardXml(options),
    });
    ensureWechatApiSuccess('sendApp(type=42)', result as ApiResponse<SendAppMessageResponse>);
}


