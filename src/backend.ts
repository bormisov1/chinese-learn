import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type AuthTokens = { accessToken: string; refreshToken: string; userId: string; authProfile?: { provider?: string; chatId?: string; fullName?: string; username?: string } };
export type Account = { id: string; name: string | null; email: string | null; picture: string | null; createdAt: string };

const defaultBackendUrl = Platform.OS === "web" && typeof window !== "undefined"
  ? `${window.location.origin}/api`
  : "http://localhost:8787";
export const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || defaultBackendUrl).replace(/\/$/, "");
const TOKEN_KEY = "hanzi-deck:auth:v1";

async function readRaw() {
  return Platform.OS === "web" ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null : await AsyncStorage.getItem(TOKEN_KEY);
}
async function writeRaw(value: string | null) {
  if (Platform.OS === "web") {
    if (value === null) globalThis.localStorage?.removeItem(TOKEN_KEY);
    else globalThis.localStorage?.setItem(TOKEN_KEY, value);
  } else if (value === null) await AsyncStorage.removeItem(TOKEN_KEY);
  else await AsyncStorage.setItem(TOKEN_KEY, value);
}
export async function getTokens(): Promise<AuthTokens | null> {
  const raw = await readRaw();
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthTokens; } catch { return null; }
}
export async function saveTokens(tokens: AuthTokens) { await writeRaw(JSON.stringify(tokens)); }
export async function clearTokens() { await writeRaw(null); }

async function request(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const tokens = await getTokens();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (tokens?.accessToken) headers.set("authorization", `Bearer ${tokens.accessToken}`);
  const response = await fetch(`${BACKEND_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry && tokens?.refreshToken) {
    const refreshed = await fetch(`${BACKEND_URL}/v1/auth/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: tokens.refreshToken }) });
    if (refreshed.ok) { await saveTokens(await refreshed.json()); return request(path, init, false); }
    await clearTokens();
  }
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `Backend request failed (${response.status})`);
  return response.json();
}

export const exchangeCode = async (code: string, redirectUri: string) => {
  const response = await fetch(`${BACKEND_URL}/v1/auth/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, redirectUri }) });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Authentication failed");
  const tokens = await response.json() as AuthTokens;
  await saveTokens(tokens);
  return tokens;
};
export const authUrl = (provider: "google" | "telegram", redirectUri: string) => `${BACKEND_URL}/v1/auth/${provider}/start?${new URLSearchParams({ redirect_uri: redirectUri }).toString()}`;
export const getAccount = () => request("/v1/account");
export const bootstrap = (body: unknown) => request("/v1/sync/bootstrap", { method: "POST", body: JSON.stringify(body) });
