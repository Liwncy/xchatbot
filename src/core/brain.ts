/**
 * 当前这条消息交给哪颗大脑。门禁 / 口令 / 正文拼装不跟大脑走。
 *
 * 会话和平台看 KV 里的名字，没有再看 D1 里 is_default 那一行。插件按 agent_kind 分流。
 */
export {brainDisplayName, parseBrainName, type AgentBrain} from './brain-name.js';
export {resolveAgentBrain} from './brain-store.js';
