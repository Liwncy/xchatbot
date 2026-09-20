export interface ImageMeta {
    size: number;
    width: number | null;
    height: number | null;
    mime: string | null;
}

function u16le(bytes: Uint8Array, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function u16be(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes: Uint8Array, offset: number): number {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function jpegSize(bytes: Uint8Array): {width: number; height: number} | null {
    let offset = 2;
    while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1];
        const length = u16be(bytes, offset + 2);
        if (marker >= 0xc0 && marker <= 0xc3 && length >= 7) {
            return {height: u16be(bytes, offset + 5), width: u16be(bytes, offset + 7)};
        }
        offset += 2 + length;
    }
    return null;
}

function webpSize(bytes: Uint8Array): {width: number; height: number} | null {
    if (bytes.length < 30) return null;
    const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (tag === 'VP8X' && bytes.length >= 30) {
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return {width, height};
    }
    if (tag === 'VP8 ' && bytes.length >= 30) {
        return {width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff};
    }
    if (tag === 'VP8L' && bytes.length >= 25) {
        const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
        return {width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1};
    }
    return null;
}

export function readImageMeta(buffer: ArrayBuffer, mimeHint?: string): ImageMeta {
    const bytes = new Uint8Array(buffer);
    const size = bytes.byteLength;
    let width: number | null = null;
    let height: number | null = null;
    let mime = mimeHint?.split(';')[0]?.trim() || null;

    if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        width = u16le(bytes, 6);
        height = u16le(bytes, 8);
        mime = 'image/gif';
    } else if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
        width = u32be(bytes, 16);
        height = u32be(bytes, 20);
        mime = 'image/png';
    } else if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        const jpeg = jpegSize(bytes);
        if (jpeg) {
            width = jpeg.width;
            height = jpeg.height;
        }
        mime = 'image/jpeg';
    } else if (bytes.length >= 16 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF') {
        const webp = webpSize(bytes);
        if (webp) {
            width = webp.width;
            height = webp.height;
        }
        mime = 'image/webp';
    }

    return {size, width, height, mime};
}
