import 'dotenv/config';
import prisma from '../config/prisma';
import { scheduleTestCronJob } from './jobs';

// Execute the job
scheduleTestCronJob()
  .then(async () => {
    // Cleanup Prisma connection
    await prisma.$disconnect();
    console.log('[Test Cron Job] Prisma connection closed');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Test Cron Job] Unhandled error:', error);
    // Cleanup Prisma connection even on error
    await prisma.$disconnect();
    process.exit(1);
  });
