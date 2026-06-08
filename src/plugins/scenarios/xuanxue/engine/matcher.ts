/** 关键词匹配器 */

import {xuanxueRules} from '../rules.js';
import type {XuanxueMatchContext, XuanxueRule} from '../types.js';

const USAGE_INTENT_QUERY = '__usage__';
const USAGE_SUFFIX_WORDS = new Set(['用法', '帮助', '说明', '示例', 'usage']);

function normalizeUsageToken(input: string): string {
    return input.trim().toLowerCase();
}

function isUsageSuffix(input: string): boolean {
    return USAGE_SUFFIX_WORDS.has(normalizeUsageToken(input));
}

function toKeywords(value: string | string[]): string[] {
    return (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
}

export function findMatch(content: string): XuanxueMatchContext | null {
    for (const rule of xuanxueRules) {
        if (rule.enabled === false) continue;
        const matchMode = rule.matchMode ?? 'exact';
        const keywords = toKeywords(rule.keyword);

        for (const keyword of keywords) {
            if (matchMode === 'exact' && content === keyword) {
                return {rule, keyword, query: ''};
            }
            if (matchMode === 'exact' && content.startsWith(keyword)) {
                const suffix = content.slice(keyword.length).trim();
                if (suffix && isUsageSuffix(suffix)) {
                    return {rule, keyword, query: USAGE_INTENT_QUERY};
                }
            }
            if (matchMode === 'prefix' && content.startsWith(keyword)) {
                const query = content.slice(keyword.length).trim();
                if (query && isUsageSuffix(query)) {
                    return {rule, keyword, query: USAGE_INTENT_QUERY};
                }
                return {rule, keyword, query};
            }
        }
    }
    return null;
}

export function buildTemplateParams(
    message: {content?: string; from: string; senderName?: string; room?: {id: string}; timestamp: number},
    ctx: XuanxueMatchContext,
): Record<string, string> {
    return {
        keyword: ctx.keyword,
        query: ctx.query,
        content: (message.content ?? '').trim(),
        from: message.from,
        senderName: message.senderName ?? '',
        roomId: message.room?.id ?? '',
    };
}

export function extractArgs(rule: XuanxueRule, query: string): Record<string, string> {
    const config = rule.args;
    if (!config) return {};

    const names = config.names ?? [];
    const required = config.required ?? [];
    const mode = config.mode ?? 'split';
    const out: Record<string, string> = {};

    if (mode === 'regex') {
        if (!config.pattern) throw new Error('参数提取缺少 regex pattern');
        const reg = new RegExp(config.pattern, config.flags ?? '');
        const match = query.match(reg);
        if (!match) throw new Error('参数提取失败：输入格式不匹配');
        names.forEach((name, idx) => {
            out[name] = (match[idx + 1] ?? '').trim();
        });
    } else if (config.conditional && config.conditional.length > 0) {
        // 条件分支解析：先快速归一化 boolean 字段，再按条件决定是否消费后续槽位
        const chunks = query
            .split(config.delimiter ?? /\s+/)
            .map((item) => item.trim())
            .filter(Boolean);
        const boolMap: Record<string, string> = {否: '0', 不排: '0', 不用替: '0', 是: '1', 排: '1', 用替: '1'};
        const quickBool = (v: string) => boolMap[v] ?? (/^[01]$/.test(v) ? v : v);

        let ci = 0; // chunk index

        for (const name of names) {
            if (ci >= chunks.length) {
                // 检查该字段是否因条件可省略
                const isConditionallyOptional = config.conditional.some((cond) => {
                    const controlVal = quickBool((out[cond.when] ?? '').trim());
                    return controlVal !== cond.is && cond.require.includes(name);
                });
                if (!isConditionallyOptional) {
                    out[name] = '';
                }
                continue;
            }

            // 检查此槽是否因某个已解析的条件字段为"否"而可跳过
            const shouldSkip = config.conditional.some((cond) => {
                const controlVal = quickBool((out[cond.when] ?? '').trim());
                return cond.require.includes(name) && controlVal !== cond.is;
            });

            if (shouldSkip) {
                out[name] = ''; // 条件不满足，不消费 chunk
            } else {
                out[name] = chunks[ci] ?? '';
                ci++;
            }
        }

        // 条件必填校验
        for (const cond of config.conditional) {
            const controlVal = quickBool((out[cond.when] ?? '').trim());
            if (controlVal === cond.is) {
                for (const key of cond.require) {
                    if (!out[key]) throw new Error(`当"${cond.when}"为"是"时，"${key}"为必填`);
                }
            }
        }
    } else {
        const chunks = query
            .split(config.delimiter ?? /\s+/)
            .map((item) => item.trim())
            .filter(Boolean);
        names.forEach((name, idx) => {
            out[name] = chunks[idx] ?? '';
        });
    }

    for (const key of required) {
        if (!out[key]) throw new Error(`缺少必填参数：${key}`);
    }

    return out;
}

export function normalizeParamsByConvention(params: Record<string, string>): Record<string, string> {
    const out = {...params};

    const shanMap: Record<string, string> = {
        壬山丙向: '0', 子山午向: '1', 癸山丁向: '2', 丑山未向: '3', 艮山坤向: '4', 寅山申向: '5',
        甲山庚向: '6', 卯山酉向: '7', 乙山辛向: '8', 辰山戌向: '9', 巽山乾向: '10', 巳山亥向: '11',
        丙山壬向: '12', 午山子向: '13', 丁山癸向: '14', 未山丑向: '15', 坤山艮向: '16', 申山寅向: '17',
        庚山甲向: '18', 酉山卯向: '19', 辛山乙向: '20', 戌山辰向: '21', 乾山巽向: '22', 亥山巳向: '23',
    };
    const shuiKouMap: Record<string, string> = {
        壬: '0', 子: '1', 癸: '2', 丑: '3', 艮: '4', 寅: '5', 甲: '6', 卯: '7', 乙: '8', 辰: '9', 巽: '10', 巳: '11',
        丙: '12', 午: '13', 丁: '14', 未: '15', 坤: '16', 申: '17', 庚: '18', 酉: '19', 辛: '20', 戌: '21', 乾: '22', 亥: '23',
    };

    if (out.yun_model) {
        const v = out.yun_model.trim();
        const map: Record<string, string> = {
            一运: '0', 二运: '1', 三运: '2', 四运: '3', 五运: '4', 六运: '5', 七运: '6', 八运: '7', 九运: '8',
        };
        out.yun_model = map[v] ?? (/^[0-8]$/.test(v) ? v : '');
        if (!out.yun_model) throw new Error('元运参数无效，请输入一运-九运或 0-8');
    }

    if (out.shan_model) {
        const v = out.shan_model.trim();
        out.shan_model = shanMap[v] ?? (/^(?:[0-9]|1[0-9]|2[0-3])$/.test(v) ? v : '');
        if (!out.shan_model) throw new Error('山向参数无效，请输入如“壬山丙向”或 0-23');
    }

    if (out.ti_model) {
        const v = out.ti_model.trim();
        const map: Record<string, string> = {否: '0', 不用替: '0', 是: '1', 用替: '1'};
        out.ti_model = map[v] ?? (/^[01]$/.test(v) ? v : '');
        if (!out.ti_model) throw new Error('是否用替参数无效，请输入是/否或 0/1');
    }

    if (out.long_model) {
        const v = out.long_model.trim();
        const map: Record<string, string> = {否: '0', 不排: '0', 是: '1', 排: '1'};
        out.long_model = map[v] ?? (/^[01]$/.test(v) ? v : '');
        if (!out.long_model) throw new Error('是否排龙诀参数无效，请输入是/否或 0/1');
    }
    // 不排龙诀时水口填默认值 0，让 body 模板能正常渲染
    if (out.long_model === '0' && !out.long_shui_kou) {
        out.long_shui_kou = '0';
    }

    if (out.long_shui_kou) {
        const v = out.long_shui_kou.trim();
        out.long_shui_kou = shuiKouMap[v] ?? (/^(?:[0-9]|1[0-9]|2[0-3])$/.test(v) ? v : '');
        if (!out.long_shui_kou) throw new Error('水口参数无效，请输入壬/子/.../亥或 0-23');
    }

    if (out.ming_model) {
        const v = out.ming_model.trim();
        const map: Record<string, string> = {否: '0', 不排: '0', 是: '1', 排: '1'};
        out.ming_model = map[v] ?? (/^[01]$/.test(v) ? v : '');
        if (!out.ming_model) throw new Error('是否排命盘参数无效，请输入是/否或 0/1');
    }
    // 不排命盘时流年/流月填默认值，让 body 模板能正常渲染
    if (out.ming_model === '0') {
        if (!out.ming_liu_year) out.ming_liu_year = '2024';
        if (!out.ming_liu_month) out.ming_liu_month = '1';
    }

    if (out.ming_liu_month) {
        const v = out.ming_liu_month.trim();
        const map: Record<string, string> = {
            一月: '1', 二月: '2', 三月: '3', 四月: '4', 五月: '5', 六月: '6',
            七月: '7', 八月: '8', 九月: '9', 十月: '10', 冬月: '11', 腊月: '12',
        };
        out.ming_liu_month = map[v] ?? (/^(?:[1-9]|1[0-2])$/.test(v) ? v : '');
        if (!out.ming_liu_month) throw new Error('流月参数无效，请输入一月-腊月或 1-12');
    }

    if (out.date) {
        const raw = out.date.trim();
        const todayWords = new Set(['今天', '今日', 'now', 'today']);
        out.dateInput = raw;

        if (todayWords.has(raw.toLowerCase()) || todayWords.has(raw)) {
            const now = new Date();
            const yyyy = String(now.getFullYear());
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            out.date = `${yyyy}-${mm}-${dd}`;
        } else {
            let y = '';
            let m = '';
            let d = '';

            const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
            const dashMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
            if (compactMatch) {
                y = compactMatch[1];
                m = compactMatch[2];
                d = compactMatch[3];
            } else if (dashMatch) {
                y = dashMatch[1];
                m = dashMatch[2];
                d = dashMatch[3];
            } else {
                throw new Error('日期格式无效，请输入 YYYY-MM-DD（如 2026-05-12）');
            }

            const month = Number(m);
            const day = Number(d);
            if (!Number.isInteger(month) || month < 1 || month > 12) {
                throw new Error('日期格式无效：月份应在 1-12');
            }
            if (!Number.isInteger(day) || day < 1 || day > 31) {
                throw new Error('日期格式无效：日期应在 1-31');
            }

            out.date = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }

    if (out.xingzuo) {
        const original = out.xingzuo.trim();
        const map: Record<string, string> = {
            白羊座: '0', 白羊: '0', aries: '0',
            金牛座: '1', 金牛: '1', taurus: '1',
            双子座: '2', 双子: '2', gemini: '2',
            巨蟹座: '3', 巨蟹: '3', cancer: '3',
            狮子座: '4', 狮子: '4', leo: '4',
            处女座: '5', 处女: '5', virgo: '5',
            天秤座: '6', 天秤: '6', libra: '6',
            天蝎座: '7', 天蝎: '7', scorpio: '7',
            射手座: '8', 射手: '8', sagittarius: '8',
            摩羯座: '9', 摩羯: '9', 山羊座: '9', capricorn: '9',
            水瓶座: '10', 水瓶: '10', aquarius: '10',
            双鱼座: '11', 双鱼: '11', pisces: '11',
        };
        out.xingzuoInput = original;
        const key = original.toLowerCase();
        out.xingzuo_id = map[key] ?? map[original] ?? (/^\d+$/.test(original) ? original : '');
        if (/^\d+$/.test(out.xingzuo_id)) {
            const id = Number(out.xingzuo_id);
            if (!Number.isInteger(id) || id < 0 || id > 11) {
                throw new Error('星座 id 超出范围，请输入 0-11');
            }
            out.xingzuo_id = String(id);
        }
        if (!out.xingzuo_id) {
            throw new Error('不支持的星座参数，请输入白羊/金牛/.../双鱼或 0-11');
        }
    }

    if (out.sex) {
        const original = out.sex.trim();
        const sexMap: Record<string, string> = {
            男: 'male', male: 'male', m: 'male',
            女: 'female', female: 'female', f: 'female',
        };
        out.sexInput = original;
        out.sex = sexMap[original] ?? out.sex;
    }

    if (out.type) {
        const original = out.type.trim();
        const typeMap: Record<string, string> = {
            公历: 'gongli', 阳历: 'gongli', gongli: 'gongli', solar: 'gongli',
            农历: 'nongli', 阴历: 'nongli', nongli: 'nongli', lunar: 'nongli',
        };
        out.typeInput = original;
        out.type = typeMap[original] ?? out.type;
    }

    for (const field of ['male_type', 'female_type'] as const) {
        if (out[field]) {
            const original = out[field].trim();
            const typeMap: Record<string, string> = {
                公历: 'gongli', 阳历: 'gongli', gongli: 'gongli',
                农历: 'nongli', 阴历: 'nongli', nongli: 'nongli',
            };
            out[`${field}Input`] = original;
            out[field] = typeMap[original] ?? out[field];
        }
    }

    // 星座配对：xingzuo_male / xingzuo_female 接受"处女男"/"白羊女"或"处女 男"/"白羊 女"两种格式
    const XINGZUO_BASE_MAP: Record<string, string> = {
        白羊: '白羊', 金牛: '金牛', 双子: '双子', 巨蟹: '巨蟹',
        狮子: '狮子', 处女: '处女', 天秤: '天秤', 天蝎: '天蝎',
        射手: '射手', 摩羯: '摩羯', 山羊: '摩羯', 水瓶: '水瓶', 双鱼: '双鱼',
    };
    for (const field of ['xingzuo_male', 'xingzuo_female'] as const) {
        if (!out[field]) continue;
        const raw = out[field].trim();
        // 已经是完整格式如"处女男"/"白羊女"，直接透传
        if (/^(白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|山羊|水瓶|双鱼)(座)?(男|女)$/.test(raw)) {
            // 去掉"座"字，保留"星座名+性别"
            out[field] = raw.replace('座', '');
            continue;
        }
        // 裸星座名，从规则参数名推断性别
        const baseName = raw.replace(/座$/, '');
        const canonical = XINGZUO_BASE_MAP[baseName];
        if (!canonical) throw new Error(`不支持的星座：${raw}，请输入如"白羊"或"处女男"`);
        const gender = field === 'xingzuo_male' ? '男' : '女';
        out[field] = `${canonical}${gender}`;
    }

    const SHENGXIAO_MAP: Record<string, string> = {
        鼠: '鼠', 牛: '牛', 虎: '虎', 兔: '兔', 龙: '龙', 蛇: '蛇',
        马: '马', 羊: '羊', 猴: '猴', 鸡: '鸡', 狗: '狗', 猪: '猪',
    };
    for (const field of ['shengxiao_male', 'shengxiao_female'] as const) {
        if (!out[field]) continue;
        const raw = out[field].trim();
        const normalized = raw
            .replace(/^生肖/, '')
            .replace(/^属/, '')
            .replace(/[男女性]$/g, '')
            .trim();
        const canonical = SHENGXIAO_MAP[normalized];
        if (!canonical) throw new Error(`不支持的生肖：${raw}，请输入如"猪"或"属猪"`);
        out[field] = canonical;
    }

    const XUEXING_MAP: Record<string, string> = {
        A: 'A', B: 'B', AB: 'AB', O: 'O',
        a: 'A', b: 'B', ab: 'AB', o: 'O',
        A型: 'A', B型: 'B', AB型: 'AB', O型: 'O',
        a型: 'A', b型: 'B', ab型: 'AB', o型: 'O',
    };
    for (const field of ['xuexing_male', 'xuexing_female'] as const) {
        if (!out[field]) continue;
        const raw = out[field].trim().replace(/\s+/g, '');
        const normalized = XUEXING_MAP[raw] ?? XUEXING_MAP[raw.toUpperCase()] ?? '';
        if (!normalized) throw new Error(`不支持的血型：${out[field]}，请输入 A/B/AB/O 或 A型/B型/AB型/O型`);
        out[field] = normalized;
    }

    if (out.qiming_gender) {
        const raw = out.qiming_gender.trim().toLowerCase();
        const map: Record<string, string> = {
            男: 'male', male: 'male', m: 'male',
            女: 'female', female: 'female', f: 'female',
        };
        const normalized = map[out.qiming_gender.trim()] ?? map[raw] ?? '';
        if (!normalized) throw new Error('性别参数无效，请输入 男/女 或 male/female');
        out.qiming_gender = normalized;
    }

    if (out.qiming_words) {
        const raw = out.qiming_words.trim();
        const map: Record<string, string> = {
            '2': '2', '二': '2', '二字': '2',
            '3': '3', '三': '3', '三字': '3',
        };
        const normalized = map[raw] ?? '';
        if (!normalized) throw new Error('字数参数无效，请输入 2/3 或 二字/三字');
        out.qiming_words = normalized;
    }

    if (!out.isdst) {        out.isdst = '0';
    }
    if (!out.timezone) {
        out.timezone = '8';
    }
    if (out.longitude_type) {
        out.longitude_type = out.longitude_type.trim().toUpperCase();
    }
    if (out.latitude_type) {
        out.latitude_type = out.latitude_type.trim().toUpperCase();
    }

    if (out.future !== undefined) {
        const futureMap: Record<string, string> = {
            '7天': '0', '7日': '0', '未来7天': '0', '近7天': '0',
            '15天': '1', '15日': '1', '未来15天': '1', '近15天': '1',
            '60天': '2', '60日': '2', '未来60天': '2', '近60天': '2', '两个月': '2',
            '90天': '3', '90日': '3', '未来90天': '3', '近90天': '3', '三个月': '3',
        };
        const orig = out.future.trim();
        out.future = futureMap[orig] ?? (/^[0-3]$/.test(orig) ? orig : '');
        if (!out.future) throw new Error('查询范围无效，请输入 7天/15天/60天/90天 或 0-3');
    }

    if (out.incident !== undefined) {
        const incidentMap: Record<string, string> = {
            搬家: '0', 装修: '1', 入宅: '2', 订婚: '3', 领证: '4',
            求嗣: '5', 纳财: '6', 开市: '7', 交易: '8', 提车: '8',
            置产: '9', 动土: '10', 出行: '11', 安葬: '12', 祭祀: '13',
            祈福: '14', 沐浴: '15', 订盟: '16', 纳婿: '17', 修坟: '18',
            破土: '19', 立碑: '21', 开生坟: '22', 合寿木: '23', 入殓: '24',
            移柩: '25', 伐木: '26', 掘井: '27', 挂匾: '28', 栽种: '29',
            入学: '30', 理发: '31', 会亲友: '32', 赴任: '33', 求医: '34', 治病: '35',
        };
        const orig = out.incident.trim();
        out.incident = incidentMap[orig] ?? (/^\d+$/.test(orig) && Number(orig) <= 35 ? orig : '');
        if (!out.incident) throw new Error('事项无效，请输入如"搬家"、"开市"、"出行"等事项名称');
    }

    return out;
}

