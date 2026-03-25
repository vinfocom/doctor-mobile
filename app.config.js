const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const localGoogleServicesPath = path.resolve(__dirname, 'google-services.json');
  const envGoogleServicesPath = process.env.GOOGLE_SERVICES_JSON;

  const resolvedEnvGoogleServicesPath = envGoogleServicesPath
    ? path.resolve(__dirname, envGoogleServicesPath)
    : null;

  const hasEnvGoogleServicesFile =
    !!resolvedEnvGoogleServicesPath && fs.existsSync(resolvedEnvGoogleServicesPath);
  const hasLocalGoogleServicesFile = fs.existsSync(localGoogleServicesPath);

  const googleServicesFile = hasEnvGoogleServicesFile
    ? resolvedEnvGoogleServicesPath
    : hasLocalGoogleServicesFile
      ? './google-services.json'
      : undefined;

  const androidConfig = config.android || {};
  const { googleServicesFile: _ignoredGoogleServicesFile, ...androidWithoutGoogleServices } =
    androidConfig;

  return {
    ...config,
    android: {
      ...androidWithoutGoogleServices,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    extra: {
      ...(config.extra || {}),
      apiUrl: process.env.EXPO_PUBLIC_API_URL || config.extra?.apiUrl,
      socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || config.extra?.socketUrl,
    },
  };
};
