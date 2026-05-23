import type {TextMessage} from '../types.js';
import {logger} from '../../utils/logger.js';
import {FileUploader} from '../../utils/file-uploader.js';
import {WechatApi} from '../../wechat/api.js';
import {buildWechatChatRecordAppReply, WechatChatRecordImageTool} from '../../wechat/index.js';

const DIRECT_FORWARD_KEYWORDS = ['我与赌毒不共戴天', '佛祖心中坐'] as const;
const REVIEW_MODE_KEYWORDS = ['因果循环', '人之初，性本色', '人之初,性本色', '人之初性本色'] as const;
const TRIGGER_KEYWORDS = [...DIRECT_FORWARD_KEYWORDS, ...REVIEW_MODE_KEYWORDS] as const;
const PORN_SKETCH_THRESHOLD = 0.1;

// 在这里直接维护接口配置，不依赖环境变量。
const YINGUO_IMAGE_API_URL = 'https://lwcfworker.dpdns.org/proxy?url=https://veil.ortlinde.com/v1/random';
const YINGUO_VERIFY_API_URL = 'https://api.pearapi.ai/api/pornimage/';
const YINGUO_SKETCH_API_URL = 'https://api.xingzhige.com/API/xian?url=';
const YINGUO_API_KEY = '';
const YINGUO_UPLOAD_VIP_CODE = '';
const DEFAULT_DIRECT_FORWARD_ROLE_A_NAME = 'Ooops';
const DEFAULT_DIRECT_FORWARD_ROLE_A_AVATAR = 'https://wx.qlogo.cn/mmhead/ver_1/npSwbRYUlDdNMFwQ4lUicwSc7xGicUJN0XDdsrH1jD4UUEO9ibUURm0VNPyge3TvsrkhgtVbRR5IcmEznhEVKKEnFvWeCMDNplUSKnCpERz6RVMZQ6QWyKaRquMYPSLSIWMaa4HZFibAEcNUCgduRNdGbQ/132';
const DEFAULT_DIRECT_FORWARD_ROLE_B_NAME = '@小陌...';
const DEFAULT_DIRECT_FORWARD_ROLE_B_AVATAR = 'https://wx.qlogo.cn/mmhead/ver_1/5C1a3PeeRSg3qurLe0ug4Qa8Cahniaqeg5P5pT0uqqpibwq3UoicdtRTPruapqSFOErd1uGAh1sMFgiaMvzVXozAZw/132';

function getAuthHeaders(): HeadersInit {
    const token = YINGUO_API_KEY.trim();
    return token ? {Authorization: `Bearer ${token}`} : {};
}

function assertRequiredConfig(): void {
    if (!YINGUO_IMAGE_API_URL.trim()) throw new Error('请在 yinguo-image.ts 中设置 YINGUO_IMAGE_API_URL');
    if (!YINGUO_VERIFY_API_URL.trim()) throw new Error('请在 yinguo-image.ts 中设置 YINGUO_VERIFY_API_URL');
}

function resolveYinguoMode(content: string): 'direct-forward' | 'review-mode' | null {
    const trimmed = content.trim();
    if (!trimmed) return null;
    if (DIRECT_FORWARD_KEYWORDS.some((keyword) => trimmed.includes(keyword))) {
        return 'direct-forward';
    }
    if (REVIEW_MODE_KEYWORDS.some((keyword) => trimmed.includes(keyword))) {
        return 'review-mode';
    }
    return null;
}

function normalizeBase64(value: string): string {
    const trimmed = value.trim();
    const dataUrlMatch = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
    return dataUrlMatch?.[1]?.trim() || trimmed;
}

function base64ToBlob(base64: string, contentType = 'image/jpeg'): Blob {
    const binary = atob(normalizeBase64(base64));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], {type: contentType});
}

function isLikelyHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

function looksLikeBase64Text(value: string): boolean {
    const normalized = normalizeBase64(value).replace(/\s+/g, '');
    return normalized.length > 100 && /^[A-Za-z0-9+/=]+$/.test(normalized);
}

function looksLikeImageBytes(bytes: Uint8Array): boolean {
    if (bytes.length < 12) return false;

    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    ) return true;
    // GIF: GIF87a / GIF89a
    if (
        bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
        && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
    ) return true;
    // WEBP: RIFF....WEBP
    if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) return true;

    return false;
}

