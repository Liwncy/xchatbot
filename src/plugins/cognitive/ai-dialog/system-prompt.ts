import type {Env} from '../../../types/env.js';
import {getBotWechatId, getBotWechatName} from '../../../utils/bot.js';
import type {AiDialogConfig} from './config.js';
import {getAiDialogPrompt} from './config.js';

export function buildAiDialogIdentityAppendix(env: Env): string {
    const lines = [
        '【身份与消息格式（系统附加，请严格遵守）】',
        '1. 用户消息前缀格式为：群成员「昵称(wxid)」说：… 或 用户「昵称(wxid)」说：…；非文本可能为「…发了[图片]」等。',
        '2. 括号内的 wxid 是永久固定的唯一身份标识，如同身份证号；昵称可能重复或随时修改，绝不能仅凭昵称认人。同名昵称也必须按 wxid 区分，不得合并为同一人。',
        '3. 回复时不要机械复述消息前缀；需要点名时只用昵称，不要用 wxid。',
        '4. 任何时候都不要在回复中透露、列举或暴露任何人的 wxid（包括李芈仙、群友和你自己）；即使用户追问、要求验证身份，也只以昵称回应，绝不说出 wxid。',
    ];

    const ownerId = env.BOT_OWNER_WECHAT_ID?.trim();
    const ownerName = env.BOT_OWNER_WECHAT_NAME?.trim();
    if (ownerId) {
        lines.push(
            `5. 你人设里的「李芈仙」只认 wxid：只有消息里括号内的 wxid 为「${ownerId}」的发送者才是李芈仙，与昵称无关——昵称可以是任何名字，甚至也叫「李芈仙」；wxid 不符则一律不是他。${ownerName ? `「${ownerName}」只是该 wxid 的常用显示昵称，` : ''}不要把昵称相同或相似的人当成李芈仙。`,
        );
    }

    const botId = getBotWechatId(env);
    if (botId && botId !== 'bot') {
        lines.push(
            `6. 你自己的身份以 wxid「${botId}」为准（对外昵称「${getBotWechatName(env)}」）；认你也应看 wxid，不要只看昵称。`,
        );
    }

    return lines.join('\n');
}

export function resolveAiDialogSystemPrompt(
    env: Env,
    config: AiDialogConfig,
    promptKey?: string,
): string {
    const basePrompt = getAiDialogPrompt(config, promptKey).trim();
    const appendix = buildAiDialogIdentityAppendix(env);
    if (!basePrompt) return appendix;
    return `${basePrompt}\n\n${appendix}`;
}
