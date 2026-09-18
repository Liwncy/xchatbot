export interface ParsedHongbao {
    title: string;
    nativeUrl: string;
}

const HONGBAO_APP_TYPE = 2001;

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

function stripCdata(value: string): string {
    return value.replace(/^<!\[CDATA\[/i, '').replace(/\]\]>$/i, '').trim();
}

function pickXmlTagValue(xml: string, tag: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
    const raw = match?.[1]?.trim();
    if (!raw) return undefined;
    return stripCdata(decodeHtmlEntities(raw));
}

export function parseHongbaoMessage(rawContent: string): ParsedHongbao | null {
    const xml = rawContent.trim();
    if (!xml) return null;
    const appmsgMatch = xml.match(/<appmsg[\s\S]*?<\/appmsg>/i);
    if (!appmsgMatch) return null;

    const appmsg = appmsgMatch[0];
    const pay = appmsg.match(/<wcpayinfo[\s\S]*?<\/wcpayinfo>/i)?.[0] ?? appmsg;
    const appType = Number.parseInt(pickXmlTagValue(appmsg, 'type') ?? '', 10);
    if (appType !== HONGBAO_APP_TYPE) return null;

    const nativeUrl = pickXmlTagValue(pay, 'nativeurl')
        ?? pickXmlTagValue(pay, 'native_url')
        ?? pickXmlTagValue(appmsg, 'nativeurl');
    if (!nativeUrl) return null;

    const title = pickXmlTagValue(pay, 'receivertitle')
        || pickXmlTagValue(pay, 'sendertitle')
        || pickXmlTagValue(appmsg, 'title')
        || '恭喜发财';
    return {title, nativeUrl};
}