function decodeUtf8(bytes: Uint8Array): string {
    return new TextDecoder('utf-8').decode(bytes).trim();
}

async function fetchImageAsBase64FromUrl(url: string): Promise<string> {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'image/*,*/*',
            ...getAuthHeaders(),
        },
    });
    if (!response.ok) {
        throw new Error(`图片链接下载失败 status=${response.status}`);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('image/')) {
        throw new Error(`图片链接返回非图片内容 content-type=${contentType || 'unknown'}`);
    }

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) {
        throw new Error('图片链接返回空内容');
    }
    return arrayBufferToBase64(buffer);
}

function buildImageSourceHeaders(): HeadersInit {
    return {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'cache-control': 'max-age=0',
        priority: 'u=0, i',
        'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        ...getAuthHeaders() as Record<string, string>,
    };
}

async function fetchSourceResponse(url: string): Promise<Response> {
    const response = await fetch(url, {
        method: 'GET',
        headers: buildImageSourceHeaders(),
    });
    if (!response.ok) {
        throw new Error(`status=${response.status}`);
    }
    return response;
}

function pickStringField(obj: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function pickNumberField(obj: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
        const value = obj[key];
        const num = Number(value);
        if (Number.isFinite(num)) {
            return num;
        }
    }
    return null;
}

function pickObjectField(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
    for (const key of keys) {
        const value = obj[key];
        if (value && typeof value === 'object') {
            return value as Record<string, unknown>;
        }
    }
    return null;
}

function resolveBase64FromPayload(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const root = payload as Record<string, unknown>;
    const direct = pickStringField(root, ['base64', 'imageBase64', 'imgBase64', 'image', 'img']);
    if (direct) return direct;

    const data = pickObjectField(root, ['data', 'result']);
    if (!data) return '';
    return pickStringField(data, ['base64', 'imageBase64', 'imgBase64', 'image', 'img']);
}

