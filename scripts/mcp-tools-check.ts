import assert from 'node:assert/strict';
import {matchVerb} from '../src/plugins/command/mcp-tools/dispatch.ts';
import {matchXuanxueCommand, xuanxueText} from '../src/plugins/command/mcp-tools/keywords.ts';

assert.equal(matchVerb('画图 一只猫', ['画图', '快画'])?.tail, '一只猫');
assert.equal(matchVerb('画图一只猫', ['画图'])?.tail, '一只猫');
assert.equal(matchVerb('修仙选1', ['修仙选', '修仙探索'])?.verb, '修仙选');
assert.equal(matchVerb('修仙探索', ['修仙选', '修仙探索'])?.verb, '修仙探索');
assert.equal(matchVerb('修仙状态', ['修仙探索', '修仙选']), null);

assert.equal(matchXuanxueCommand('八字测算 张三 男 公历 2005 12 23 8 37'), true);
assert.equal(matchXuanxueCommand('玄学'), true);
assert.equal(matchXuanxueCommand('今日老婆'), false);
assert.equal(xuanxueText('玄学'), '玄学帮助');

console.log('✓ mcp-tools');
