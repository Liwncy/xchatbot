/// <reference types="node" />
import assert from 'node:assert/strict';
import {parseWechatArticleContent, parseWechatArticlePage} from '../src/adapter/golem/article-content.ts';
import {parseWechatAppMessage} from '../src/adapter/golem/parse-appmsg.ts';
import {toGolemOutboundReplies} from '../src/adapter/golem/outbound.ts';
import type {PluginContext} from '../src/core/context.ts';
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
    parseOneShotDistributionCommand,
} from '../src/plugins/command/message-distribution/parse.ts';
import {dispatchDistribution} from '../src/plugins/channel/message-distribution/dispatch.ts';
import {messageDistributionCommandPlugin} from '../src/plugins/command/message-distribution/index.ts';

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

const official = parseWechatAppMessage(`
<appmsg>
  <type>5</type>
  <mmreader>
    <category><item>
      <title><![CDATA[公众号文章]]></title>
      <url><![CDATA[http://mp.weixin.qq.com/s?__biz=test&amp;idx=1]]></url>
      <summary><![CDATA[文章摘要]]></summary>
      <sources><source><name><![CDATA[同城微管家]]></name></source></sources>
    </item></category>
  </mmreader>
</appmsg>`);
assert.equal(official?.articles?.[0]?.desc, '文章摘要');
assert.equal(official?.publisherName, '同城微管家');
assert.equal(official?.articles?.[0]?.url, 'http://mp.weixin.qq.com/s?__biz=test&idx=1');

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
assert.deepEqual(parseOneShotDistributionCommand('分发 目标=wxid_a,123@chatroom 正文="今晚八点集合"'), {
    values: {
        目标: 'wxid_a,123@chatroom',
        正文: '今晚八点集合',
    },
});
assert.deepEqual(parseOneShotDistributionCommand('分发 wxid_a,wxid_b 今晚八点集合'), {
    values: {
        目标: 'wxid_a,wxid_b',
        正文: '今晚八点集合',
    },
});
assert.deepEqual(parseOneShotDistributionCommand('分发 wxid_a,wxid_b'), {
    values: {目标: 'wxid_a,wxid_b'},
});

assert.deepEqual(parseWechatArticleContent(`
<article id="js_article">
  <div id="js_content">
    <p>以下文章来源于Java资料站，作者小锋</p>
    <p>第一段<span>接着写</span></p>
    <p><img src="data:image/gif;base64,x" data-src="https://mmbiz.qpic.cn/a.jpg?x=1&amp;y=2" alt="配图"></p>
    <img data-src="https://wx.qlogo.cn/mmhead/account/0" width="132">
    <img data-src="https://mmbiz.qpic.cn/icon.png" class="article_icon" data-w="32" data-ratio="1">
    <h2>小标题</h2>
    <ul><li>列表项</li></ul>
    <section>第二段</section>
    <script>不该出现</script>
  </div>
  <p>留言区</p>
</article>`, 'https://mp.weixin.qq.com/s/test'), [
    {type: 'text', content: '第一段接着写'},
    {type: 'image', url: 'https://mmbiz.qpic.cn/a.jpg?x=1&y=2', alt: '配图'},
    {type: 'text', content: '小标题', style: 'heading'},
    {type: 'text', content: '列表项', style: 'list'},
    {type: 'text', content: '第二段'},
]);
assert.deepEqual(parseWechatArticlePage(`
<span id="js_author_name">文章作者</span>
<a id="js_name">公众号名称</a>
<div id="js_content"><p>正文</p></div>
<script>
var nickname = "备用名称";
var round_head_img = "https:\\/\\/wx.qlogo.cn\\/mmhead\\/author\\/0";
</script>`, 'https://mp.weixin.qq.com/s/test'), {
    contentItems: [{type: 'text', content: '正文'}],
    authorName: '文章作者',
    authorAvatarUrl: 'https://wx.qlogo.cn/mmhead/author/0',
});

