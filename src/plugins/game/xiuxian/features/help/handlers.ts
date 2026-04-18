import type {HandlerResponse} from '../../../../../types/message.js';
import type {XiuxianCommand} from '../../core/types/index.js';
import {helpText} from './reply.js';

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

export function handleHelpCommand(cmd: XiuxianCommand): HandlerResponse | null {
    if (cmd.type !== 'help') return null;
    return asText(helpText(cmd.topic));
}