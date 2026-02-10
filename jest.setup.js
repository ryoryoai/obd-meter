/* eslint-env jest */
// Jest setup for React Native modules that expect native binaries.
import 'react-native-gesture-handler/jestSetup';

// Reanimated needs a mock in Jest (especially when components import it at module scope).
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Silence warnings about missing native animated helpers.
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({}), { virtual: true });
