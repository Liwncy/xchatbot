export type EmojiBracketCommand =
    | {type: 'name'; value: string}
    | {type: 'category'; value: string}
    | {type: 'tag'; value: string};

const BRACKET = /\[\s*([/#]?)([^\]\s]{1,16})\s*\]/gu;
const TOKEN = /^(?:[\u4e00-\u9fff]+|[a-z0-9][a-z0-9_-]*)$/u;

/** 微信小表情方括号名。社区快照 + 占位字，挡 [微笑] [旺柴] [表情]。 */
const WECHAT_PANEL_EMOJI = new Set([
    '表情', '狗头',
    '微笑', 'smile', '撇嘴', 'grimace', '色', 'drool', '发呆', 'scowl',
    '得意', 'coolguy', '流泪', 'sob', '害羞', 'shy', '闭嘴', 'silent',
    '睡', 'sleep', '大哭', 'cry', '尴尬', 'awkward', '发怒', 'angry',
    '调皮', 'tongue', '呲牙', 'grin', '惊讶', 'surprise', '难过', 'frown',
    '囧', 'blush', '抓狂', 'scream', '吐', 'puke', '偷笑', 'chuckle',
    '愉快', 'joyful', '白眼', 'slight', '傲慢', 'smug', '困', 'drowsy',
    '惊恐', 'panic', '憨笑', '大笑', 'laugh', '悠闲', 'commando',
    '咒骂', 'scold', '疑问', 'shocked', '嘘', 'shhh', '晕', 'dizzy',
    '衰', 'toasted', '骷髅', 'skull', '敲打', 'hammer', '再见', 'bye',
    '擦汗', 'speechless', '抠鼻', 'nosepick', '鼓掌', 'clap',
    '坏笑', 'trick', '左哼哼', '右哼哼', '鄙视', '委屈', 'shrunken',
    '快哭了', 'tearingup', '阴险', 'sly', '亲亲', 'kiss', '可怜', 'whimper',
    '生病', 'sick', '脸红', 'flushed', '破涕为笑', 'lol', '恐惧', 'terror',
    '失望', 'letdown', '无语', 'duh', '嘿哈', 'hey', '捂脸', 'facepalm',
    '奸笑', 'smirk', '机智', 'smart', '皱眉', 'concerned', '耶',
    '吃瓜', 'onlooker', '加油', 'goforit', '汗', 'sweats', '天啊', 'omg',
    'emm', '社会社会', 'respect', '旺柴', 'doge', '好的', 'noprob',
    '打脸', 'mybad', '哇', 'wow', '翻白眼', 'boring', '666', 'awesome',
    '让我看看', 'letmesee', '叹气', 'sigh', '苦涩', 'hurt', '裂开', 'broken',
    '嘴唇', 'lips', '爱心', 'heart', '心碎', 'brokenheart', '拥抱', 'hug',
    '强', 'thumbsup', '弱', 'thumbsdown', '握手', 'shake', '胜利', 'peace',
    '抱拳', 'salute', '勾引', 'beckon', '拳头', 'fist', 'ok', '合十', 'worship',
    '啤酒', 'beer', '咖啡', 'coffee', '蛋糕', 'cake', '玫瑰', 'rose',
    '凋谢', 'wilt', '菜刀', 'cleaver', '炸弹', 'bomb', '便便', 'poop',
    '月亮', 'moon', '太阳', 'sun', '庆祝', 'party', '礼物', 'gift',
    '红包', 'packet', '發', 'rich', '福', 'blessing', '烟花', 'fireworks',
    '爆竹', 'firecracker', '猪头', 'pig', '跳跳', 'waddle', '发抖', 'tremble',
    '转圈', 'twirl', '加油加油', 'keepfighting',
    '酷', 'ruthless', '饥饿', 'hungry', '流汗', 'sweat', '奋斗', 'determined',
    '折磨', 'tormented', '糗大了', 'shame', '哈欠', 'yawn', '吓', 'wrath',
    '西瓜', 'watermelon', '篮球', 'basketball', '乒乓', 'pingpong',
    '饭', 'rice', '闪电', 'lightning', '刀', 'dagger', '足球', 'soccer',
    '瓢虫', 'ladybug', '差劲', 'pinky', '爱你', 'rockon', 'no', 'nuh-uh',
    '爱情', 'inlove', '飞吻', 'blowkiss', '怄火', '磕头', 'kotow',
    '回头', 'dramatic', '投降', 'surrender', '激动', 'hooray',
    '乱舞', 'meditate', '献吻', 'smooch', '左太极', '右太极',
    '跳绳', '笑脸', '茶', 'tea',
]);

function isWechatPanelEmoji(value: string): boolean {
    return WECHAT_PANEL_EMOJI.has(value.trim().toLowerCase());
}

function toCommand(prefix: string, raw: string): EmojiBracketCommand | null {
    const value = raw.trim();
    if (!TOKEN.test(value.toLowerCase()) && !/[\u4e00-\u9fff]/u.test(value)) return null;
    if (prefix === '#') return {type: 'tag', value};
    if (prefix === '/') return {type: 'category', value};
    if (isWechatPanelEmoji(value)) return null;
    return {type: 'name', value};
}

/** 从正文里取最后一个 [名字]、[/分类]、[#标签]。微信小表情方括号不算。 */
export function extractEmojiBracketCommand(content: string): EmojiBracketCommand | null {
    const matches = [...content.matchAll(BRACKET)];
    for (let index = matches.length - 1; index >= 0; index -= 1) {
        const prefix = matches[index]?.[1] ?? '';
        const value = matches[index]?.[2] ?? '';
        const command = toCommand(prefix, value);
        if (command) return command;
    }
    return null;
}
