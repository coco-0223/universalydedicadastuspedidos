import { collection, doc, getDoc, getDocs, updateDoc, writeBatch, setDoc, onSnapshot, query, where, runTransaction, getDocsFromCache, getDocsFromServer, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { BusinessProfile, BusinessSettings, Offer, Order, Product, AppNotification } from '../types';
import { CURRENT_BUSINESS_ID } from '../data/mockData';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const fetchBusinessData = async (businessId: string, userRole?: string, userId?: string, guestOrderIds?: string[], skipOrders = false, skipCatalog = false) => {
    try {
        let actualBusinessId = businessId;
        let businessRef = doc(db, 'businesses', actualBusinessId);
        let businessSnap = await getDoc(businessRef);
        
        if (!businessSnap.exists()) {
            // Check if businessId is an owner UID
            const q = query(collection(db, 'businesses'), where('ownerId', '==', businessId));
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
                businessSnap = qSnap.docs[0];
                actualBusinessId = businessSnap.id;
                businessRef = doc(db, 'businesses', actualBusinessId);
            }
        }
        
        if (!businessSnap.exists()) {
            console.warn(`Business ${actualBusinessId} not found in Firebase. Initializing with defaults.`);
            // Return defaults so the app can start and the user can "Save" to create the document
            return { 
                profile: { id: actualBusinessId, name: 'Nuevo Negocio', primaryColor: '#FF3B30' }, 
                settings: (await import('../data/mockData')).defaultSettings, 
                products: [], 
                offers: [], 
                orders: [] 
            };
        }
        
        const data = businessSnap.data();
        const profile = data.profile || { id: actualBusinessId, name: 'Nuevo Negocio', primaryColor: '#FF3B30' };
        
        const defaultSettings = (await import('../data/mockData')).defaultSettings;
        const settings = {
            ...defaultSettings,
            ...(data.settings || {})
        };
        // Deep merge important objects
        if (data.settings?.deliveryRules) {
            settings.deliveryRules = { ...defaultSettings.deliveryRules, ...data.settings.deliveryRules };
            if (data.settings.deliveryRules.cost !== undefined && settings.deliveryRules.standardCost === undefined) {
                settings.deliveryRules.standardCost = data.settings.deliveryRules.cost;
            }
        }
        if (data.settings?.branches === undefined) {
            settings.branches = defaultSettings.branches;
        }
        if (data.settings?.paymentMethods) {
            settings.paymentMethods = data.settings.paymentMethods;
        }
        
        if (typeof settings.rawExcelGrid === 'string') {
            try {
                settings.rawExcelGrid = JSON.parse(settings.rawExcelGrid);
            } catch (e) {
                console.error("Failed to parse rawExcelGrid:", e);
                settings.rawExcelGrid = undefined;
            }
        }
        
        // Fetch products & offers
        let products: Product[] = [];
        let offers: Offer[] = [];
        if (!skipCatalog) {
            // Intentar cargar de la Arquitectura de Documento Único (Alternativa A)
            const catalogRef = doc(db, `businesses/${actualBusinessId}/catalog`, 'data');
            const catalogSnap = await getDoc(catalogRef);
            
            if (catalogSnap.exists()) {
                const catalogData = catalogSnap.data();
                products = catalogData.products || [];
                offers = catalogData.offers || [];
                console.log(`[Firestore Read] fetchBusinessData: Catálogo ÚNICO descargado (1 lectura para TODO).`);
            } else {
                // Fallback de migración: leer subcolecciones antiguas
                console.log(`[Firestore Read] fetchBusinessData: No se encontró catálogo único. Fallback a subcolecciones...`);
                const productsSnap = await getDocs(collection(db, `businesses/${actualBusinessId}/products`));
                products = productsSnap.docs.map(doc => doc.data() as Product);
                
                const offersSnap = await getDocs(collection(db, `businesses/${actualBusinessId}/offers`));
                offers = offersSnap.docs.map(doc => doc.data() as Offer);
            }
        }
        
        // Fetch orders conditionally
        let rawOrders: Order[] = [];
        if (!skipOrders) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            let ordersQuery = null;
            if (userRole === 'business') {
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                const endOfToday = new Date();
                endOfToday.setHours(23, 59, 59, 999);
                ordersQuery = query(
                    collection(db, `businesses/${actualBusinessId}/orders`), 
                    where('scheduledTime', '>=', startOfToday.toISOString()),
                    where('scheduledTime', '<=', endOfToday.toISOString())
                );
            } else if (userId) {
                ordersQuery = query(collection(db, `businesses/${actualBusinessId}/orders`), where('clientId', '==', userId));
            } else if (guestOrderIds && guestOrderIds.length > 0) {
                const safeIds = guestOrderIds.slice(0, 10);
                ordersQuery = query(collection(db, `businesses/${actualBusinessId}/orders`), where('id', 'in', safeIds));
            }

            if (ordersQuery) {
                const ordersSnap = await getDocs(ordersQuery);
                rawOrders = ordersSnap.docs.map(doc => doc.data() as Order);
                console.log(`[Firestore Read] fetchBusinessData: Descargados ${rawOrders.length} pedidos. Rol: ${userRole || 'invitado'}`);
            }
        }
        
        const orders = Array.from(new Map(rawOrders.map(o => [o.id, o])).values());
        
        return { profile, settings, products, offers, orders };
    } catch (error) {
        console.error("Error fetching business data from Firebase:", error);
        throw error;
    }
};

