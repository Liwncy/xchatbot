import type {TextMessage} from '../../types.js';
import {tryForwardOpenClawXbot} from '../../../openclaw/try-forward-openclaw-xbot.js';

export const openClawXbotPlugin: TextMessage = {
    type: 'text',
    name: 'openclaw-xbot',
    description: 'OpenClaw 微信桥接入口：本地插件未命中时转发到 xbot 频道',
    match: (_content, message) => message.source === 'group' || message.source === 'private',
    handle: tryForwardOpenClawXbot,
};
