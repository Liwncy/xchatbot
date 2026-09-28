import assert from 'node:assert/strict';
import {parseWechatAppMessage} from '../src/adapter/golem/parse-appmsg.ts';
import type {Env} from '../src/types/env.ts';
import type {IncomingMessage} from '../src/core/message.ts';
import {matchesDistributionRule} from '../src/core/message-distribution/matcher.ts';
import {buildDistributionReplies} from '../src/core/message-distribution/transform.ts';
import {
    DEFAULT_CONTENT_POLICY,
    type DistributionRule,
} from '../src/core/message-distribution/types.ts';
import {
    parseDistributionCommand,
    parseKeyValues,
} from '../src/plugins/command/message-distribution/parse.ts';

const articleXml = `
<msg>
  <appmsg>
    <title><![CDATA[一篇文章]]></title>
    <type>5</type>
    <des><![CDATA[文章摘要]]></des>
    <url><![CDATA[https://example.com/post?a=1&amp;b=2]]></url>
    <thumburl><![CDATA[https://example.com/thumb.jpg]]></thumburl>
  </appmsg>
</msg>`;

assert.deepEqual(parseWechatAppMessage(articleXml), {
    appType: 5,
    title: '一篇文章',
    url: 'https://example.com/post?a=1&b=2',
    desc: '文章摘要',
    thumbUrl: 'https://example.com/thumb.jpg',
});

const digestXml = `
<appmsg>
  <mmreader>
    <category>
      <item>
        <title><![CDATA[第一篇]]></title>
        <digest><![CDATA[摘要一]]></digest>
        <url><![CDATA[https://example.com/1]]></url>
        <cover><![CDATA[https://example.com/1.jpg]]></cover>
      </item>
      <item>
        <title><![CDATA[第二篇]]></title>
        <url><![CDATA[https://example.com/2]]></url>
      </item>
    </category>
  </mmreader>
</appmsg>`;
const digest = parseWechatAppMessage(digestXml);
assert.equal(digest?.articles?.length, 2);
assert.deepEqual(digest?.articles?.[1], {
    title: '第二篇',
    url: 'https://example.com/2',
});

assert.deepEqual(parseKeyValues('名称=科技资讯 要求="压缩成 100 字" 输出=图文'), {
    名称: '科技资讯',
    要求: '压缩成 100 字',
    输出: '图文',
});
assert.deepEqual(parseDistributionCommand('分发规则 停用 科技资讯'), {
    kind: 'status',
    name: '科技资讯',
    active: false,
});
assert.deepEqual(parseDistributionCommand('分发规则 内容 科技资讯 模式=AI 输出=图文'), {
    kind: 'content',
    name: '科技资讯',
    values: {模式: 'AI', 输出: '图文'},
});

const message: IncomingMessage = {
    platform: 'golem',
    type: 'link',
    source: 'official',
    from: 'gh_news',
    to: 'bot',
    timestamp: 1,
    messageId: 'message-1',
    content: '一篇文章',
    app: parseWechatAppMessage(articleXml) ?? undefined,
    rawXml: articleXml,
    raw: {},
};

const rule: DistributionRule = {
    id: 'rule-1',
    name: '科技资讯',
    status: 'active',
    priority: 100,
    source: {kind: 'official', ids: ['gh_news']},
    messageTypes: ['link'],
    keywords: ['文章'],
    targets: [{platform: 'web', kind: 'user', id: 'reader'}],
    contentPolicy: {
        ...DEFAULT_CONTENT_POLICY,
        mode: 'auto',
        output: 'link',
    },
    continuePipeline: false,
    createdAt: 1,
    updatedAt: 1,
};

assert.equal(matchesDistributionRule(rule, message), true);
assert.equal(matchesDistributionRule({...rule, keywords: ['不匹配']}, message), false);

async function main(): Promise<void> {
    const rebuilt = await buildDistributionReplies({} as Env, message, rule);
    assert.deepEqual(rebuilt, [{
        type: 'link',
        title: '一篇文章\n来源：gh_news',
        url: 'https://example.com/post?a=1&b=2',
        desc: '文章摘要',
        thumbUrl: 'https://example.com/thumb.jpg',
    }]);

    const original = await buildDistributionReplies({} as Env, message, {
        ...rule,
        targets: [{platform: 'golem', kind: 'group', id: 'room@chatroom'}],
    });
    assert.deepEqual(original, [{type: 'forward', xml: articleXml}]);

    console.log('message-distribution-check ok');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
