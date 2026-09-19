module.exports = function (api) {
  api.cache(true);
  return {
    // Preset de Babel de Expo. Debe estar también como devDependency
    // (babel-preset-expo) para que Babel lo resuelva siempre.
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@': './src',
          },
        },
      ],
    ],
  };
};
