import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseFeishuMessage, sendFeishuReply } from '../../src/platforms/feishu/index.js';
import type { FeishuEventBody } from '../../src/platforms/feishu/types.js';
import type { ReplyMessage } from '../../src/types/message.js';

describe('parseFeishuMessage', () => {
  it('returns null for URL verification challenge', () => {
    const body: FeishuEventBody = { challenge: 'test_challenge', token: 'xxx', type: 'url_verification' };
    expect(parseFeishuMessage(body)).toBeNull();
  });

  it('returns null for events without message', () => {
    const body: FeishuEventBody = {
      schema: '2.0',
      header: {
        event_id: 'evt_001',
        token: 'xxx',
        create_time: '1700000000000',
        event_type: 'im.message.receive_v1',
        tenant_key: 'tenant_001',
        app_id: 'app_001',
      },
      event: {},
    };
    expect(parseFeishuMessage(body)).toBeNull();
  });

  it('parses text message', () => {
    const body: FeishuEventBody = {
      schema: '2.0',
      header: {
        event_id: 'evt_001',
        token: 'xxx',
        create_time: '1700000000000',
        event_type: 'im.message.receive_v1',
        tenant_key: 'tenant_001',
        app_id: 'app_001',
      },
      event: {
        sender: {
          sender_id: { open_id: 'ou_abc123' },
          sender_type: 'user',
        },
        message: {
          message_id: 'msg_001',
          create_time: '1700000000000',
          chat_id: 'oc_chat_001',
          chat_type: 'group',
          message_type: 'text',
          content: JSON.stringify({ text: 'Hello Feishu Bot' }),
        },
      },
    };

    const msg = parseFeishuMessage(body);
    expect(msg).not.toBeNull();
    expect(msg!.platform).toBe('feishu');
    expect(msg!.type).toBe('text');
    expect(msg!.content).toBe('Hello Feishu Bot');
    expect(msg!.from).toBe('ou_abc123');
  });

  it('parses image message', () => {
    const body: FeishuEventBody = {
      schema: '2.0',
      header: {
        event_id: 'evt_002',
        token: 'xxx',
        create_time: '1700000000000',
        event_type: 'im.message.receive_v1',
        tenant_key: 'tenant_001',
        app_id: 'app_001',
      },
      event: {
        sender: { sender_id: { open_id: 'ou_abc123' } },
        message: {
          message_id: 'msg_002',
          create_time: '1700000001000',
          chat_id: 'oc_chat_001',
          chat_type: 'group',
          message_type: 'image',
          content: JSON.stringify({ image_key: 'img_key_001' }),
        },
      },
    };

    const msg = parseFeishuMessage(body);
    expect(msg!.type).toBe('image');
    expect(msg!.mediaId).toBe('img_key_001');
  });
});

describe('sendFeishuReply', () => {
  const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ code: 0, msg: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses reply.to to override chatId', async () => {
    const reply: ReplyMessage = { type: 'text', content: 'Hello', to: 'oc_override' };
    await sendFeishuReply(reply, 'oc_original', 'app_token');

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.receive_id).toBe('oc_override');
  });

  it('prepends at tags for mentions in text reply', async () => {
    const reply: ReplyMessage = {
      type: 'text',
      content: 'Check this out',
      mentions: ['ou_user1', 'ou_user2'],
    };
    await sendFeishuReply(reply, 'oc_chat', 'app_token');

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    const content = JSON.parse(body.content);
    expect(content.text).toContain('<at user_id="ou_user1"></at>');
    expect(content.text).toContain('<at user_id="ou_user2"></at>');
    expect(content.text).toContain('Check this out');
  });

  it('sends text without at tags when no mentions', async () => {
    const reply: ReplyMessage = { type: 'text', content: 'Hello' };
    await sendFeishuReply(reply, 'oc_chat', 'app_token');

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    const content = JSON.parse(body.content);
    expect(content.text).toBe('Hello');
  });

  it('includes at elements in markdown reply with mentions', async () => {
    const reply: ReplyMessage = {
      type: 'markdown',
      title: 'Title',
      content: '**bold**',
      mentions: ['ou_user1'],
    };
    await sendFeishuReply(reply, 'oc_chat', 'app_token');

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    const content = JSON.parse(body.content);
    const firstLine = content.post.zh_cn.content[0];
    expect(firstLine).toContainEqual({ tag: 'at', user_id: 'ou_user1' });
  });

  it('sends multiple replies sequentially', async () => {
    const replies: ReplyMessage[] = [
      { type: 'text', content: 'first' },
      { type: 'text', content: 'second' },
    ];
    for (const reply of replies) {
      await sendFeishuReply(reply, 'oc_chat', 'app_token');
    }

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const body0 = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    const content0 = JSON.parse(body0.content);
    expect(content0.text).toBe('first');

    const body1 = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
    const content1 = JSON.parse(body1.content);
    expect(content1.text).toBe('second');
  });
});
