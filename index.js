// Temporary TestFlight diagnostic: show the JavaScript error that iOS crash
// feedback omits, while keeping the app alive long enough to share it.
if (!__DEV__ && typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
  const previousHandler = global.RN$handleException;
  let fatalShown = false;

  global.RN$handleException = (error, isFatal, reportToConsole) => {
    if (!isFatal) return previousHandler?.(error, isFatal, reportToConsole) || false;
    if (fatalShown) return true;
    fatalShown = true;

    const name = error?.name || 'Error';
    const message = error?.message || String(error);
    const details = `${name}: ${message}\n\n${error?.stack || ''}`;
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

import 'expo-router/entry';
