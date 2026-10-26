import { doc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { businesses } from '../data/mockData';

export const seedFirebase = async () => {
    try {
        console.log("Starting seeding process...");
        const batch = writeBatch(db);

        // Define business IDs we want to process
        const businessIds = Object.keys(businesses);

        for (const bId of businessIds) {
            const businessObj = businesses[bId];
            
            // 1. Save Business Profile and Settings
            const businessRef = doc(db, 'businesses', bId);
            batch.set(businessRef, {
                profile: businessObj.profile,
                settings: businessObj.settings
            });

            // 2. Save Products as a Subcollection
            for (const product of businessObj.products) {
                const productRef = doc(db, `businesses/${bId}/products`, product.id);
                // Merge in businessId just in case it's needed for global queries later
                batch.set(productRef, { ...product, businessId: bId });
            }

            // 3. Save Offers as a Subcollection
            for (const offer of businessObj.offers) {
                const offerRef = doc(db, `businesses/${bId}/offers`, offer.id);
                batch.set(offerRef, { ...offer, businessId: bId });
            }

            // 4. Save Orders as a Subcollection (Empty initially, or migrate mock orders if any)
            for (const order of businessObj.orders) {
                const orderRef = doc(db, `businesses/${bId}/orders`, order.id);
                batch.set(orderRef, { ...order, businessId: bId });
            }
        }

        // Commit all changes to Firestore
        await batch.commit();
        console.log("Seeding process completed successfully!");
        return true;
    } catch (error) {
        console.error("Error during database seeding:", error);
        throw error;
    }
};
