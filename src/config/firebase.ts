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
  apiKey: "AIzaSyCy5nvRGy1JPcLWpwnppw85a40l9Aowt9g",
  authDomain: "universalydedicadastuspedidos.firebaseapp.com",
  projectId: "universalydedicadastuspedidos",
  storageBucket: "universalydedicadastuspedidos.firebasestorage.app",
  messagingSenderId: "329137168324",
  appId: "1:329137168324:web:2329c2039c3481b61b0e91",
  measurementId: "G-DJ5MCKN8SN"
};

// Determinamos qué variante de la app se está ejecutando
const variant = Constants.expoConfig?.extra?.appVariant || 'universal';

// Elegimos la configuración de Firebase correspondiente
const firebaseConfig = variant === 'universal' ? firebaseConfigUniversal : firebaseConfigRocio;

// Initialize Firebase (Singleton pattern to prevent re-initialization)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
