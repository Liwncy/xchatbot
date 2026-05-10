/** 动态生成玄学帮助列表 */

import type {XuanxueRule} from '../types.js';

export function buildHelpText(rules: XuanxueRule[]): string {
    const entries = rules
        .filter((r) => r.enabled !== false && r.helpEntry)
        .map((r) => `${r.helpEntry}`);

    return [
        '🔮 玄学功能指令一览',
        '━━━━━━━━━━━━━━',
        ...entries,
        '━━━━━━━━━━━━━━',
        '💡 发送对应关键词可查看详细用法',
        '⚠️ 测算结果仅供娱乐参考，请勿迷信。',
    ].join('\n');
}

