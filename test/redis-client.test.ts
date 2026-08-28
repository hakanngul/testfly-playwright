import { describe, it, expect, beforeEach } from 'vitest';
import { RedisClient } from '../src/clients/db/RedisClient';


describe('RedisClient', () => {
  let redis: RedisClient;

  beforeEach(() => {
    redis = new RedisClient();
  });

  it('should set and get values correctly', async () => {
    await redis.set('user:100', { name: 'Alice', role: 'admin' });
    const user = await redis.get('user:100');
    expect(user).toEqual({ name: 'Alice', role: 'admin' });
  });

  it('should return null for non-existing keys', async () => {
    const val = await redis.get('nonexistent');
    expect(val).toBeNull();
  });

  it('should handle TTL expiry properly', async () => {
    await redis.set('temp_otp', '123456', 0.05); // 50ms TTL
    expect(await redis.get('temp_otp')).toBe('123456');

    await new Promise((r) => setTimeout(r, 60));
    expect(await redis.get('temp_otp')).toBeNull();
  });

  it('should assert key existence and values', async () => {
    await redis.set('session:token', 'abc-123');
    await expect(redis.assertExists('session:token')).resolves.not.toThrow();
    await expect(redis.assertValue('session:token', 'abc-123')).resolves.not.toThrow();

    await expect(redis.assertExists('invalid_key')).rejects.toThrow('Redis Assert Failed');
    await expect(redis.assertValue('session:token', 'wrong_val')).rejects.toThrow('Redis Assert Failed');
  });

  it('should delete and flush keys', async () => {
    await redis.set('key1', 'val1');
    await redis.set('key2', 'val2');
    expect(await redis.keys()).toHaveLength(2);

    await redis.del('key1');
    expect(await redis.exists('key1')).toBe(false);

    await redis.flush();
    expect(await redis.keys()).toHaveLength(0);
  });
});
