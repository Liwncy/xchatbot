import type {XiuxianCommand} from '../../core/types/index.js';
import {parseCombatCommand} from './combat.js';
import {parseEconomyCommand} from './economy.js';
import {parseGrowthCommand} from './growth.js';
import {parseInventoryCommand} from './inventory.js';
import {parsePetCommand} from './pet.js';
import {parsePlayerCommand} from './player.js';
import {parseSocialCommand} from './social.js';

const PARSERS: Array<(text: string) => XiuxianCommand | null> = [
    parsePlayerCommand,
    parseGrowthCommand,
    parseSocialCommand,
    parseInventoryCommand,
    parseCombatCommand,
    parseEconomyCommand,
    parsePetCommand,
];

export function parseXiuxianCommand(content: string): XiuxianCommand | null {
    const text = content.trim();
    if (!text) return null;

    for (const parser of PARSERS) {
        const command = parser(text);
        if (command) return command;
    }

    return null;
}