function resolveUrlFromPayload(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const root = payload as Record<string, unknown>;
    const direct = pickStringField(root, ['url', 'link', 'imageUrl', 'imgUrl', 'data']);
    if (/^https?:\/\//i.test(direct)) return direct;

    const data = pickObjectField(root, ['data', 'result']);
    if (!data) return '';

    const nested = pickStringField(data, ['url', 'link', 'imageUrl', 'imgUrl']);
    return /^https?:\/\//i.test(nested) ? nested : '';
}

function resolveScoreFromPayload(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;

    const rootScore = pickNumberField(root, ['score', 'risk', 'riskScore', 'nsfw', 'toxicity']);
    if (rootScore !== null) return rootScore;

    const data = pickObjectField(root, ['data', 'result']);
    if (!data) return null;
    return pickNumberField(data, ['score', 'risk', 'riskScore', 'nsfw', 'toxicity']);
}

function resolvePornFromPayload(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;

    const rootPorn = pickNumberField(root, ['porn']);
    if (rootPorn !== null) return rootPorn;

    const data = pickObjectField(root, ['data', 'result']);
    if (!data) return null;
    return pickNumberField(data, ['porn']);
}

function resolveClassificationFromPayload(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const root = payload as Record<string, unknown>;

    const rootClassification = root.classification;
    if (typeof rootClassification === 'string' && rootClassification.trim()) {
        return rootClassification.trim();
    }

    const data = pickObjectField(root, ['data', 'result']);
    if (!data) return '';
    const nestedClassification = data.classification;
    if (typeof nestedClassification === 'string' && nestedClassification.trim()) {
        return nestedClassification.trim();
    }
    return '';
}

async function fetchImageBase64(): Promise<string> {
    const url = YINGUO_IMAGE_API_URL.trim();
    if (!url) {
        throw new Error('未配置可用原图接口地址');
    }

    const response = await fetchSourceResponse(url);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

    if (contentType.includes('image/')) {
        const imageBuffer = await response.arrayBuffer();
        if (!imageBuffer.byteLength) {
            throw new Error('原图接口返回空图片内容');
        }
        return arrayBufferToBase64(imageBuffer);
    }

    if (contentType.includes('application/json')) {
        const payload = await response.json();
        const base64 = resolveBase64FromPayload(payload);
        if (base64) return normalizeBase64(base64);

        const imageUrl = resolveUrlFromPayload(payload);
        if (imageUrl) {
            return fetchImageAsBase64FromUrl(imageUrl);
        }
        throw new Error('原图 JSON 未返回 base64 或可用图片链接');
    }

    // 某些源站不会返回 content-type，这里按原始字节做兜底识别。
    const rawBuffer = await response.arrayBuffer();
    if (!rawBuffer.byteLength) {
        throw new Error('原图接口返回空内容');
    }
    const rawBytes = new Uint8Array(rawBuffer);
    if (looksLikeImageBytes(rawBytes)) {
        return arrayBufferToBase64(rawBuffer);
    }

    const rawText = decodeUtf8(rawBytes);
    if (isLikelyHttpUrl(rawText)) {
        return fetchImageAsBase64FromUrl(rawText);
    }
    if (looksLikeBase64Text(rawText)) {
        return normalizeBase64(rawText);
    }

    if (rawText.startsWith('{') || rawText.startsWith('[')) {
        try {
            const payload = JSON.parse(rawText) as unknown;
            const base64 = resolveBase64FromPayload(payload);
            if (base64) return normalizeBase64(base64);
            const imageUrl = resolveUrlFromPayload(payload);
            if (imageUrl) return fetchImageAsBase64FromUrl(imageUrl);
        } catch {
            // Ignore invalid JSON and continue to unified error.
        }
    }

    throw new Error(`原图接口返回了无法识别的内容类型 content-type=${contentType || 'unknown'}`);
}

async function verifyImage(base64: string): Promise<{score: number | null; porn: number | null; classification: string}> {
    // todo：鉴黄接口异常，跳过
    if(!false){
        return {score:1,porn:0.25,classification:'色情'};
    }
    const api = YINGUO_VERIFY_API_URL.trim();
    const form = new FormData();
    form.append('file', base64ToBlob(base64), `yinguo-${Date.now()}.jpg`);

    const response = await fetch(api, {
        method: 'POST',
        headers: {
            Accept: 'application/json, text/plain, */*',
            ...getAuthHeaders(),
        },
        body: form,
    });
    if (!response.ok) {
        throw new Error(`图片验证失败 status=${response.status}`);
    }

    const payload = await response.json();
    return {
        score: resolveScoreFromPayload(payload),
        porn: resolvePornFromPayload(payload),
        classification: resolveClassificationFromPayload(payload),
    };
}

async function createTempUrl(base64: string): Promise<string> {
    const tempUrl = await FileUploader.uploadBase64(base64, {
        fileName: `yinguo-${Date.now()}.jpg`,
        contentType: 'image/jpeg',
        vipCode: YINGUO_UPLOAD_VIP_CODE,
    });
    if (!tempUrl) {
        throw new Error('临时链接生成失败');
    }
    return tempUrl;
}

async function toSketchImageByUrl(imageUrl: string): Promise<string | null> {
    const api = YINGUO_SKETCH_API_URL.trim();
    if (!api) return null;

    const requestUrl = `${api}${encodeURIComponent(imageUrl)}`;

    const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
            Accept: 'application/json, text/plain, */*',
            ...getAuthHeaders(),
        },
    });
    if (!response.ok) {
        throw new Error(`手绘转换失败 status=${response.status}`);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('image/')) {
        const imageBuffer = await response.arrayBuffer();
        if (!imageBuffer.byteLength) return null;
        return arrayBufferToBase64(imageBuffer);
    }

    if (contentType.includes('application/json')) {
        const payload = await response.json();
        const base64Result = resolveBase64FromPayload(payload);
        if (base64Result) return normalizeBase64(base64Result);

        const urlResult = resolveUrlFromPayload(payload);
        return urlResult || null;
    }

    const rawText = (await response.text()).trim();
    if (isLikelyHttpUrl(rawText)) return rawText;
    if (looksLikeBase64Text(rawText)) return normalizeBase64(rawText);
    return null;
}

function isPornClassification(value: string): boolean {
    return value.replace(/\s+/g, '') === '色情';
}

function shouldConvertToSketch(classification: string, porn: number | null): boolean {
    if (isPornClassification(classification)) return true;
    if (porn === null) return false;
    return porn > PORN_SKETCH_THRESHOLD;
}

