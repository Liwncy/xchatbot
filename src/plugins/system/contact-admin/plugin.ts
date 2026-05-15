import type {TextMessage} from '../../types.js';
import {ContactRepository} from './repository.js';
import {WechatApi} from '../../../wechat/api.js';

const COMMAND_PREFIX = '/cm';
const COMMAND_LIST = 'list';
const COMMAND_APPROVE = 'approve';
const COMMAND_ADD_GROUP = 'add-group';
const COMMAND_REMOVE = 'remove';
const COMMAND_DEBUG_LIST = 'debug-list';
const COMMAND_SYNC = 'sync';
const COMMAND_HELP = 'help';

function parseCommand(content: string): {cmd: 'list' | 'approve' | 'add-group' | 'remove' | 'debug-list' | 'sync' | 'help'; arg: string} | null {
    const raw = content.trim();
    if (!raw.startsWith(COMMAND_PREFIX)) return null;
    const text = raw.slice(COMMAND_PREFIX.length).trim();
    if (!text) return {cmd: 'help', arg: ''};

    const [sub, ...rest] = text.split(/\s+/);
    const cmd = sub.trim().toLowerCase();
    const arg = rest.join(' ').trim();

    if (cmd === COMMAND_LIST) return {cmd: 'list', arg};
    if (cmd === COMMAND_HELP) return {cmd: 'help', arg};
    if (cmd === COMMAND_APPROVE) return {cmd: 'approve', arg};
    if (cmd === COMMAND_ADD_GROUP) return {cmd: 'add-group', arg};
    if (cmd === COMMAND_REMOVE) return {cmd: 'remove', arg};
    if (cmd === COMMAND_DEBUG_LIST) return {cmd: 'debug-list', arg};
    if (cmd === COMMAND_SYNC) return {cmd: 'sync', arg};
    return null;
}

function buildHelpText(): string {
    return [
        '联系人管理命令（统一 /cm 前缀）：',
        '1) /cm help',
        '2) /cm list',
        '3) /cm approve {JSON参数}',
        '4) /cm add-group 123456@chatroom',
        '5) /cm remove wxid_xxx',
        '6) /cm debug-list',
        '7) /cm sync',
        '',
        '说明：',
        '- 仅机器人主人（BOT_OWNER_WECHAT_ID）可执行',
        '- 群聊仅在群ID属于联系人列表时才回复',
    ].join('\n');
}

function ensureOwner(messageFrom: string, ownerWxid?: string): string | null {
    const owner = ownerWxid?.trim() ?? '';
    if (!owner) return '未配置 BOT_OWNER_WECHAT_ID，无法执行联系人管理';
    if (messageFrom.trim() !== owner) return '无权限，仅机器人主人可执行此命令';
    return null;
}

