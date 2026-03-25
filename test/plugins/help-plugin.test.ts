import {describe, it, expect, vi, afterEach} from 'vitest';
import {helpPlugin} from '../../src/plugins/system/help';
import {pluginManager} from '../../src/plugins/manager';
import type {IncomingMessage} from '../../src/types/message.js';

function makeMessage(content: string): IncomingMessage {
    return {
        platform: 'wechat',
        type: 'text',
        from: 'wxid_user_001',
        to: 'wxid_bot_001',
        timestamp: 1700000000,
        messageId: 'msg_001',
        content,
        raw: {},
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('helpPlugin', () => {
    it('matches help keywords', () => {
        expect(helpPlugin.match('帮助', makeMessage('帮助'))).toBe(true);
        expect(helpPlugin.match('help', makeMessage('help'))).toBe(true);
        expect(helpPlugin.match('插件列表', makeMessage('插件列表'))).toBe(true);
        expect(helpPlugin.match('帮助 alpha-plugin', makeMessage('帮助 alpha-plugin'))).toBe(true);
        expect(helpPlugin.match('help alpha-plugin', makeMessage('help alpha-plugin'))).toBe(true);
        expect(helpPlugin.match('随机内容', makeMessage('随机内容'))).toBe(false);
    });

    it('returns plugin list and descriptions', async () => {
        vi.spyOn(pluginManager, 'getPlugins').mockReturnValue([
            {
                type: 'text',
                name: 'alpha-plugin',
                description: 'alpha desc',
                match: () => true,
                handle: async () => null,
            },
            {
                type: 'image',
                name: 'beta-plugin',
                description: 'beta desc',
                match: () => true,
                handle: async () => null,
            },
        ]);

        const reply = await helpPlugin.handle(makeMessage('帮助'), {});
        expect(reply).not.toBeNull();
        expect(Array.isArray(reply)).toBe(false);
        expect((reply as {type: string}).type).toBe('text');

        const content = (reply as {content: string}).content;
        expect(content).toContain('已注册插件：2 个');
        expect(content).toContain('[text] alpha-plugin - alpha desc');
        expect(content).toContain('[image] beta-plugin - beta desc');
        expect(content).toContain('帮助 插件名');
    });

    it('returns plugin detail for specific plugin query', async () => {
        vi.spyOn(pluginManager, 'getPlugins').mockReturnValue([
            {
                type: 'text',
                name: 'alpha-plugin',
                description: 'alpha desc',
                match: () => true,
                handle: async () => null,
            },
        ]);

        const reply = await helpPlugin.handle(makeMessage('帮助 alpha-plugin'), {});
        expect(reply).not.toBeNull();
        expect(Array.isArray(reply)).toBe(false);

        const content = (reply as {content: string}).content;
        expect(content).toContain('插件详情：');
        expect(content).toContain('名称：alpha-plugin');
        expect(content).toContain('类型：text');
        expect(content).toContain('功能：alpha desc');
    });

    it('returns not-found message for unknown plugin query', async () => {
        vi.spyOn(pluginManager, 'getPlugins').mockReturnValue([
            {
                type: 'text',
                name: 'alpha-plugin',
                description: 'alpha desc',
                match: () => true,
                handle: async () => null,
            },
        ]);

        const reply = await helpPlugin.handle(makeMessage('帮助 unknown-plugin'), {});
        expect(reply).not.toBeNull();
        expect(Array.isArray(reply)).toBe(false);
        expect((reply as {content: string}).content).toContain('未找到插件：unknown-plugin');
    });
});

