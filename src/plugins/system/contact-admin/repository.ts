import {WechatApi} from '../../../wechat/api.js';

type ContactType = 'user' | 'group' | 'system';

type DebugEndpointMeta = {
    code: number | null;
    message: string;
    dataKeys: string[];
};

type ApiEnvelope = {
    code?: unknown;
    message?: unknown;
    data?: unknown;
};

type ContactRecord = {
    contactId: string;
    contactType: ContactType;
    enabled: number;
    pluginDefaultMode: 'allow_all' | 'deny_all';
    displayName: string;
    alias: string;
    remark: string;
    source: string;
};

type GroupMemberRecord = {
    groupId: string;
    memberId: string;
    memberNickname: string;
    memberDisplayName: string;
    bigAvatarUrl: string;
    smallAvatarUrl: string;
    memberFlag: number;
    inviterUsername: string;
    serverVersion: number;
    infoMask: number;
    source: string;
};

/** 微信联系人管理（基于网关 API，不依赖 KV）。 */
export class ContactRepository {
    private static readonly CONTACT_DETAIL_BATCH_SIZE = 10;

    private static readonly CREATE_CONTACT_TABLE_SQL = "CREATE TABLE IF NOT EXISTS \"contact\" ("
        + 'contact_id TEXT PRIMARY KEY, '
        + 'contact_type TEXT NOT NULL, '
        + 'enabled INTEGER NOT NULL DEFAULT 1, '
        + "plugin_default_mode TEXT NOT NULL DEFAULT 'allow_all', "
        + "display_name TEXT NOT NULL DEFAULT '', "
        + "alias TEXT NOT NULL DEFAULT '', "
        + "remark TEXT NOT NULL DEFAULT '', "
        + "source TEXT NOT NULL DEFAULT 'contacts', "
        + 'created_at INTEGER NOT NULL, '
        + 'updated_at INTEGER NOT NULL'
        + ')';

    private static readonly CREATE_GROUP_MEMBER_TABLE_SQL = "CREATE TABLE IF NOT EXISTS group_member ("
        + 'group_id TEXT NOT NULL, '
        + 'member_id TEXT NOT NULL, '
        + "member_nickname TEXT NOT NULL DEFAULT '', "
        + "member_display_name TEXT NOT NULL DEFAULT '', "
        + "big_avatar_url TEXT NOT NULL DEFAULT '', "
        + "small_avatar_url TEXT NOT NULL DEFAULT '', "
        + 'member_flag INTEGER NOT NULL DEFAULT 0, '
        + "inviter_username TEXT NOT NULL DEFAULT '', "
        + 'server_version INTEGER NOT NULL DEFAULT 0, '
        + 'info_mask INTEGER NOT NULL DEFAULT 0, '
        + "source TEXT NOT NULL DEFAULT 'groups_members', "
        + 'created_at INTEGER NOT NULL, '
        + 'updated_at INTEGER NOT NULL, '
        + 'PRIMARY KEY (group_id, member_id)'
        + ')';

    static async ensureSchema(db: D1Database): Promise<void> {
        await db.prepare(ContactRepository.CREATE_CONTACT_TABLE_SQL).run();
        await db.prepare(ContactRepository.CREATE_GROUP_MEMBER_TABLE_SQL).run();
        await ContactRepository.ensureGroupMemberColumns(db);
    }

    private static async ensureGroupMemberColumns(db: D1Database): Promise<void> {
        const statements = [
            "ALTER TABLE group_member ADD COLUMN member_nickname TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE group_member ADD COLUMN member_display_name TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE group_member ADD COLUMN big_avatar_url TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE group_member ADD COLUMN small_avatar_url TEXT NOT NULL DEFAULT ''",
            'ALTER TABLE group_member ADD COLUMN member_flag INTEGER NOT NULL DEFAULT 0',
            "ALTER TABLE group_member ADD COLUMN inviter_username TEXT NOT NULL DEFAULT ''",
            'ALTER TABLE group_member ADD COLUMN server_version INTEGER NOT NULL DEFAULT 0',
            'ALTER TABLE group_member ADD COLUMN info_mask INTEGER NOT NULL DEFAULT 0',
            "ALTER TABLE group_member ADD COLUMN source TEXT NOT NULL DEFAULT 'groups_members'",
            'ALTER TABLE group_member ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0',
            'ALTER TABLE group_member ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0',
        ];

        for (const sql of statements) {
            try {
                await db.prepare(sql).run();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (!/duplicate column name/i.test(message)) {
                    throw error;
                }
            }
        }
    }

