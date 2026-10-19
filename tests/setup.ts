import { afterEach } from 'vitest';

/**
 * The simulation tests are long and synchronous. On a slow CPU a whole file can
 * run without the worker ever reaching its event loop, and vitest's own RPC
 * times out after 60 s ("Timeout calling onTaskUpdate") even though every test
 * passed. A macrotask between tests lets those replies through.
 */
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