export const listenToBusinessData = (businessId: string, callback: (catalogUpdatedAt: string) => void) => {
    const businessRef = doc(db, 'businesses', businessId);
    return onSnapshot(businessRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            if (data.catalogUpdatedAt) callback(data.catalogUpdatedAt);
        }
    });
};

export const fetchBusinessByOwnerEmail = async (email: string) => {
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where("email", "==", email), where("role", "==", "business"));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            throw new Error(`Ningún negocio encontrado para el correo ${email}`);
        }
        
        const ownerId = snapshot.docs[0].id; // The UID
        return { data: await fetchBusinessData(ownerId), businessId: ownerId };
    } catch (error) {
        console.error("Error fetching business by email:", error);
        throw error;
    }
}

// Helper para eliminar campos 'undefined' que Firestore no soporta
const cleanData = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
        return obj.map(item => (item !== null && typeof item === 'object') ? cleanData(item) : item);
    }
    if (typeof obj === 'object') {
        const res: any = {};
        Object.keys(obj).forEach(key => {
            if (obj[key] !== undefined) {
                res[key] = cleanData(obj[key]);
            }
        });
        return res;
    }
    return obj;
};

export const saveBusinessSettings = async (businessId: string, newSettings: BusinessSettings) => {
    try {
        const businessRef = doc(db, 'businesses', businessId);
        
        const settingsToSave = { ...newSettings };
        if (settingsToSave.rawExcelGrid && Array.isArray(settingsToSave.rawExcelGrid)) {
            settingsToSave.rawExcelGrid = JSON.stringify(settingsToSave.rawExcelGrid) as any;
        }

        await setDoc(businessRef, {
            settings: cleanData(settingsToSave)
        }, { merge: true });
        return true;
    } catch (error) {
        console.error("Error saving settings to Firebase:", error);
        throw error;
    }
};

export const saveBusinessProfile = async (businessId: string, newProfile: BusinessProfile) => {
    try {
        const businessRef = doc(db, 'businesses', businessId);
        await setDoc(businessRef, {
            profile: cleanData(newProfile)
        }, { merge: true });
        return true;
    } catch (error) {
        console.error("Error saving profile to Firebase:", error);
        throw error;
    }
};

