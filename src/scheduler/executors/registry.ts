import type {SchedulerExecutor, SchedulerExecutorMetadata} from './types.js';

export class SchedulerExecutorRegistry {
    private readonly executors = new Map<string, SchedulerExecutor>();

    register(executor: SchedulerExecutor): void {
        this.executors.set(executor.key, executor);
    }

    get(key: string): SchedulerExecutor | undefined {
        return this.executors.get(key);
    }

    list(): SchedulerExecutorMetadata[] {
        return Array.from(this.executors.values()).map((executor) => ({
            key: executor.key,
            description: executor.description,
            timeoutMs: executor.timeoutMs,
            supportsManualTrigger: executor.supportsManualTrigger ?? true,
        }));
    }
}

export const schedulerExecutorRegistry = new SchedulerExecutorRegistry();

