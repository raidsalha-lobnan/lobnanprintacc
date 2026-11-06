import { db } from '../firebase';

import {
  FirestoreSyncTransport
} from './firestoreTransport';

import { LocalSyncDb } from './localDb';
import { SyncCoordinator } from './coordinator';
import { UnifiedRepository } from './repository';

export async function createUnifiedDataLayer(
  workspaceId: string
) {
  const local = new LocalSyncDb(workspaceId);

  const remote = new FirestoreSyncTransport(
    db,
    workspaceId
  );

  const coordinator = new SyncCoordinator(
    local,
    remote,
    workspaceId
  );

  const repository = new UnifiedRepository(
    local,
    coordinator
  );

  await coordinator.start();

  return {
    repository,
    coordinator,
    local,
    stop: () => coordinator.stop()
  };
}
