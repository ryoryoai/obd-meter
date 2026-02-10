import { AppRegistry } from 'react-native';
import App from './App.web';

AppRegistry.registerComponent('OBDMeter', () => App);
AppRegistry.runApplication('OBDMeter', {
  rootTag: document.getElementById('root'),
});
