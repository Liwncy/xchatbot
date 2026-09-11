import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import type {Plugin, PluginKind} from './types.js';

const plugins: Plugin[] = [];
const DISABLED_KV_KEY = 'plugins:runtime:disabled';

export function registerPlugin(plugin: Plugin): void {
    const exists = plugins.some((item) => item.manifest.name === plugin.manifest.name);
    if (exists) return;
    plugins.push(plugin);
}

export function listRegisteredPlugins(): Plugin[] {
    return [...plugins];
}

export function supportsPlatform(plugin: Plugin, platform: string): boolean {
    const {platforms} = plugin.manifest;
    if (platforms === '*') return true;
    return platforms.includes(platform);
}

export async function loadDisabledNames(env: Env): Promise<Set<string>> {
    try {
        const raw = await env.XBOT_KV.get(DISABLED_KV_KEY);
        if (!raw?.trim()) return new Set();
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0));
    } catch (error) {
        logger.warn('读取插件停用清单失败', {
            error: error instanceof Error ? error.message : String(error),
        });
        return new Set();
    }
}

export function selectPlugins(
    kind: PluginKind,
    platform: string,
    disabled: Set<string>,
): Plugin[] {
    return plugins
        .filter((plugin) => plugin.manifest.kind === kind)
        .filter((plugin) => supportsPlatform(plugin, platform))
        .filter((plugin) => !disabled.has(plugin.manifest.name))
        .sort((left, right) => left.manifest.priority - right.manifest.priority);
}