export const contactAdminPlugin: TextMessage = {
    type: 'text',
    name: 'contact-admin',
    description: '联系人管理（/cm 前缀）：联系人列表 / 好友审批 / 加群联系人 / 移除联系人',
    match: (content) => parseCommand(content) !== null,
    handle: async (message, env) => {
        try {
            const parsed = parseCommand(message.content ?? '');
            if (!parsed) return null;

            const ownerErr = ensureOwner(message.from, env.BOT_OWNER_WECHAT_ID);
            if (ownerErr) return {type: 'text', content: ownerErr};

            const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
            if (!apiBaseUrl) {
                return {type: 'text', content: 'WECHAT_API_BASE_URL 未配置，无法执行联系人管理'};
            }
            await ContactRepository.ensureSchema(env.XBOT_DB);

            if (parsed.cmd === 'help') {
                return {type: 'text', content: buildHelpText()};
            }

            if (parsed.cmd === 'list') {
                const contacts = await ContactRepository.listFromDb(env.XBOT_DB);
                if (contacts.length === 0) {
                    return {type: 'text', content: '当前联系人表为空，请先执行 /cm sync'};
                }
                const lines = contacts.map((item) => `${item.contactId} [${item.contactType}]${item.displayName ? ` ${item.displayName}` : ''}`);
                return {
                    type: 'text',
                    content: `当前联系人列表（共 ${contacts.length} 项）：\n${lines.join('\n')}`,
                };
            }

            if (parsed.cmd === 'sync') {
                const result = await ContactRepository.syncToDb(env.XBOT_DB, apiBaseUrl);
                return {
                    type: 'text',
                    content: `✅ 联系人同步完成：total=${result.total}, users=${result.users}, groups=${result.groups}, systems=${result.systems}, memberSyncedGroups=${result.memberSyncedGroups}, groupMembers=${result.groupMembers}`,
                };
            }

            if (parsed.cmd === 'debug-list') {
                const debug = await ContactRepository.debugFetch(apiBaseUrl);
                const head = (items: string[]) => items.slice(0, 10).join('\n') || '(empty)';
                const keysText = (keys: string[]) => keys.length ? keys.join(', ') : '(none)';
                return {
                    type: 'text',
                    content: [
                        '联系人调试结果：',
                        `- /api/contacts code: ${debug.contactsMeta.code ?? 'null'}, message: ${debug.contactsMeta.message || '(empty)'}`,
                        `- /api/contacts data keys: ${keysText(debug.contactsMeta.dataKeys)}`,
                        `- /api/contacts: ${debug.fromContacts.length}`,
                        `- /api/contacts/all code: ${debug.contactsAllMeta.code ?? 'null'}, message: ${debug.contactsAllMeta.message || '(empty)'}`,
                        `- /api/contacts/all data keys: ${keysText(debug.contactsAllMeta.dataKeys)}`,
                        `- /api/contacts/all: ${debug.fromContactsAll.length}`,
                        `- merged: ${debug.merged.length}`,
                        '',
                        '[contacts sample]',
                        head(debug.fromContacts),
                        '',
                        '[contacts/all sample]',
                        head(debug.fromContactsAll),
                    ].join('\n'),
                };
            }

            if (parsed.cmd === 'approve') {
                if (!parsed.arg) {
                    return {type: 'text', content: '请提供审批参数 JSON，例如：/cm approve {"v1":"...","v2":"...","opcode":3}'};
                }
                let payload: Record<string, unknown>;
                try {
                    payload = JSON.parse(parsed.arg) as Record<string, unknown>;
                } catch {
                    return {type: 'text', content: '审批参数不是有效 JSON'};
                }
                await ContactRepository.approveFriendRequest(apiBaseUrl, payload);
                return {type: 'text', content: '✅ 好友申请审批已提交'};
            }

            if (parsed.cmd === 'add-group') {
                const groupId = parsed.arg.trim();
                if (!groupId || !groupId.endsWith('@chatroom')) {
                    return {type: 'text', content: '请提供群ID，例如：/cm add-group 123456@chatroom'};
                }
                await ContactRepository.addGroupAsContact(apiBaseUrl, groupId);
                await ContactRepository.addGroupToDb(env.XBOT_DB, groupId, 'manual');
                return {type: 'text', content: `✅ 已将群加入联系人：${groupId}`};
            }

            const contactId = parsed.arg.trim();
            if (!contactId) {
                return {type: 'text', content: '请提供联系人ID，例如：/cm remove wxid_xxx'};
            }

            if (contactId.endsWith('@chatroom')) {
                // 群联系人不删会话，只取消保存到通讯录。
                const api = new WechatApi(apiBaseUrl);
                const result = await api.setGroupContactList(contactId, false);
                if (typeof result.code === 'number' && result.code !== 0) {
                    throw new Error(`setGroupContactList(false) failed: code=${result.code}, message=${String(result.message ?? '')}`);
                }
            } else {
                await ContactRepository.removeContact(apiBaseUrl, contactId);
            }
            await ContactRepository.setContactEnabled(env.XBOT_DB, contactId, false);
            return {type: 'text', content: `✅ 已移除联系人：${contactId}`};
        } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            return {type: 'text', content: `联系人管理失败：${messageText}`};
        }
    },
};

