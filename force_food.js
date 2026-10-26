const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc } = require('firebase/firestore');

const firebaseConfigRocio = {
  apiKey: "AIzaSyCvu7Sq3UwNh_c-NigObnDjPGrKODQg6dA",
  authDomain: "meatmarket-3d0a3.firebaseapp.com",
  projectId: "meatmarket-3d0a3",
  storageBucket: "meatmarket-3d0a3.firebasestorage.app",
  messagingSenderId: "938438745918",
  appId: "1:938438745918:web:8fab1ed8f15a3a07de566f"
};

const app = initializeApp(firebaseConfigRocio);
const db = getFirestore(app);

async function run() {
  const uid = 'DDFoVOlaBiXgoNbYqNYM8BOLwFF2';
  console.log(`Forcing isFoodBusiness to true for ${uid}...`);
  const businessRef = doc(db, 'businesses', uid);
  await updateDoc(businessRef, {
    'settings.isFoodBusiness': true
  });
  console.log("Updated successfully!");
}

run().catch(console.error);
