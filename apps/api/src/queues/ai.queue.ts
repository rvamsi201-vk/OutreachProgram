import { Queue, Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { logger } from '../config/logger.js';
import { DocumentIngestionService } from '../modules/ai/knowledge/document-ingestion.service.js';

export interface DocumentIngestionJob {
  documentId: string;
}

const connection = redis.duplicate({ maxRetriesPerRequest: null });

export const documentIngestionQueue = new Queue<DocumentIngestionJob>('document-ingestion', { connection });
export const transcriptionQueue = new Queue('transcription', { connection });

export function startAiWorkers() {
  const ingestionWorker = new Worker<DocumentIngestionJob>(
    'document-ingestion',
    async (job) => {
      await new DocumentIngestionService().ingest(job.data.documentId);
    },
    { connection },
  );
  ingestionWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Document ingestion failed');
  });
  return [ingestionWorker];
}
