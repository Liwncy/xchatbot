import type {TextMessage} from '../types.js';
import type {IncomingMessage} from '../../types/message.js';
import {FakeForwardService, parseFakeForwardTimeInput} from './fake-forward-service.js';
import {FAKE_FORWARD_PREFIX, type ParsedFakeForwardCommand} from './fake-forward-types.js';

const fakeForwardService = new FakeForwardService();

const FAKE_FORWARD_TIME_PATTERN = '(?:\\d{1,2}:\\d{2})|(?:\\d{4}-\\d{2}-\\d{2}\\s+\\d{1,2}:\\d{2})';

function parseRoleCommand(body: string): ParsedFakeForwardCommand {
    const matched = body.match(/^角色\s+(\S+)\s+(\S+)(?:\s+(\S+))?$/u);
    if (!matched) {
        throw new Error('角色命令格式应为：伪转发 角色 <角色ID> <姓名> [头像URL]');
    }
    return {
        action: 'role',
        roleId: matched[1],
        roleName: matched[2],
        avatarUrl: matched[3],
    };
}

function parseChatCommand(body: string): ParsedFakeForwardCommand {
    const singleMatched = body.match(new RegExp(`^聊天\\s+(\\S+)\\s+(${FAKE_FORWARD_TIME_PATTERN})\\s+([^\\r\\n]+)$`, 'u'));
    if (singleMatched) {
        parseFakeForwardTimeInput(singleMatched[2]);
        return {
            action: 'chat',
            roleId: singleMatched[1],
            timeText: singleMatched[2],
            content: singleMatched[3],
        };
    }

    const remainder = body.slice('聊天'.length).trimStart();
    if (!remainder) {
        throw new Error('聊天命令格式应为：伪转发 聊天 <角色ID> <时间> <内容>，或使用多行“角色ID [时间]：内容”');
    }

    const rawLines = remainder.split(/\r?\n/);
    const firstLine = rawLines[0]?.trim() ?? '';
    let timeText: string | undefined;
    let lines = rawLines;

    if (firstLine) {
        try {
            parseFakeForwardTimeInput(firstLine);
            timeText = firstLine;
            lines = rawLines.slice(1);
        } catch {
            // ignore; treat all lines as chat content and default time to now
        }
    }

    const chatItems = lines
        .map((line, index) => ({line, index}))
        .filter(({line}) => line.trim())
        .map(({line, index}) => {
            const matched = line.match(new RegExp(`^([A-Za-z0-9_-]{1,20})(?:\\s+(${FAKE_FORWARD_TIME_PATTERN}))?\\s*[：:]\\s*(.+)$`, 'u'));
            if (!matched) {
                throw new Error(`聊天内容第 ${index + 1} 行格式应为：角色ID [时间]：内容`);
            }
            if (matched[2]) {
                parseFakeForwardTimeInput(matched[2]);
            }
            return {
                roleId: matched[1],
                timeText: matched[2],
                content: matched[3],
            };
        });

    if (chatItems.length === 0) {
        throw new Error('请至少提供一行聊天内容，格式如：A：你好 或 A 09:13：你好');
    }

    return {
        action: 'chat',
        timeText,
        chatItems,
    };
}

export function parseFakeForwardCommand(content: string): ParsedFakeForwardCommand {
    const trimmed = content.trim();
    if (!trimmed.startsWith(FAKE_FORWARD_PREFIX)) {
        return {action: 'help'};
    }
    const body = trimmed.slice(FAKE_FORWARD_PREFIX.length).trim();
    if (!body) return {action: 'help'};
    if (body === '预览') return {action: 'preview'};
    if (body === '撤回') return {action: 'revoke'};
    if (body === '结束' || body === '发送') return {action: 'finish'};
    if (body === '取消') return {action: 'cancel'};
    if (body === '帮助') return {action: 'help'};
    if (body === '开始') return {action: 'start'};
    if (body.startsWith('开始 ')) {
        return {action: 'start', title: body.slice(3).trim()};
    }
    if (body.startsWith('角色 ')) {
        return parseRoleCommand(body);
    }
    if (/^聊天(?:\s|$)/u.test(body)) {
        return parseChatCommand(body);
    }
    return {action: 'help'};
}

function isSupportedMessage(message: IncomingMessage): boolean {
    return message.platform === 'wechat' && (message.source === 'group' || message.source === 'private');
}

export const fakeForwardPlugin: TextMessage = {
    type: 'text',
    name: 'fake-forward',
    description: '通过“伪转发 ...”创建并发送聊天记录草稿',
    match: (content, message) => isSupportedMessage(message) && content.trim().startsWith(FAKE_FORWARD_PREFIX),
    async handle(message, env) {
        try {
            const command = parseFakeForwardCommand(message.content ?? '');
            return await fakeForwardService.handleCommand(message, env, command);
        } catch (error) {
            return {
                type: 'text',
                content: error instanceof Error ? error.message : String(error),
            };
        }
    },
};