async function maybeConvertToSketch(base64: string, classification: string, porn: number | null): Promise<string | null> {
    if (!shouldConvertToSketch(classification, porn)) return null;

    const tempUrl = await createTempUrl(base64);
    const sketchImage = await toSketchImageByUrl(tempUrl);
    if (!sketchImage) {
        logger.warn('因果诱惑图片命中手绘规则，但手绘接口未返回有效结果', {
            classification,
            porn,
            pornThreshold: PORN_SKETCH_THRESHOLD,
        });
    }
    return sketchImage;
}

async function buildDirectForwardReply(
    message: Parameters<TextMessage['handle']>[0],
    env: Parameters<TextMessage['handle']>[1],
    sourceBase64: string,
) {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    if (!apiBaseUrl) {
        throw new Error('WECHAT_API_BASE_URL 未配置，无法上传转发图片');
    }

    const receiver = message.room?.id || message.from;
    if (!receiver) {
        throw new Error('无法确定图片上传接收者');
    }

    const api = new WechatApi(apiBaseUrl);
    const {roleA, roleB, senderAvatarUrl, senderName} = await resolveDirectForwardRoles(api, message.room?.id, message.from);
    const uploaded = await WechatChatRecordImageTool.uploadImage(api, {
        imageBase64: sourceBase64,
    });

    const senderNickname = senderName || message.senderName?.trim() || '发送人昵称';
    const now = Date.now();

    return buildWechatChatRecordAppReply({
        title: '群聊的聊天记录',
        isChatRoom: true,
        items: [
            {
                kind: 'text',
                nickname: roleA.name,
                content: '兄弟们，我找到一张特别牛逼的图片[奸笑]',
                avatarUrl: roleA.avatarUrl,
                timestampMs: now,
            },
            {
                kind: 'text',
                nickname: roleB.name,
                content: '什么图片这么牛逼啊',
                avatarUrl: roleB.avatarUrl,
                timestampMs: now + 1000,
            },
            {
                kind: 'image',
                nickname: roleA.name,
                uploadedImage: uploaded,
                avatarUrl: roleA.avatarUrl,
                timestampMs: now + 2000,
            },
            {
                kind: 'text',
                nickname: roleA.name,
                content: '哈哈哈，牛逼吧[旺柴]',
                avatarUrl: roleA.avatarUrl,
                timestampMs: now + 3000,
            },
            {
                kind: 'text',
                nickname: roleB.name,
                content: '🐂[啤酒]',
                avatarUrl: roleB.avatarUrl,
                timestampMs: now + 4000,
            },
            {
                kind: 'text',
                nickname: senderNickname,
                content: '🐂[啤酒]',
                avatarUrl: senderAvatarUrl,
                timestampMs: now + 5000,
            },
        ],
    }, {
        to: receiver,
    });
}

async function buildReviewModeReply(sourceBase64: string) {
    const verifyResult = await verifyImage(sourceBase64);
    const sketchImage = await maybeConvertToSketch(sourceBase64, verifyResult.classification, verifyResult.porn);
    if (sketchImage) {
        logger.info('因果诱惑图片命中手绘规则，已转手绘图', {
            classification: verifyResult.classification,
            porn: verifyResult.porn,
            pornThreshold: PORN_SKETCH_THRESHOLD,
            score: verifyResult.score,
        });
        return {
            type: 'image' as const,
            mediaId: sketchImage,
            originalUrl: /^https?:\/\//i.test(sketchImage) ? sketchImage : undefined,
        };
    }

    return {
        type: 'image' as const,
        mediaId: sourceBase64,
    };
}

export const yinguoImagePlugin: TextMessage = {
    type: 'text',
    name: 'yinguo-image',
    description: '因果诱惑图片插件：部分关键词直传 CDN 转聊天记录图片，其他关键词走鉴黄+手绘模式',
    match: (content) => {
        const trimmed = content.trim();
        return TRIGGER_KEYWORDS.some((keyword) => trimmed.includes(keyword));
    },
    handle: async (message, env) => {
        try {
            assertRequiredConfig();
            const mode = resolveYinguoMode(message.content ?? '');
            const sourceBase64 = await fetchImageBase64();
            if (mode === 'direct-forward') {
                return await buildDirectForwardReply(message, env, sourceBase64);
            }
            return await buildReviewModeReply(sourceBase64);
        } catch (error) {
            logger.error('因果诱惑图片插件处理失败', {
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                type: 'text',
                content: '因果图片服务暂时不可用，请稍后再试。',
            };
        }
    },
};

interface DirectForwardRole {
    id: string;
    name: string;
    avatarUrl?: string;
}

function asNonEmptyText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function pickFirstText(source: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
        const value = asNonEmptyText(source[key]);
        if (value) return value;
    }
    return '';
}

