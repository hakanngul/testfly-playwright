import { describe, it, expect, beforeEach } from 'vitest';
import { DbClient } from '../src/clients/db/DbClient';


describe('DbClient', () => {
  let db: DbClient;

  beforeEach(() => {
    db = new DbClient();
  });

  it('should create and retrieve records in tables', async () => {
    const user = await db.users.create({ name: 'Alice', role: 'admin' });
    expect(user.id).toBeDefined();
    expect(user.name).toBe('Alice');
    expect(user.role).toBe('admin');

    const found = await db.users.findById(user.id);
    expect(found).toEqual(user);
  });

  it('should find one record matching criteria', async () => {
    await db.users.create({ name: 'Bob', role: 'user' });
    await db.users.create({ name: 'Charlie', role: 'admin' });

    const admin = await db.users.findOne({ role: 'admin' });
    expect(admin).not.toBeNull();
    expect(admin?.name).toBe('Charlie');
  });

  it('should update and delete records', async () => {
    const order = await db.orders.create({ product: 'Phone', status: 'PENDING' });
    const updated = await db.orders.update(order.id, { status: 'COMPLETED' });

    expect(updated.status).toBe('COMPLETED');

    const deleted = await db.orders.delete(order.id);
    expect(deleted).toBe(true);

    const check = await db.orders.findById(order.id);
    expect(check).toBeNull();
  });

  it('should assert status successfully', async () => {
    const order = await db.orders.create({ product: 'Laptop', status: 'SHIPPED' });
    await expect(db.orders.assertStatus('SHIPPED', order.id)).resolves.not.toThrow();
  });

  it('should cleanup tables', async () => {
    await db.users.create({ name: 'Eve' });
    expect(await db.users.count()).toBe(1);

    await db.cleanup();
    expect(await db.users.count()).toBe(0);
  });
});
