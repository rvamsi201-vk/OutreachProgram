import { Queue, Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { logger } from '../config/logger.js';
import { CampaignRepository } from '../repositories/campaign.repository.js';
import { CampaignExecutionService } from '../services/campaign/campaign-execution.service.js';

export interface CampaignExecutionJob {
  executionId: string;
}

const connection = redis.duplicate({ maxRetriesPerRequest: null });

export const campaignSchedulerQueue = new Queue('campaign-scheduler', { connection });
export const campaignQueue = new Queue<CampaignExecutionJob>('campaign', { connection });
export const emailQueue = new Queue<CampaignExecutionJob>('email', { connection });
export const smsQueue = new Queue<CampaignExecutionJob>('sms', { connection });
export const whatsappQueue = new Queue<CampaignExecutionJob>('whatsapp', { connection });
export const notificationQueue = new Queue('notification', { connection });

export async function startCampaignWorkers() {
  const repo = new CampaignRepository();

  await campaignSchedulerQueue.add(
    'tick',
    {},
    {
      jobId: 'campaign-scheduler-tick',
      repeat: { every: 30_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );

  const schedulerWorker = new Worker(
    'campaign-scheduler',
    async () => {
      await repo.activateDueRuns();
      const enrollmentIds = await repo.dueEnrollmentIds(100);
      for (const enrollmentId of enrollmentIds) {
        const execution = await repo.createExecutionForEnrollment(enrollmentId);
        if (execution) {
          await campaignQueue.add('dispatch', { executionId: execution.id }, {
            jobId: execution.id,
            attempts: 3,
            backoff: { type: 'exponential', delay: 10_000 },
            removeOnComplete: true,
            removeOnFail: 500,
          });
        }
      }
      return { claimed: enrollmentIds.length };
    },
    { connection },
  );

  const dispatchWorker = new Worker<CampaignExecutionJob>(
    'campaign',
    async (job) => {
      const bundle = await repo.executionBundle(job.data.executionId);
      const channel = bundle?.step?.channel;
      const queue = channel === 'EMAIL' ? emailQueue : channel === 'SMS' ? smsQueue : channel === 'WHATSAPP' ? whatsappQueue : null;
      if (!queue) throw new Error(`Unsupported campaign channel: ${channel}`);
      await queue.add('send', job.data, {
        jobId: job.data.executionId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: 500,
      });
    },
    { connection },
  );

  const makeChannelWorker = (name: 'email' | 'sms' | 'whatsapp') =>
    new Worker<CampaignExecutionJob>(
      name,
      async (job) => {
        await new CampaignExecutionService().execute(job.data.executionId);
      },
      { connection },
    ).on('failed', async (job, err) => {
      logger.error({ err, jobId: job?.id, queue: name }, 'Campaign channel job failed');
      if (job) {
        await repo.markExecution(job.data.executionId, {
          status: 'FAILED',
          error: err.message,
          completedAt: new Date(),
        });
      }
    });

  dispatchWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Campaign dispatch failed');
  });
  schedulerWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Campaign scheduler failed');
  });

  return [
    schedulerWorker,
    dispatchWorker,
    makeChannelWorker('email'),
    makeChannelWorker('sms'),
    makeChannelWorker('whatsapp'),
  ];
}
