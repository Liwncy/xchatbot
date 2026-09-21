import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {getChatHistoryByMessageId, searchChatHistory} from '../core/chat-log/search.js';
import {searchAppLogs} from '../core/app-log/search.js';
import {emojiGet, emojiSave, emojiSearch, emojiUpdate} from '../core/emoji-stash/index.js';
import {formatPeerList, peerBan, peerMatch, peerSave, peerSearch} from '../core/peer-roster/index.js';
import {runFakeForward} from '../plugins/channel/fake-forward/index.js';
import type {Env} from '../types/env.js';

function jsonResult(value: unknown) {
    return textResult(JSON.stringify(value, null, 2));
}

function errorResult(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {content: [{type: 'text' as const, text: message}], isError: true};
}

function textResult(text: string) {
    return {content: [{type: 'text' as const, text}]};
}

export function createChannelMcpServer(env: Env): McpServer {
    const server = new McpServer({
        name: 'xchatbot',
        version: '0.1.0',
    });

    server.registerTool(
        'agbot_chat_history',
        {
            description:
                '查询当前会话通道聊天记录（微信群/私聊原文，含未回复的）。'
                + '认人、对「他/刚才谁说」、按某天/时间段翻记录时用。'
                + '表情/图片行会带 md5= 和可用 url=，收藏表情用这个，不要只看占位文案。'
                + 'scope 必须从本条消息前缀原样复制（group:… 或 user:…），不要猜、不要改 @chatroom。'
                + '查某天用 date（2026-08-29 / 8-29 / 29号，可带 14:30:05）。总结某天必须带 date，limit 默认 200。'
                + '按时间点用 from/until，精确到秒。满页用 afterId 继续拿更晚的，再一起总结。'
                + '闲聊接话不要调。',
            inputSchema: z.object({
                scope: z.string().describe('必填。本条前缀里的 scope，如 group:123@chatroom 或 user:wxid_xxx'),
                limit: z.number().int().min(1).max(200).optional()
                    .describe('条数 1-200。无时间窗默认 20；有 date/from/until 默认 200'),
                date: z.string().optional()
                    .describe('某一天。可带时分秒：2026-08-29 或 2026-08-29 14:30:05。也可用 8-29、29号'),
                from: z.string().optional()
                    .describe('窗口起点，含，精确到秒。有 date 时忽略'),
                until: z.string().optional()
                    .describe('窗口终点，不含这一刻。只写日期则含当天。有 date 时忽略'),
                hours: z.number().int().min(1).max(168).optional()
                    .describe('只看最近 N 小时，1-168。有 date/from/until 时忽略'),
                speaker: z.string().optional()
                    .describe('发言人：wxid_… 精确匹配；否则按 id 或昵称模糊匹配'),
                keyword: z.string().optional().describe('正文关键词，模糊匹配'),
                msgType: z.string().optional()
                    .describe('消息类型：text/image/emoji/video/voice/link 等'),
                beforeId: z.number().int().optional()
                    .describe('翻更早：填上一页返回的 beforeId（最近流水用）'),
                afterId: z.number().int().optional()
                    .describe('翻更晚：总结某天满页后填返回的 afterId'),
                direction: z.string().optional().describe('可选 inbound / outbound；不传则全部'),
                platform: z.string().optional().describe('可选 golem / web'),
            }),
        },
        async (input) => textResult(await searchChatHistory(env, input)),
    );

    server.registerTool(
        'agbot_chat_get',
        {
            description:
                '按通道 message_id 查一条记录，用来确认引用/刚才那句是谁说的。'
                + 'messageId 用引用里的消息 id，不要用昵称猜。',
            inputSchema: z.object({
                messageId: z.string().describe('必填。通道消息 id'),
            }),
        },
        async (input) => textResult(await getChatHistoryByMessageId(env, input.messageId)),
    );

    server.registerTool(
        'agbot_app_log',
        {
            description:
                '查询通道运行日志（warn/error，不是聊天原文）。'
                + '主人问「刚才怎么失败 / 报错了什么」时用。闲聊接话不要调。'
                + '不要把日志原文念给群友；对主人也只概括原因，不要播报堆栈。'
                + '可按 scope、level、stage、messageId、时间窗筛选。',
            inputSchema: z.object({
                scope: z.string().optional()
                    .describe('可选。本条前缀 scope= 后面那一段；不填则查全部会话'),
                limit: z.number().int().min(1).max(200).optional()
                    .describe('条数 1-200。无时间窗默认 20；有 date/from/until 默认 200'),
                date: z.string().optional().describe('某一天，格式同聊天记录'),
                from: z.string().optional().describe('窗口起点。有 date 时忽略'),
                until: z.string().optional().describe('窗口终点。有 date 时忽略'),
                hours: z.number().int().min(1).max(168).optional()
                    .describe('最近 N 小时。有 date/from/until 时忽略'),
                level: z.string().optional().describe('warn 或 error；不填则全部'),
                stage: z.string().optional().describe('阶段名，如 golem.send'),
                messageId: z.string().optional().describe('关联的通道消息 id'),
                keyword: z.string().optional().describe('摘要或详情关键词'),
                beforeId: z.number().int().optional().describe('翻更早'),
                afterId: z.number().int().optional().describe('翻更晚'),
                platform: z.string().optional().describe('可选 golem / web'),
            }),
        },
        async (input) => textResult(await searchAppLogs(env, input)),
    );

    server.registerTool(
        'golem_fake_forward',
        {
            description:
                '把一段对白做成微信聊天记录卡片。'
                + '对方说编聊天记录、做聊天记录卡、假聊天记录、伪造聊天记录、编一段群聊记录时用。'
                + 'script 每行「姓名|时间|内容」，时间可空；有角色没台词先问，不要自己编。'
                + '角色写群里显示的名字（被@的人就照抄「被@」行里的名字），是群友的话卡片会自动署他的微信名并配上头像，你不用管。'
                + '群里把 group 填成 scope=group: 后面那串。成功后配文一句，下一行把协议行原样发出。闲聊接话不要调。',
            inputSchema: z.object({
                script: z.string().describe('必填。每行：姓名|时间|内容。时间 HH:mm 或 YYYY-MM-DD HH:mm，可空'),
                title: z.string().optional().describe('可选。默认「群聊的聊天记录」'),
                group: z.string().optional().describe('可选。群 id；私聊留空'),
                platform: z.string().optional().describe('可选 golem / web，默认 golem'),
            }),
        },
        async (input) => textResult(await runFakeForward(env, input)),
    );

    server.registerTool(
        'emoji_search',
        {
            description:
                '搜通道自己的表情/梗图库。用中文搜，如 无奈、猫、摊手。'
                + '有 md5 的按指纹发表情，没有就用 imgUrl 当普通图。默认只搜启用的；includeInactive 才带停用/损坏。'
                + '闲聊接话不要调。',
            inputSchema: z.object({
                query: z.string().describe('搜索词，如 无奈 / 猫'),
                category: z.string().optional()
                    .describe('可选分类：funny|meme|cute|react|sad|angry|love|animal|work|misc'),
                includeInactive: z.boolean().optional().describe('是否包含未启用'),
                limit: z.number().int().min(1).max(30).optional(),
            }),
        },
        async (input) => {
            try {
                return jsonResult(await emojiSearch(env, {
                    query: input.query,
                    category: input.category,
                    includeInactive: Boolean(input.includeInactive),
                    limit: input.limit,
                }));
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        'emoji_save',
        {
            description:
                '把表情/梗图存进通道图库。至少给 md5 或 imgUrl。'
                + '从聊天记录收藏时用返回行里的 md5= / url=，不要编。'
                + '改名字说明标签请用 emoji_update，不要再用本工具。闲聊不要自动乱存。',
            inputSchema: z.object({
                md5: z.string().optional().describe('32 位十六进制指纹，可空'),
                imgUrl: z.string().optional().describe('公网图链'),
                name: z.string().optional(),
                description: z.string().optional().describe('中文一句，给搜索用'),
                tags: z.array(z.string()).optional().describe('中文关键词，如 [无奈, 摊手]'),
                category: z.string().optional(),
                status: z.string().optional().describe('pending|active|disabled|broken'),
                mime: z.string().optional(),
                source: z.string().optional(),
                width: z.number().int().optional(),
                height: z.number().int().optional(),
                size: z.number().int().optional(),
            }),
        },
        async (input) => {
            try {
                return jsonResult(await emojiSave(env, input));
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        'emoji_get',
        {
            description: '按 md5 或 name 取一条图库记录（含未启用）。',
            inputSchema: z.object({
                md5: z.string().optional(),
                name: z.string().optional(),
            }),
        },
        async (input) => {
            try {
                const item = await emojiGet(env, input);
                return jsonResult(item ?? {found: false});
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        'emoji_update',
        {
            description:
                '按主人反馈改已有图库条目。用 md5 / name / id 定位，只改给到的字段。'
                + '不自动新建，不猜图。',
            inputSchema: z.object({
                md5: z.string().optional().describe('按当前 md5 定位'),
                name: z.string().optional().describe('按当前 name 定位'),
                id: z.number().int().optional(),
                newName: z.string().optional(),
                description: z.string().optional(),
                tags: z.array(z.string()).optional(),
                category: z.string().optional(),
                status: z.string().optional(),
                mime: z.string().optional(),
                imgUrl: z.string().optional(),
                md5Value: z.string().optional().describe('设置或清空 md5，空字符串清空'),
            }),
        },
        async (input) => {
            try {
                return jsonResult(await emojiUpdate(env, input));
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        'peer_search',
        {
            description:
                '查本群花名册：谁会接这类话。闲聊不要调。'
                + 'scope 从本条前缀原样抄。query 写会啥或人名，空着列出全部。',
            inputSchema: z.object({
                scope: z.string().describe('必填。本条前缀里的 scope，如 group:123@chatroom'),
                query: z.string().optional().describe('会啥或人名，可空'),
                includeInactive: z.boolean().optional(),
            }),
        },
        async (input) => {
            try {
                const items = await peerSearch(env, input);
                return jsonResult({items, reply: formatPeerList(items)});
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        'peer_match',
        {
            description:
                '按对方原话对花名册，拼好该喊谁、喊什么。'
                + '命中后把返回的 outbound 行原样贴出去，不要自己改口令，不要自己办事。'
                + 'scope 从本条前缀原样抄。query 只用对方原话。',
            inputSchema: z.object({
                scope: z.string().describe('必填。本条前缀里的 scope'),
                query: z.string().describe('对方原话，不要带身份前缀'),
            }),
        },
        async (input) => {
            try {
                return jsonResult(await peerMatch(env, input));
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        'peer_save',
        {
            description:
                '把群友或机器人记进花名册。对方明确说记下才用。'
                + 'topic 是会啥。template 空着就是人话；golem::info 这种整句照念；'
                + 'music {问} 或 music 老鼠爱大米 是带空。不要记自己或主人。',
            inputSchema: z.object({
                scope: z.string().describe('必填。本条前缀里的 scope'),
                wxid: z.string().optional().describe('被记的人 wxid'),
                name: z.string().describe('群里那个名'),
                topic: z.string().describe('会啥，如 点歌、写脚本、兜底'),
                template: z.string().optional().describe('喊法。空=人话'),
                mention: z.boolean().optional().describe('要不要 @，默认照念免@、其余要@'),
                fallback: z.boolean().optional().describe('对不上时兜底'),
                platform: z.string().optional(),
            }),
        },
        async (input) => {
            try {
                const item = await peerSave(env, input);
                return jsonResult({...item, reply: `记下了，下次${item.topic}找${item.name}`});
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        'peer_ban',
        {
            description: '花名册里不再喊他或某条会啥。改状态，不删。',
            inputSchema: z.object({
                scope: z.string(),
                id: z.number().int().optional(),
                wxid: z.string().optional(),
                topic: z.string().optional(),
            }),
        },
        async (input) => {
            try {
                const item = await peerBan(env, input);
                return jsonResult(item ? {...item, reply: '好，不喊了'} : {found: false});
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    return server;
}
