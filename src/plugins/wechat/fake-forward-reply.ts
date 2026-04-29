import type {FakeForwardDraft} from './fake-forward-types.js';

function formatRoleLine(id: string, name: string): string {
    return `- ${id}：${name}`;
}

function formatChatLine(index: number, line: string): string {
    return `${index}. ${line}`;
}

export function buildFakeForwardStartedText(title: string): string {
    return [
        '已开始伪转发草稿。',
        `标题：${title}`,
        '请先使用“伪转发 角色 角色ID 姓名 [头像URL]”定义角色。',
        '然后使用“伪转发 聊天 角色ID 时间 内容”追加聊天项。',
        '2 分钟无新命令将自动发送。',
    ].join('\n');
}

export function buildFakeForwardRoleText(roleId: string, roleName: string, avatarUrl?: string): string {
    const lines = [`已定义角色 ${roleId}：${roleName}`];
    if (avatarUrl) {
        lines.push(`头像：${avatarUrl}`);
    }
    return lines.join('\n');
}

export function buildFakeForwardChatAddedText(seq: number, roleId: string, timeText: string, content: string): string {
    return [
        `已添加第 ${seq} 条：${roleId} ${timeText} ${content}`,
        '2 分钟无新命令将自动发送。',
    ].join('\n');
}

export function buildFakeForwardRevokeText(remainingItems: number): string {
    return `已撤回最后一条聊天项，当前还剩 ${remainingItems} 条。`;
}

export function buildFakeForwardCancelledText(): string {
    return '已取消当前伪转发草稿。';
}

export function buildFakeForwardPreviewText(draft: FakeForwardDraft, displayItems: string[]): string {
    const roleEntries = Object.values(draft.roles);
    const lines = [
        '【伪转发草稿预览】',
        `标题：${draft.title}`,
        '角色：',
        ...(roleEntries.length > 0
            ? roleEntries.map((role) => formatRoleLine(role.id, role.name))
            : ['- （暂无角色）']),
        `聊天项：${draft.items.length}`,
        ...(displayItems.length > 0
            ? displayItems.map((line, index) => formatChatLine(index + 1, line))
            : ['- （暂无聊天项）']),
        '输入“伪转发 结束”立即发出，或等待 2 分钟自动发送。',
    ];
    return lines.join('\n');
}

export function buildFakeForwardNoDraftText(): string {
    return '当前没有活跃的伪转发草稿，请先发送“伪转发 开始”。';
}

export function buildFakeForwardAlreadyStartedText(title: string): string {
    return `当前已有未完成草稿：${title}\n可继续编辑，或发送“伪转发 取消”后重新开始。`;
}

export function buildFakeForwardHelpText(): string {
    return [
        '伪转发支持以下命令：',
        '1. 伪转发 开始 [标题]',
        '2. 伪转发 角色 <角色ID> <姓名> [头像URL]',
        '3. 伪转发 聊天 <角色ID> <时间> <内容>',
        '4. 伪转发 预览',
        '5. 伪转发 撤回',
        '6. 伪转发 结束',
        '7. 伪转发 取消',
    ].join('\n');
}


