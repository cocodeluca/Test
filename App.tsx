import React from 'react';
import { Platform } from 'react-native';

// Platform-specific app entry point
let App: React.FC;

if (Platform.OS === 'web') {
  const WebApp = require('./src/platforms/web/App').default;
  App = WebApp;
} else {
  // iOS and Android
  const MobileApp = require('./src/platforms/mobile/App').default;
  App = MobileApp;
}

export default App;
