import type {AppReply, Env, IncomingMessage} from '../../types/message.js';
import {buildWechatChatRecordAppReply, sendWechatReply} from '../../wechat/index.js';
import {WechatApi} from '../../wechat/api.js';
import {createSchedulerRepository} from '../../scheduler/index.js';
import type {SchedulerCreateJobInput} from '../../scheduler/types.js';
import {
    buildFakeForwardAlreadyStartedText,
    buildFakeForwardBatchChatAddedText,
    buildFakeForwardCancelledText,
    buildFakeForwardChatAddedText,
    buildFakeForwardHelpText,
    buildFakeForwardNoDraftText,
    buildFakeForwardPreviewText,
    buildFakeForwardRevokeText,
    buildFakeForwardRoleText,
    buildFakeForwardStartedText,
} from './fake-forward-reply.js';
import {deleteFakeForwardDraft, getFakeForwardDraft, putFakeForwardDraft} from './fake-forward-kv.js';
import type {
    FakeForwardDraft,
    FakeForwardFlushPayload,
    FakeForwardItem,
    FakeForwardRole,
    ParsedFakeForwardChatLine,
    FakeForwardSessionContext,
    ParsedFakeForwardCommand,
    ParsedFakeForwardTime,
} from './fake-forward-types.js';
import {
    FAKE_FORWARD_AUTO_SEND_DELAY_SECONDS,
    FAKE_FORWARD_MAX_CONTENT_LENGTH,
    FAKE_FORWARD_MAX_ITEMS,
    FAKE_FORWARD_MAX_ROLE_NAME_LENGTH,
    FAKE_FORWARD_MAX_ROLES,
    FAKE_FORWARD_SCHEDULER_EXECUTOR_KEY,
    FAKE_FORWARD_SCHEDULER_NAMESPACE,
} from './fake-forward-types.js';

function nowUnixSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function assertWechatMessageSource(message: IncomingMessage): asserts message is IncomingMessage & {source: 'group' | 'private'} {
    if (message.source !== 'group' && message.source !== 'private') {
        throw new Error('伪转发当前仅支持私聊和群聊场景');
    }
}

function buildSessionContext(message: IncomingMessage): FakeForwardSessionContext {
    assertWechatMessageSource(message);
    if (message.source === 'group') {
        if (!message.room?.id) {
            throw new Error('群聊消息缺少 room.id');
        }
        return {
            sessionKey: `wechat:group:${message.room.id}:${message.from}`,
            source: 'group',
            initiatorId: message.from,
            receiverId: message.room.id,
            roomId: message.room.id,
            defaultTitle: '群聊的聊天记录',
        };
    }
    return {
        sessionKey: `wechat:private:${message.from}`,
        source: 'private',
        initiatorId: message.from,
        receiverId: message.from,
        defaultTitle: '聊天记录',
    };
}

function normalizeRoleId(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error('角色ID不能为空');
    }
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(trimmed)) {
        throw new Error('角色ID 仅支持 1-20 位字母、数字、下划线和中划线');
    }
    return trimmed;
}

function normalizeRoleName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error('角色姓名不能为空');
    }
    if (trimmed.length > FAKE_FORWARD_MAX_ROLE_NAME_LENGTH) {
        throw new Error(`角色姓名不能超过 ${FAKE_FORWARD_MAX_ROLE_NAME_LENGTH} 个字符`);
    }
    return trimmed;
}

function normalizeAvatarUrl(value?: string): string | undefined {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return undefined;
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        throw new Error('头像 URL 格式无效');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('头像 URL 仅支持 http/https');
    }
    return trimmed;
}

function normalizeContent(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error('聊天内容不能为空');
    }
    if (trimmed.length > FAKE_FORWARD_MAX_CONTENT_LENGTH) {
        throw new Error(`聊天内容不能超过 ${FAKE_FORWARD_MAX_CONTENT_LENGTH} 个字符`);
    }
    return trimmed;
}

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

function parseDateTimeParts(year: number, month: number, day: number, hour: number, minute: number): ParsedFakeForwardTime {
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error('时间格式无效');
    }
    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (
        date.getFullYear() !== year
        || date.getMonth() !== month - 1
        || date.getDate() !== day
        || date.getHours() !== hour
        || date.getMinutes() !== minute
    ) {
        throw new Error('时间格式无效');
    }
    return {
        timestampMs: date.getTime(),
        displayText: `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}`,
    };
}

