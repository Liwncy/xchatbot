import type {TextMessage} from '../../types.js';
import {logger} from '../../../utils/logger.js';
import {submitAgnesVideoTask} from './submit.js';
import {AGNES_TEXT_VIDEO_KEYWORDS} from './constants.js';
import {resolveAgnesVideoConfig} from './config.js';
import {
    buildTextToVideoPrompt,
    extractPromptAfterKeyword,
} from './prompt.js';
import {
    buildConfigMissingReply,
    buildInvalidQueryFormatReply,
    buildMissingPromptReply,
    buildSubmitFailedReply,
    buildSubmittedReply,
} from './reply.js';
import {handleAgnesVideoQuery, matchesAgnesVideoQuery} from './query.js';

export {handleAgnesQuoteVideo, matchesAgnesQuoteVideo} from './quote.js';

export const agnesVideoPlugin: TextMessage = {
    type: 'text',
    name: 'agnes-video',
    description: '聪明绘影文生视频与查绘影查询',
    match: (content) => {
        const trimmed = content.trim();
        return matchesAgnesVideoQuery(trimmed)
            || AGNES_TEXT_VIDEO_KEYWORDS.some((keyword) => trimmed.startsWith(keyword));
    },
    handle: async (message, env) => {
        if (matchesAgnesVideoQuery(message.content ?? '')) {
            const queryReply = await handleAgnesVideoQuery(message, env);
            return queryReply ?? buildInvalidQueryFormatReply();
        }

        const promptText = extractPromptAfterKeyword(message.content ?? '', AGNES_TEXT_VIDEO_KEYWORDS);
        if (!promptText) return buildMissingPromptReply();

        const config = resolveAgnesVideoConfig(env);
        if (!config) {
            return buildConfigMissingReply();
        }

        const prompt = buildTextToVideoPrompt(promptText);
        try {
            const record = await submitAgnesVideoTask({
                config,
                env,
                prompt,
                from: message.from,
                roomId: message.room?.id,
                mode: 'text',
            });
            return buildSubmittedReply(record);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            logger.error('Agnes 文生视频提交失败', {
                promptText,
                prompt,
                error: detail,
            });
            return buildSubmitFailedReply(detail);
        }
    },
};
