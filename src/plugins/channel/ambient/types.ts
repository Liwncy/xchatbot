import type {PluginContext} from '../../../core/context.js';
import type {IncomingMessage} from '../../../core/message.js';
import type {HandlerResponse} from '../../../core/reply.js';

/**
 * 群聊旁听监听器：不靠 `#` 口令、不 @ 机器人的普通群消息里，玩法想插一句话时用。
 *
 * 宿主（index.ts）已经替监听器挡掉了：不是群聊、不是文字、`#` 口令、@ 了机器人、机器人自己发的。
 * 监听器只管自己的判断，别再重复挡。
 *
 * 加新监听器：监听器放在自己玩法的目录里，再到 plugins/register.ts 里 registerAmbientListener 一行。
 * 每个监听器能在「插件停用清单」里用 `ambient:<name>` 单独关。
 */
export interface AmbientListener {
    /** 短名，用来拼停用名 `ambient:<name>` 和日志。 */
    name: string;
    /**
     * 便宜的预判，只看消息和 KV。命中的话才会往下走，所以不要在这里碰 D1 或外部服务。
     */
    match(message: IncomingMessage, ctx: PluginContext): boolean | Promise<boolean>;
    /**
     * 要回就返回回复；这回不接就返回 null，后面的监听器和别的插件接着处理。
     * 回了之后这条消息不会再交给大脑。
     */
    handle(message: IncomingMessage, ctx: PluginContext): Promise<HandlerResponse>;
}
