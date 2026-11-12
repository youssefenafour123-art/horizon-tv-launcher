plugins {
    id("com.android.application")
}

android {
    namespace = "com.riwaq.art"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.riwaq.art"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // sideload build: signed with the local debug key so it installs straight away
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // artwork is already JPEG: storing it uncompressed lets the WebView stream it straight from the APK
    androidResources { noCompress += listOf("jpg", "woff2", "mp4") }

    sourceSets["main"].assets.srcDir(file("build/webassets"))
}

// bundle the web app (the same files as the browser preview) into the APK
val copyWeb by tasks.registering(Sync::class) {
    from(rootProject.projectDir.parentFile.resolve("web"))
    into(layout.buildDirectory.dir("webassets/web"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }
