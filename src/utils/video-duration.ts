const MP4_CONTAINER_BOX_TYPES = new Set([
    'moov',
    'trak',
    'mdia',
    'minf',
    'stbl',
    'edts',
    'dinf',
    'mvex',
    'moof',
    'traf',
    'meta',
    'udta',
]);

function readFourCc(view: DataView, offset: number): string {
    if (offset + 4 > view.byteLength) return '';
    return String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3),
    );
}

function readUint64(view: DataView, offset: number): number | null {
    if (offset + 8 > view.byteLength) return null;
    const high = view.getUint32(offset);
    const low = view.getUint32(offset + 4);
    return high * 2 ** 32 + low;
}

function parseMp4DurationFromMvhd(view: DataView, offset: number, size: number, headerSize: number): number | undefined {
    const bodyOffset = offset + headerSize;
    const boxEnd = offset + size;
    if (bodyOffset + 4 > boxEnd) return undefined;

    const version = view.getUint8(bodyOffset);
    if (version === 1) {
        const timescaleOffset = bodyOffset + 20;
        const durationOffset = bodyOffset + 24;
        if (durationOffset + 8 > boxEnd) return undefined;
        const timescale = view.getUint32(timescaleOffset);
        const duration = readUint64(view, durationOffset);
        if (!timescale || duration == null || duration <= 0) return undefined;
        return duration / timescale;
    }

    const timescaleOffset = bodyOffset + 12;
    const durationOffset = bodyOffset + 16;
    if (durationOffset + 4 > boxEnd) return undefined;
    const timescale = view.getUint32(timescaleOffset);
    const duration = view.getUint32(durationOffset);
    if (!timescale || duration <= 0) return undefined;
    return duration / timescale;
}

function findMp4DurationSeconds(view: DataView, start: number, end: number): number | undefined {
    let offset = start;
    while (offset + 8 <= end) {
        const size32 = view.getUint32(offset);
        const type = readFourCc(view, offset + 4);
        let headerSize = 8;
        let boxSize = size32;

        if (size32 === 1) {
            const extendedSize = readUint64(view, offset + 8);
            if (extendedSize == null) return undefined;
            boxSize = extendedSize;
            headerSize = 16;
        } else if (size32 === 0) {
            boxSize = end - offset;
        }

        if (!boxSize || boxSize < headerSize || offset + boxSize > end) return undefined;

        if (type === 'mvhd') {
            const duration = parseMp4DurationFromMvhd(view, offset, boxSize, headerSize);
            if (duration && Number.isFinite(duration) && duration > 0) {
                return duration;
            }
        }

        if (MP4_CONTAINER_BOX_TYPES.has(type)) {
            const nestedStart = offset + headerSize + (type === 'meta' ? 4 : 0);
            const nestedEnd = offset + boxSize;
            if (nestedStart < nestedEnd) {
                const nestedDuration = findMp4DurationSeconds(view, nestedStart, nestedEnd);
                if (nestedDuration && Number.isFinite(nestedDuration) && nestedDuration > 0) {
                    return nestedDuration;
                }
            }
        }

        offset += boxSize;
    }

    return undefined;
}

/**
 * 从 MP4 文件数据中解析总时长（秒）。
 *
 * 仅解析 ISO BMFF / MP4 容器；失败时返回 `undefined`。
 */
export function parseMp4DurationSeconds(buffer: ArrayBuffer): number | undefined {
    if (buffer.byteLength < 32) return undefined;
    const view = new DataView(buffer);
    const duration = findMp4DurationSeconds(view, 0, view.byteLength);
    if (!duration || !Number.isFinite(duration) || duration <= 0) return undefined;
    return duration;
}


