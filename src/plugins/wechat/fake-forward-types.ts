import type {MessageSource} from '../../types/message.js';

export const FAKE_FORWARD_PREFIX = '伪转发';
export const FAKE_FORWARD_DRAFT_TTL_SECONDS = 1800;
export const FAKE_FORWARD_AUTO_SEND_DELAY_SECONDS = 120;
export const FAKE_FORWARD_MAX_ITEMS = 20;
export const FAKE_FORWARD_MAX_ROLES = 10;
export const FAKE_FORWARD_MAX_ROLE_NAME_LENGTH = 30;
export const FAKE_FORWARD_MAX_CONTENT_LENGTH = 300;
export const FAKE_FORWARD_SCHEDULER_NAMESPACE = 'fake-forward';
export const FAKE_FORWARD_SCHEDULER_EXECUTOR_KEY = 'fake-forward-flush';

export interface FakeForwardRole {
    id: string;
    name: string;
    avatarUrl?: string;
}

export interface FakeForwardItem {
    seq: number;
    roleId: string;
    timestampMs: number;
    content: string;
    kind: 'text';
}

export interface FakeForwardDraft {
    sessionKey: string;
    source: Extract<MessageSource, 'group' | 'private'>;
    initiatorId: string;
    receiverId: string;
    roomId?: string;
    title: string;
    version: number;
    autoSendAt: number;
    createdAt: number;
    updatedAt: number;
    roles: Record<string, FakeForwardRole>;
    items: FakeForwardItem[];
}

export interface FakeForwardSessionContext {
    sessionKey: string;
    source: Extract<MessageSource, 'group' | 'private'>;
    initiatorId: string;
    receiverId: string;
    roomId?: string;
    defaultTitle: string;
}

export interface FakeForwardFlushPayload {
    sessionKey: string;
    version: number;
}

export interface ParsedFakeForwardChatLine {
    roleId: string;
    timeText?: string;
    content: string;
}

export interface ParsedFakeForwardCommand {
    action: 'start' | 'role' | 'chat' | 'preview' | 'revoke' | 'finish' | 'cancel' | 'help';
    title?: string;
    roleId?: string;
    roleName?: string;
    avatarUrl?: string;
    timeText?: string;
    content?: string;
    chatItems?: ParsedFakeForwardChatLine[];
}

export interface ParsedFakeForwardTime {
    timestampMs: number;
    displayText: string;
}

