/** 回复构建器：text 回退 + forward 卡片（八字 / 合婚） */

import {renderTemplateString} from '../../common/shared.js';
import {buildWechatChatRecordAppReply} from '../../../wechat/chat-record.js';
import {withSectionEmoji, withSummaryEmoji, beautifySectionContent, HEHUN_SCORE_EMOJI} from '../lib/format.js';
import {renderTableImageUrl, renderTableSvgDataUrl} from '../lib/table-image.js';
import type {BaziParsedResult} from '../parsers/bazi.js';
import type {HeHunParsedResult, HeHunPersonInfo} from '../parsers/hehun.js';
import type {XuanxueRule} from '../types.js';
import type {IncomingMessage, ImageReply} from '../../../types/message.js';

const MAX_REPLY_LENGTH = 1800;

function withGroupSenderInTitle(message: IncomingMessage, baseTitle: string): string {
    if (message.source !== 'group') return baseTitle;
    const sender = (message.senderName ?? '').trim() || message.from;
    if (!sender) return baseTitle;
    return `${baseTitle}【${sender}】`;
}

export function finalizeReply(rule: XuanxueRule, result: string, params: Record<string, string>): string {
    const text = rule.replyTemplate
        ? renderTemplateString(rule.replyTemplate, {...params, result}, false)
        : result;
    return text.length > MAX_REPLY_LENGTH ? `${text.slice(0, MAX_REPLY_LENGTH)}\n...(已截断)` : text;
}

export function buildForwardReply(
    message: IncomingMessage,
    rule: XuanxueRule,
    parsed: BaziParsedResult | HeHunParsedResult,
    params: Record<string, string>,
) {
    if ('male' in parsed) {
        return buildHeHunForwardReply(message, rule, parsed);
    }
    return buildBaziForwardReply(message, rule, parsed, params);
}

export function buildTableImageReplies(
    rule: XuanxueRule,
    parsed: BaziParsedResult | HeHunParsedResult,
): ImageReply[] {
    // 仅对合盘/合婚/排盘生成表格图片，其他玄学规则不额外发图
    const isTableRule =
        rule.name.includes('hehun') || rule.name.includes('hepan') || rule.name.includes('paipan');
    if (!isTableRule) return [];

    if ('male' in parsed) {
        const maleLines = formatTableRows(parsed.male.tableRows)
            .map((line) => line.trimStart())
            .filter(Boolean);
        const femaleLines = formatTableRows(parsed.female.tableRows)
            .map((line) => line.trimStart())
            .filter(Boolean);

        const replies: ImageReply[] = [];
        if (maleLines.length > 0) {
            const imageUrl = renderTableImageUrl('命盘表格（甲/男方）', maleLines);
            replies.push({type: 'image', mediaId: renderTableSvgDataUrl('命盘表格（甲/男方）', maleLines), originalUrl: imageUrl});
        }
        if (femaleLines.length > 0) {
            const imageUrl = renderTableImageUrl('命盘表格（乙/女方）', femaleLines);
            replies.push({type: 'image', mediaId: renderTableSvgDataUrl('命盘表格（乙/女方）', femaleLines), originalUrl: imageUrl});
        }
        return replies;
    }

    // 八字排盘：抽取包含表格框线的 section 内容转图
    const imageReplies: ImageReply[] = [];
    for (const section of parsed.sections) {
        if (!section.content.includes('┌') && !section.content.includes('│')) continue;
        const lines = section.content
            .split('\n')
            .map((line) => line.trimEnd())
            .filter(Boolean);
        if (lines.length === 0) continue;
        const imageUrl = renderTableImageUrl(section.title, lines);
        imageReplies.push({
            type: 'image',
            mediaId: renderTableSvgDataUrl(section.title, lines),
            originalUrl: imageUrl,
        });
    }

    return imageReplies.slice(0, 2);
}

function buildBaziForwardReply(
    message: IncomingMessage,
    rule: XuanxueRule,
    parsed: BaziParsedResult,
    params: Record<string, string>,
) {
    const avatarUrl = rule.forwardAvatarUrl?.trim() || undefined;
    const rawSummaryLines =
        parsed.summary.length > 0
            ? parsed.summary
            : [`缘主姓名：${params.name ?? params.senderName ?? '未知'}`];
    const previewImageUrl = parsed.previewImageUrl?.trim();
    if (previewImageUrl) {
        rawSummaryLines.push(`🖼 结果配图：${previewImageUrl}`);
    }
    const summaryLines = rawSummaryLines.map((line) => withSummaryEmoji(line));

    const items = [
        {
            nickname: withSectionEmoji('基本信息'),
            content: summaryLines.join('\n'),
            avatarUrl,
            timestampMs: message.timestamp * 1000,
        },
        ...parsed.sections.map((section, index) => ({
            nickname: withSectionEmoji(section.title),
            content: formatBaziSectionContent(section.content),
            avatarUrl,
            timestampMs: message.timestamp * 1000 + (index + 1) * 1000,
        })),
    ];

    return buildWechatChatRecordAppReply({
        title: withGroupSenderInTitle(message, `🔮 ${rule.forwardTitle?.trim() || '八字测算结果'}`),
        summary: summaryLines.join('  '),
        desc: '八字核心结果摘要',
        items,
        isChatRoom: message.source === 'group',
    });
}

