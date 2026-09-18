import assert from 'node:assert/strict';
import {parseHongbaoMessage} from '../src/adapter/golem/parse-hongbao.ts';
import {parseWechatMessages} from '../src/adapter/golem/parse.ts';
import {THANKS_LINES, thanksReply} from '../src/plugins/channel/hongbao/thanks.ts';

const nativeUrl = 'wxpay://c2cbizmessagehandler/hongbao/receivehongbao?msgtype=1&channelid=1&sendid=123&sign=abc';

{
    const parsed = parseHongbaoMessage(`<msg><appmsg>
        <type>2001</type>
        <title>恭喜发财，大吉大利</title>
        <wcpayinfo><nativeurl><![CDATA[${nativeUrl}]]></nativeurl></wcpayinfo>
    </appmsg></msg>`);
    assert.equal(parsed?.title, '恭喜发财，大吉大利');
    assert.equal(parsed?.nativeUrl, nativeUrl);
}

{
    const parsed = parseHongbaoMessage(`<msg><appmsg>
        <type>2001</type>
        <title>恭喜发财</title>
        <nativeurl>${nativeUrl.replaceAll('&', '&amp;')}</nativeurl>
    </appmsg></msg>`);
    assert.equal(parsed?.nativeUrl, nativeUrl);
}

assert.equal(parseHongbaoMessage(`<msg><appmsg><type>2000</type><title>转账</title><nativeurl>${nativeUrl}</nativeurl></appmsg></msg>`), null);
assert.equal(parseHongbaoMessage('<msg><appmsg><type>5</type><title>链接</title></appmsg></msg>'), null);
assert.equal(parseHongbaoMessage('你好'), null);

{
    const parsed = parseHongbaoMessage(`wxid_a:
<msg>
	<appmsg appid="" sdkver="">
		<des><![CDATA[我给你发了一个红包，赶紧去拆!]]></des>
		<type><![CDATA[2001]]></type>
		<title><![CDATA[微信红包]]></title>
		<wcpayinfo>
			<receivertitle><![CDATA[恭喜发财，大吉大利]]></receivertitle>
			<nativeurl><![CDATA[${nativeUrl}&total_num=2]]></nativeurl>
		</wcpayinfo>
		<emoji><type>2</type></emoji>
	</appmsg>
</msg>`);
    assert.equal(parsed?.title, '恭喜发财，大吉大利');
    assert.equal(parsed?.nativeUrl, `${nativeUrl}&total_num=2`);
}

{
    const [message] = parseWechatMessages({
        new_message: [{
            type: 49,
            create_time: 1_779_000_000,
            sender: {value: 'wxid_a'},
            receiver: {value: '123@chatroom'},
            source: 'chatroom',
            push_content: '张三 : [微信红包] 恭喜发财，大吉大利',
            content: {value: `wxid_a:\n<msg><appmsg><type>2001</type><title>恭喜发财，大吉大利</title><nativeurl>${nativeUrl}</nativeurl></appmsg></msg>`},
        }],
    });
    assert.equal(message?.type, 'hongbao');
    assert.equal(message?.source, 'group');
    assert.equal(message?.hongbao?.nativeUrl, nativeUrl);
    assert.equal(message?.content, '恭喜发财，大吉大利');
    assert.match(message?.rawXml ?? '', /<type>2001<\/type>/u);
}

assert.equal(THANKS_LINES.length, 29);
assert.equal(new Set(THANKS_LINES).size, THANKS_LINES.length);
{
    const reply = thanksReply({
        platform: 'golem',
        type: 'hongbao',
        source: 'group',
        from: 'wxid_a',
        senderName: '张三',
        to: '123@chatroom',
        timestamp: 1,
        messageId: '1',
        raw: {},
    }, () => 0);
    assert.equal(reply.content, `@张三 ${THANKS_LINES[0]}`);
    assert.deepEqual(reply.mentions, ['wxid_a']);
}

console.log('✓ hongbao');
