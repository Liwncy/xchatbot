declare module '*silk-glue.mjs' {
    export function encode(
        input: ArrayBufferView | ArrayBuffer,
        sampleRate: number,
    ): Promise<{data: Uint8Array; duration: number}>;
    export function getDuration(data: ArrayBufferView | ArrayBuffer, frameMs?: number): number;
    export function isWav(data: ArrayBufferView | ArrayBuffer): boolean;
    export function isSilk(data: ArrayBufferView | ArrayBuffer): boolean;
}

declare module '*.wasm' {
    const value: WebAssembly.Module;
    export default value;
}

declare module 'silk-wasm/lib/silk.wasm' {
    const value: WebAssembly.Module;
    export default value;
}
