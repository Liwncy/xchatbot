/** 动态生成玄学帮助列表 */

import type {XuanxueRule} from '../types.js';
import type {BaziParsedResult} from '../parsers/bazi.js';

const CATEGORY_PRIORITY: string[] = [
    '测算姓名',
    '缘份配对',
    '测算吉凶',
    '运势预测',
    '八字命理',
    '合盘配对',
    '风水堪舆',
    '玄学排盘',
    '算卦占卜',
    '灵签抽签',
    '其他功能',
];

function getCategoryOrderValue(category: string): number {
    const idx = CATEGORY_PRIORITY.indexOf(category);
    return idx >= 0 ? idx : CATEGORY_PRIORITY.length + 1;
}

const RULE_PRIORITY_BY_CATEGORY: Record<string, Record<string, number>> = {
    '测算姓名': {
        'xuanxue-xingming-dafen': 1,
        'xuanxue-online-qiming': 2,
        'xuanxue-qiming-dafen': 3,
        'xuanxue-gongsi-dafen': 4,
    },
    '缘份配对': {
        'xuanxue-xingzuo-peidui': 1,
        'xuanxue-shengxiao-peidui': 2,
        'xuanxue-xingming-peidui': 3,
        'xuanxue-shengri-peidui': 4,
        'xuanxue-xuexing-peidui': 5,
    },
    '测算吉凶': {
        'xuanxue-laohuangli-chaxun': 1,
        'xuanxue-zeshi-chaxun': 2,
        'xuanxue-xingzuo-daily': 3,
        'xuanxue-shuzi-jixiong': 4,
    },
    '八字命理': {
        'xuanxue-bazi-calc': 1,
        'xuanxue-bazi-daily-fortune': 2,
        'xuanxue-bazi-jingsuan': 3,
        'xuanxue-bazi-paipan': 4,
        'xuanxue-bazi-jingpan': 5,
        'xuanxue-bazi-caiyun': 6,
        'xuanxue-bazi-weilai': 7,
    },
};

function getRuleOrderValue(category: string, ruleName: string): number {
    const mapping = RULE_PRIORITY_BY_CATEGORY[category];
    if (!mapping) return Number.MAX_SAFE_INTEGER;
    return mapping[ruleName] ?? Number.MAX_SAFE_INTEGER;
}

function collectGroupedHelp(rules: XuanxueRule[]): Array<{category: string; entries: string[]}> {
    const grouped = new Map<string, Array<{name: string; entry: string}>>();

    for (const rule of rules) {
        if (rule.enabled === false || !rule.helpEntry) continue;
        const category = rule.helpCategory?.trim() || '其他功能';
        const list = grouped.get(category) ?? [];
        list.push({name: rule.name, entry: rule.helpEntry});
        grouped.set(category, list);
    }

    return [...grouped.entries()]
        .sort((a, b) => {
            const pa = getCategoryOrderValue(a[0]);
            const pb = getCategoryOrderValue(b[0]);
            if (pa !== pb) return pa - pb;
            return a[0].localeCompare(b[0], 'zh-CN');
        })
        .map(([category, entries]) => ({
            category,
            entries: entries
                .sort((a, b) => {
                    const pa = getRuleOrderValue(category, a.name);
                    const pb = getRuleOrderValue(category, b.name);
                    if (pa !== pb) return pa - pb;
                    return a.entry.localeCompare(b.entry, 'zh-CN');
                })
                .map((item) => item.entry),
        }));
}

export function buildHelpText(rules: XuanxueRule[]): string {
    const grouped = collectGroupedHelp(rules);

    const entries: string[] = [];
    for (const group of grouped) {
        const category = group.category;
        const list = group.entries;
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

/** 返回转发消息结构：每个分类一个 section，末尾附测算告诫 */
export function buildHelpParsedResult(rules: XuanxueRule[]): BaziParsedResult {
    const grouped = collectGroupedHelp(rules);

    const sections = grouped.map((group) => ({
        title: group.category,
        content: group.entries.join('\n'),
    }));

    sections.push({
        title: '📜 测算告诫',
        content: [
            '1. 测算结果若是理想，固然是一件可喜可贺的事情；如果测算结果不理想，缘主也不必灰心。缘主的命运，即便算得再准，也还是需要缘主自己去把握。算命的目的是为了趋吉避凶，顺势而行。',
            '',
            '2. 正所谓一命二运三风水，四积阴德五读书，六名七相八敬神，九交贵人十修身。平时积善行德，心存善念，必有善行，善念善行，天必佑之。',
        ].join('\n'),
    });

    return {
        summary: ['💡 发送对应【关键词】可查看用法和参数格式'],
        sections,
    };
}
