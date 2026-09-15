import assert from 'node:assert/strict';
import {formatAppLogList} from '../src/core/app-log/format.ts';
import type {AppLogRecord} from '../src/core/app-log/types.ts';

{
    const empty = formatAppLogList([], '最近', 20, false);
    assert.match(empty, /没有找到运行日志/);
}

{
    const row: AppLogRecord = {
        id: 3,
        createdAt: Date.parse('2026-08-29T10:00:00+08:00') / 1000,
        level: 'error',
        stage: 'golem.send',
        summary: 'Golem 发送失败',
        detail: '{"status":500}',
        platform: 'golem',
        sessionId: '123@chatroom',
        messageId: 'm3',
        pluginName: '',
    };
    const list = formatAppLogList([row], '最近', 20, false);
    assert.match(list, /共 1 条（旧→新）/);
    assert.match(list, /error stage=golem.send session=123@chatroom id=m3: Golem 发送失败/);
}

console.log('✓ app log format');
