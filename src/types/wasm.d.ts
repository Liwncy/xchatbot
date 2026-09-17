declare module '*.wasm' {
    const value: ArrayBuffer;
    export default value;
}

declare module 'silk-wasm/lib/silk.wasm' {
    const value: ArrayBuffer;
    export default value;
}