function formatBaziSectionContent(content: string): string {
    const normalized = content.trim();
    if (!normalized) return '暂无内容';

    // 对于排盘表格/多行结构内容，尽量保留原始排版。
    if (normalized.includes('\n') || /[┌└│]/.test(normalized)) {
        return normalized.length > 1800 ? `${normalized.slice(0, 1800)}...` : normalized;
    }

    return beautifySectionContent(normalized);
}

function formatPersonLines(info: HeHunPersonInfo): string {
    const basicLines = info.lines.map((l) => `• ${l}`);
    const tableLines = info.tableRows.length > 0 ? formatTableRows(info.tableRows) : [];
    return [...basicLines, ...tableLines].join('\n') || `• ${info.name}`;
}

function formatTableRows(rows: string[]): string[] {
    const parsed = rows
        .map((row) => row.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean))
        .filter((cells) => cells.length > 0);

    if (parsed.length === 0) return [];

    const maxCols = Math.max(...parsed.map((cells) => cells.length));
    const matrix = parsed.map((cells) =>
        Array.from({length: maxCols}, (_, i) => cells[i] ?? '—'),
    );

    const colWidths = Array.from({length: maxCols}, () => 0);
    for (const row of matrix) {
        row.forEach((cell, idx) => {
            colWidths[idx] = Math.max(colWidths[idx], getDisplayWidth(cell));
        });
    }

    const rowTexts = matrix.map((cells) =>
        cells.map((cell, col) => padDisplay(cell, colWidths[col])).join(' ｜ '),
    );
    const rowWidth = Math.max(...rowTexts.map((r) => getDisplayWidth(r)));
    const top = `┌${'─'.repeat(rowWidth + 2)}`;
    const bottom = `└${'─'.repeat(rowWidth + 2)}`;

    const lines: string[] = ['\n📋 八字命盘', top];
    rowTexts.forEach((row) => {
        lines.push(`│ ${padDisplay(row, rowWidth)}`);
    });
    lines.push(bottom);
    return lines;
}

function getDisplayWidth(text: string): number {
    let width = 0;
    for (const ch of text) {
        width += /[\u0000-\u00ff]/.test(ch) ? 1 : 2;
    }
    return width;
}

function padDisplay(text: string, targetWidth: number): string {
    const pad = Math.max(0, targetWidth - getDisplayWidth(text));
    return `${text}${' '.repeat(pad)}`;
}



function buildHeHunForwardReply(
    message: IncomingMessage,
    rule: XuanxueRule,
    parsed: HeHunParsedResult,
) {
    const avatarUrl = rule.forwardAvatarUrl?.trim() || undefined;
    const ts = message.timestamp * 1000;
    const isHePan = rule.name.includes('hepan');
    const leftLabel = isHePan ? '甲方' : '男方';
    const rightLabel = isHePan ? '乙方' : '女方';
    const relationEmoji = isHePan ? '🤝' : '❤️';
    const titleEmoji = isHePan ? '🤝' : '💑';
    const descText = isHePan ? '八字合盘测算结果' : '八字合婚测算结果';

    const maleItem = {
        nickname: `👤 ${leftLabel}命盘`,
        content: formatPersonLines(parsed.male),
        avatarUrl,
        timestampMs: ts,
    };
    const femaleItem = {
        nickname: `👤 ${rightLabel}命盘`,
        content: formatPersonLines(parsed.female),
        avatarUrl,
        timestampMs: ts + 1000,
    };

    const scoreItems = parsed.scores.map((item, idx) => ({
        nickname: `${HEHUN_SCORE_EMOJI[item.label] ?? '📊'} ${item.label}  ${item.score}`,
        content: beautifySectionContent(item.detail, 8, 1200) || '暂无详情',
        avatarUrl,
        timestampMs: ts + (idx + 2) * 1000,
    }));

    const totalItem = {
        nickname: '🏆 综合评分',
        content: `总分：${parsed.totalScore || '未知'}\n💞 ${parsed.male.name} ${relationEmoji} ${parsed.female.name}`,
        avatarUrl,
        timestampMs: ts + (scoreItems.length + 2) * 1000,
    };

    return buildWechatChatRecordAppReply({
        title: withGroupSenderInTitle(message, `${titleEmoji} ${rule.forwardTitle?.trim() || (isHePan ? '八字合盘结果' : '八字合婚结果')}`),
        summary: `${parsed.male.name} ${relationEmoji} ${parsed.female.name}  总分 ${parsed.totalScore}`,
        desc: descText,
        items: [maleItem, femaleItem, ...scoreItems, totalItem],
        isChatRoom: message.source === 'group',
    });
}

