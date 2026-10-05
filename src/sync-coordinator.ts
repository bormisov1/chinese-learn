import type { StoreData } from "./types";

/** Commit a response only while the state used to make its request is still current. */
export function commitBootstrapResponse(
  update: (fn: (current: StoreData) => StoreData) => void,
  submitted: StoreData,
  merged: StoreData,
  onAccepted: (merged: StoreData) => StoreData,
) {
  update(current => current === submitted ? onAccepted(merged) : current);
}

/** Keep bootstrap requests in order so an older request cannot overwrite a newer server snapshot. */
export function createBootstrapCoordinator(
  readPending: () => StoreData | null,
  bootstrap: (submitted: StoreData) => Promise<StoreData>,
  commit: (submitted: StoreData, merged: StoreData) => void,
) {
  let inFlight = false;
  let queued = false;

  const run = () => {
    if (inFlight) { queued = true; return; }
    const submitted = readPending();
    if (!submitted) return;
    inFlight = true;
    void bootstrap(submitted).then(merged => commit(submitted, merged)).catch(() => {
      // Local changes remain available; the next change can retry syncing.
    }).finally(() => {
      inFlight = false;
      if (queued) { queued = false; run(); }
    });
  };

  return run;
}
