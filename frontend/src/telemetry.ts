import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { BACKEND_URL } from "./api-client";

type TelemetryProperties = Record<string, string | number | boolean | undefined>;
type TelemetryEvent = {
  eventId: string;
  name: string;
  occurredAt: number;
  platform: string;
  appVersion: string;
  installId: string;
  properties: TelemetryProperties;
};

const QUEUE_KEY = "hanzi-deck:telemetry:v1";
const INSTALL_KEY = "hanzi-deck:telemetry-install:v1";
const FIRST_OPEN_KEY = "hanzi-deck:telemetry-first-open:v1";
const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
let installId: string | null = null;
let queue: TelemetryEvent[] = [];
let loaded = false;
let flushInFlight: Promise<void> | null = null;

const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const [storedQueue, storedInstall] = await Promise.all([AsyncStorage.getItem(QUEUE_KEY), AsyncStorage.getItem(INSTALL_KEY)]);
    queue = storedQueue ? JSON.parse(storedQueue) : [];
    installId = storedInstall || id();
    if (!storedInstall) await AsyncStorage.setItem(INSTALL_KEY, installId);
  } catch {
    queue = [];
    installId = installId ?? id();
  }
}

async function persist() {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-10000)));
}

export async function track(name: string, properties: TelemetryProperties = {}) {
  await load();
  queue.push({
    eventId: id(), name, occurredAt: Date.now(), platform: Platform.OS,
    appVersion: "1.0.0", installId: installId ?? "unknown",
    properties: { ...properties, sessionId },
  });
  queue = queue.slice(-10000);
  await persist();
  if (queue.length >= 20) void flushTelemetry();
}

export async function flushTelemetry() {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    await load();
    if (!queue.length) return;
    const batch = queue.slice(0, 100);
    try {
      const response = await fetch(`${BACKEND_URL}/v1/telemetry/batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
      });
      if (!response.ok) return;
      const result = await response.json() as { accepted?: number };
      const accepted = Math.max(0, Math.min(batch.length, Number(result.accepted ?? 0)));
      queue = queue.slice(accepted);
      await persist();
    } catch {
      // Telemetry must never block learning or authentication.
    }
  })().finally(() => { flushInFlight = null; });
  return flushInFlight;
}

export async function initializeTelemetry() {
  await track("app_opened");
  if (!(await AsyncStorage.getItem(FIRST_OPEN_KEY))) {
    await AsyncStorage.setItem(FIRST_OPEN_KEY, "1");
    await track("first_app_opened");
  }
  await flushTelemetry();
}
