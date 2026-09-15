import assert from 'node:assert/strict';
import {parseInspectCommand} from '../src/plugins/channel/inspect/parse.ts';

assert.equal(parseInspectCommand('今天天气'), null);
assert.equal(parseInspectCommand('帮我查记录'), null);
assert.equal(parseInspectCommand('#查记录'), null);
assert.deepEqual(parseInspectCommand('查记录帮助'), {kind: 'history', help: true});
assert.deepEqual(parseInspectCommand('查记录 帮助'), {kind: 'history', help: true});
assert.deepEqual(parseInspectCommand('查日志帮助'), {kind: 'log', help: true});

{
    const parsed = parseInspectCommand('查记录');
    assert.ok(parsed && !parsed.help);
    assert.equal(parsed.kind, 'history');
    assert.equal(parsed.hours, undefined);
}

{
    const parsed = parseInspectCommand('查记录 8-29 李芈仙 搜 咖啡 近3小时 图片 20条');
    assert.ok(parsed && !parsed.help);
    assert.equal(parsed.date, '8-29');
    assert.equal(parsed.speaker, '李芈仙');
    assert.equal(parsed.keyword, '咖啡');
    assert.equal(parsed.hours, 3);
    assert.equal(parsed.msgType, 'image');
    assert.equal(parsed.limit, 20);
}

{
    const parsed = parseInspectCommand('查日志');
    assert.ok(parsed && !parsed.help);
    assert.equal(parsed.hours, 1);
}

{
    const parsed = parseInspectCommand('查报错');
    assert.ok(parsed && !parsed.help);
    assert.equal(parsed.level, 'error');
    assert.equal(parsed.hours, 1);
}

console.log('✓ inspect parse');
