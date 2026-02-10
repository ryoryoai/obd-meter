// react-native-bluetooth-classic Web mock
//
// The real library is native-only. For web builds we expose a minimal API
// so the UI can render (Demo Mode still works).

const notSupported = () => Promise.reject(new Error('Bluetooth Classic is not supported on web'));

const RNBluetoothClassic = {
  isBluetoothAvailable: () => Promise.resolve(false),
  isBluetoothEnabled: () => Promise.resolve(false),
  requestBluetoothEnabled: () => Promise.resolve(false),
  getBondedDevices: () => Promise.resolve([]),
  connectToDevice: notSupported,
  onDeviceDisconnected: () => ({ remove() {} }),
  openBluetoothSettings: () => {},
};

export default RNBluetoothClassic;

