import type { ExpoConfig } from "expo/config";

const variant = process.env.APP_VARIANT ?? "prod";
const isDevVariant = variant === "dev";

const appName = isDevVariant ? "Lagalaga Dev" : "Lagalaga";
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
    buildNumber: "12",
    supportsTablet: true,
    usesAppleSignIn: true,
    bundleIdentifier: iosBundleIdentifier,
    associatedDomains: ["applinks:ilpeppino.github.io"],
    infoPlist: {
      LSApplicationQueriesSchemes: ["roblox"],
      ITSAppUsesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
          {
            // Email address — collected optionally when user shares it via Apple Sign In
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEmailAddress",
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            ],
          },
          {
            // Name — Roblox display name and username stored in user profile
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeName",
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            ],
          },
          {
            // User ID — Roblox user ID and internal app user ID
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeUserID",
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            ],
          },
          {
            // Device ID — push notification token stored per user account
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeDeviceID",
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            ],
          },
          {
            // App interactions — sessions created/joined, streaks, activity
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeAppInteractions",
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: [
              "NSPrivacyCollectedDataTypePurposeAppFunctionality",
            ],
          },
        ],
      NSPrivacyAccessedAPITypes: [
        {
          // File timestamps — used by expo-sqlite, expo-file-system, and react-native
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
          NSPrivacyAccessedAPITypeReasons: [
            "C617.1", // Access timestamps of files created by the app
            "0A2A.1", // Sync/integrity checks on app-created files
            "3B52.1", // Timestamps accessed by third-party SDKs
          ],
        },
        {
          // NSUserDefaults — used by AsyncStorage and expo-secure-store
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: [
            "CA92.1", // Read/write app's own user defaults for settings and preferences
          ],
        },
        {
          // System boot time — used by react-native performance APIs and expo-constants
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
          NSPrivacyAccessedAPITypeReasons: [
            "35F9.1", // Measure elapsed time for performance monitoring
          ],
        },
        {
          // Disk space — used by expo-device and expo-file-system
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
          NSPrivacyAccessedAPITypeReasons: [
            "E174.1", // Check available space before writing app data
            "85F4.1", // Needed for normal app operation (writing files)
          ],
        },
      ],
    },
  },
  android: {
    googleServicesFile: "./google-services.json",
    adaptiveIcon: {
      backgroundColor: "#1A2A6C",
      foregroundImage: "./assets/generated/adaptive-icon-foreground.png",
      backgroundImage: "./assets/generated/adaptive-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    intentFilters: [
      {
        // Android verification helper:
        // adb shell am start -W -a android.intent.action.VIEW -d "lagalaga://auth/google?code=1&state=2"
        action: "VIEW",
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            scheme: appScheme,
            host: "auth",
            pathPrefix: "/roblox",
          },
          {
            scheme: appScheme,
            host: "auth",
            pathPrefix: "/google",
          },
          {
            scheme: "exp+lagalaga",
            host: "auth",
            pathPrefix: "/roblox",
          },
          {
            scheme: "exp+lagalaga",
            host: "auth",
            pathPrefix: "/google",
          },
        ],
      },
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            scheme: "https",
            host: "ilpeppino.github.io",
            pathPrefix: "/lagalaga/invite",
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
    "expo-apple-authentication",
    "./plugins/withAndroidNativeBuildFixes",
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
      "expo-notifications",
      {
        icon: "./assets/generated/icon.png",
        color: "#1A2A6C",
      },
    ],
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
  ...(isDevVariant ? {} : { autolinking: { exclude: ["expo-dev-client"] } }),
  extra: {
    router: {},
    eas: {
      projectId: "36b14711-e62b-452d-82bf-e8e7f9128fe6",
    },
  },
};

export default config;
