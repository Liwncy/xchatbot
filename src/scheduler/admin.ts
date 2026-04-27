import type {Env} from '../types/message.js';
import {computeNextRunAt} from './cron.js';
import {
    createSchedulerCenter,
    createSchedulerRepository,
    listSchedulerExecutors,
    normalizeCreateJobInput,
    normalizeListPagination,
    normalizeUpdateJobInput,
    toSchedulerJobView,
    toSchedulerRunView,
} from './index.js';
import {jsonResponse, nowUnixSeconds} from './utils.js';

function parseJobId(pathname: string): number | null {
    const matched = pathname.match(/^\/admin\/scheduler\/jobs\/(\d+)(?:\/|$)/);
    if (!matched) return null;
    return Number(matched[1]);
}

export async function handleSchedulerAdmin(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const repository = createSchedulerRepository(env);

    if (request.method === 'GET' && pathname === '/admin/scheduler/executors') {
        return jsonResponse({items: listSchedulerExecutors()});
    }

    if (request.method === 'GET' && pathname === '/admin/scheduler/jobs') {
        const {limit, offset} = normalizeListPagination(url);
        const result = await repository.listJobs(limit, offset);
        return jsonResponse({
            total: result.total,
            limit,
            offset,
            items: result.items.map(toSchedulerJobView),
        });
    }

    if (request.method === 'POST' && pathname === '/admin/scheduler/jobs') {
        const body = await request.json();
        const now = nowUnixSeconds();
        const input = normalizeCreateJobInput(body, now);
        const created = await repository.createJob({...input, now});
        return jsonResponse({ok: true, item: toSchedulerJobView(created)}, {status: 201});
    }

    const jobId = parseJobId(pathname);
    if (!jobId) {
        return new Response('Not Found', {status: 404});
    }

    if (request.method === 'GET' && pathname === `/admin/scheduler/jobs/${jobId}`) {
        const job = await repository.getJobById(jobId);
        if (!job) return new Response('Not Found', {status: 404});
        return jsonResponse({item: toSchedulerJobView(job)});
    }

    if (request.method === 'POST' && pathname === `/admin/scheduler/jobs/${jobId}/update`) {
        const existingJob = await repository.getJobById(jobId);
        if (!existingJob) return new Response('Not Found', {status: 404});
        const body = await request.json();
        const now = nowUnixSeconds();
        const input = normalizeUpdateJobInput(existingJob, body, now);
        const updated = await repository.updateJob(jobId, {...input, now});
        return jsonResponse({ok: true, item: updated ? toSchedulerJobView(updated) : null});
    }

    if (request.method === 'GET' && pathname === `/admin/scheduler/jobs/${jobId}/runs`) {
        const job = await repository.getJobById(jobId);
        if (!job) return new Response('Not Found', {status: 404});
        const {limit, offset} = normalizeListPagination(url);
        const result = await repository.listRunsByJobId(jobId, limit, offset);
        return jsonResponse({
            job: toSchedulerJobView(job),
            total: result.total,
            limit,
            offset,
            items: result.items.map(toSchedulerRunView),
        });
    }

    if (request.method === 'POST' && pathname === `/admin/scheduler/jobs/${jobId}/pause`) {
        const updated = await repository.pauseJob(jobId, nowUnixSeconds());
        if (!updated) return new Response('Not Found', {status: 404});
        const job = await repository.getJobById(jobId);
        return jsonResponse({ok: true, item: job ? toSchedulerJobView(job) : null});
    }

    if (request.method === 'POST' && pathname === `/admin/scheduler/jobs/${jobId}/resume`) {
        const job = await repository.getJobById(jobId);
        if (!job) return new Response('Not Found', {status: 404});
        let nextRunAt = job.nextRunAt;
        const now = nowUnixSeconds();
        if (job.scheduleType === 'cron' && job.cronExpr) {
            nextRunAt = computeNextRunAt(job.cronExpr, now, job.timezone);
        } else if (!nextRunAt || nextRunAt <= now) {
            nextRunAt = now + Math.max(1, job.retryBackoffSec);
        }
        await repository.resumeJob(jobId, nextRunAt, now);
        const updated = await repository.getJobById(jobId);
        return jsonResponse({ok: true, item: updated ? toSchedulerJobView(updated) : null});
    }

    if (request.method === 'POST' && pathname === `/admin/scheduler/jobs/${jobId}/trigger`) {
        const center = createSchedulerCenter(env);
        const result = await center.triggerJobNow(jobId, env, {
            workerInvocationId: `manual_${jobId}_${Date.now()}`,
        });
        if (!result) {
            return jsonResponse({ok: false, error: 'Job is currently leased or not found'}, {status: 409});
        }
        return jsonResponse({
            ok: true,
            job: toSchedulerJobView(result.job),
            run: toSchedulerRunView(result.run),
        });
    }

    return new Response('Not Found', {status: 404});
}


