const path = require('path'),
  HtmlWebpackPlugin = require('html-webpack-plugin'),
  CleanWebpackPlugin = require('clean-webpack-plugin'),
  webpack = require('webpack'),
  ExtractTextPlugin = require('extract-text-webpack-plugin'),
  {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

const UglifyJsPlugin = require('uglifyjs-webpack-plugin');

module.exports = {
  entry: './src/js/index.js',
  devtool: 'source-map',
  cache: true,
  mode: 'production',
  optimization: {
    minimizer: [
      new UglifyJsPlugin({
        cache: true,
        parallel: true,
        sourceMap: true,
      }),
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({$: 'jquery', jQuery: 'jquery' }),
    new webpack.ContextReplacementPlugin(/moment[\\/]locale$/, /^\.\/(ru|en)$/), // https://github.com/webpack/webpack/issues/87
    new BundleAnalyzerPlugin({analyzerMode: 'static', openAnalyzer: false}),
    new ExtractTextPlugin('styles.css'),
    new webpack.LoaderOptionsPlugin({
      minimize: true,
      debug: false,
    }),
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      favicon: './src/images/favicon.ico',
      template: './src/index.ejs',
      inject: true,
      hash: true,
    }),
  ],
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  node: {
    tls: 'empty',
    fs: 'empty',
    net: 'empty',
    console: true,
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        // exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: 'css-loader',
        }),
      },
      {
        test: /\.(png|svg|jpg|gif)$/,
        use: [
          'file-loader',
        ],
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        use: [
          'file-loader',
        ],
      },
    ],
  },
};
