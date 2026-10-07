import { StoreData } from "./types";
import { mergeExplanations } from "./word-explanations";
import { keepRemovedWordsOut } from "./vocabulary-selection";

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
  // These settings are device-local and are deliberately excluded from sync requests.
  const { apiKey: _apiKey, apiKeyValidated: _validated, apiUrl: _apiUrl, model: _model, ...remoteSettings } = remote.settings ?? {};
  return keepRemovedWordsOut({
    ...local,
    ...remote,
    explanations: mergeExplanations(local.explanations, remote.explanations),
    settings: { ...local.settings, ...remoteSettings },
    mixQueue: local.mixQueue,
    mixPosition: local.mixPosition,
    storageVersion: local.storageVersion,
    removedWordHanzi: local.removedWordHanzi,
  }, local.removedWordHanzi ?? []);
}
