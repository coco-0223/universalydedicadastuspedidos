const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, doc, getDoc } = require('firebase/firestore');

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
  console.log("Searching for user carniketing@gmail.com...");
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', 'carniketing@gmail.com'));
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) {
    console.log("User not found!");
    return;
  }
  
  const userDoc = querySnapshot.docs[0];
  const uid = userDoc.id;
  const userData = userDoc.data();
  console.log(`Found User: UID=${uid}, role=${userData.role}, email=${userData.email}`);
  
  console.log(`Fetching business data for ID: ${uid}...`);
  const businessRef = doc(db, 'businesses', uid);
  const businessSnap = await getDoc(businessRef);
  
  if (!businessSnap.exists()) {
    console.log("Business document does not exist in Firestore for this UID!");
    return;
  }
  
  const bData = businessSnap.data();
  console.log("Profile Name:", bData.profile ? bData.profile.name : 'no profile');
  console.log("Settings isFoodBusiness:", bData.settings ? bData.settings.isFoodBusiness : 'no settings');
  console.log("Settings:", JSON.stringify(bData.settings, null, 2));
}

run().catch(console.error);
