const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const babelLoaderConfig = {
  test: /\.[jt]sx?$/,
  exclude: /node_modules\/(?!(react-native|@react-native|react-native-reanimated|react-native-gesture-handler|react-native-svg)\/).*/,
  use: {
    loader: 'babel-loader',
    options: {
      sourceType: 'unambiguous',
      presets: [
        ['@babel/preset-env', { targets: { browsers: ['last 2 versions'] } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
        '@babel/preset-typescript',
      ],
      plugins: [
        'react-native-reanimated/plugin',
      ],
    },
  },
};

module.exports = {
  mode: 'development',
  entry: path.resolve(__dirname, 'index.web.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js'],
    alias: {
      'react-native$': 'react-native-web',
      // ネイティブ専用モジュールをモックに差し替え
      'react-native-ble-plx': path.resolve(__dirname, 'web/mocks/ble-plx.js'),
      'expo-sqlite': path.resolve(__dirname, 'web/mocks/expo-sqlite.js'),
      '@shopify/react-native-skia': path.resolve(__dirname, 'web/mocks/skia.js'),
      'victory-native': path.resolve(__dirname, 'web/mocks/victory-native.js'),
    },
  },
  module: {
    rules: [
      babelLoaderConfig,
      {
        test: /\.(ttf|otf|woff|woff2|png|jpg|jpeg|gif)$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      __DEV__: JSON.stringify(true),
      'process.env.NODE_ENV': JSON.stringify('development'),
      'process.env': JSON.stringify({ NODE_ENV: 'development' }),
    }),
    new webpack.ProvidePlugin({
      process: require.resolve('process/browser'),
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'web/index.html'),
    }),
  ],
  devServer: {
    port: 8090,
    hot: true,
    open: true,
    static: {
      directory: path.resolve(__dirname, 'web'),
    },
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
  devtool: 'eval-source-map',
};
