import { describe, it, expect, vi } from 'vitest';
import { ConnectionRegistry, maskRedisUrl, type ConnectionSet } from '../src/connections.js';

function fakeSet(): ConnectionSet {
  return {
    controller: {} as never,
    actions: {} as never,
    inspector: {} as never,
    ping: async () => true,
    close: vi.fn(async () => {}),
  };
}

describe('maskRedisUrl', () => {
  it('masks credentials', () => {
    expect(maskRedisUrl('redis://user:secret@host:6379')).toBe('redis://***:***@host:6379');
    expect(maskRedisUrl('redis://host:6379')).toBe('redis://host:6379');
    expect(maskRedisUrl('garbage')).toBe('redis://***');
  });
});

describe('ConnectionRegistry', () => {
  it('registers, lists (masked), gets, and reports the default', () => {
    const reg = new ConnectionRegistry('default');
    reg.register('default', fakeSet(), 'redis://a:b@h:6379');
    expect(reg.ids()).toEqual(['default']);
    expect(reg.get('default')).toBeDefined();
    expect(reg.list()[0]).toEqual({ id: 'default', redisUrl: 'redis://***:***@h:6379', isDefault: true });
  });

  it('adds at runtime via the factory and removes (not the default)', async () => {
    const created: string[] = [];
    const reg = new ConnectionRegistry('default', async (id) => {
      created.push(id);
      return fakeSet();
    });
    reg.register('default', fakeSet(), 'redis://h');

    await reg.add('staging', 'redis://staging:6379');
    expect(created).toEqual(['staging']);
    expect(reg.ids().sort()).toEqual(['default', 'staging']);

    await expect(reg.add('staging', 'redis://x')).rejects.toThrow(/already exists/);
    await expect(reg.remove('default')).rejects.toThrow(/cannot remove the default/);
    expect(await reg.remove('staging')).toBe(true);
    expect(await reg.remove('nope')).toBe(false);
  });

  it('refuses runtime add when no factory is set', async () => {
    const reg = new ConnectionRegistry('default');
    await expect(reg.add('x', 'redis://x')).rejects.toThrow(/not enabled/);
  });
});
