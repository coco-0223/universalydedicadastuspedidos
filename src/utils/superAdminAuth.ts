import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const PRIMARY_SUPERADMIN_EMAIL = 'cocobustos.93@gmail.com';

export interface SuperAdminRecord {
    email: string;
    role: 'owner' | 'invited_admin';
    status: 'pending' | 'approved' | 'rejected';
    invitedBy: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Check if the current user email is the primary super admin (cocobustos.93@gmail.com)
 */
export const isPrimarySuperAdmin = (email?: string | null): boolean => {
    if (!email) return false;
    return email.toLowerCase().trim() === PRIMARY_SUPERADMIN_EMAIL;
};

/**
 * Check whether an email is authorized to access the SuperAdmin dashboard.
 * - Primary owner (cocobustos.93@gmail.com) is ALWAYS authorized.
 * - Any invited admin is authorized ONLY if approved in the 'superadmins' collection.
 */
export const checkIsSuperAdminAuthorized = async (email?: string | null): Promise<boolean> => {
    if (!email) return false;
    const cleanEmail = email.toLowerCase().trim();
    if (cleanEmail === PRIMARY_SUPERADMIN_EMAIL) {
        return true;
    }

    try {
        const snap = await getDoc(doc(db, 'superadmins', cleanEmail));
        if (snap.exists()) {
            const data = snap.data() as SuperAdminRecord;
            return data.status === 'approved';
        }
    } catch (e) {
        console.error('Error verifying superadmin status:', e);
    }
    return false;
};

/**
 * Check if an email is an approved superadmin from a cached/in-memory list
 */
export const isEmailApprovedSuperAdmin = (email: string, superadminList: SuperAdminRecord[]): boolean => {
    const cleanEmail = email.toLowerCase().trim();
    if (cleanEmail === PRIMARY_SUPERADMIN_EMAIL) return true;
    const match = superadminList.find(a => a.email.toLowerCase().trim() === cleanEmail);
    return match?.status === 'approved';
};
