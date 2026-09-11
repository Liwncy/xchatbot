import type {IncomingMessage} from '../../core/message.js';
import type {HandlerResponse} from '../../core/reply.js';
import type {PluginContext} from '../../core/context.js';

export type PluginKind = 'channel' | 'command' | 'agent';
export type PluginImpl = 'local' | 'mcp';

export interface PluginManifest {
    name: string;
    platforms: string[] | '*';
    kind: PluginKind;
    priority: number;
    impl: PluginImpl;
}

export interface Plugin {
    manifest: PluginManifest;
    match(message: IncomingMessage, ctx: PluginContext): boolean | Promise<boolean>;
    handle(message: IncomingMessage, ctx: PluginContext): Promise<HandlerResponse>;
}

export const KIND_ORDER: PluginKind[] = ['channel', 'command', 'agent'];
