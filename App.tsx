import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { database } from './src/storage/database';

function App(): React.JSX.Element {
  useEffect(() => {
    database.initialize();
  }, []);

  return (
    <>
      <StatusBar hidden />
      <AppNavigator />
    </>
  );
}

export default App;