    private static normalizeId(input: unknown): string {
        if (typeof input === 'string') return input.trim();
        if (!input || typeof input !== 'object') return '';
        const obj = input as Record<string, unknown>;
        const value = obj.value;
        return typeof value === 'string' ? value.trim() : '';
    }

    private static normalizeText(input: unknown): string {
        return ContactRepository.normalizeId(input);
    }

    private static normalizeInt(input: unknown): number {
        const num = Number(input);
        return Number.isFinite(num) ? num : 0;
    }

    private static inferContactType(contactId: string): ContactType {
        if (contactId.endsWith('@chatroom')) return 'group';
        const systemIds = new Set(['weixin', 'fmessage', 'medianote', 'floatbottle']);
        if (systemIds.has(contactId) || contactId.startsWith('gh_')) return 'system';
        return 'user';
    }

    private static mapContactRecord(entry: unknown, source: string): ContactRecord | null {
        const contactId = ContactRepository.pickContactId(entry);
        if (!contactId) return null;
        const obj = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
        return {
            contactId,
            contactType: ContactRepository.inferContactType(contactId),
            enabled: 1,
            pluginDefaultMode: 'allow_all',
            displayName: ContactRepository.normalizeText(obj.nickname),
            alias: ContactRepository.normalizeText(obj.alias),
            remark: ContactRepository.normalizeText(obj.remark),
            source,
        };
    }

    private static pickContactId(entry: unknown): string {
        if (typeof entry === 'string') return entry.trim();
        if (!entry || typeof entry !== 'object') return '';
        const obj = entry as Record<string, unknown>;
        return ContactRepository.normalizeId(
            obj.username
            ?? obj.user_name
            ?? obj.wxid
            ?? obj.id
            ?? obj.userName,
        );
    }

