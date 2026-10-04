import Redis from 'ioredis';
import { Queue } from 'bullmq';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const names = ['lead-imports', 'campaign-dispatch', 'campaign-email', 'campaign-sms', 'campaign-whatsapp', 'document-ingestion'];

for (const name of names) {
  const queue = new Queue(name, { connection });
  const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
  console.log(JSON.stringify({ queue: name, ...counts }));
  await queue.close();
}

await connection.quit();
