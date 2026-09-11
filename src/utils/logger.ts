export const logger = {
    debug(message: string, ...args: unknown[]): void {
        console.debug(message, ...args);
    },
    info(message: string, ...args: unknown[]): void {
        console.info(message, ...args);
    },
    warn(message: string, ...args: unknown[]): void {
        console.warn(message, ...args);
    },
    error(message: string, ...args: unknown[]): void {
        console.error(message, ...args);
    },
};
