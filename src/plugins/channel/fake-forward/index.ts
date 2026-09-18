import {getAdapter} from '../../../adapter/index.js';
import {markedCommand} from '../../../core/command-mark.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {Env} from '../../../types/env.js';
import {logger} from '../../../utils/logger.js';
import type {Plugin} from '../../runtime/types.js';
import {buildFakeForwardCard, type FakeForwardInput} from './card.js';
import {parseFakeForwardCommand} from './command.js';
import {FakeForwardAskError} from './script.js';

export {buildFakeForwardCard, type FakeForwardInput} from './card.js';

const HELP = [
    '编一张记录卡，这么发：',
    '#伪转发',
    '张三|09:12|你到了吗',
    '李四||快了',
    '',
    '想加标题：',
    '#伪转发 昨晚群聊',
    '张三|09:12|你到了吗',
].join('\n');

export async function runFakeForward(env: Env, input: FakeForwardInput): Promise<string> {
    const adapter = getAdapter(input.platform?.trim() || 'golem');
    if (!adapter?.toOutboundText) {
        return fail('error', '这次没做成，用人话说没弄成，不要念字段名或错误码。');
    }

    try {
        const reply = await buildFakeForwardCard(adapter, env, input);
        const line = adapter.toOutboundText(reply);
        if (!line) {
            return fail('error', '这次没做成，用人话说没弄成，不要念字段名或错误码。');
        }
        return [
            'status=ok',
            'caption=编好了',
            '下面这一行从 app: 开头原样发出，不要改 xml，不要拆行，不要念给用户听：',
            line,
        ].join('\n');
    } catch (error) {
        if (error instanceof FakeForwardAskError) {
            logger.info('伪转发缺字段', {hint: error.message});
            return fail('ask', `${error.message}\n对方没给齐就只追问缺的，不要自己编台词。`);
        }
        logger.warn('伪转发失败', {
            error: error instanceof Error ? error.message : String(error),
        });
        return fail('error', '这次没做成，用人话说没弄成，不要念字段名或错误码。');
    }
}

export const fakeForwardPlugin: Plugin = {
    manifest: {
        name: 'fake-forward',
        platforms: '*',
        kind: 'channel',
        priority: 14,
        impl: 'local',
    },
    match(message, ctx) {
        if (message.type !== 'text' && message.type !== 'link') return false;
        return parseFakeForwardCommand(markedCommand(message, ctx.env) ?? '') != null;
    },
    async handle(message, ctx): Promise<HandlerResponse> {
        const parsed = parseFakeForwardCommand(markedCommand(message, ctx.env) ?? '');
        if (!parsed) return null;
        if (parsed.kind === 'help') return textReply(HELP);

        try {
            return await buildFakeForwardCard(ctx.adapter, ctx.env, {
                script: parsed.script,
                title: parsed.title,
                group: message.room?.id,
            });
        } catch (error) {
            if (error instanceof FakeForwardAskError) {
                return textReply(error.message);
            }
            logger.warn('伪转发失败', {
                error: error instanceof Error ? error.message : String(error),
            });
            return textReply('没编成，再试下');
        }
    },
};

function fail(status: 'ask' | 'error', hint: string): string {
    return `status=${status}\nhint=${hint}`;
}
