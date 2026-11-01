import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  type CustomerInfoUpdateListener,
} from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

export const REVENUECAT_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || "premium";

const platformApiKey = () => {
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || "";
  if (Platform.OS === "android") return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || "";
  if (Platform.OS === "web") return process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY?.trim() || "";
  return "";
};

const entitled = (customerInfo: CustomerInfo) =>
  customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID] !== undefined;

export type RevenueCatState = {
  ready: boolean;
  configured: boolean;
  premium: boolean;
  busy: boolean;
  error: string;
  presentPaywall: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  presentCustomerCenter: () => Promise<void>;
};

export function useRevenueCat(accountId: string | null): RevenueCatState {
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [premium, setPremium] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configuredRef = useRef(false);
  const identifiedAccount = useRef<string | null>(null);
  const operationBusy = useRef(false);

  const acceptCustomerInfo = useCallback((customerInfo: CustomerInfo) => {
    setPremium(entitled(customerInfo));
    setError("");
  }, []);

  useEffect(() => {
    let active = true;
    let listener: CustomerInfoUpdateListener | null = null;
    const initialize = async () => {
      const apiKey = platformApiKey();
      if (!apiKey) {
        if (active) {
          setReady(true);
          setError(`RevenueCat ${Platform.OS} API key is missing.`);
        }
        return;
      }
      try {
        if (!(await Purchases.isConfigured())) {
          Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
          Purchases.configure({ apiKey });
        }
        configuredRef.current = true;
        if (!active) return;
        setConfigured(true);
        listener = acceptCustomerInfo;
        Purchases.addCustomerInfoUpdateListener(listener);
        const customerInfo = await Purchases.getCustomerInfo();
        if (active) {
          acceptCustomerInfo(customerInfo);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not initialize purchases.");
      } finally {
        if (active) setReady(true);
      }
    };
    void initialize();
    return () => {
      active = false;
      if (listener) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [acceptCustomerInfo]);

  useEffect(() => {
    if (!configured || !configuredRef.current) return;
    const identify = async () => {
      try {
        if (accountId) {
          const result = await Purchases.logIn(accountId);
          identifiedAccount.current = accountId;
          acceptCustomerInfo(result.customerInfo);
        } else if (identifiedAccount.current) {
          acceptCustomerInfo(await Purchases.logOut());
          identifiedAccount.current = null;
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not update purchase account.");
      }
    };
    void identify();
  }, [accountId, acceptCustomerInfo, configured]);

  const refresh = useCallback(async () => {
    const customerInfo = await Purchases.getCustomerInfo();
    acceptCustomerInfo(customerInfo);
    return entitled(customerInfo);
  }, [acceptCustomerInfo]);

  const presentPaywall = useCallback(async () => {
    if (!configuredRef.current) {
      setError(`Subscriptions are unavailable: RevenueCat ${Platform.OS} API key is missing.`);
      return false;
    }
    if (operationBusy.current) return false;
    operationBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: REVENUECAT_ENTITLEMENT_ID,
        displayCloseButton: true,
      });
      if (result === PAYWALL_RESULT.ERROR) setError("Could not open the subscription paywall.");
      return await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open the subscription paywall.");
      return false;
    } finally {
      operationBusy.current = false;
      setBusy(false);
    }
  }, [refresh]);

  const restorePurchases = useCallback(async () => {
    if (!configuredRef.current) {
      setError(`Subscriptions are unavailable: RevenueCat ${Platform.OS} API key is missing.`);
      return false;
    }
    if (operationBusy.current) return false;
    operationBusy.current = true;
    setBusy(true);
    setError("");
    try {
      if (Platform.OS === "web") return await refresh();
      const customerInfo = await Purchases.restorePurchases();
      acceptCustomerInfo(customerInfo);
      return entitled(customerInfo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not restore purchases.");
      return false;
    } finally {
      operationBusy.current = false;
      setBusy(false);
    }
  }, [acceptCustomerInfo, refresh]);

  const presentCustomerCenter = useCallback(async () => {
    if (!configuredRef.current) {
      setError(`Subscriptions are unavailable: RevenueCat ${Platform.OS} API key is missing.`);
      return;
    }
    if (operationBusy.current) return;
    operationBusy.current = true;
    setBusy(true);
    setError("");
    try {
      await RevenueCatUI.presentCustomerCenter();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open subscription management.");
    } finally {
      operationBusy.current = false;
      setBusy(false);
    }
  }, [refresh]);

  return { ready, configured, premium, busy, error, presentPaywall, restorePurchases, presentCustomerCenter };
}
