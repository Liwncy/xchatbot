import type {XuanxueRule} from './types.js';
import {buildHelpText} from './engine/help.js';

/**
 * 玄学插件规则注册表。
 * 新增规则时填写 helpEntry 字段即可自动出现在「玄学帮助」列表中。
 */
export const xuanxueRules: XuanxueRule[] = [
    {
        name: 'xuanxue-help',
        keyword: ['玄学帮助', '玄学指令', '算命帮助'],
        matchMode: 'exact',
        url: '',
        method: 'GET',
        parse: {mode: 'text'},
        // usage 由 buildHelpText() 在运行时动态生成，此处仅占位
        get usage() {
            return buildHelpText(xuanxueRules);
        },
    },
    {
        name: 'xuanxue-bazi-calc',
        keyword: ['八字测算', '八字测命'],
        matchMode: 'prefix',
        url: 'https://store.yuanfenju.com/index/cesuan_result.html',
        method: 'POST',
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name={{name}}&sex={{sex}}&type={{type}}&year={{year}}&month={{month}}&day={{day}}&hours={{hours}}&minute={{minute}}&sect=1&lang=zh-cn',
        args: {
            mode: 'split',
            names: ['name', 'sex', 'type', 'year', 'month', 'day', 'hours', 'minute'],
            required: ['name', 'sex', 'type', 'year', 'month', 'day', 'hours', 'minute'],
        },
        parse: {
            mode: 'baziHtml',
        },
        replyMode: 'forward',
        forwardTitle: '八字测算结果',
        forwardNickname: '八字测算助手',
        // 可替换为你自己的头像链接（建议使用稳定的 https 图片地址）
        forwardAvatarUrl: 'https://bkimg.cdn.bcebos.com/pic/8d5494eef01f3a292df5593c5d7fab315c6035a8d6b4?x-bce-process=image/format,f_auto/quality,Q_70/resize,m_lfit,limit_1,w_536',
        usage: '🔮 八字测算\n\n八字算命可查询生辰八字、分析八字五行命理，出生日期支持公历和农历测算，测算结果仅供参考。\n\n八字，即生辰八字，是一个人出生时的干支历日期，四柱八字是算命方法中最正统的一种。中国古代一个时辰等于现在的两个小时，八字算命只需准确到时辰范围即可。\n\n📌 指令格式：\n八字测算 姓名 性别(男/女) 历法(公历/农历) 年 月 日 时 分\n\n💡 示例：\n八字测算 王羲之 男 公历 2005 12 23 8 37',
        helpEntry: '🧬 八字测算 — 分析生辰八字、五行命理',
        replyTemplate:
            '🔮 八字测算结果\n姓名：{{name}}\n性别：{{sexInput}}\n历法：{{typeInput}}\n生辰：{{year}}-{{month}}-{{day}} {{hours}}:{{minute}}\n\n{{result}}\n\n💡 指令格式：八字测算 姓名 性别(男/女) 历法(公历/农历) 年 月 日 时 分',
    },
    {
        name: 'xuanxue-bazi-hehun',
        keyword: ['八字合婚', '合婚测算', '合婚配对'],
        matchMode: 'prefix',
        url: 'https://store.yuanfenju.com/index/hehun_result.html',
        method: 'POST',
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        // 格式：男方姓名 历法 年 月 日 时 分 女方姓名 历法 年 月 日 时 分
        body: 'male_name={{male_name}}&male_type={{male_type}}&male_year={{male_year}}&male_month={{male_month}}&male_day={{male_day}}&male_hours={{male_hours}}&male_minute={{male_minute}}&female_name={{female_name}}&female_type={{female_type}}&female_year={{female_year}}&female_month={{female_month}}&female_day={{female_day}}&female_hours={{female_hours}}&female_minute={{female_minute}}&lang=zh-cn',
        args: {
            mode: 'split',
            names: [
                'male_name', 'male_type', 'male_year', 'male_month', 'male_day', 'male_hours', 'male_minute',
                'female_name', 'female_type', 'female_year', 'female_month', 'female_day', 'female_hours', 'female_minute',
            ],
            required: [
                'male_name', 'male_type', 'male_year', 'male_month', 'male_day', 'male_hours', 'male_minute',
                'female_name', 'female_type', 'female_year', 'female_month', 'female_day', 'female_hours', 'female_minute',
            ],
        },
        parse: {
            mode: 'heHunHtml',
        },
        replyMode: 'forward',
        forwardTitle: '八字合婚结果',
        forwardNickname: '八字合婚助手',
        forwardAvatarUrl: 'https://bkimg.cdn.bcebos.com/pic/8d5494eef01f3a292df5593c5d7fab315c6035a8d6b4?x-bce-process=image/format,f_auto/quality,Q_70/resize,m_lfit,limit_1,w_536',
        usage: '💑 八字合婚\n\n根据周易算命的方法，对男女双方的生辰八字进行配对合婚测算，分析两人命宫、年支、日干等多维度契合度，给出综合评分，仅供参考。\n\n📌 指令格式：\n八字合婚 男方姓名 历法(公历/农历) 年 月 日 时 分 女方姓名 历法 年 月 日 时 分\n\n💡 示例：\n八字合婚 王小二 公历 2005 12 23 8 37 李大炮 公历 2005 5 23 8 37',
        helpEntry: '💑 八字合婚 — 男女双方八字配对合婚评分',
        replyTemplate: '',
    },
    {
        name: 'xuanxue-bazi-hepan',
        keyword: ['八字合盘', '合盘测算', '合盘配对'],
        matchMode: 'prefix',
        url: 'https://store.yuanfenju.com/index/hepan_result.html',
        method: 'POST',
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        // 格式：甲方姓名 历法 年 月 日 时 分 乙方姓名 历法 年 月 日 时 分
        body: 'male_name={{male_name}}&male_type={{male_type}}&male_year={{male_year}}&male_month={{male_month}}&male_day={{male_day}}&male_hours={{male_hours}}&male_minute={{male_minute}}&female_name={{female_name}}&female_type={{female_type}}&female_year={{female_year}}&female_month={{female_month}}&female_day={{female_day}}&female_hours={{female_hours}}&female_minute={{female_minute}}&lang=zh-cn',
        args: {
            mode: 'split',
            names: [
                'male_name', 'male_type', 'male_year', 'male_month', 'male_day', 'male_hours', 'male_minute',
                'female_name', 'female_type', 'female_year', 'female_month', 'female_day', 'female_hours', 'female_minute',
            ],
            required: [
                'male_name', 'male_type', 'male_year', 'male_month', 'male_day', 'male_hours', 'male_minute',
                'female_name', 'female_type', 'female_year', 'female_month', 'female_day', 'female_hours', 'female_minute',
            ],
        },
        parse: {
            mode: 'hePanHtml',
        },
        replyMode: 'forward',
        forwardTitle: '八字合盘结果',
        forwardNickname: '八字合盘助手',
        forwardAvatarUrl: 'https://bkimg.cdn.bcebos.com/pic/8d5494eef01f3a292df5593c5d7fab315c6035a8d6b4?x-bce-process=image/format,f_auto/quality,Q_70/resize,m_lfit,limit_1,w_536',
        usage: '🤝 八字合盘\n\n输入甲方和乙方的信息后，可进行本命卦合盘论吉凶。八字合盘并无绝对完美配对，50分以上通常可作为参考，结果仅供参考。\n\n📌 指令格式：\n八字合盘 甲方姓名 历法(公历/农历) 年 月 日 时 分 乙方姓名 历法 年 月 日 时 分\n\n💡 示例：\n八字合盘 王小二 公历 2005 12 23 8 37 李大炮 公历 2005 12 23 8 37',
        helpEntry: '🤝 八字合盘 — 双方本命卦与八字关系综合合盘评分',
        replyTemplate: '',
    },
    {
        name: 'xuanxue-bazi-jingsuan',
        keyword: ['八字精算', '精算八字'],
        matchMode: 'prefix',
        url: 'https://store.yuanfenju.com/index/jingsuan_result.html',
        method: 'POST',
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name={{name}}&sex={{sex}}&type={{type}}&year={{year}}&month={{month}}&day={{day}}&hours={{hours}}&minute={{minute}}&lang=zh-cn&sect=2',
        args: {
            mode: 'split',
            names: ['name', 'sex', 'type', 'year', 'month', 'day', 'hours', 'minute'],
            required: ['name', 'sex', 'type', 'year', 'month', 'day', 'hours', 'minute'],
        },
        parse: {
            mode: 'baziHtml',
        },
        replyMode: 'forward',
        forwardTitle: '八字精算结果',
        forwardNickname: '八字精算助手',
        forwardAvatarUrl: 'https://bkimg.cdn.bcebos.com/pic/8d5494eef01f3a292df5593c5d7fab315c6035a8d6b4?x-bce-process=image/format,f_auto/quality,Q_70/resize,m_lfit,limit_1,w_536',
        usage: '🔮 八字精算\n\n在八字测算基础上进行更深度的命理分析，包含喜用神、大运流年、财运姻缘等全面解读，适合想深入了解命盘的用户，测算结果仅供参考。\n\n📌 指令格式：\n八字精算 姓名 性别(男/女) 历法(公历/农历) 年 月 日 时 分\n\n💡 示例：\n八字精算 王羲之 男 公历 2005 12 23 8 37',
        helpEntry: '🔮 八字精算 — 深度命盘解读（喜用神/大运/流年）',
        replyTemplate:
            '🔮 八字精算结果\n姓名：{{name}}\n性别：{{sexInput}}\n历法：{{typeInput}}\n生辰：{{year}}-{{month}}-{{day}} {{hours}}:{{minute}}\n\n{{result}}\n\n💡 指令格式：八字精算 姓名 性别(男/女) 历法(公历/农历) 年 月 日 时 分',
    },
    {
        name: 'xuanxue-bazi-paipan',
        keyword: ['八字排盘', '四柱排盘', '排八字'],
        matchMode: 'prefix',
        url: 'https://store.yuanfenju.com/index/paipan_result.html',
        method: 'POST',
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name={{name}}&sex={{sex}}&type={{type}}&year={{year}}&month={{month}}&day={{day}}&hours={{hours}}&minute={{minute}}&lang=zh-cn&sect=1',
        args: {
            mode: 'split',
            names: ['name', 'sex', 'type', 'year', 'month', 'day', 'hours', 'minute'],
            required: ['name', 'sex', 'type', 'year', 'month', 'day', 'hours', 'minute'],
        },
        parse: {
            mode: 'paipanHtml',
        },
        replyMode: 'forward',
        forwardTitle: '四柱八字排盘结果',
        forwardNickname: '八字排盘助手',
        forwardAvatarUrl: 'https://bkimg.cdn.bcebos.com/pic/8d5494eef01f3a292df5593c5d7fab315c6035a8d6b4?x-bce-process=image/format,f_auto/quality,Q_70/resize,m_lfit,limit_1,w_536',
        usage: '🧮 四柱八字排盘\n\n将年月日时排成命盘，每个时间概念称为一柱，共四柱；每柱有天干地支两个字，共八个字，故称四柱八字排盘。\n\n排盘说明：\n1) 公历即阳历，农历即阴历，请按实际日期类型输入；\n2) 八字日界线按晚上11时，若23时系统按次日排盘；\n3) 若不清楚出生分钟，可不必精确到分钟。\n\n📌 指令格式：\n八字排盘 姓名 性别(男/女) 历法(公历/农历) 年 月 日 时 分\n\n💡 示例：\n八字排盘 王羲之 男 公历 2005 12 23 8 37',
        helpEntry: '🧮 八字排盘 — 生成四柱命盘与大运排盘',
        replyTemplate: '',
    },
    {
        name: 'xuanxue-demo-quote',
        keyword: ['玄学语录', '玄学一句'],
        matchMode: 'exact',
        url: 'https://api.yujn.cn/api/ysyl.php',
        method: 'GET',
        parse: {
            mode: 'text',
        },
        helpEntry: '🌀 玄学语录 — 随机一句玄学金句',
        replyTemplate: '🔮 {{result}}',
    },
    {
        name: 'xuanxue-demo-divination',
        enabled: false,
        keyword: '玄学占卜',
        matchMode: 'prefix',
        url: 'https://example.com/divination?q={{query}}',
        method: 'GET',
        parse: {
            mode: 'regex',
            pattern: '<div class="result">([\\s\\S]*?)</div>',
            flags: 'i',
            group: 1,
        },
        replyTemplate: '🧿 题目：{{query}}\n{{result}}',
    },
];

