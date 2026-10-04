import { buildApp } from './app.js';
import { env, logger } from './config/index.js';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
    logger.info(`🚀 API server running on http://localhost:${env.API_PORT}`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  }
}

start();
