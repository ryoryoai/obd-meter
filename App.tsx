import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { database } from './src/storage/database';

function App(): React.JSX.Element {
  useEffect(() => {
    // expo-sqlite depends on Expo native modules. In this bare RN app, the native side may not
    // be configured yet, so initialization can fail at runtime. Don't crash the whole UI.
    database.initialize().catch((err) => {
      console.warn('Database init failed (logging disabled):', err);
    });
  }, []);

  return (
    <>
      <StatusBar hidden />
      <AppNavigator />
    </>
  );
}

export default App;
