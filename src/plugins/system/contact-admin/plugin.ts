import type {TextMessage} from '../../types.js';
import {NO_PERMISSION_REPLY} from '../../../constants/messages.js';
import {ContactRepository} from './repository.js';
import {WechatApi} from '../../../wechat';
import type {VerifyFriendRequest} from '../../../wechat/api/types.js';

const COMMAND_PREFIX = '/cm';
const COMMAND_LIST = 'list';
const COMMAND_APPROVE = 'approve';
const COMMAND_ADD_GROUP = 'add-group';
const COMMAND_DEL_GROUP = 'del-group';
const COMMAND_ADD_USER = 'add-user';
const COMMAND_ENABLE_USER = 'enable-user';
const COMMAND_DISABLE_USER = 'disable-user';
const COMMAND_REMOVE = 'remove';
const COMMAND_DEBUG_LIST = 'debug-list';
const COMMAND_SYNC = 'sync';
const COMMAND_HELP = 'help';

type ContactAdminCommand =
    | 'list'
    | 'approve'
    | 'add-group'
    | 'del-group'
    | 'add-user'
    | 'disable-user'
    | 'remove'
    | 'debug-list'
    | 'sync'
    | 'help';

function parseCommand(content: string): {cmd: ContactAdminCommand; arg: string} | null {
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
    if (cmd === COMMAND_DEL_GROUP) return {cmd: 'del-group', arg};
    if (cmd === COMMAND_ADD_USER) return {cmd: 'add-user', arg};
    if (cmd === COMMAND_ENABLE_USER) return {cmd: 'add-user', arg};
    if (cmd === COMMAND_DISABLE_USER) return {cmd: 'disable-user', arg};
    if (cmd === COMMAND_REMOVE) return {cmd: 'remove', arg};
    if (cmd === COMMAND_DEBUG_LIST) return {cmd: 'debug-list', arg};
    if (cmd === COMMAND_SYNC) return {cmd: 'sync', arg};
    return null;
}

function buildHelpText(): string {
    return [
        '联系人管理（/cm，仅主人）：',
        '/cm list',
        '/cm sync',
        '/cm add-user wxid_xxx（或 /cm enable-user）',
        '/cm disable-user wxid_xxx',
        '/cm add-group 123@chatroom',
        '/cm del-group 123@chatroom',
        '/cm remove wxid_xxx',
        '/cm approve {JSON}',
        '',
        '私聊、群聊都要先加白才会理；公众号不理。同步进来的个人默认关着，得 /cm add-user 打开。',
    ].join('\n');
}

function ensureOwner(messageFrom: string, ownerWxid?: string): string | null {
    const owner = ownerWxid?.trim() ?? '';
    if (!owner) return '联系人管理功能还没找到主人，暂时不能操作哦';
    if (messageFrom.trim() !== owner) return NO_PERMISSION_REPLY;
    return null;
}

function buildChatroomContactListFailureText(result: {code: number; message?: unknown}): string {
    return `联系人操作没成功（code=${result.code}），稍后再试试吧`;
}

