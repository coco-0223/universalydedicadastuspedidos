import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { TesterActivity } from '../types';

export const trackTesterInteraction = async (businessId: string, user: any, localCount: number = 1) => {
    if (!businessId || businessId === 'default') return;

    try {
        let testerId = user?.id;
        if (!testerId || testerId === 'guest') {
            let storedId = await AsyncStorage.getItem('@tester_id');
            if (!storedId) {
                storedId = 'tester_' + Date.now().toString() + Math.random().toString(36).substring(7);
                await AsyncStorage.setItem('@tester_id', storedId);
            }
            testerId = storedId;
        }

        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        const testerRef = doc(db, 'businesses', businessId, 'testers', testerId);
        const testerSnap = await getDoc(testerRef);
        
        let data: TesterActivity;
        const currentPhone = user?.phone || (await AsyncStorage.getItem('@tester_phone')) || undefined;
        const currentName = (user?.name && user?.name !== 'Usuario Anónimo') ? user.name : (await AsyncStorage.getItem('@tester_name')) || undefined;
        const isNative = Platform.OS !== 'web';

        if (testerSnap.exists()) {
            data = testerSnap.data() as TesterActivity;
        } else {
            data = {
                id: testerId,
                name: currentName || 'Usuario Anónimo',
                phone: currentPhone,
                platform: isNative ? 'app' : 'web',
                lastActiveDate: today,
                interactionsToday: 0,
                consecutiveDays: 0,
                completedDates: [],
                updatedAt: new Date().toISOString()
            };
        }

        if (data.lastActiveDate !== today) {
            // Check if they missed a day
            const lastDate = new Date(data.lastActiveDate);
            const currentDate = new Date(today);
            const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays > 1) {
                const yesterday = new Date(currentDate);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toLocaleDateString('en-CA');
                
                if (!data.completedDates.includes(yesterdayStr)) {
                    data.consecutiveDays = 0;
                }
            }

            data.lastActiveDate = today;
            data.interactionsToday = localCount;
        } else {
            if (data.interactionsToday < 5) {
                // If localCount is higher, use it, otherwise just increment by 1 to be safe
                data.interactionsToday = Math.max(data.interactionsToday + 1, localCount);
                if (data.interactionsToday > 5) data.interactionsToday = 5;
            }
        }
        
        if (data.interactionsToday >= 5 && !data.completedDates.includes(today)) {
            data.completedDates.push(today);
            data.consecutiveDays += 1;
        }
        
        data.updatedAt = new Date().toISOString();
        if (currentName) data.name = currentName;
        if (currentPhone) data.phone = currentPhone;
        data.platform = isNative ? 'app' : 'web';
        
        await setDoc(testerRef, data, { merge: true });
        
    } catch (e) {
        console.warn('Error tracking tester interaction', e);
    }
}
