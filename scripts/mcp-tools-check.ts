import assert from 'node:assert/strict';
import {matchXuanxueCommand, xuanxueText} from '../src/plugins/command/mcp-tools/xuanxue-keywords.ts';

assert.equal(matchXuanxueCommand('八字测算 张三 男 公历 2005 12 23 8 37'), true);
assert.equal(matchXuanxueCommand('玄学'), true);
assert.equal(matchXuanxueCommand('玄学帮助'), true);
assert.equal(matchXuanxueCommand('今日老婆'), false);
assert.equal(matchXuanxueCommand('庄园浇水'), false);
assert.equal(matchXuanxueCommand('实时天气 北京'), false);
assert.equal(xuanxueText('玄学'), '玄学帮助');
assert.equal(xuanxueText('八字测算'), '八字测算');

console.log('✓ mcp-tools keywords');
