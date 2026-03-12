const fs = require("fs");
const path = require("path");
const {
  withAppBuildGradle,
  withProjectBuildGradle,
  withGradleProperties,
  withAndroidManifest,
  withDangerousMod,
  createRunOncePlugin,
} = require("@expo/config-plugins");

const APP_CLEAN_SNIPPET = `// RN new-arch codegen JNI folders may not exist during \`clean\`, causing
// externalNativeBuildClean* to fail before release build starts.
tasks.matching { it.name.startsWith("externalNativeBuildClean") }.configureEach {
    enabled = false
}

tasks.matching { it.name.startsWith("configureCMake") }.configureEach {
    dependsOn(":react-native-reanimated:prefabReleasePackage")
    dependsOn(":react-native-worklets:prefabReleasePackage")
}
`;

const ROOT_PREFAB_ORDERING_SNIPPET = `// Ensure Reanimated's CMake configure runs only after Worklets prefab artifacts exist.
gradle.projectsEvaluated {
  def reanimatedProject = project.findProject(':react-native-reanimated')
  if (reanimatedProject != null) {
    reanimatedProject.tasks.matching { it.name.startsWith('configureCMake') }.configureEach { task ->
      task.dependsOn(':react-native-worklets:prefabReleasePackage')
    }
  }
}
`;

function withAppBuildGradleFixes(config) {
  return withAppBuildGradle(config, (configMod) => {
    const contents = configMod.modResults.contents;
    if (!contents.includes('externalNativeBuildClean') || !contents.includes('prefabReleasePackage')) {
      configMod.modResults.contents = `${contents.trimEnd()}\n\n${APP_CLEAN_SNIPPET}`;
    }
    return configMod;
  });
}

function withProjectBuildGradleFixes(config) {
  return withProjectBuildGradle(config, (configMod) => {
    const contents = configMod.modResults.contents;
    if (!contents.includes("Ensure Reanimated's CMake configure runs only after Worklets prefab artifacts exist")) {
      configMod.modResults.contents = `${contents.trimEnd()}\n\n${ROOT_PREFAB_ORDERING_SNIPPET}`;
    }
    return configMod;
  });
}

function withGradleParallelDisabled(config) {
  return withGradleProperties(config, (configMod) => {
    const props = configMod.modResults;
    const existing = props.find((item) => item.type === "property" && item.key === "org.gradle.parallel");
    if (existing) {
      existing.value = "false";
    } else {
      props.push({ type: "property", key: "org.gradle.parallel", value: "false" });
    }
    return configMod;
  });
}

const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="database" path="."/>
  <exclude domain="sharedpref" path="."/>
  <exclude domain="file" path="."/>
</full-backup-content>
`;

const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="."/>
    <exclude domain="file" path="."/>
  </cloud-backup>
  <device-transfer>
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="."/>
    <exclude domain="file" path="."/>
  </device-transfer>
</data-extraction-rules>
`;

// Permissions injected by Expo/React Native libraries that must not appear in production.
const BLOCKED_PERMISSIONS = new Set([
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
]);

function withManifestPermissionFixes(config) {
  return withAndroidManifest(config, (configMod) => {
    const manifest = configMod.modResults.manifest;
    if (Array.isArray(manifest["uses-permission"])) {
      manifest["uses-permission"] = manifest["uses-permission"].filter(
        (entry) => !BLOCKED_PERMISSIONS.has(entry?.$?.["android:name"])
      );
    }
    return configMod;
  });
}

function withBackupRules(config) {
  // Step 1: write the XML resource files
  config = withDangerousMod(config, [
    "android",
    (configMod) => {
      const xmlDir = path.join(
        configMod.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, "backup_rules.xml"), BACKUP_RULES_XML);
      fs.writeFileSync(
        path.join(xmlDir, "data_extraction_rules.xml"),
        DATA_EXTRACTION_RULES_XML
      );
      return configMod;
    },
  ]);

  // Step 2: reference the XML files from the <application> element
  config = withAndroidManifest(config, (configMod) => {
    const application = configMod.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:fullBackupContent"] = "@xml/backup_rules";
      application.$["android:dataExtractionRules"] = "@xml/data_extraction_rules";
    }
    return configMod;
  });

  return config;
}

function withAndroidNativeBuildFixes(config) {
  config = withAppBuildGradleFixes(config);
  config = withProjectBuildGradleFixes(config);
  config = withGradleParallelDisabled(config);
  config = withLargeScreenOrientationFixes(config);
  config = withManifestPermissionFixes(config);
  config = withBackupRules(config);
  return config;
}

function appendCsvValue(existing, value) {
  const parts = (existing || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes(value)) {
    parts.push(value);
  }
  return parts.join(",");
}

function withLargeScreenOrientationFixes(config) {
  return withAndroidManifest(config, (configMod) => {
    const manifest = configMod.modResults.manifest;
    manifest.$ = manifest.$ || {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    const application = manifest.application?.[0];
    if (!application) {
      return configMod;
    }

    application.activity = application.activity || [];
    const activities = application.activity;

    for (const activity of activities) {
      const activityName = activity?.$?.["android:name"];
      if (activityName === ".MainActivity" || activityName?.endsWith(".MainActivity")) {
        delete activity.$["android:screenOrientation"];
      }
    }

    const barcodeActivityName = "com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity";
    const existingBarcodeActivity = activities.find(
      (activity) => activity?.$?.["android:name"] === barcodeActivityName
    );

    if (existingBarcodeActivity) {
      existingBarcodeActivity.$["android:screenOrientation"] = "unspecified";
      existingBarcodeActivity.$["tools:replace"] = appendCsvValue(
        existingBarcodeActivity.$["tools:replace"],
        "android:screenOrientation"
      );
    }

    return configMod;
  });
}

module.exports = createRunOncePlugin(
  withAndroidNativeBuildFixes,
  "withAndroidNativeBuildFixes",
  "1.2.0"
);