export function parseFakeForwardTimeInput(input: string, nowMs = Date.now()): ParsedFakeForwardTime {
    const trimmed = input.trim();
    const full = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (full) {
        return parseDateTimeParts(
            Number(full[1]),
            Number(full[2]),
            Number(full[3]),
            Number(full[4]),
            Number(full[5]),
        );
    }
    const short = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (short) {
        const now = new Date(nowMs);
        return parseDateTimeParts(
            now.getFullYear(),
            now.getMonth() + 1,
            now.getDate(),
            Number(short[1]),
            Number(short[2]),
        );
    }
    throw new Error('时间格式应为 HH:mm 或 YYYY-MM-DD HH:mm');
}

function parseFakeForwardTimeInputWithReference(input: string, referenceTimestampMs: number): ParsedFakeForwardTime {
    const trimmed = input.trim();
    const short = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!short) {
        return parseFakeForwardTimeInput(trimmed, referenceTimestampMs);
    }
    const reference = new Date(referenceTimestampMs);
    return parseDateTimeParts(
        reference.getFullYear(),
        reference.getMonth() + 1,
        reference.getDate(),
        Number(short[1]),
        Number(short[2]),
    );
}

function displayTimeFromTimestamp(timestampMs: number): string {
    const date = new Date(timestampMs);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function resolveParsedChatTime(timeText?: string, nowMs = Date.now()): ParsedFakeForwardTime {
    if (timeText?.trim()) {
        return parseFakeForwardTimeInput(timeText, nowMs);
    }
    const now = new Date(nowMs);
    return parseDateTimeParts(
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
    );
}

function resolveParsedChatTimeWithReference(timeText: string, referenceTimestampMs?: number, nowMs = Date.now()): ParsedFakeForwardTime {
    if (referenceTimestampMs != null) {
        return parseFakeForwardTimeInputWithReference(timeText, referenceTimestampMs);
    }
    return parseFakeForwardTimeInput(timeText, nowMs);
}

function buildBatchTimeSummary(displayTimes: string[]): string {
    if (displayTimes.length === 0) {
        return '未指定';
    }
    const first = displayTimes[0];
    const last = displayTimes[displayTimes.length - 1];
    return first === last ? first : `${first} ~ ${last}`;
}

function toDisplayLines(draft: FakeForwardDraft): string[] {
    return draft.items.slice(-8).map((item) => {
        const role = draft.roles[item.roleId];
        const roleLabel = role ? `${item.roleId}(${role.name})` : item.roleId;
        return `${roleLabel} ${displayTimeFromTimestamp(item.timestampMs)} ${item.content}`;
    });
}

function buildAppReplyFromDraft(draft: FakeForwardDraft): AppReply {
    if (draft.items.length === 0) {
        throw new Error('草稿为空，无法发送');
    }
    return buildWechatChatRecordAppReply({
        title: draft.title,
        items: draft.items.map((item) => {
            const role = draft.roles[item.roleId];
            if (!role) {
                throw new Error(`角色不存在：${item.roleId}`);
            }
            return {
                nickname: role.name,
                avatarUrl: role.avatarUrl,
                timestampMs: item.timestampMs,
                content: item.content,
            };
        }),
        isChatRoom: draft.source === 'group',
    }, {
        to: draft.receiverId,
    });
}

async function sendAppReply(env: Env, reply: AppReply, receiverId: string): Promise<void> {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    if (!apiBaseUrl) {
        throw new Error('WECHAT_API_BASE_URL 未配置，无法发送伪转发消息');
    }
    const api = new WechatApi(apiBaseUrl);
    await sendWechatReply(api, reply, receiverId);
}

export class FakeForwardService {
    async handleCommand(message: IncomingMessage, env: Env, command: ParsedFakeForwardCommand) {
        if (command.action === 'help') {
            return {type: 'text' as const, content: buildFakeForwardHelpText()};
        }

        const session = buildSessionContext(message);
        switch (command.action) {
            case 'start':
                return {
                    type: 'text' as const,
                    content: await this.startDraft(env, session, command.title),
                };
            case 'role':
                return {
                    type: 'text' as const,
                    content: await this.defineRole(env, session, command.roleId ?? '', command.roleName ?? '', command.avatarUrl),
                };
            case 'chat':
                return {
                    type: 'text' as const,
                    content: command.chatItems?.length
                        ? await this.appendBatchChat(env, session, command.chatItems, command.timeText)
                        : await this.appendChat(env, session, command.roleId ?? '', command.timeText ?? '', command.content ?? ''),
                };
            case 'preview':
                return {
                    type: 'text' as const,
                    content: await this.previewDraft(env, session),
                };
            case 'revoke':
                return {
                    type: 'text' as const,
                    content: await this.revokeLastItem(env, session),
                };
            case 'cancel':
                return {
                    type: 'text' as const,
                    content: await this.cancelDraft(env, session.sessionKey),
                };
            case 'finish':
                await this.flushDraft(env, session.sessionKey, 'manual');
                return null;
            default:
                return {type: 'text' as const, content: buildFakeForwardHelpText()};
        }
    }

    async startDraft(env: Env, session: FakeForwardSessionContext, title?: string): Promise<string> {
        const existing = await getFakeForwardDraft(env, session.sessionKey);
        if (existing) {
            return buildFakeForwardAlreadyStartedText(existing.title);
        }
        const now = nowUnixSeconds();
        const draft: FakeForwardDraft = {
            sessionKey: session.sessionKey,
            source: session.source,
            initiatorId: session.initiatorId,
            receiverId: session.receiverId,
            roomId: session.roomId,
            title: title?.trim() || session.defaultTitle,
            version: 1,
            autoSendAt: now + FAKE_FORWARD_AUTO_SEND_DELAY_SECONDS,
            createdAt: now,
            updatedAt: now,
            roles: {},
            items: [],
        };
        await putFakeForwardDraft(env, draft);
        await this.upsertDelayJob(env, draft);
        return buildFakeForwardStartedText(draft.title);
    }

    async defineRole(env: Env, session: FakeForwardSessionContext, roleIdInput: string, roleNameInput: string, avatarUrlInput?: string): Promise<string> {
        const draft = await this.requireDraft(env, session.sessionKey);
        const roleId = normalizeRoleId(roleIdInput);
        const roleName = normalizeRoleName(roleNameInput);
        const avatarUrl = normalizeAvatarUrl(avatarUrlInput);
        const existingRole = draft.roles[roleId];
        if (!existingRole && Object.keys(draft.roles).length >= FAKE_FORWARD_MAX_ROLES) {
            throw new Error(`单个草稿最多只能定义 ${FAKE_FORWARD_MAX_ROLES} 个角色`);
        }
        const role: FakeForwardRole = {
            id: roleId,
            name: roleName,
            avatarUrl,
        };
        const now = nowUnixSeconds();
        const nextDraft: FakeForwardDraft = {
            ...draft,
            roles: {
                ...draft.roles,
                [roleId]: role,
            },
            version: draft.version + 1,
            updatedAt: now,
            autoSendAt: now + FAKE_FORWARD_AUTO_SEND_DELAY_SECONDS,
        };
        await putFakeForwardDraft(env, nextDraft);
        await this.upsertDelayJob(env, nextDraft);
        return buildFakeForwardRoleText(roleId, roleName, avatarUrl);
    }

    async appendChat(env: Env, session: FakeForwardSessionContext, roleIdInput: string, timeText: string, contentInput: string): Promise<string> {
        const draft = await this.requireDraft(env, session.sessionKey);
        const roleId = normalizeRoleId(roleIdInput);
        if (!draft.roles[roleId]) {
            throw new Error(`角色不存在：${roleId}，请先使用“伪转发 角色 ...”定义角色`);
        }
        if (draft.items.length >= FAKE_FORWARD_MAX_ITEMS) {
            throw new Error(`单个草稿最多只能添加 ${FAKE_FORWARD_MAX_ITEMS} 条聊天项`);
        }
        const parsedTime = resolveParsedChatTime(timeText);
        const content = normalizeContent(contentInput);
        const nextItem: FakeForwardItem = {
            seq: draft.items.length + 1,
            roleId,
            timestampMs: parsedTime.timestampMs,
            content,
            kind: 'text',
        };
        const now = nowUnixSeconds();
        const nextDraft: FakeForwardDraft = {
            ...draft,
            items: [...draft.items, nextItem],
            version: draft.version + 1,
            updatedAt: now,
            autoSendAt: now + FAKE_FORWARD_AUTO_SEND_DELAY_SECONDS,
        };
        await putFakeForwardDraft(env, nextDraft);
        await this.upsertDelayJob(env, nextDraft);
        return buildFakeForwardChatAddedText(nextItem.seq, roleId, parsedTime.displayText, content);
    }

    async appendBatchChat(env: Env, session: FakeForwardSessionContext, chatItems: ParsedFakeForwardChatLine[], timeText?: string): Promise<string> {
        const draft = await this.requireDraft(env, session.sessionKey);
        if (chatItems.length === 0) {
            throw new Error('请至少提供一条聊天内容');
        }
        if (draft.items.length + chatItems.length > FAKE_FORWARD_MAX_ITEMS) {
            throw new Error(`单个草稿最多只能添加 ${FAKE_FORWARD_MAX_ITEMS} 条聊天项`);
        }

        const batchNowMs = Date.now();
        let currentParsedTime = timeText?.trim()
            ? resolveParsedChatTime(timeText, batchNowMs)
            : undefined;
        const displayTimes: string[] = [];
        const nextItems = chatItems.map((item, index) => {
            const roleId = normalizeRoleId(item.roleId);
            if (!draft.roles[roleId]) {
                throw new Error(`角色不存在：${roleId}，请先使用“伪转发 角色 ...”定义角色`);
            }
            if (item.timeText?.trim()) {
                currentParsedTime = resolveParsedChatTimeWithReference(item.timeText, currentParsedTime?.timestampMs, batchNowMs);
            } else if (!currentParsedTime) {
                currentParsedTime = resolveParsedChatTime(undefined, batchNowMs);
            }
            displayTimes.push(currentParsedTime.displayText);
            return {
                seq: draft.items.length + index + 1,
                roleId,
                timestampMs: currentParsedTime.timestampMs,
                content: normalizeContent(item.content),
                kind: 'text',
            } satisfies FakeForwardItem;
        });

        const now = nowUnixSeconds();
        const nextDraft: FakeForwardDraft = {
            ...draft,
            items: [...draft.items, ...nextItems],
            version: draft.version + 1,
            updatedAt: now,
            autoSendAt: now + FAKE_FORWARD_AUTO_SEND_DELAY_SECONDS,
        };
        await putFakeForwardDraft(env, nextDraft);
        await this.upsertDelayJob(env, nextDraft);
        return buildFakeForwardBatchChatAddedText(nextItems.length, buildBatchTimeSummary(displayTimes));
    }

    async previewDraft(env: Env, session: FakeForwardSessionContext): Promise<string> {
        const draft = await this.requireDraft(env, session.sessionKey);
        const now = nowUnixSeconds();
        const nextDraft: FakeForwardDraft = {
            ...draft,
            version: draft.version + 1,
            updatedAt: now,
            autoSendAt: now + FAKE_FORWARD_AUTO_SEND_DELAY_SECONDS,
        };
        await putFakeForwardDraft(env, nextDraft);
        await this.upsertDelayJob(env, nextDraft);
        return buildFakeForwardPreviewText(nextDraft, toDisplayLines(nextDraft));
    }

    async revokeLastItem(env: Env, session: FakeForwardSessionContext): Promise<string> {
        const draft = await this.requireDraft(env, session.sessionKey);
        if (draft.items.length === 0) {
            throw new Error('当前草稿还没有聊天项，无法撤回');
        }
        const now = nowUnixSeconds();
        const nextItems = draft.items.slice(0, -1).map((item, index) => ({...item, seq: index + 1}));
        const nextDraft: FakeForwardDraft = {
            ...draft,
            items: nextItems,
            version: draft.version + 1,
            updatedAt: now,
            autoSendAt: now + FAKE_FORWARD_AUTO_SEND_DELAY_SECONDS,
        };
        await putFakeForwardDraft(env, nextDraft);
        await this.upsertDelayJob(env, nextDraft);
        return buildFakeForwardRevokeText(nextDraft.items.length);
    }

    async cancelDraft(env: Env, sessionKey: string): Promise<string> {
        const draft = await getFakeForwardDraft(env, sessionKey);
        if (!draft) {
            return buildFakeForwardNoDraftText();
        }
        await deleteFakeForwardDraft(env, sessionKey);
        await this.pauseDelayJob(env, sessionKey);
        return buildFakeForwardCancelledText();
    }

    async flushDraft(env: Env, sessionKey: string, mode: 'manual' | 'auto', expectedVersion?: number): Promise<void> {
        const draft = await getFakeForwardDraft(env, sessionKey);
        if (!draft) {
            if (mode === 'manual') {
                throw new Error(buildFakeForwardNoDraftText());
            }
            return;
        }
        const now = nowUnixSeconds();
        if (expectedVersion != null && draft.version !== expectedVersion) {
            return;
        }
        if (mode === 'auto' && draft.autoSendAt > now) {
            return;
        }
        if (draft.items.length === 0) {
            throw new Error('草稿为空，无法发送');
        }
        const reply = buildAppReplyFromDraft(draft);
        await sendAppReply(env, reply, draft.receiverId);
        await deleteFakeForwardDraft(env, sessionKey);
        await this.pauseDelayJob(env, sessionKey);
    }

    async flushDraftFromScheduler(env: Env, payload: FakeForwardFlushPayload): Promise<{status: 'success' | 'skipped'; result: unknown}> {
        const draft = await getFakeForwardDraft(env, payload.sessionKey);
        if (!draft) {
            return {status: 'skipped', result: {reason: 'draft_not_found', sessionKey: payload.sessionKey}};
        }
        if (draft.version !== payload.version) {
            return {
                status: 'skipped',
                result: {
                    reason: 'version_mismatch',
                    sessionKey: payload.sessionKey,
                    expectedVersion: payload.version,
                    actualVersion: draft.version,
                },
            };
        }
        if (draft.items.length === 0) {
            return {status: 'skipped', result: {reason: 'empty_draft', sessionKey: payload.sessionKey}};
        }
        const now = nowUnixSeconds();
        if (draft.autoSendAt > now) {
            return {
                status: 'skipped',
                result: {
                    reason: 'not_due_yet',
                    sessionKey: payload.sessionKey,
                    autoSendAt: draft.autoSendAt,
                    now,
                },
            };
        }
        await this.flushDraft(env, payload.sessionKey, 'auto', payload.version);
        return {
            status: 'success',
            result: {
                sessionKey: payload.sessionKey,
                version: payload.version,
                itemCount: draft.items.length,
            },
        };
    }

    private async requireDraft(env: Env, sessionKey: string): Promise<FakeForwardDraft> {
        const draft = await getFakeForwardDraft(env, sessionKey);
        if (!draft) {
            throw new Error(buildFakeForwardNoDraftText());
        }
        return draft;
    }

    private async upsertDelayJob(env: Env, draft: FakeForwardDraft): Promise<void> {
        const repository = createSchedulerRepository(env);
        const job = await repository.getJobByNamespaceAndKey(FAKE_FORWARD_SCHEDULER_NAMESPACE, draft.sessionKey);
        const input: SchedulerCreateJobInput & {now: number; nextRunAt: number | null} = {
            namespace: FAKE_FORWARD_SCHEDULER_NAMESPACE,
            jobKey: draft.sessionKey,
            name: `fake-forward:${draft.sessionKey}`,
            executorKey: FAKE_FORWARD_SCHEDULER_EXECUTOR_KEY,
            scheduleType: 'delay',
            payload: {
                sessionKey: draft.sessionKey,
                version: draft.version,
            } satisfies FakeForwardFlushPayload,
            retryLimit: 2,
            retryBackoffSec: 30,
            concurrencyPolicy: 'forbid',
            misfirePolicy: 'fire_once',
            cronExpr: null,
            timezone: null,
            nextRunAt: draft.autoSendAt,
            now: nowUnixSeconds(),
        };
        if (job) {
            await repository.updateJob(job.id, input);
            if (job.status !== 'active') {
                await repository.resumeJob(job.id, draft.autoSendAt, nowUnixSeconds());
            }
            return;
        }
        await repository.createJob({...input, nextRunAt: draft.autoSendAt});
    }

    private async pauseDelayJob(env: Env, sessionKey: string): Promise<void> {
        const repository = createSchedulerRepository(env);
        const job = await repository.getJobByNamespaceAndKey(FAKE_FORWARD_SCHEDULER_NAMESPACE, sessionKey);
        if (!job) return;
        await repository.pauseJob(job.id, nowUnixSeconds());
    }
}