export const saveOrderToFirebase = async (businessId: string, order: Order) => {
    const bId = (businessId && businessId !== 'default') ? businessId : CURRENT_BUSINESS_ID;
    
    console.log(`[SaveOrder] Iniciando guardado para negocio: ${bId}. User role: ${order.clientId === 'guest' ? 'guest' : 'authenticated'}`);

    try {
        let finalOrderId = order.id;
        
        // Solo generamos un ID secuencial si el pedido es completamente nuevo
        if (!order.id || order.id === '') {
            try {
                const counterRef = doc(db, `businesses/${bId}/counters`, 'orders');
                finalOrderId = await runTransaction(db, async (transaction) => {
                    const counterDoc = await transaction.get(counterRef);
                    let nextId = 1;
                    const now = new Date();
                    
                    if (counterDoc.exists()) {
                        const data = counterDoc.data();
                        nextId = (data.currentId || 0) + 1;
                        transaction.update(counterRef, { currentId: nextId });
                    } else {
                        transaction.set(counterRef, { currentId: 1 });
                    }
                    
                    return nextId.toString();
                });
                console.log(`[SaveOrder] ID secuencial generado: ${finalOrderId}`);
            } catch (transactionError: any) {
                console.warn("[SaveOrder] Falló la transacción de ID (permisos o conexión). Usando ID de emergencia.", transactionError?.message);
                // Fallback: ID basado en tiempo (HHmm + ultimos 4 del timestamp) para que sea corto pero único
                const now = new Date();
                const hhmm = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
                finalOrderId = "E-" + hhmm + "-" + Date.now().toString().slice(-4);
            }

            // Deduct stock (Single-Document architecture)
            let stockWasDeducted = false;
            try {
                const hasDeductions = order.items.some(item => 
                    (item.product.specialOffer?.active && item.product.specialOffer.limitByStock) || 
                    (item.product.stock !== undefined && item.product.stock !== null)
                );
                
                if (hasDeductions) {
                    const catalogRef = doc(db, `businesses/${bId}/catalog`, 'data');
                    
                    await runTransaction(db, async (transaction) => {
                        const catDoc = await transaction.get(catalogRef);
                        if (catDoc.exists()) {
                            const catData = catDoc.data();
                            let updated = false;
                            
                            const newProducts = (catData.products || []).map((p: any) => {
                                const orderItem = order.items.find(i => i.product.id === p.id);
                                if (orderItem) {
                                    // 1. Regular general stock
                                    if (p.stock !== undefined && p.stock !== null) {
                                        const currentStock = p.stock || 0;
                                        p.stock = Math.max(0, currentStock - orderItem.quantity);
                                        updated = true;
                                    }
                                    // 2. Special offer stock
                                    if (p.specialOffer?.active && p.specialOffer.limitByStock) {
                                        const currentSpecialStock = p.specialOffer.stockRemaining || 0;
                                        p.specialOffer.stockRemaining = Math.max(0, currentSpecialStock - orderItem.quantity);
                                        updated = true;
                                    }
                                }
                                return p;
                            });
                            
                            if (updated) {
                                transaction.update(catalogRef, { products: newProducts });
                                stockWasDeducted = true;
                            }
                        }
                    });
                }
            } catch(e) { 
                console.warn("[SaveOrder] Error al descontar stock en catalog/data, se ignora", e); 
            }
            
            // Trigger catalog refresh for clients SOLO SI hay descuento de stock real
            if (stockWasDeducted) {
                try {
                    const businessRef = doc(db, 'businesses', bId);
                    await updateDoc(businessRef, { catalogUpdatedAt: new Date().toISOString() });
                } catch(e) {}
            }
        }
        
        // Final write to the orders collection
        const cleanedOrder = cleanData(order);
        const finalOrder = { ...cleanedOrder, id: finalOrderId, businessId: bId };
        
        // Verificar que no haya valores NaN o Invalid Date que rompan Firestore
        if (isNaN(finalOrder.totalPrice)) finalOrder.totalPrice = 0;
        if (isNaN(finalOrder.subtotal)) finalOrder.subtotal = 0;

        const orderRef = doc(db, `businesses/${bId}/orders`, finalOrderId);
        await setDoc(orderRef, finalOrder);
        
        // Update counters/agenda for future orders (Hash Verification system)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const orderDate = new Date(finalOrder.scheduledTime);
        orderDate.setHours(0, 0, 0, 0);
        
        if (orderDate.getTime() > startOfToday.getTime()) {
            try {
                const agendaRef = doc(db, `businesses/${bId}/counters`, 'agenda');
                const dateStr = finalOrder.scheduledTime.split('T')[0];
                await setDoc(agendaRef, {
                    [dateStr]: new Date().toISOString()
                }, { merge: true });
                console.log(`[Firestore Write] Updated agenda counter for date ${dateStr}`);
            } catch (err) {
                console.warn("[SaveOrder] Error updating agenda counter:", err);
            }
        }
        
        console.log(`[SaveOrder] Pedido ${finalOrderId} guardado exitosamente.`);
        return finalOrder;
    } catch (error: any) {
        console.error("[SaveOrder] CRITICAL ERROR saving order:", error);
        // Rethrow with more context if possible
        const improvedError = new Error(error.message || "Unknown Firestore Error");
        (improvedError as any).code = error.code;
        throw improvedError;
    }
};

