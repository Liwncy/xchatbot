import { describe, it, expect } from 'vitest';
import { parseFeishuMessage } from '../../src/platforms/feishu/index.js';
import type { FeishuEventBody } from '../../src/platforms/feishu/types.js';

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
