// Show fatal native JavaScript errors and report enough startup context to
// diagnose release-only failures without requiring adb access.
if (!__DEV__ && typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
  const previousHandler = global.RN$handleException;
  let fatalShown = false;
  const { Platform } = require('react-native');
  const diagnosticEndpoint = `${process.env.EXPO_PUBLIC_BACKEND_URL || 'https://zh.x.bormisov.com/api'}/v1/telemetry/batch`;
  const reportDiagnostic = (name, properties) => {
    const now = Date.now();
    const suffix = Math.random().toString(36).slice(2, 12);
    void fetch(diagnosticEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [{
        eventId: `${now.toString(36)}-${suffix}`,
        name,
        occurredAt: now,
        platform: Platform.OS,
        appVersion: '1.0.0',
        installId: `startup-${suffix}`,
        properties,
      }] }),
    }).catch(() => {});
  };

  if (Platform.OS === 'android') reportDiagnostic('android_startup', { stage: 'js_entry' });

  global.RN$handleException = (error, isFatal, reportToConsole) => {
    if (!isFatal) return previousHandler?.(error, isFatal, reportToConsole) || false;
    if (fatalShown) return true;
    fatalShown = true;

    const name = error?.name || 'Error';
    const message = error?.message || String(error);
    const details = `${name}: ${message}\n\n${error?.stack || ''}`;
    if (Platform.OS === 'android') {
      reportDiagnostic('android_crash', {
        source: 'javascript', exception: name, message, stack: error?.stack || '', stage: 'js_fatal',
      });
    }
    try {
      const { Alert, Share } = require('react-native');
      Alert.alert('Hanzi Deck startup error', details.slice(0, 1200), [
        { text: 'Share details', onPress: () => { void Share.share({ message: details }).catch(() => {}); } },
        { text: 'Dismiss' },
      ]);
    } catch {
      // Preserve the original crash if the native alert cannot be displayed.
      return previousHandler?.(error, isFatal, reportToConsole) || false;
    }
    return true;
  };
}

// Keep this as require: a static import is evaluated before the diagnostic
// handler above and cannot catch errors thrown while loading the router.
require('expo-router/entry');