export const listenToOrders = (businessId: string, callback: (orders: Order[]) => void, userRole?: string, userId?: string, guestOrderIds?: string[]) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let ordersQuery = null;
    if (userRole === 'business') {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        ordersQuery = query(
            collection(db, `businesses/${businessId}/orders`), 
            where('scheduledTime', '>=', startOfToday.toISOString())
        );
    } else if (userId) {
        ordersQuery = query(collection(db, `businesses/${businessId}/orders`), where('clientId', '==', userId));
    } else if (guestOrderIds && guestOrderIds.length > 0) {
        const safeIds = guestOrderIds.slice(0, 10);
        ordersQuery = query(collection(db, `businesses/${businessId}/orders`), where('id', 'in', safeIds));
    }

    if (!ordersQuery) {
        callback([]);
        return () => {}; // Empty unsubscribe
    }

    return onSnapshot(ordersQuery, (snapshot) => {
        console.log(`[Firestore Read] listenToOrders: Recibidos ${snapshot.docs.length} pedidos en vivo. Rol: ${userRole || 'invitado'}`);
        const rawOrders = snapshot.docs.map(doc => doc.data() as Order);
        // Deduplicate orders by ID to handle corrupted database states
        const uniqueOrders = Array.from(new Map(rawOrders.map(o => [o.id, o])).values());
        callback(uniqueOrders);
    }, (error) => {
        console.error("Error listening to orders:", error);
    });
};

export const getFutureOrders = async (businessId: string): Promise<Order[]> => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        
        const q = query(
            collection(db, `businesses/${businessId}/orders`),
            where('scheduledTime', '>=', startOfToday.toISOString())
        );
        
        const snap = await getDocs(q);
        console.log(`[Firestore Read] getFutureOrders: Descargados ${snap.docs.length} pedidos desde hoy en adelante bajo demanda.`);
        return snap.docs.map(doc => doc.data() as Order);
    } catch (error) {
        console.error("Error getting future orders:", error);
        throw error;
    }
};

export const getPastOrders = async (businessId: string): Promise<Order[]> => {
    try {
        const yesterdayEnd = new Date();
        yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
        yesterdayEnd.setHours(23, 59, 59, 999);
        
        const q = query(
            collection(db, `businesses/${businessId}/orders`),
            where('scheduledTime', '<=', yesterdayEnd.toISOString())
        );
        
        try {
            const cacheSnap = await getDocsFromCache(q);
            if (!cacheSnap.empty) {
                console.log(`[Firestore Cache Read] getPastOrders: Cargados ${cacheSnap.docs.length} pedidos del pasado desde caché.`);
                return cacheSnap.docs.map(doc => doc.data() as Order);
            }
        } catch (cacheError) {
            console.log(`[Firestore Cache Read] No se encontraron pedidos pasados en caché, consultando al servidor...`);
        }
        
        const serverSnap = await getDocsFromServer(q);
        console.log(`[Firestore Read] getPastOrders: Descargados ${serverSnap.docs.length} pedidos del pasado desde el servidor.`);
        return serverSnap.docs.map(doc => doc.data() as Order);
    } catch (error) {
        console.error("Error getting past orders:", error);
        throw error;
    }
};

