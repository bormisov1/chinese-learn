import { StoreData } from "./types";
import { bootstrap } from "./backend";
import { applyBootstrapSnapshot } from "./sync-merge";
export function syncableSnapshot(data: StoreData) {
  const { apiKey: _apiKey, apiKeyValidated: _validated, apiUrl: _apiUrl, model: _model, ...settings } = data.settings;
  return { ...data, settings, mixQueue: [], mixPosition: 0 };
}

export async function bootstrapStore(data: StoreData): Promise<StoreData> {
  const response = await bootstrap({ bootstrapId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, deviceId: "local-device", snapshot: syncableSnapshot(data) });
  const remote = response.snapshot as Partial<StoreData>;
  return applyBootstrapSnapshot(data, remote);
}
