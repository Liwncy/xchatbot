import type {AmbientListener} from './types.js';

const listeners: AmbientListener[] = [];

/** 和 registerPlugin 一个规矩：同名只认第一个，按注册顺序问。 */
export function registerAmbientListener(listener: AmbientListener): void {
    if (listeners.some((item) => item.name === listener.name)) return;
    listeners.push(listener);
}

export function listAmbientListeners(): AmbientListener[] {
    return [...listeners];
}