export const saveNotificationToFirebase = async (businessId: string, notification: AppNotification) => {
    try {
        const notifRef = doc(db, `businesses/${businessId}/notifications`, notification.id);
        await setDoc(notifRef, cleanData(notification));
        return true;
    } catch (e) {
        console.error("Error saving notification:", e);
        return false;
    }
};

export const markNotificationAsReadInFirebase = async (businessId: string, notificationId: string) => {
    try {
        const notifRef = doc(db, `businesses/${businessId}/notifications`, notificationId);
        await updateDoc(notifRef, { read: true });
        return true;
    } catch (e) {
        console.error("Error updating notification:", e);
        return false;
    }
};

export const listenToNotifications = (businessId: string, userId: string, callback: (notifs: AppNotification[]) => void) => {
    const notifRef = collection(db, `businesses/${businessId}/notifications`);
    
    let q;
    if (userId && userId !== 'default') {
        q = query(notifRef, where('userId', 'in', ['all', userId]));
    } else {
        q = query(notifRef, where('userId', '==', 'all'));
    }

    return onSnapshot(q, (snapshot) => {
        console.log(`[Firestore Read] listenToNotifications: Recibidas ${snapshot.docs.length} notificaciones para userId: ${userId}`);
        const myNotifs = snapshot.docs.map(doc => doc.data() as AppNotification);
        callback(myNotifs);
    }, (error) => {
        console.error("Error listening to notifications:", error);
    });
};

export const saveCatalogToFirebase = async (
    businessId: string, 
    products: Product[], 
    offers: Offer[], 
    originalProducts?: Product[], 
    originalOffers?: Offer[]
) => {
    console.log(`[Firestore] Guardando catálogo usando Arquitectura de Documento Único para: ${businessId}`);
    try {
        const batch = writeBatch(db);
        
        // Documento Único
        const catalogRef = doc(db, `businesses/${businessId}/catalog`, 'data');
        
        // Guardamos todo de una sola vez
        batch.set(catalogRef, cleanData({
            products: products.map(p => ({ ...p, businessId })),
            offers: offers.map(o => ({ ...o, businessId })),
            updatedAt: new Date().toISOString()
        }));

        // Actualizamos el timestamp maestro
        const businessRef = doc(db, 'businesses', businessId);
        const nowStr = new Date().toISOString();
        batch.set(businessRef, { catalogUpdatedAt: nowStr }, { merge: true });

        await batch.commit();
        await AsyncStorage.setItem('catalogUpdatedAt', nowStr);
        console.log(`[Firestore] Catálogo único guardado con éxito. catalogUpdatedAt: ${nowStr}`);
        return true;
    } catch (error) {
        console.error("[Firestore] Error en saveCatalogToFirebase (Single-Document):", error);
        throw error;
    }
};
export const savePushTokenToFirebase = async (businessId: string, clientId: string, token: string) => {
    try {
        const cleanedToken = token.replace(/\s/g, ''); // Eliminar cualquier espacio accidental
        const tokenRef = doc(db, `businesses/${businessId}/push_tokens`, clientId);
        await setDoc(tokenRef, { 
            token: cleanedToken, 
            updatedAt: new Date().toISOString(),
            clientId 
        });
        return true;
    } catch (e) {
        console.error("Error saving push token:", e);
        return false;
    }
};

export const createBroadcast = async (businessId: string, title: string, message: string) => {
    try {
        const broadcastId = Date.now().toString();
        const broadcastRef = doc(db, `businesses/${businessId}/broadcasts`, broadcastId);
        await setDoc(broadcastRef, {
            id: broadcastId,
            title,
            message,
            createdAt: new Date().toISOString()
        });
        return true;
    } catch (e) {
        console.error("Error creating broadcast:", e);
        return false;
    }
};

export const deleteOrderFromFirebase = async (businessId: string, orderId: string) => {
    try {
        const orderRef = doc(db, `businesses/${businessId}/orders`, orderId);
        await deleteDoc(orderRef);
        return true;
    } catch (e) {
        console.error("Error deleting order from firebase:", e);
        throw e;
    }
};