function extractGroupMemberRoles(payload: unknown): DirectForwardRole[] {
    if (!payload || typeof payload !== 'object') return [];
    const root = payload as Record<string, unknown>;
    const contactList = Array.isArray(root.contact_list) ? root.contact_list : [];
    const detailList = contactList.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const members = (item as Record<string, unknown>).members;
        if (!members || typeof members !== 'object') return [];
        const list = (members as Record<string, unknown>).list;
        return Array.isArray(list) ? list : [];
    });
    const result = (root.result && typeof root.result === 'object') ? root.result as Record<string, unknown> : null;
    const list = detailList.length > 0
        ? detailList
        : Array.isArray(result?.list)
            ? result.list
            : Array.isArray(root.list)
                ? root.list
                : [];

    const roles: DirectForwardRole[] = [];
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const id = pickFirstText(obj, ['username', 'user_name', 'wxid', 'id', 'userName']);
        if (!id) continue;
        const name = pickFirstText(obj, ['display_name', 'nickname']) || id;
        const avatarUrl = pickFirstText(obj, ['big_avatar_url', 'small_avatar_url']);
        roles.push({id, name, avatarUrl: avatarUrl || undefined});
    }

    const dedup = new Map<string, DirectForwardRole>();
    for (const role of roles) dedup.set(role.id, role);
    return Array.from(dedup.values());
}

function pickRandomPair(items: DirectForwardRole[]): [DirectForwardRole, DirectForwardRole] | null {
    if (items.length < 2) return null;
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return [copy[0], copy[1]];
}

async function resolveDirectForwardRoles(
    api: WechatApi,
    roomId: string | undefined,
    senderId: string,
): Promise<{roleA: DirectForwardRole; roleB: DirectForwardRole; senderAvatarUrl?: string; senderName?: string}> {
    const fallback = {
        roleA: {
            id: 'fallback_a',
            name: DEFAULT_DIRECT_FORWARD_ROLE_A_NAME,
            avatarUrl: DEFAULT_DIRECT_FORWARD_ROLE_A_AVATAR,
        },
        roleB: {
            id: 'fallback_b',
            name: DEFAULT_DIRECT_FORWARD_ROLE_B_NAME,
            avatarUrl: DEFAULT_DIRECT_FORWARD_ROLE_B_AVATAR,
        },
        senderAvatarUrl: undefined as string | undefined,
        senderName: undefined as string | undefined,
    };

    if (!roomId) return fallback;

    try {
        const detailResp = await api.getContactDetail([roomId]);
        if (typeof detailResp.code === 'number' && detailResp.code !== 0) {
            logger.warn('因果诱惑随机角色获取失败：getContactDetail 返回异常', {
                roomId,
                code: detailResp.code,
                message: detailResp.message,
            });
            return fallback;
        }

        let allMembers = extractGroupMemberRoles(detailResp.data);
        if (allMembers.length === 0) {
            const membersResp = await api.getChatroomMembers(roomId);
            if (typeof membersResp.code === 'number' && membersResp.code !== 0) {
                logger.warn('因果诱惑随机角色获取失败：getChatroomMembers 返回异常', {
                    roomId,
                    code: membersResp.code,
                    message: membersResp.message,
                });
                return fallback;
            }
            allMembers = extractGroupMemberRoles(membersResp.data);
        }
        const senderMember = allMembers.find((member) => member.id === senderId);
        const senderAvatarUrl = senderMember?.avatarUrl;
        const senderName = senderMember?.name;
        const members = allMembers
             .filter((member) => member.id !== senderId);
        const pair = pickRandomPair(members);
        if (!pair) {
            return {
                ...fallback,
                senderAvatarUrl,
                senderName,
            };
        }
        return {
            roleA: pair[0],
            roleB: pair[1],
            senderAvatarUrl,
            senderName,
        };
    } catch (error) {
        logger.warn('因果诱惑随机角色获取异常，使用默认角色', {
            roomId,
            error: error instanceof Error ? error.message : String(error),
        });
        return fallback;
    }
}
