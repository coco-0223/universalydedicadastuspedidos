const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBoZHze9pIxCEoVblVOQHn1kK0HE4RW-2U",
  authDomain: "meatmarket-3d0a3.firebaseapp.com",
  projectId: "meatmarket-3d0a3",
  storageBucket: "meatmarket-3d0a3.firebasestorage.app",
  messagingSenderId: "938438745918",
  appId: "1:938438745918:web:8fab1ed8f15a3a07de566f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function findAdmin() {
    console.log("Fetching all businesses...");
    const snap = await getDocs(collection(db, 'businesses'));
    snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.profile) {
             console.log(`Business ID: ${doc.id}`);
             console.log(`Business Name: ${data.profile.name}`);
             console.log('---------------------');
        }
    });

    console.log("Fetching all users with role 'business'...");
    const usersSnap = await getDocs(collection(db, 'users'));
    usersSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.role === 'business') {
             console.log(`User ID: ${doc.id}`);
             console.log(`User Email: ${data.email}`);
             console.log('---------------------');
        }
    });
}

findAdmin().then(() => process.exit(0)).catch(console.error);
