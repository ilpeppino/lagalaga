import type { ExpoConfig } from "expo/config";

const variant = process.env.APP_VARIANT ?? "prod";
const isDevVariant = variant === "dev";

const appName = isDevVariant ? "Lagalaga Dev" : "lagalaga";
const appScheme = isDevVariant ? "lagalaga-dev" : "lagalaga";
const androidPackage = isDevVariant
  ? "com.ilpeppino.lagalaga.dev"
  : "com.ilpeppino.lagalaga";
const iosBundleIdentifier = isDevVariant
  ? "com.ilpeppino.lagalaga.dev"
  : "com.ilpeppino.lagalaga";

const config: ExpoConfig = {
  name: appName,
  slug: "lagalaga",
  owner: "ilpeppino",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/generated/icon.png",
  scheme: appScheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  assetBundlePatterns: ["**/*"],
  splash: {
    image: "./assets/generated/splash.png",
    resizeMode: "contain",
    backgroundColor: "#1A2A6C",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: iosBundleIdentifier,
    infoPlist: {
      LSApplicationQueriesSchemes: ["roblox", "roblox", "roblox", "roblox"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#1A2A6C",
      foregroundImage: "./assets/generated/adaptive-icon-foreground.png",
      backgroundImage: "./assets/generated/adaptive-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    intentFilters: [
      {
        action: "VIEW",
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            scheme: appScheme,
            host: "auth",
            pathPrefix: "/roblox",
          },
        ],
      },
    ],
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: androidPackage,
  },
  web: {
    output: "static",
    favicon: "./assets/generated/favicon.png",
  },
  plugins: [
    "expo-router",
    ...(isDevVariant ? ["expo-dev-client"] : []),
    [
      "expo-splash-screen",
      {
        image: "./assets/generated/splash.png",
        imageWidth: 260,
        resizeMode: "contain",
        backgroundColor: "#1A2A6C",
        dark: {
          backgroundColor: "#1A2A6C",
        },
      },
    ],
    "expo-sqlite",
    [
      "expo-font",
      {
        fonts: [
          "./assets/fonts/BitcountSingle-Regular.ttf",
          "./assets/fonts/BitcountSingle-Bold.ttf",
        ],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  autolinking: isDevVariant ? undefined : { exclude: ["expo-dev-client"] },
  extra: {
    router: {},
    eas: {
      projectId: "36b14711-e62b-452d-82bf-e8e7f9128fe6",
    },
  },
};

export default config;
