import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {getChatHistoryByMessageId, searchChatHistory} from '../core/chat-log/search.js';
import {searchAppLogs} from '../core/app-log/search.js';
import {runFakeForward} from '../plugins/channel/fake-forward/index.js';
import type {Env} from '../types/env.js';

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

    return server;
}
