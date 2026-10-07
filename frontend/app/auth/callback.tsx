import { ActivityIndicator, Platform, Text as NativeText, View } from "react-native";
import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useStore } from "@/context";
import { colors } from "@/theme";

export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; state?: string }>();
  const router = useRouter();
  const { authCompletedCode, authError } = useStore();
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !params.code) return;
    window.dispatchEvent(new CustomEvent("hanzideck-auth", { detail: `${window.location.origin}/auth/callback?code=${encodeURIComponent(params.code)}` }));
  }, [params.code]);
  useEffect(() => {
    if (params.code && authCompletedCode === params.code) router.replace("/");
  }, [authCompletedCode, params.code, router]);
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.paper }}>
    {authError ? <NativeText style={{ color: colors.red }}>{authError}</NativeText> : <ActivityIndicator color={colors.green} />}
  </View>;
}
