import assert from 'node:assert/strict';
import {stripBotPrefix} from '../src/core/bot.ts';

const MARKER = /^[#＃]\s*(.*)$/u;

function extractMarkedCommand(stripped: string): string | null {
    const match = MARKER.exec(stripped.trim());
    if (!match) return null;
    return match[1]?.trim() ?? '';
}

function marked(content: string, botName = '小聪明儿', botId = 'wxid_bot'): string | null {
    return extractMarkedCommand(stripBotPrefix(content, botName, botId));
}

assert.equal(marked('开机'), null);
assert.equal(marked('扮演绿茶'), null);
assert.equal(marked('帮我查记录'), null);
assert.equal(marked('修仙状态'), null);
assert.equal(marked('撤回'), null);

assert.equal(marked('#开机'), '开机');
assert.equal(marked('＃开机'), '开机');
assert.equal(marked('# 开机'), '开机');
assert.equal(marked('@小聪明儿 #开机'), '开机');
assert.equal(marked('@小聪明儿#开机'), '开机');
assert.equal(marked('#查记录 8-29 李芈仙'), '查记录 8-29 李芈仙');
assert.equal(marked('#扮演 绿茶'), '扮演 绿茶');
assert.equal(marked('#'), '');
assert.equal(marked('#   '), '');
assert.equal(extractMarkedCommand('开机'), null);

console.log('✓ command-mark');
