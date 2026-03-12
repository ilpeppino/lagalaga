const {
  withAppBuildGradle,
  withProjectBuildGradle,
  withGradleProperties,
  withAndroidManifest,
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

function withAndroidNativeBuildFixes(config) {
  config = withAppBuildGradleFixes(config);
  config = withProjectBuildGradleFixes(config);
  config = withGradleParallelDisabled(config);
  config = withLargeScreenOrientationFixes(config);
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
  "1.1.0"
);
