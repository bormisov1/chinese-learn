import { StoreData } from "./types";
import { mergeExplanations } from "./word-explanations";

function hasStudyData(data: Partial<StoreData>) {
  return Boolean(
    data.languageSelected ||
    data.onboardingComplete ||
    data.words?.length ||
    data.sentences?.length ||
    data.attempts?.length ||
    data.roundCompletions?.length ||
    Object.keys(data.explanations ?? {}).length,
  );
}

export function applyBootstrapSnapshot(local: StoreData, remote: Partial<StoreData>): StoreData {
  // A transient empty response must never erase an already-used local client.
  if (hasStudyData(local) && !hasStudyData(remote)) return local;
  return {
    ...local,
    ...remote,
    explanations: mergeExplanations(local.explanations, remote.explanations),
    settings: { ...local.settings, ...(remote.settings ?? {}) },
    mixQueue: local.mixQueue,
    mixPosition: local.mixPosition,
    storageVersion: local.storageVersion,
  };
}
