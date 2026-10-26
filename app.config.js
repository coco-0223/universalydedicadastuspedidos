const { ExpoConfig } = require('expo/config');
const fs = require('fs');
const path = require('path');

// Por defecto para este repositorio es 'universal'
let variant = process.env.APP_VARIANT || 'universal';
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/APP_VARIANT=(.*)/);
    if (match && match[1] && !process.env.APP_VARIANT) {
      variant = match[1].trim();
    }
  }
} catch (e) {
  console.log("Usando variante por defecto: " + variant);
}

// Catálogo de configuraciones por aplicación
const APP_CONFIGS = {
  'rocio': {
    name: "Rocio Carnicerias",
    slug: "rocio-carnicerias",
    package: "com.rociocarnicerias.app",
    scheme: "rociocarnicerias",
    icon: "./assets/images/rocio_icon.jpg",
    splash: "./assets/images/rocio_icon.jpg",
    adaptiveIcon: "./assets/images/rocio_adaptive_icon.jpg",
    googleServices: "./google-services.json",
    projectId: "b133196d-7545-48b1-aade-ae1fba959528"
  },
  'universal': {
    name: "TusPedidos",
    slug: "tuspedidos-universal",
    package: "com.tuspedidos.app",
    scheme: "tuspedidos",
    icon: "./assets/images/icon.png",
    splash: "./assets/images/splash-icon.png",
    adaptiveIcon: "./assets/images/adaptive-icon.png",
    googleServices: undefined, // Se configura en el Dashboard
    projectId: "b133196d-7545-48b1-aade-ae1fba959528"
  },
  // Aquí podés agregar 'pepe', 'tito', etc. siguiendo el mismo formato
};

const currentConfig = APP_CONFIGS[variant] || APP_CONFIGS['universal'];

module.exports = {
  expo: {
    name: currentConfig.name,
    slug: currentConfig.slug,
    version: "1.0.3",
    orientation: "portrait",
    icon: currentConfig.icon,
    scheme: currentConfig.scheme,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: currentConfig.splash,
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: currentConfig.package
    },
    android: {
      package: currentConfig.package,
      versionCode: 15,
      googleServicesFile: currentConfig.googleServices,
      adaptiveIcon: {
        foregroundImage: currentConfig.adaptiveIcon,
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      permissions: ["NOTIFICATIONS"]
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-image-picker",
        {
          "photosPermission": "La aplicación necesita acceder a tus fotos para elegir imágenes.",
          "cameraPermission": false
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    updates: {
      url: `https://u.expo.dev/${currentConfig.projectId}`
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    extra: {
      appVariant: variant,
      eas: {
        projectId: currentConfig.projectId
      }
    }
  }
};
