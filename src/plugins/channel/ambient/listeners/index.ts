import type {AmbientListener} from '../types.js';
import {nekoListener} from './neko.js';

/** 按这个顺序问，第一个回了话的赢。加新玩法在这里加一行。 */
export const AMBIENT_LISTENERS: AmbientListener[] = [nekoListener];
