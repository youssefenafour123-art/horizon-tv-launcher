plugins {
    id("com.android.application")
}

android {
    namespace = "com.horizon.launcher"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.horizon.launcher"
        minSdk = 24
        targetSdk = 36
        versionCode = 8
        versionName = "1.7"
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

    sourceSets["main"].assets.srcDir(file("build/webassets"))
}

// bundle the Horizon web UI (the same files as the browser preview) into the APK
val copyWeb by tasks.registering(Sync::class) {
    val root = rootProject.projectDir.parentFile
    from(root) {
        include("horizon/**", "shared/**", "assets/athan.mp3", "wallpapers/*.jpg", "wallpapers/paintings/*.jpg", "wallpapers/paintings/credits.json", "wallpapers/ai/*.jpg")
    }
    into(layout.buildDirectory.dir("webassets/web"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }
