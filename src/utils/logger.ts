/**
 * 轻量级日志工具，适用于 Cloudflare Workers 环境。
 *
 * 提供 debug / info / warn / error 四个级别，所有输出通过 console 打印，
 * 不依赖任何外部包。
 */

/** 日志级别枚举（数值越大优先级越高） */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  /** 禁用所有日志 */
  SILENT = 4,
}

/** 日志级别名称映射 */
const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.SILENT]: 'SILENT',
};

/**
 * Logger 类 —— 提供结构化日志能力。
 *
 * 使用方式：
 * ```ts
 * import { logger } from './utils/logger.js';
 * logger.info('收到消息', { from: 'user1' });
 * logger.error('处理失败', error);
 * ```
 */
export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.DEBUG) {
    this.level = level;
  }

  /** 设置最低日志级别 */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /** 获取当前日志级别 */
  getLevel(): LogLevel {
    return this.level;
  }

  /** 输出 DEBUG 级别日志 */
  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  /** 输出 INFO 级别日志 */
  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  /** 输出 WARN 级别日志 */
  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  /** 输出 ERROR 级别日志 */
  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  /** 内部日志输出方法 */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level < this.level) return;

    const label = LEVEL_LABELS[level];
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${label}]`;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(prefix, message, ...args);
        break;
      case LogLevel.INFO:
        console.info(prefix, message, ...args);
        break;
      case LogLevel.WARN:
        console.warn(prefix, message, ...args);
        break;
      case LogLevel.ERROR:
        console.error(prefix, message, ...args);
        break;
      default:
        break;
    }
  }
}

/** 全局单例 logger */
export const logger = new Logger();
