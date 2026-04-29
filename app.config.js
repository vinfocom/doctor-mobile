const fs = require('fs');
const path = require('path');

const parseVersionCode = (version) => {
  const semverMatch = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (semverMatch) {
    const major = Number.parseInt(semverMatch[1], 10);
    const minor = Number.parseInt(semverMatch[2], 10);
    const patch = Number.parseInt(semverMatch[3], 10);
    return major * 10000 + minor * 100 + patch;
  }

  const numericMatch = version.match(/\d+/);
  if (numericMatch) {
    return Math.max(Number.parseInt(numericMatch[0], 10), 1);
  }

  return 1;
};

module.exports = ({ config }) => {
  const localGoogleServicesPath = path.resolve(__dirname, 'google-services.json');
  const envGoogleServicesPath = process.env.GOOGLE_SERVICES_JSON;
  const appVersion = (process.env.EXPO_PUBLIC_APP_VERSION || config.version || '1.0.0').trim();
  const computedVersionCode = parseVersionCode(appVersion);

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
  const androidVersionCode =
    typeof androidWithoutGoogleServices.versionCode === 'number'
      ? androidWithoutGoogleServices.versionCode
      : computedVersionCode;

  return {
    ...config,
    version: appVersion,
    android: {
      ...androidWithoutGoogleServices,
      versionCode: androidVersionCode,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    extra: {
      ...(config.extra || {}),
      apiUrl: process.env.EXPO_PUBLIC_API_URL || config.extra?.apiUrl,
      socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || config.extra?.socketUrl,
      appVersion,
    },
  };
};
