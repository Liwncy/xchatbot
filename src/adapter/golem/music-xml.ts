import {randomCardAppId} from './card-appids.js';

const MUSIC_APP_TYPE = 3;

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

export function buildMusicAppXml(params: {
    title: string;
    singer?: string;
    url?: string;
    dataUrl?: string;
    thumbUrl?: string;
}): {appType: number; xml: string} {
    const xml = `<appmsg appid="${randomCardAppId()}" sdkver="0">`
        + `<title>${escapeXml(params.title || '音乐')}</title>`
        + `<des>${escapeXml(params.singer ?? '')}</des>`
        + '<action></action>'
        + `<type>${MUSIC_APP_TYPE}</type>`
        + '<showtype>0</showtype>'
        + `<url>${escapeXml(params.url ?? '')}</url>`
        + '<lowurl></lowurl>'
        + `<dataurl>${escapeXml(params.dataUrl ?? '')}</dataurl>`
        + '<lowdataurl></lowdataurl>'
        + `<songalbumurl>${escapeXml(params.thumbUrl ?? '')}</songalbumurl>`
        + '<songlyric></songlyric>'
        + '</appmsg>';
    return {appType: MUSIC_APP_TYPE, xml};
}
