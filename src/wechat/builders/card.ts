import type {TextReply} from '../../types/message.js';
import type {ApiResponse, SendMessageResponse} from '../api-types.js';
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

export function buildWechatContactCardXml(options: BuildWechatContactCardOptions): string {
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
    return `<?xml version="1.0"?>\n<msg ${serialized} />`;
}

export function buildWechatContactCardXmlReply(
    options: BuildWechatContactCardOptions,
    extras?: Pick<TextReply, 'to' | 'mentions'>,
): TextReply {
    return {
        type: 'text',
        content: buildWechatContactCardXml(options),
        ...extras,
    };
}

export async function sendWechatContactCardXmlMessage(
    api: WechatApi,
    receiver: string,
    options: BuildWechatContactCardOptions,
): Promise<void> {
    const result = await api.sendText({
        receiver,
        content: buildWechatContactCardXml(options),
        type: 42,
    });
    ensureWechatApiSuccess('sendText(type=42)', result as ApiResponse<SendMessageResponse>);
}


