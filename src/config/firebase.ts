// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import Constants from 'expo-constants';

// Configuración para Rocío Carnicerías (App Dedicada)
const firebaseConfigRocio = {
  apiKey: "AIzaSyCvu7Sq3UwNh_c-NigObnDjPGrKODQg6dA",
  authDomain: "meatmarket-3d0a3.firebaseapp.com",
  projectId: "meatmarket-3d0a3",
  storageBucket: "meatmarket-3d0a3.firebasestorage.app",
  messagingSenderId: "938438745918",
  appId: "1:938438745918:web:8fab1ed8f15a3a07de566f"
};

// Configuración para TusPedidos (App Universal)
const firebaseConfigUniversal = {
  apiKey: "AIzaSyAAK3mls1uuAO5dF6brx_tqIehwRKzNojc",
  authDomain: "tuspedidosdb.firebaseapp.com",
  projectId: "tuspedidosdb",
  storageBucket: "tuspedidosdb.firebasestorage.app",
  messagingSenderId: "234025684198",
  appId: "1:234025684198:web:65d225990b6df5cab03f27",
  measurementId: "G-QPDCMMD9LK"
};

// Determinamos qué variante de la app se está ejecutando
const variant = Constants.expoConfig?.extra?.appVariant || 'rocio';

// Elegimos la configuración de Firebase correspondiente
const firebaseConfig = variant === 'universal' ? firebaseConfigUniversal : firebaseConfigRocio;

// Initialize Firebase (Singleton pattern to prevent re-initialization)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
