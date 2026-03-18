import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Logger, LogLevel, logger} from '../../src/utils/logger.js';

describe('Logger', () => {
    let spyDebug: ReturnType<typeof vi.spyOn>;
    let spyInfo: ReturnType<typeof vi.spyOn>;
    let spyWarn: ReturnType<typeof vi.spyOn>;
    let spyError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        spyDebug = vi.spyOn(console, 'debug').mockImplementation(() => {
        });
        spyInfo = vi.spyOn(console, 'info').mockImplementation(() => {
        });
        spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {
        });
        spyError = vi.spyOn(console, 'error').mockImplementation(() => {
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('默认日志级别为 DEBUG', () => {
        const log = new Logger();
        expect(log.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('可以设置日志级别', () => {
        const log = new Logger();
        log.setLevel(LogLevel.WARN);
        expect(log.getLevel()).toBe(LogLevel.WARN);
    });

    it('debug() 在 DEBUG 级别下输出', () => {
        const log = new Logger(LogLevel.DEBUG);
        log.debug('测试消息');
        expect(spyDebug).toHaveBeenCalledTimes(1);
        expect(spyDebug.mock.calls[0][1]).toBe('测试消息');
    });

    it('info() 在 INFO 级别下输出', () => {
        const log = new Logger(LogLevel.INFO);
        log.info('信息消息');
        expect(spyInfo).toHaveBeenCalledTimes(1);
        expect(spyInfo.mock.calls[0][1]).toBe('信息消息');
    });

    it('warn() 在 WARN 级别下输出', () => {
        const log = new Logger(LogLevel.WARN);
        log.warn('警告消息');
        expect(spyWarn).toHaveBeenCalledTimes(1);
        expect(spyWarn.mock.calls[0][1]).toBe('警告消息');
    });

    it('error() 在 ERROR 级别下输出', () => {
        const log = new Logger(LogLevel.ERROR);
        log.error('错误消息');
        expect(spyError).toHaveBeenCalledTimes(1);
        expect(spyError.mock.calls[0][1]).toBe('错误消息');
    });

    it('低于设定级别的日志不输出', () => {
        const log = new Logger(LogLevel.WARN);
        log.debug('debug 消息');
        log.info('info 消息');
        expect(spyDebug).not.toHaveBeenCalled();
        expect(spyInfo).not.toHaveBeenCalled();
    });

    it('SILENT 级别下所有日志均不输出', () => {
        const log = new Logger(LogLevel.SILENT);
        log.debug('d');
        log.info('i');
        log.warn('w');
        log.error('e');
        expect(spyDebug).not.toHaveBeenCalled();
        expect(spyInfo).not.toHaveBeenCalled();
        expect(spyWarn).not.toHaveBeenCalled();
        expect(spyError).not.toHaveBeenCalled();
    });

    it('日志输出带有时间戳和级别前缀', () => {
        const log = new Logger(LogLevel.INFO);
        log.info('测试前缀');
        const prefix = spyInfo.mock.calls[0][0] as string;
        expect(prefix).toMatch(/^\[.*\] \[INFO\]$/);
    });

    it('支持传递额外参数', () => {
        const log = new Logger(LogLevel.DEBUG);
        const extra = {key: 'value'};
        log.debug('带参数', extra);
        expect(spyDebug).toHaveBeenCalledTimes(1);
        expect(spyDebug.mock.calls[0][2]).toBe(extra);
    });

    it('全局单例 logger 可直接使用', () => {
        logger.info('全局日志');
        expect(spyInfo).toHaveBeenCalledTimes(1);
    });
});
