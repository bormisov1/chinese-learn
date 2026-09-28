import { StoreData } from "./types";

function hasStudyData(data: Partial<StoreData>) {
  return Boolean(
    data.languageSelected ||
    data.onboardingComplete ||
    data.words?.length ||
    data.sentences?.length ||
    data.attempts?.length ||
    data.roundCompletions?.length,
  );
}

export function applyBootstrapSnapshot(local: StoreData, remote: Partial<StoreData>): StoreData {
  // A transient empty response must never erase an already-used local client.
  if (hasStudyData(local) && !hasStudyData(remote)) return local;
  return {
    ...local,
    ...remote,
    settings: { ...local.settings, ...(remote.settings ?? {}) },
    mixQueue: local.mixQueue,
    mixPosition: local.mixPosition,
    storageVersion: local.storageVersion,
  };
}
