// react-native-ble-plx Web mock
export class BleManager {
  constructor() {}
  startDeviceScan() {}
  stopDeviceScan() {}
  destroy() {}
  connectToDevice() { return Promise.resolve({}); }
  discoverAllServicesAndCharacteristicsForDevice() { return Promise.resolve({}); }
}
export class Device {}
export default { BleManager };
