import type {Env} from '../../types/message.js';
import type {FakeForwardDraft} from './fake-forward-types.js';
import {FAKE_FORWARD_DRAFT_TTL_SECONDS} from './fake-forward-types.js';

function buildDraftKey(sessionKey: string): string {
    return `fake-forward:draft:${sessionKey}`;
}

export async function getFakeForwardDraft(env: Env, sessionKey: string): Promise<FakeForwardDraft | null> {
    const raw = await env.XBOT_KV.get(buildDraftKey(sessionKey));
    if (!raw?.trim()) return null;
    return JSON.parse(raw) as FakeForwardDraft;
}

export async function putFakeForwardDraft(
    env: Env,
    draft: FakeForwardDraft,
    ttlSeconds = FAKE_FORWARD_DRAFT_TTL_SECONDS,
): Promise<void> {
    await env.XBOT_KV.put(buildDraftKey(draft.sessionKey), JSON.stringify(draft), {
        expirationTtl: ttlSeconds,
    });
}

export async function deleteFakeForwardDraft(env: Env, sessionKey: string): Promise<void> {
    await env.XBOT_KV.delete(buildDraftKey(sessionKey));
}