const message: IncomingMessage = {
    platform: 'golem',
    type: 'link',
    source: 'official',
    chatId: 'gh_news',
    senderId: 'gh_news',
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
    chatIds: ['gh_news'],
    messageTypes: ['link'],
    keywords: ['文章'],
    targets: [{platform: 'web', id: 'reader'}],
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
        title: '一篇文章',
        url: 'https://example.com/post?a=1&b=2',
        desc: '文章摘要',
        thumbUrl: 'https://example.com/thumb.jpg',
    }]);

    const original = await buildDistributionReplies({} as Env, message, {
        ...rule,
        targets: [{platform: 'golem', id: 'room@chatroom'}],
    });
    assert.deepEqual(original, rebuilt);

    const nativeArticle = await toGolemOutboundReplies(message, {} as Env);
    assert.deepEqual(nativeArticle, [{type: 'app', appType: 5, xml: articleXml.trim()}]);

    const collection = await buildDistributionReplies({} as Env, {
        ...message,
        senderName: '科技号',
        app: {
            ...message.app!,
            articles: [{
                title: '一篇文章',
                url: 'https://mp.weixin.qq.com/s/test',
                contentItems: [
                    {type: 'text', content: '第一段'},
                    {type: 'image', url: 'https://mmbiz.qpic.cn/a.jpg'},
                ],
            }],
        },
    }, {
        ...rule,
        contentPolicy: {
            ...DEFAULT_CONTENT_POLICY,
            mode: 'rebuild',
            output: 'collection',
            includeOriginalUrl: false,
        },
    });
    assert.equal(collection[0]?.type, 'chat-record');
    if (collection[0]?.type === 'chat-record') {
        assert.equal(collection[0].title, '一篇文章');
        assert.equal(collection[0].items[0]?.type, 'text');
        assert.equal(collection[0].items[0]?.type === 'text' ? collection[0].items[0].content : '', '《一篇文章》');
        assert.equal(collection[0].items[2]?.type, 'image');
        assert.equal(collection[0].items[0]?.nickname, '小聪明儿');
        assert.match(collection[0].items[0]?.avatarUrl ?? '', /^https:\/\/wx\.qlogo\.cn\//u);
    }

    const emojiReplies = await toGolemOutboundReplies({
        ...message,
        type: 'emoji',
        content: undefined,
        app: undefined,
        rawXml: '<msg><emoji md5="emoji-md5"/></msg>',
        media: {md5: 'emoji-md5'},
    }, {} as Env);
    assert.deepEqual(emojiReplies, [{type: 'emoji', md5: 'emoji-md5'}]);

    let deliveredChatId = '';
    let deliveredTargets: string[] = [];
    const ctx = {
        env: {} as Env,
        requestId: 'one-shot',
        waitUntil() {},
        adapter: {
            platform: 'web',
            supportsProactiveSend: true,
            async send(targetMessage: IncomingMessage, replies: Array<{to?: string}>) {
                deliveredChatId = targetMessage.chatId;
                deliveredTargets = replies.map((reply) => reply.to ?? '');
                return replies.map(() => ({ok: true}));
            },
            async toOutboundReplies(sourceMessage: IncomingMessage) {
                return sourceMessage.type === 'link'
                    ? [{type: 'text' as const, content: 'web 原样内容'}]
                    : null;
            },
            async revoke() {
                return {ok: false as const, reason: 'unsupported' as const};
            },
        },
    } as PluginContext;
    const dispatched = await dispatchDistribution(
        message,
        ctx,
        rule.targets,
        [message],
        rule.contentPolicy,
    );
    assert.deepEqual(dispatched, {sent: 1, failed: 0, skipped: 0});
    assert.equal(deliveredChatId, 'reader');
    assert.deepEqual(deliveredTargets, ['reader']);

    let orderedContents: string[] = [];
    const commandMessage: IncomingMessage = {
        platform: 'web',
        type: 'link',
        source: 'private',
        chatId: 'owner',
        senderId: 'owner',
        to: 'bot',
        timestamp: 1,
        messageId: 'one-shot-message',
        content: '#分发 reader 开头说明',
        quote: {
            title: '#分发 reader 开头说明',
            referType: 1,
            referContent: '引用正文',
        },
        raw: {},
    };
    const commandCtx = {
        ...ctx,
        env: {BOT_OWNER_ID: 'owner'} as Env,
        adapter: {
            ...ctx.adapter,
            async send(_targetMessage: IncomingMessage, replies: Array<{type: string; content?: string}>) {
                orderedContents = replies.map((reply) => reply.content ?? reply.type);
                return replies.map(() => ({ok: true}));
            },
        },
    } as PluginContext;
    const commandReply = await messageDistributionCommandPlugin.handle(commandMessage, commandCtx);
    assert.deepEqual(orderedContents, ['开头说明', '引用正文']);
    assert.deepEqual(commandReply, {type: 'text', content: '发过去了 👌'});

    console.log('message-distribution-check ok');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
