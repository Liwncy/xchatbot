import {logger} from '../../../../utils/logger.js';
import {getDefaultPrefixSetConfig, setPrefixSetConfig} from '../core/balance/index.js';

const XIUXIAN_SET_CONFIG_KV_KEY = 'xiuxian:equipment:set-config';
const XIUXIAN_SET_CONFIG_CACHE_MS = 60_000;
let xiuxianSetConfigCacheAt = 0;

export async function tryLoadSetConfigFromKv(kv: KVNamespace | undefined, now: number): Promise<void> {
    if (!kv) return;
    if (now - xiuxianSetConfigCacheAt < XIUXIAN_SET_CONFIG_CACHE_MS) return;
    xiuxianSetConfigCacheAt = now;
    try {
        const raw = await kv.get(XIUXIAN_SET_CONFIG_KV_KEY);
        if (!raw) {
            setPrefixSetConfig(getDefaultPrefixSetConfig());
            return;
        }
        const parsed = JSON.parse(raw) as {prefixSets?: unknown} | unknown;
        const configs = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as {prefixSets?: unknown})?.prefixSets)
                ? (parsed as {prefixSets: unknown[]}).prefixSets
                : [];
        if (!configs.length) {
            setPrefixSetConfig(getDefaultPrefixSetConfig());
            logger.warn('[xiuxian] set config in KV is empty, fallback to default');
            return;
        }
        setPrefixSetConfig(configs as never[]);
    } catch (error) {
        setPrefixSetConfig(getDefaultPrefixSetConfig());
        logger.warn('[xiuxian] failed to parse set config from KV, fallback to default', {error});
    }
}