    private static extractContactEntries(payload: unknown): unknown[] {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return [];
        const obj = payload as Record<string, unknown>;
        const candidates = [
            obj.modify_contacts,
            obj.contacts,
            obj.usernames,
            obj.contact_list,
            obj.list,
            obj.items,
            obj.data,
        ];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
        }
        return [];
    }

    private static extractContactDetailEntries(payload: unknown): unknown[] {
        if (!payload || typeof payload !== 'object') return [];
        const obj = payload as Record<string, unknown>;
        const list = obj.contact_list;
        return Array.isArray(list) ? list : [];
    }

    private static extractGroupMemberEntries(payload: unknown): {
        serverVersion: number;
        infoMask: number;
        list: unknown[];
    } {
        if (!payload || typeof payload !== 'object') {
            return {serverVersion: 0, infoMask: 0, list: []};
        }
        const data = payload as Record<string, unknown>;
        const result = data.result && typeof data.result === 'object'
            ? data.result as Record<string, unknown>
            : null;
        const list = Array.isArray(result?.list)
            ? result.list
            : Array.isArray(data.list)
                ? data.list
                : [];
        return {
            serverVersion: ContactRepository.normalizeInt(data.server_version),
            infoMask: ContactRepository.normalizeInt(result?.info_mask),
            list,
        };
    }

    private static mapGroupMemberRecord(
        groupId: string,
        entry: unknown,
        serverVersion: number,
        infoMask: number,
        source: string,
    ): GroupMemberRecord | null {
        if (!entry || typeof entry !== 'object') return null;
        const obj = entry as Record<string, unknown>;
        const memberId = ContactRepository.normalizeId(
            obj.username ?? obj.user_name ?? obj.wxid ?? obj.id ?? obj.userName,
        );
        if (!memberId) return null;
        return {
            groupId,
            memberId,
            memberNickname: ContactRepository.normalizeText(obj.nickname),
            memberDisplayName: ContactRepository.normalizeText(obj.display_name),
            bigAvatarUrl: ContactRepository.normalizeText(obj.big_avatar_url),
            smallAvatarUrl: ContactRepository.normalizeText(obj.small_avatar_url),
            memberFlag: ContactRepository.normalizeInt(obj.flag ?? obj.chatroom_member_flag),
            inviterUsername: ContactRepository.normalizeText(obj.inviter_username),
            serverVersion,
            infoMask,
            source,
        };
    }

    private static chunkArray<T>(items: T[], size: number): T[][] {
        if (size <= 0) return [items];
        const chunks: T[][] = [];
        for (let index = 0; index < items.length; index += size) {
            chunks.push(items.slice(index, index + size));
        }
        return chunks;
    }

    private static toContactIds(entries: unknown[]): string[] {
        return Array.from(new Set(entries
            .map((item) => ContactRepository.pickContactId(item))
            .filter(Boolean)));
    }

    private static toContactRecords(entries: unknown[], source: string): ContactRecord[] {
        const records = entries
            .map((entry) => ContactRepository.mapContactRecord(entry, source))
            .filter((item): item is ContactRecord => Boolean(item));
        const merged = new Map<string, ContactRecord>();
        for (const record of records) {
            merged.set(record.contactId, record);
        }
        return Array.from(merged.values());
    }

    static async upsertContacts(db: D1Database, contacts: ContactRecord[]): Promise<void> {
        await ContactRepository.ensureSchema(db);
        if (contacts.length === 0) return;
        const now = Date.now();
        const statements = contacts.map((contact) =>
            db.prepare(
                `INSERT INTO contact (
                    contact_id, contact_type, enabled, plugin_default_mode,
                    display_name, alias, remark, source, created_at, updated_at
                ) VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
                ON CONFLICT(contact_id) DO UPDATE SET
                    contact_type = excluded.contact_type,
                    display_name = CASE WHEN excluded.display_name <> '' THEN excluded.display_name ELSE contact.display_name END,
                    alias = CASE WHEN excluded.alias <> '' THEN excluded.alias ELSE contact.alias END,
                    remark = CASE WHEN excluded.remark <> '' THEN excluded.remark ELSE contact.remark END,
                    source = excluded.source,
                    updated_at = excluded.updated_at`,
            ).bind(
                contact.contactId,
                contact.contactType,
                contact.pluginDefaultMode,
                contact.displayName,
                contact.alias,
                contact.remark,
                contact.source,
                now,
            ),
        );
        await db.batch(statements);
    }

    static async upsertGroupMembers(db: D1Database, members: GroupMemberRecord[]): Promise<void> {
        await ContactRepository.ensureSchema(db);
        if (members.length === 0) return;
        const now = Date.now();
        const statements = members.map((member) =>
            db.prepare(
                `INSERT INTO group_member (
                    group_id, member_id, member_nickname, member_display_name,
                    big_avatar_url, small_avatar_url, member_flag, inviter_username,
                    server_version, info_mask, source, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
                ON CONFLICT(group_id, member_id) DO UPDATE SET
                    member_nickname = CASE WHEN excluded.member_nickname <> '' THEN excluded.member_nickname ELSE group_member.member_nickname END,
                    member_display_name = CASE WHEN excluded.member_display_name <> '' THEN excluded.member_display_name ELSE group_member.member_display_name END,
                    big_avatar_url = CASE WHEN excluded.big_avatar_url <> '' THEN excluded.big_avatar_url ELSE group_member.big_avatar_url END,
                    small_avatar_url = CASE WHEN excluded.small_avatar_url <> '' THEN excluded.small_avatar_url ELSE group_member.small_avatar_url END,
                    member_flag = excluded.member_flag,
                    inviter_username = CASE WHEN excluded.inviter_username <> '' THEN excluded.inviter_username ELSE group_member.inviter_username END,
                    server_version = excluded.server_version,
                    info_mask = excluded.info_mask,
                    source = excluded.source,
                    updated_at = excluded.updated_at`,
            ).bind(
                member.groupId,
                member.memberId,
                member.memberNickname,
                member.memberDisplayName,
                member.bigAvatarUrl,
                member.smallAvatarUrl,
                member.memberFlag,
                member.inviterUsername,
                member.serverVersion,
                member.infoMask,
                member.source,
                now,
            ),
        );
        await db.batch(statements);
    }

    static async listFromDb(db: D1Database, includeDisabled = false): Promise<Array<{
        contactId: string;
        contactType: string;
        enabled: number;
        displayName: string;
    }>> {
        await ContactRepository.ensureSchema(db);
        const rows = includeDisabled
            ? await db.prepare(
                `SELECT contact_id, contact_type, enabled, display_name
                 FROM contact
                 ORDER BY contact_type ASC, contact_id ASC`,
            ).all<Record<string, unknown>>()
            : await db.prepare(
                `SELECT contact_id, contact_type, enabled, display_name
                 FROM contact
                 WHERE enabled = 1
                 ORDER BY contact_type ASC, contact_id ASC`,
            ).all<Record<string, unknown>>();
        return (rows.results ?? []).map((row) => ({
            contactId: String(row.contact_id ?? ''),
            contactType: String(row.contact_type ?? ''),
            enabled: Number(row.enabled ?? 0) || 0,
            displayName: String(row.display_name ?? ''),
        }));
    }

    static async setContactEnabled(db: D1Database, contactId: string, enabled: boolean): Promise<void> {
        await ContactRepository.ensureSchema(db);
        await db.prepare(
            `UPDATE contact
             SET enabled = ?2,
                 updated_at = ?3
             WHERE contact_id = ?1`,
        ).bind(contactId.trim(), enabled ? 1 : 0, Date.now()).run();
    }

    static async addGroupToDb(db: D1Database, groupId: string, source = 'manual'): Promise<void> {
        const trimmed = groupId.trim();
        if (!trimmed) return;
        await ContactRepository.upsertContacts(db, [
            {
                contactId: trimmed,
                contactType: 'group',
                enabled: 1,
                pluginDefaultMode: 'allow_all',
                displayName: '',
                alias: '',
                remark: '',
                source,
            },
        ]);
    }

    static async debugFetch(apiBaseUrl: string): Promise<{
        contactsMeta: DebugEndpointMeta;
        contactsAllMeta: DebugEndpointMeta;
        fromContacts: string[];
        fromContactsAll: string[];
        merged: string[];
    }> {
        const api = new WechatApi(apiBaseUrl);

        const syncResult = await api.getContacts({contact_seq: 0, group_seq: 0});
        ContactRepository.ensureSuccess('getContacts', syncResult);
        const syncEntries = ContactRepository.extractContactEntries(syncResult.data);
        const fromContacts = ContactRepository.toContactIds(syncEntries);
        const syncEnvelope = syncResult as ApiEnvelope;

        const allResult = await api.getAllContacts({
            contact_seq: 0,
            group_seq: 0,
            offset: 0,
            limit: 5000,
        });
        ContactRepository.ensureSuccess('getAllContacts', allResult);
        const allEntries = ContactRepository.extractContactEntries(allResult.data);
        const fromContactsAll = ContactRepository.toContactIds(allEntries);
        const allEnvelope = allResult as ApiEnvelope;

        const toMeta = (result: ApiEnvelope): DebugEndpointMeta => {
            const code = typeof result.code === 'number' ? result.code : null;
            const message = typeof result.message === 'string' ? result.message : '';
            const data = result.data;
            const dataKeys = data && typeof data === 'object' && !Array.isArray(data)
                ? Object.keys(data as Record<string, unknown>).slice(0, 20)
                : [];
            return {code, message, dataKeys};
        };

        return {
            contactsMeta: toMeta(syncEnvelope),
            contactsAllMeta: toMeta(allEnvelope),
            fromContacts,
            fromContactsAll,
            merged: Array.from(new Set([...fromContacts, ...fromContactsAll])),
        };
    }

    static async syncToDb(db: D1Database, apiBaseUrl: string): Promise<{
        total: number;
        users: number;
        groups: number;
        systems: number;
        groupMembers: number;
        memberSyncedGroups: number;
    }> {
        await ContactRepository.ensureSchema(db);
        const api = new WechatApi(apiBaseUrl);
        const [syncResult, allResult] = await Promise.all([
            api.getContacts({contact_seq: 0, group_seq: 0}),
            api.getAllContacts({contact_seq: 0, group_seq: 0, offset: 0, limit: 5000}),
        ]);
        ContactRepository.ensureSuccess('getContacts', syncResult);
        ContactRepository.ensureSuccess('getAllContacts', allResult);

        const syncEntries = ContactRepository.extractContactEntries(syncResult.data);
        const allEntries = ContactRepository.extractContactEntries(allResult.data);
        const mergedIds = ContactRepository.toContactIds([...syncEntries, ...allEntries]);
        const detailEntries = await ContactRepository.fetchContactDetailEntries(api, mergedIds);
        const records = detailEntries.length > 0
            ? ContactRepository.toContactRecords(detailEntries, 'contacts_detail')
            : ContactRepository.toContactRecords([...syncEntries, ...allEntries], 'contacts');
        await ContactRepository.upsertContacts(db, records);

        const groupIds = records.filter((item) => item.contactType === 'group').map((item) => item.contactId);
        const memberRecords = await ContactRepository.fetchGroupMembersByGroups(api, groupIds);
        await ContactRepository.upsertGroupMembers(db, memberRecords);

        let users = 0;
        let groups = 0;
        let systems = 0;
        for (const record of records) {
            if (record.contactType === 'user') users += 1;
            else if (record.contactType === 'group') groups += 1;
            else systems += 1;
        }
        return {
            total: records.length,
            users,
            groups,
            systems,
            groupMembers: memberRecords.length,
            memberSyncedGroups: groupIds.length,
        };
    }

    private static async fetchContactDetailEntries(api: WechatApi, contactIds: string[]): Promise<unknown[]> {
        const ids = Array.from(new Set(contactIds.map((item) => item.trim()).filter(Boolean)));
        const merged = new Map<string, unknown>();

        // 优先按联系人 ID 分批拉取详情，避免一次请求参数过大。
        for (const batch of ContactRepository.chunkArray(ids, ContactRepository.CONTACT_DETAIL_BATCH_SIZE)) {
            // 网关兼容行为：群 ID 也通过 usernames 传递（例如 123@chatroom）。
            const result = await api.getContactDetail({usernames: batch});
            ContactRepository.ensureSuccess('getContactDetail', result);
            const entries = ContactRepository.extractContactDetailEntries(result.data);
            for (const entry of entries) {
                const id = ContactRepository.pickContactId(entry);
                if (id) merged.set(id, entry);
            }
        }

        // 当上游联系人列表未返回 ID 时，尝试无参数调用获取详情全集。
        if (ids.length === 0) {
            const result = await api.getContactDetail({});
            ContactRepository.ensureSuccess('getContactDetail', result);
            const entries = ContactRepository.extractContactDetailEntries(result.data);
            for (const entry of entries) {
                const id = ContactRepository.pickContactId(entry);
                if (id) merged.set(id, entry);
            }
        }

        return Array.from(merged.values());
    }

    private static async fetchGroupMembersByGroups(api: WechatApi, groupIds: string[]): Promise<GroupMemberRecord[]> {
        const uniqueGroupIds = Array.from(new Set(groupIds.map((id) => id.trim()).filter(Boolean)));
        const records: GroupMemberRecord[] = [];
        for (const groupId of uniqueGroupIds) {
            const result = await api.getGroupMembers(groupId);
            ContactRepository.ensureSuccess('getGroupMembers', result);
            const {serverVersion, infoMask, list} = ContactRepository.extractGroupMemberEntries(result.data);
            for (const entry of list) {
                const record = ContactRepository.mapGroupMemberRecord(
                    groupId,
                    entry,
                    serverVersion,
                    infoMask,
                    'groups_members',
                );
                if (record) records.push(record);
            }
        }
        const merged = new Map<string, GroupMemberRecord>();
        for (const record of records) {
            merged.set(`${record.groupId}::${record.memberId}`, record);
        }
        return Array.from(merged.values());
    }

    private static async fetchAllContacts(apiBaseUrl: string): Promise<string[]> {
        const debug = await ContactRepository.debugFetch(apiBaseUrl);
        return debug.merged;
    }

    private static ensureSuccess(op: string, result: unknown): void {
        const payload = result as {code?: unknown; message?: unknown};
        if (typeof payload.code === 'number' && payload.code !== 0) {
            throw new Error(`${op} failed: code=${payload.code}, message=${String(payload.message ?? '')}`);
        }
    }

    static async list(apiBaseUrl: string): Promise<string[]> {
        return ContactRepository.fetchAllContacts(apiBaseUrl);
    }

    static async removeContact(apiBaseUrl: string, username: string): Promise<void> {
        const api = new WechatApi(apiBaseUrl);
        const result = await api.deleteContact(username.trim());
        ContactRepository.ensureSuccess('deleteContact', result);
    }

    static async addGroupAsContact(apiBaseUrl: string, groupId: string): Promise<void> {
        const api = new WechatApi(apiBaseUrl);
        const result = await api.setGroupContactList(groupId.trim(), true);
        ContactRepository.ensureSuccess('setGroupContactList', result);
    }

    static async approveFriendRequest(apiBaseUrl: string, payload: Record<string, unknown>): Promise<void> {
        const api = new WechatApi(apiBaseUrl);
        const result = await api.verifyFriendRequest(payload);
        ContactRepository.ensureSuccess('verifyFriendRequest', result);
    }

    static async isGroupContactAllowed(db: D1Database, roomId: string): Promise<boolean> {
        await ContactRepository.ensureSchema(db);
        const row = await db
            .prepare(
                `SELECT 1 AS ok
                 FROM contact
                 WHERE contact_id = ?1
                   AND contact_type = 'group'
                   AND enabled = 1
                 LIMIT 1`,
            )
            .bind(roomId.trim())
            .first<Record<string, unknown>>();
        return Boolean(row?.ok);
    }
}

