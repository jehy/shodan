const path = require('path'),
  HtmlWebpackPlugin = require('html-webpack-plugin'),
  CleanWebpackPlugin = require('clean-webpack-plugin'),
  webpack = require('webpack'),
  ExtractTextPlugin = require('extract-text-webpack-plugin'),
  {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer'),
  precss = require('precss'),
  autoprefixer =   require('autoprefixer');

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
    new CleanWebpackPlugin(['dist']),
    new HtmlWebpackPlugin({
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
        test: /\.(scss)$/,
        use: [{
          loader: 'style-loader', // inject CSS to page
        }, {
          loader: 'css-loader', // translates CSS into CommonJS modules
        }, {
          loader: 'postcss-loader', // Run post css actions
          options: {
            plugins() { // post css plugins, can be exported to postcss.config.js
              return [
                precss,
                autoprefixer,
              ];
            },
          },
        }, {
          loader: 'sass-loader', // compiles Sass to CSS
        }],
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['env'],
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
