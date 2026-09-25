import type { MemoryRepository, SpatialMemory } from '../../types/memory';

/**
 * Where memories live.
 *
 * Two implementations, one interface. The application uses `localStorage`; tests
 * and any non-browser context use the in-memory one. Nothing above this file
 * knows which it has, which is the whole point — Phase 5 proves persistence
 * locally, and the abstraction is what lets that become a real database later
 * without touching the manager, the resolver or the command bus.
 */

const STORAGE_KEY = 'nova.memories.v1';

/** Storage is a shared, fallible resource: quota, private mode, another tab. */
function storageAvailable(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const probe = '__nova_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export class InMemoryRepository implements MemoryRepository {
  private records = new Map<string, SpatialMemory>();

  save(memory: SpatialMemory) {
    this.records.set(memory.id, memory);
  }

  get(id: string): SpatialMemory | null {
    return this.records.get(id) ?? null;
  }

  getAll(): SpatialMemory[] {
    return [...this.records.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  delete(id: string): boolean {
    return this.records.delete(id);
  }

  clear() {
    this.records.clear();
  }
}

/**
 * The browser-backed repository.
 *
 * Reads and writes the whole collection each time. At the scale Phase 5 deals
 * in — a handful of named arrangements, written only when the user asks — that
 * is far cheaper than the bookkeeping needed to avoid it, and it keeps the
 * stored value a single self-consistent document.
 */
export class LocalStorageRepository implements MemoryRepository {
  private read(): Record<string, SpatialMemory> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // Anything could be under that key — another version of NOVA, or a user
      // editing it by hand. A malformed store is treated as empty rather than
      // being allowed to throw somewhere further up.
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private write(records: Record<string, SpatialMemory>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Quota exceeded or storage disabled. A memory that cannot be written is
      // reported by the manager; it must never take the environment down.
    }
  }

  save(memory: SpatialMemory) {
    const records = this.read();
    records[memory.id] = memory;
    this.write(records);
  }

  get(id: string): SpatialMemory | null {
    return this.read()[id] ?? null;
  }

  getAll(): SpatialMemory[] {
    return Object.values(this.read()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  delete(id: string): boolean {
    const records = this.read();
    if (!records[id]) return false;
    delete records[id];
    this.write(records);
    return true;
  }

  clear() {
    this.write({});
  }
}

/** The repository the running application uses. */
let active: MemoryRepository = storageAvailable()
  ? new LocalStorageRepository()
  : new InMemoryRepository();

export function getRepository(): MemoryRepository {
  return active;
}

/** Swap the backing store. Used by tests, and by a future real database. */
export function setRepository(repository: MemoryRepository) {
  active = repository;
}

/** Whether memories will survive a reload, or only this session. */
export function isPersistent(): boolean {
  return active instanceof LocalStorageRepository;
}
