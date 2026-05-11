/**
 * 玄学插件入口
 *
 * 目录结构：
 *   lib/html.ts        HTML 工具（stripHtml / normalizeBasicValue 等）
 *   lib/format.ts      格式化工具（emoji / beautifySectionContent 等）
 *   parsers/bazi.ts    八字测算 / 精算解析器
 *   parsers/hehun.ts   八字合婚解析器
 *   engine/matcher.ts  关键词匹配 / 参数提取 / 参数归一化
 *   engine/fetcher.ts  HTTP 请求器
 *   engine/parser.ts   解析分发器
 *   engine/reply.ts    回复构建器（text / forward 卡片）
 *   rules.ts           规则注册表
 *   types.ts           公共类型定义
 */

import type {TextMessage} from '../types.js';
import {logger} from '../../utils/logger.js';
import {findMatch, buildTemplateParams, extractArgs, normalizeParamsByConvention} from './engine/matcher.js';
import {fetchPage} from './engine/fetcher.js';
import {parsePage} from './engine/parser.js';
import {finalizeReply, buildForwardReply} from './engine/reply.js';

export const xuanxuePlugin: TextMessage = {
    type: 'text',
    name: 'xuanxue-engine',
    description: '玄学插件引擎（关键词 -> 请求 -> 解析 -> 返回）',
    match: (content) => findMatch(content) !== null,
    handle: async (message) => {
        const content = (message.content ?? '').trim();
        const context = findMatch(content);
        if (!context) return null;
        const isUsageIntent = context.query === '__usage__';

        const matchMode = context.rule.matchMode ?? 'exact';

        // 独立用法触发：关键词后加“用法/帮助/说明/示例/usage”直接返回 usage。
        if (isUsageIntent && context.rule.usage) {
            logger.debug('玄学插件用法触发', {rule: context.rule.name, content});
            return {type: 'text', content: context.rule.usage};
        }

        // 前置引导：prefix 规则但用户没带任何参数，直接回复用法提示
        if (matchMode === 'prefix' && !context.query && context.rule.usage) {
            logger.debug('玄学插件引导触发', {rule: context.rule.name, content});
            return {type: 'text', content: context.rule.usage};
        }

        // exact 规则无参数直接执行；但若用户多输了内容无法匹配到 exact 规则，
        // 这里不会触发（findMatch 已返回 null）。
        // 若 exact 规则有 usage，可通过「玄学帮助」查看。

        // 纯静态规则（url 为空）：直接返回 usage 作为内容
        if (!context.rule.url && context.rule.usage) {
            return {type: 'text', content: context.rule.usage};
        }

        const params = buildTemplateParams(message, context);

        let argParams: Record<string, string>;
        try {
            argParams = normalizeParamsByConvention(extractArgs(context.rule, context.query));
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            return {type: 'text', content: context.rule.usage ?? `参数格式错误：${errMsg}`};
        }

        const mergedParams = {...params, ...argParams};

        try {
            const page = await fetchPage(context.rule, mergedParams);
            const parsed = parsePage(context.rule, page);
            if (!parsed) return {type: 'text', content: '玄学插件未解析到有效结果。'};

            if (context.rule.replyMode === 'forward') {
                if (typeof parsed === 'string') {
                    return {type: 'text', content: finalizeReply(context.rule, parsed, mergedParams)};
                }
                return buildForwardReply(message, context.rule, parsed, mergedParams);
            }

            if (typeof parsed !== 'string') {
                let fallbackText: string;
                if ('male' in parsed) {
                    fallbackText = [
                        `👨 ${parsed.male.name}  vs  👩 ${parsed.female.name}`,
                        ...parsed.scores.map((s) => `【${s.label}】${s.score}`),
                        `总分：${parsed.totalScore}`,
                    ].join('\n');
                } else {
                    fallbackText = [
                        ...parsed.summary,
                        ...parsed.sections.map((s) => `【${s.title}】\n${s.content}`),
                    ].join('\n\n');
                }
                return {type: 'text', content: finalizeReply(context.rule, fallbackText, mergedParams)};
            }

            return {type: 'text', content: finalizeReply(context.rule, parsed, mergedParams)};
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('玄学插件处理异常', {rule: context.rule.name, error: errMsg});
            return {type: 'text', content: '玄学插件请求或解析失败，请稍后重试。'};
        }
    },
};