function isUserContactId(contactId: string): boolean {
    const id = contactId.trim();
    if (!id || id.endsWith('@chatroom')) return false;
    if (id.startsWith('gh_')) return false;
    return true;
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
                return {type: 'text', content: '联系人功能还没接好线，稍等一下吧'};
            }
            await ContactRepository.ensureSchema(env.XBOT_DB);

            if (parsed.cmd === 'help') {
                return {type: 'text', content: buildHelpText()};
            }

            if (parsed.cmd === 'list') {
                const contacts = await ContactRepository.listFromDb(env.XBOT_DB);
                if (contacts.length === 0) {
                    return {type: 'text', content: '名单还是空的，先 /cm sync，再用 add-user / add-group 打开谁'};
                }
                const lines = contacts.map((item) => `${item.contactId} [${item.contactType}]${item.displayName ? ` ${item.displayName}` : ''}`);
                return {
                    type: 'text',
                    content: `当前已开启（共 ${contacts.length}）：\n${lines.join('\n')}`,
                };
            }

            if (parsed.cmd === 'sync') {
                const result = await ContactRepository.syncToDb(env.XBOT_DB, apiBaseUrl);
                return {
                    type: 'text',
                    content: `同步好了：一共 ${result.total}（人 ${result.users} / 群 ${result.groups} / 系统 ${result.systems}），个人默认关着，要用 /cm add-user 打开 👌`,
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
                        `- /api/contacts/detail code: ${debug.contactDetailMeta.code ?? 'null'}, message: ${debug.contactDetailMeta.message || '(empty)'}`,
                        `- /api/contacts/detail data keys: ${keysText(debug.contactDetailMeta.dataKeys)}`,
                        `- /api/contacts/detail: ${debug.fromContactDetail.length}`,
                        `- merged: ${debug.merged.length}`,
                        '',
                        '[contacts sample]',
                        head(debug.fromContacts),
                        '',
                        '[contacts/detail sample]',
                        head(debug.fromContactDetail),
                    ].join('\n'),
                };
            }

            if (parsed.cmd === 'approve') {
                if (!parsed.arg) {
                    return {type: 'text', content: '把审批参数 JSON 带上，例如：/cm approve {"v1":"...","v2":"...","scene":17}'};
                }
                let payload: VerifyFriendRequest;
                try {
                    const raw = JSON.parse(parsed.arg) as Record<string, unknown>;
                    if (typeof raw.v1 !== 'string' || typeof raw.v2 !== 'string' || typeof raw.scene !== 'number') {
                        return {type: 'text', content: '审批参数差字段了，要有字符串 v1/v2 和数字 scene'};
                    }
                    payload = {
                        v1: raw.v1,
                        v2: raw.v2,
                        scene: raw.scene,
                    };
                } catch {
                    return {type: 'text', content: '这 JSON 不太对 🤔'};
                }
                await ContactRepository.approveFriendRequest(apiBaseUrl, payload);
                return {type: 'text', content: '好友申请已提交 👌'};
            }

            if (parsed.cmd === 'add-group') {
                const groupId = parsed.arg.trim() || message.room?.id?.trim() || '';
                if (!groupId || !groupId.endsWith('@chatroom')) {
                    return {type: 'text', content: '给个群 ID，比如 /cm add-group 123456@chatroom；在群里直接发 /cm add-group 也行'};
                }
                await ContactRepository.addGroupAsContact(apiBaseUrl, groupId);
                await ContactRepository.addGroupToDb(env.XBOT_DB, groupId, 'manual');
                return {type: 'text', content: `好了，群加上了：${groupId} 👌`};
            }

            if (parsed.cmd === 'del-group') {
                const groupId = parsed.arg.trim() || message.room?.id?.trim() || '';
                if (!groupId || !groupId.endsWith('@chatroom')) {
                    return {type: 'text', content: '给个群 ID，比如 /cm del-group 123456@chatroom；在群里直接发 /cm del-group 也行'};
                }
                const api = new WechatApi(apiBaseUrl);
                const result = await api.setChatroomContactList(groupId, false);
                if (result.code !== 0) {
                    return {type: 'text', content: buildChatroomContactListFailureText(result)};
                }
                await ContactRepository.setContactEnabled(env.XBOT_DB, groupId, false);
                return {type: 'text', content: `好了，群撤了：${groupId}`};
            }

            if (parsed.cmd === 'add-user') {
                const userId = parsed.arg.trim();
                if (!isUserContactId(userId)) {
                    return {type: 'text', content: '给个微信号 ID，比如 /cm add-user wxid_xxx'};
                }
                await ContactRepository.addUserToDb(env.XBOT_DB, userId, 'manual');
                return {type: 'text', content: `好了，人加上了：${userId} 👌`};
            }

            if (parsed.cmd === 'disable-user') {
                const userId = parsed.arg.trim();
                if (!isUserContactId(userId)) {
                    return {type: 'text', content: '给个微信号 ID，比如 /cm disable-user wxid_xxx'};
                }
                await ContactRepository.setContactEnabled(env.XBOT_DB, userId, false);
                return {type: 'text', content: `好了，已停用白名单：${userId}（不会删微信联系人）`};
            }

            const contactId = parsed.arg.trim();
            if (!contactId) {
                return {type: 'text', content: '给个联系人 ID，比如 /cm remove wxid_xxx'};
            }

            if (contactId.endsWith('@chatroom')) {
                // 群联系人不删会话，只取消保存到通讯录。
                const api = new WechatApi(apiBaseUrl);
                const result = await api.setChatroomContactList(contactId, false);
                if (result.code !== 0) {
                    return {type: 'text', content: buildChatroomContactListFailureText(result)};
                }
            } else {
                await ContactRepository.removeContact(apiBaseUrl, contactId);
            }
            await ContactRepository.setContactEnabled(env.XBOT_DB, contactId, false);
            return {type: 'text', content: `好了，移除了：${contactId}`};
        } catch {
            return {type: 'text', content: '联系人操作没成功，再试一次吧？'};
        }
    },
};
