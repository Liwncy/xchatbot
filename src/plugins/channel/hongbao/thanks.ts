import type {IncomingMessage} from '../../../core/message.js';
import type {TextReply} from '../../../core/reply.js';

/** 领到才用。拒绝那组不进池。 */
export const THANKS_LINES = [
    '哇塞，我说怎么晕头转向的，原来是被幸福砸晕了脑袋 😵',
    '看你如此尽心，今晚就宣你侍寝吧 😏',
    '这红包的声音比任何甜言蜜语都动听，爱你不止一点点 🥰',
    '人家被你的红包砸中了，余生你得负责了 🥺',
    '这位老板，您的充值已成功到账，请问老板晚上要服务吗，需要回复1 😏',
    '被富豪包养的感觉，原来是这样的 😎',
    '谢谢亲爱的红包，我们之间除了情情爱爱，还有大一点的红包吗 💰',
    '亲爱哒，这个俗人我当了，谁让我贪你的财，好你的色呢 😋',
    '收到心上人红包的我，开心得像两百斤撒欢的胖子 🤣',
    '红包我收下了，嘴巴也被堵住了，接下来就看你的表现了 🤭',
    '我就知道你喜欢我，现在被我找到证据了吧 😉',
    '感谢老板的投喂，你真是会投其所好，我更爱你了怎么办 🥰',
    '我可真是一个幸运的人，贪财好色都能被满足 ✨',
    '今晚想吃什么？火锅，外卖，还是我 🔥',
    '拿着红包点一杯芋泥啵啵奶茶，不要芋泥和奶茶，只要你的啵啵 😘',
    '有你真好，我知道我收到的不止是红包，还有你的用心 🫶',
    '看出来咯，有人把我放心尖尖上咯 💗',
    '谢谢你明目张胆的偏爱，我才敢大张旗鼓的炫耀 🥰',
    '不是所有的红包我都收，只有你，才能让我感觉到特别 🫶',
    '收到你的红包特别开心，感谢你这么爱我 💕',
    '我通往富婆的道路上，你是最大的功臣 😎',
    '保护费收了，今后我罩你 👊',
    '万水千山总是情，再发一个行不行 🥺',
    '你在我心里住这么久，今天是来交房租的吗 😏',
    '如此大礼，小女子唯有以身相许了 🤭',
    '回血成功，您老婆大人的心情值+100 爱情值+200 💗',
    '红包我领了，心意收回去吧 😉',
    '谢皇上赏赐，吾皇万岁万岁万万岁 👑',
    '爱的预付款已收到，记得余生补齐尾款 😘',
] as const;

export function pickThanksLine(random = Math.random): string {
    const index = Math.min(THANKS_LINES.length - 1, Math.floor(random() * THANKS_LINES.length));
    return THANKS_LINES[index] ?? THANKS_LINES[0];
}

export function thanksReply(message: IncomingMessage, random = Math.random): TextReply {
    const from = message.from.trim();
    const name = displayName(message.senderName);
    const line = pickThanksLine(random);
    return {
        type: 'text',
        content: name ? `@${name} ${line}` : line,
        ...(from ? {mentions: [from]} : {}),
    };
}

function displayName(senderName?: string): string {
    const name = senderName?.trim() ?? '';
    if (!name || /^wxid_/i.test(name)) return '';
    return name;
}
