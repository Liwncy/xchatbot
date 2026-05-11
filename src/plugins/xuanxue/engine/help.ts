/** 动态生成玄学帮助列表 */

import type {XuanxueRule} from '../types.js';

export function buildHelpText(rules: XuanxueRule[]): string {
    const grouped = new Map<string, string[]>();

    for (const rule of rules) {
        if (rule.enabled === false || !rule.helpEntry) continue;
        const category = rule.helpCategory?.trim() || '其他功能';
        const list = grouped.get(category) ?? [];
        list.push(rule.helpEntry);
        grouped.set(category, list);
    }

    const entries: string[] = [];
    for (const [category, list] of grouped.entries()) {
        entries.push(`【${category}】`);
        entries.push(...list);
    }

    return [
        '🔮 玄学功能指令一览',
        '━━━━━━━━━━━━━━',
        ...entries,
        '━━━━━━━━━━━━━━',
        '💡 发送对应【关键词0】可查看详细用法',
        '',
        '📜 测算告诫',
        '1. 测算结果若是理想，固然是一件可喜可贺的事情；如果测算结果不理想，缘主也不必灰心。缘主的命运，即便算得再准，也还是需要缘主自己去把握。算命的目的是为了趋吉避凶，顺势而行。',
        '',
        '2. 正所谓一命二运三风水，四积阴德五读书，六名七相八敬神，九交贵人十修身。平时积善行德，心存善念，必有善行，善念善行，天必佑之。',
    ].join('\n');
}

