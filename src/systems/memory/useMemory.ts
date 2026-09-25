import { useEffect } from 'react';
import { setSavedMemoryReader } from '../context/contextEngine';
import { initMemory, listMemorySummaries } from './memoryManager';

/**
 * Attach the memory layer to the running application.
 *
 * Two things happen once, at startup: stored memories are read out of the
 * repository into the metadata store so the interface can list them, and the
 * context engine is told how to find their names so they can be described to
 * the model. Nothing after this reads storage until a memory command asks it to.
 */
export function useMemory() {
  useEffect(() => {
    initMemory();
    setSavedMemoryReader(() =>
      listMemorySummaries().map((summary) => ({
        id: summary.id,
        name: summary.name,
        workspace: summary.workspace,
      })),
    );
    return () => setSavedMemoryReader(() => []);
  }, []);
}
