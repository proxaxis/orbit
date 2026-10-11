/**
 * Redis クライアント（OAuth state と Push スケジュール用。
 * エンティティの永続化は Realm）
 */
import Redis from 'ioredis';
import { env } from '@/assets/constants.js';

/** @type {RedisClient} */
export const redis = new (/** @type {any} */ (Redis))({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: undefined,
  lazyConnect: false,
});

redis.on('connect', () => {
  console.log('Connected to Redis server');
});

redis.on('error', (/** @type {any} */ err) => {
  console.error('Redis connection error:', err);
});
