import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { useStore } from "@/context";
import { colors } from "@/theme";

export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; state?: string }>();
  const { authError } = useStore();
  useEffect(() => {
    if (typeof window === "undefined" || !params.code) return;
    window.dispatchEvent(new CustomEvent("hanzideck-auth", { detail: `${window.location.origin}/auth/callback?code=${encodeURIComponent(params.code)}` }));
  }, [params.code]);
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}><ActivityIndicator color={colors.green} />{authError ? null : null}</View>;
}
