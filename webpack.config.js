const webpackDev = require('./webpack.dev');
const webpackProd = require('./webpack.prod');

const webpack = {dev: webpackDev, prod: webpackProd};

module.exports = (env) => webpack[env];
