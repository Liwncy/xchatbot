import type {DirectoryPerson} from '../../../adapter/types.js';
import {chatRecordReply, type ChatRecordReply} from '../../../core/reply.js';

const GUIDE_AVATAR_URL = 'https://wx.qlogo.cn/mmhead/ver_1/t4vmY8hTfx0rJnTygqKyIIX9PicUDwaEhib5Ex843gTJk7UVSKTcic4mlPt9rq2U7vMOJdXdHpdOSXoL0Ez8CicxWB3ojMh107wzggmTmKQn4bnxcL6lDVKx0mX91koST8x2/132';

export function buildRandomFriendCard(
    candidate: DirectoryPerson,
    phone: string,
    timestampMs: number,
    guideName: string,
): ChatRecordReply {
    const guide = guideName.trim() || '小聪明儿';
    return chatRecordReply(
        [
            {
                nickname: guide,
                avatarUrl: GUIDE_AVATAR_URL,
                content: '💌 悄悄递你一张缘分小纸条，先看看这位有没有合你的眼缘。\n💕 资料我已经替你整理成好读的小卡片啦。',
                timestampMs,
            },
            {
                nickname: candidate.nickname,
                avatarUrl: candidate.avatarUrl,
                content: buildProfileSummary(candidate, phone),
                timestampMs: timestampMs + 1000,
            },
            {
                nickname: guide,
                avatarUrl: GUIDE_AVATAR_URL,
                content: `🌙 要是觉得有点心动，就复制手机号 ${phone}，去微信里搜一下，顺手问一句“处吗？宝贝😘”，万一真成了呢。\n🍀 说不定这次，真能顺手牵出一段小缘分。`,
                timestampMs: timestampMs + 2000,
            },
        ],
        {
            title: '💘 月老小纸条',
            summary: `替你牵来一段缘分：${candidate.nickname}`,
            desc: `✨ 资料已经替你整理好啦，可复制手机号 ${phone} 自行搜索`,
        },
    );
}

export function buildProfileSummary(candidate: DirectoryPerson, phone: string): string {
    return [
        `📛 昵称：${candidate.nickname}`,
        `📱 手机号：${phone}`,
        `🔎 微信号：${candidate.alias?.trim() || '未公开'}`,
        `🧍 性别：${genderLabel(candidate.gender)}`,
        `🌍 地区：${candidate.region?.trim() || '未填写'}`,
        `🪪 关系：${candidate.id.endsWith('@stranger') ? '目前还没有加上好友' : '已经在联系人范围里了'}`,
        `✨ 账号感觉：${candidate.verified ? '像是带一点特别身份的账号' : '看起来是普通个人账号'}`,
        `📝 个签：${candidate.sign?.trim() || '这个人还没留下个性签名'}`,
        `💭 小印象：${impression(candidate)}`,
    ].join('\n');
}

function genderLabel(gender: number | undefined): string {
    if (gender === 1) return '男';
    if (gender === 2) return '女';
    return '未知';
}

function impression(candidate: DirectoryPerson): string {
    if (candidate.verified) return '看起来像是自带一点特别身份光环。';
    if (candidate.region?.trim()) return '像是在人海里刚好被月老翻到的一张小卡片。';
    return '资料不算张扬，留一点想象空间也挺好。';
}
