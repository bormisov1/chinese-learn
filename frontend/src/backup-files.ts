import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { cacheDirectory } from "expo-file-system/legacy";
import { readAsStringAsync, writeAsStringAsync } from "expo-file-system/legacy";
import type { BackupFile } from "./backup";

const MIME_TYPE = "application/json";

export async function downloadBackup(backup: BackupFile) {
  const json = JSON.stringify(backup, null, 2);
  const filename = `hanzi-deck-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (Platform.OS === "web") {
    const blob = new Blob([json], { type: MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return;
  }
  if (!cacheDirectory) throw new Error("The device file system is unavailable.");
  const uri = `${cacheDirectory}${filename}`;
  await writeAsStringAsync(uri, json, { encoding: "utf8" });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is unavailable on this device.");
  await Sharing.shareAsync(uri, { mimeType: MIME_TYPE, UTI: "public.json", dialogTitle: "Save Hanzi Deck backup" });
}

export async function chooseBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: [MIME_TYPE, "text/plain"], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (Platform.OS === "web" && asset.file) return asset.file.text();
  return readAsStringAsync(asset.uri);
}
