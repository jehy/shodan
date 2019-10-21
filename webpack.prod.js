const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');
const TerserPlugin = require('terser-webpack-plugin');
const devSetup = require('./webpack.dev');

const prodOnly = {
  devtool: 'source-map',
  mode: 'production',
  optimization: {
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          ecma: 6,
        },
      }),
    ],
  },
  plugins: [
    new BundleAnalyzerPlugin({analyzerMode: 'static', openAnalyzer: false}),
  ],
};

const prodSetup = {...devSetup,
  devtool: prodOnly.devtool,
  mode: prodOnly.mode,
  optimization: prodOnly.optimization,
  plugins: prodOnly.plugins.concat(devSetup.plugins),
};

module.exports = prodSetup;
