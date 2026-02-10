/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// AppNavigator pulls in react-navigation which ships ESM. For this repo's unit tests,
// we only need to ensure the root component renders, so we stub the navigator.
jest.mock('../src/navigation/AppNavigator', () => ({
  AppNavigator: () => null,
}));

const App = require('../App').default;

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
