import { ActivityIndicator, Platform, Text as NativeText, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useStore } from "@/context";
import { colors } from "@/theme";

export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; state?: string }>();
  const router = useRouter();
  const { account, authBusy, authError } = useStore();
  const [started, setStarted] = useState(false);
  const sawBusy = useRef(false);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !params.code) return;
    window.dispatchEvent(new CustomEvent("hanzideck-auth", { detail: `${window.location.origin}/auth/callback?code=${encodeURIComponent(params.code)}` }));
    setStarted(true);
  }, [params.code]);
  useEffect(() => {
    if (authBusy) sawBusy.current = true;
    if (started && sawBusy.current && !authBusy && account) router.replace("/");
  }, [account, authBusy, router, started]);
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.paper }}>
    {authError ? <NativeText style={{ color: colors.red }}>{authError}</NativeText> : <ActivityIndicator color={colors.green} />}
  </View>;
}
