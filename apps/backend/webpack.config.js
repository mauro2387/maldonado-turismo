module.exports = function (options, webpack) {
  return {
    ...options,
    externals: {
      // Bcrypt and its dependencies should not be bundled
      'bcrypt': 'commonjs bcrypt',
      '@mapbox/node-pre-gyp': 'commonjs @mapbox/node-pre-gyp',
      'mock-aws-s3': 'commonjs mock-aws-s3',
      'aws-sdk': 'commonjs aws-sdk',
      'nock': 'commonjs nock',
    },
    plugins: [
      ...options.plugins,
      new webpack.IgnorePlugin({
        resourceRegExp: /^mock-aws-s3$/,
        contextRegExp: /@mapbox\/node-pre-gyp/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^aws-sdk$/,
        contextRegExp: /@mapbox\/node-pre-gyp/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^nock$/,
        contextRegExp: /@mapbox\/node-pre-gyp/,
      }),
    ],
  };
};
