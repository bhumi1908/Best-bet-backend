import Redis from 'ioredis';

// Redis connection options for BullMQ
// CRITICAL: BullMQ creates its own Redis connections from these options
// Each Queue and Worker instance gets its own connection
// IMPORTANT: maxRetriesPerRequest MUST be null for BullMQ (BullMQ will override it anyway)
export const redisConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // CRITICAL: Must be null for BullMQ (BullMQ requires this)
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('Redis connection failed after 10 attempts. Stopping retries.');
      return null; // Stop retrying
    }
    return Math.min(times * 50, 2000); // Exponential backoff: 50ms, 100ms, 150ms, ..., max 2000ms
  },
  lazyConnect: false, // BullMQ handles connection lifecycle, but we want immediate connection
};

// Redis instance for direct use (if needed elsewhere)
export const redisConnection = new Redis(redisConnectionOptions);

// Track connection status
let isRedisConnected = false;

// Connection event handlers
redisConnection.on('connect', () => {
  isRedisConnected = true;
  console.log('Redis connected');
});

redisConnection.on('ready', () => {
  isRedisConnected = true;
  console.log('Redis ready');
});

redisConnection.on('error', (error: any) => {
  isRedisConnected = false;
  // Log warning if Redis is not available but don't crash
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    console.warn(' Redis is not available. Queue functionality will not work until Redis is started.');
    console.warn(' Please start Redis or set REDIS_HOST/REDIS_PORT environment variables.');
  } else {
    console.error('Redis error:', error.message);
  }
});

redisConnection.on('close', () => {
  isRedisConnected = false;
  console.warn('⚠️  Redis connection closed');
});

// Function to check if Redis is available
export async function checkRedisConnection(): Promise<boolean> {
  try {
    if (!isRedisConnected) {
      await redisConnection.connect();
    }
    await redisConnection.ping();
    return true;
  } catch (error) {
    return false;
  }
}

export { isRedisConnected };
export default redisConnection;
