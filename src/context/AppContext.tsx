import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { businesses, CURRENT_BUSINESS_ID, defaultSettings, mockOffers, mockOrders, mockProducts, IS_DEDICATED_APP, DEDICATED_OWNER_EMAILS } from '../data/mockData';
import { BusinessProfile, BusinessSettings, Offer, Order, OrderItem, Product, User, AppNotification } from '../types';
import { fetchBusinessByOwnerEmail, fetchBusinessData, listenToOrders, listenToBusinessData, getFutureOrders, getPastOrders, deleteOrderFromFirebase } from '../services/businessService';
import { doc, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { trackTesterInteraction } from '../utils/testerTracker';

interface AppContextType {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    businessProfile: BusinessProfile;
    setBusinessProfile: React.Dispatch<React.SetStateAction<BusinessProfile>>;
    products: Product[];
    setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    offers: Offer[];
    setOffers: React.Dispatch<React.SetStateAction<Offer[]>>;
    settings: BusinessSettings;
    setSettings: React.Dispatch<React.SetStateAction<BusinessSettings>>;
    cart: OrderItem[];
    setCart: React.Dispatch<React.SetStateAction<OrderItem[]>>;
    modifyingOrder: Order | null;
    setModifyingOrder: (order: Order | null) => void;
    notifications: AppNotification[];
    setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
    unreadOrderUpdates: number;
    setUnreadOrderUpdates: React.Dispatch<React.SetStateAction<number>>;
    loadBusinessById: (businessId: string, currentUserOverride?: User | null, currentGuestIdsOverride?: string[]) => Promise<void>;
    addRafflePoints: (amount: number) => Promise<void>;
    isLoading: boolean;
    isLoadingOrders: boolean;
    flashOfferState: { expiresAt: number; discount: number; type?: 'percentage'|'fixed'; title?: string } | null;
    setFlashOfferState: React.Dispatch<React.SetStateAction<{ expiresAt: number; discount: number; type?: 'percentage'|'fixed'; title?: string } | null>>;
    isSyncingFuture: boolean;
    isSyncingPast: boolean;
    syncFutureOrders: () => Promise<void>;
    syncPastOrders: () => Promise<void>;
    activeCouponCode: string | null;
    setActiveCouponCode: (code: string | null) => void;
    guestOrderIds: string[];
    setGuestOrderIds: React.Dispatch<React.SetStateAction<string[]>>;
    addGuestOrder: (orderId: string) => void;
    clearGuestOrders: () => void;
    trackTesterInteraction: () => Promise<void>;
    favorites: string[];
    toggleFavorite: (productId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(businesses[CURRENT_BUSINESS_ID]?.profile || { id: 'default', name: 'Butcher App', primaryColor: '#FF3B30' });
    const [products, setProducts] = useState<Product[]>(IS_DEDICATED_APP ? [] : mockProducts);
    const [orders, setOrders] = useState<Order[]>(IS_DEDICATED_APP ? [] : mockOrders);
    const [offers, setOffers] = useState<Offer[]>(IS_DEDICATED_APP ? [] : mockOffers);
    const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [modifyingOrder, setModifyingOrder] = useState<Order | null>(null);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadOrderUpdates, setUnreadOrderUpdates] = useState<number>(0);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [flashOfferState, setFlashOfferState] = useState<{ expiresAt: number; discount: number; type?: 'percentage'|'fixed'; title?: string } | null>(null);
    const [isSyncingFuture, setIsSyncingFuture] = useState(false);
    const [isSyncingPast, setIsSyncingPast] = useState(false);
    const [activeCouponCode, setActiveCouponCode] = useState<string | null>(null);
    const [guestOrderIds, setGuestOrderIds] = useState<string[]>([]);
    const interactionsRef = useRef({ count: 0, date: '' });

    const [favorites, setFavorites] = useState<string[]>([]);

    useEffect(() => {
        if (user?.favorites) {
            setFavorites(user.favorites);
        } else {
            AsyncStorage.getItem('@guest_favorites').then(val => {
                if (val) setFavorites(JSON.parse(val));
            }).catch(() => {});
        }
    }, [user?.favorites]);

    const toggleFavorite = async (productId: string) => {
        let newFavs = [...favorites];
        if (newFavs.includes(productId)) {
            newFavs = newFavs.filter(id => id !== productId);
        } else {
            newFavs.push(productId);
        }
        setFavorites(newFavs);

        if (user?.id) {
            try {
                // Update in Firestore
                const { doc, updateDoc } = await import('firebase/firestore');
                const { db } = await import('../config/firebase');
                await updateDoc(doc(db, 'users', user.id), { favorites: newFavs });
                setUser({ ...user, favorites: newFavs });
            } catch (e) {
                console.error("Error updating favorites", e);
            }
        } else {
            AsyncStorage.setItem('@guest_favorites', JSON.stringify(newFavs)).catch(() => {});
        }
    };

    const handleTrackTesterInteraction = async () => {
        try {
            const today = new Date().toLocaleDateString('en-CA');
            const key = `@tester_interactions_${today}`;
            let countStr = await AsyncStorage.getItem(key);
            let count = countStr ? parseInt(countStr, 10) : 0;
            
            if (count < 5) {
                count += 1;
                await AsyncStorage.setItem(key, count.toString());
                await trackTesterInteraction(businessProfile.id, user, count);
            }
        } catch (e) {
            console.warn(e);
        }
    };


    const ordersUnsubscribeRef = useRef<(() => void) | null>(null);
    const businessUnsubscribeRef = useRef<(() => void) | null>(null);
    const lastLoadedUserRef = useRef<{ id: string | undefined; role: string | undefined }>({ id: undefined, role: undefined });

    const loadBusinessById = async (targetBusinessId: string, currentUserOverride?: User | null, currentGuestIdsOverride?: string[]) => {
        setIsLoading(true);
        try {
            // Utilizamos los overrides pasados o el estado actual
            const activeUser = currentUserOverride !== undefined ? currentUserOverride : user;
            const activeGuestIds = currentGuestIdsOverride !== undefined ? currentGuestIdsOverride : guestOrderIds;

            console.log(`[AppContext] loadBusinessById: loading for business ${targetBusinessId}. activeUserRole: ${activeUser?.role || 'client'}, activeUserId: ${activeUser?.id || 'none'}`);

            // Track what we are loading
            lastLoadedUserRef.current = { id: activeUser?.id, role: activeUser?.role || undefined };

            let skipFetchCatalog = false;
            // Si no es administrador y tenemos productos en caché, podemos verificar el timestamp antes de descargar
            if (activeUser?.role === 'client' || !activeUser) {
                try {
                    const localSync = await AsyncStorage.getItem('catalogUpdatedAt');
                    if (localSync) {
                        const businessRef = doc(db, 'businesses', targetBusinessId);
                        const businessSnap = await getDoc(businessRef);
                        if (businessSnap.exists()) {
                            const businessDocData = businessSnap.data();
                            if (businessDocData?.catalogUpdatedAt === localSync) {
                                console.log(`[AppContext] Catálogo en caché está actualizado (${localSync}). Omitiendo descarga de productos.`);
                                skipFetchCatalog = true;
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[AppContext] Error al verificar timestamp de catálogo:", e);
                }
            }

            const cloudData = await fetchBusinessData(
                targetBusinessId, 
                activeUser?.role === 'business' ? 'business' : 'client', 
                activeUser?.id, 
                activeGuestIds, 
                false,
                skipFetchCatalog
            );
            
            setBusinessProfile(cloudData.profile);
            setSettings(cloudData.settings);
                        if (!skipFetchCatalog) {
                setProducts(cloudData.products);
                setOffers(cloudData.offers);
            } else {
                try {
                    const cachedProducts = await AsyncStorage.getItem('products');
                    if (cachedProducts) setProducts(JSON.parse(cachedProducts));
                    const cachedOffers = await AsyncStorage.getItem('offers');
                    if (cachedOffers) setOffers(JSON.parse(cachedOffers));
                } catch (e) {
                    console.error('Error loading cache', e);
                }
            }
            setOrders(cloudData.orders);
            
            // Clean up previous order listener
            if (ordersUnsubscribeRef.current) {
                console.log(`[AppContext] Cleaning up previous order listener`);
                ordersUnsubscribeRef.current();
                ordersUnsubscribeRef.current = null;
            }

            // Suscribirse a órdenes en tiempo real de manera optimizada
            setIsLoadingOrders(true);
            const unsubscribeOrders = listenToOrders(targetBusinessId, (newOrders) => {
                if (activeUser?.role === 'business') {
                    setOrders(prev => {
                        const startOfToday = new Date();
                        startOfToday.setHours(0, 0, 0, 0);

                        // Keep orders that are from the PAST
                        const pastOrders = prev.filter(o => {
                            const time = new Date(o.scheduledTime).getTime();
                            return time < startOfToday.getTime();
                        });

                        // Merge past orders with the real-time future+today orders
                        const merged = [...pastOrders, ...newOrders];
                        return Array.from(new Map(merged.map(o => [o.id, o])).values());
                    });
                } else {
                    setOrders(newOrders);
                }
                setIsLoadingOrders(false);
            }, activeUser?.role === 'business' ? 'business' : 'client', activeUser?.id, activeGuestIds);

            ordersUnsubscribeRef.current = unsubscribeOrders;

            // Clean up previous business data listener
            if (businessUnsubscribeRef.current) {
                console.log(`[AppContext] Cleaning up previous business data listener`);
                businessUnsubscribeRef.current();
                businessUnsubscribeRef.current = null;
            }

            // Suscribirse a actualizaciones del catálogo (SOLO si no es administrador)
            if (activeUser?.role !== 'business') {
                const unsubscribeBusiness = listenToBusinessData(targetBusinessId, async (updatedAt) => {
                    const localSync = await AsyncStorage.getItem('catalogUpdatedAt');
                    if (localSync !== updatedAt) {
                        console.log(`[Firestore Read] Catálogo actualizado, recargando... (sin pedidos)`);
                        const newData = await fetchBusinessData(targetBusinessId, 'client', activeUser?.id, activeGuestIds, true, false);
                        setSettings(newData.settings);
                        setProducts(newData.products);
                        setOffers(newData.offers);
                        await AsyncStorage.setItem('catalogUpdatedAt', updatedAt);
                        await AsyncStorage.setItem('settings', JSON.stringify(newData.settings));
                        await AsyncStorage.setItem('products', JSON.stringify(newData.products));
                        await AsyncStorage.setItem('offers', JSON.stringify(newData.offers));
                    }
                });

                businessUnsubscribeRef.current = unsubscribeBusiness;
            }

            // Guardar localmente para caché
            await AsyncStorage.setItem('businessProfile', JSON.stringify(cloudData.profile));
            await AsyncStorage.setItem('settings', JSON.stringify(cloudData.settings));
            if (!skipFetchCatalog) {
                await AsyncStorage.setItem('products', JSON.stringify(cloudData.products));
                await AsyncStorage.setItem('offers', JSON.stringify(cloudData.offers));
            }
            await AsyncStorage.setItem('orders', JSON.stringify(cloudData.orders));
        } catch (error) {
            console.error("Error loading business by ID:", error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // 0. Restaurar usuario de la sesión primero
                const userSave = await AsyncStorage.getItem('user');
                let currentUser: User | null = null;
                if (userSave) {
                    try {
                        currentUser = JSON.parse(userSave);
                        setUser(currentUser);
                    } catch(e) {}
                }

                // Restaurar caché de catálogo para carga instantánea
                const profileSave = await AsyncStorage.getItem('businessProfile');
                if (profileSave) {
                    try { setBusinessProfile(JSON.parse(profileSave)); } catch(e) {}
                }
                const settingsSave = await AsyncStorage.getItem('settings');
                if (settingsSave) {
                    try { setSettings(JSON.parse(settingsSave)); } catch(e) {}
                }
                const productsSave = await AsyncStorage.getItem('products');
                if (productsSave) {
                    try { setProducts(JSON.parse(productsSave)); } catch(e) {}
                }
                const offersSave = await AsyncStorage.getItem('offers');
                if (offersSave) {
                    try { setOffers(JSON.parse(offersSave)); } catch(e) {}
                }
                const ordersSave = await AsyncStorage.getItem('orders');
                if (ordersSave) {
                    try { setOrders(JSON.parse(ordersSave)); } catch(e) {}
                }

                // 1. Determinar de qué negocio traer los datos inicialmente
                let targetBusinessId: string | null = IS_DEDICATED_APP ? CURRENT_BUSINESS_ID : null;

                if (currentUser?.email === 'cocobustos.93@gmail.com') {
                    const saved = await AsyncStorage.getItem('businessProfile');
                    targetBusinessId = saved ? JSON.parse(saved).id : currentUser.id;
                } else if (currentUser?.role === 'business') {
                    targetBusinessId = currentUser.id;
                } 
                else if (IS_DEDICATED_APP) {
                    // Para apps dedicadas, intentamos obtener el ID real desde el inicio
                    try {
                        const { businessId } = await fetchBusinessByOwnerEmail(DEDICATED_OWNER_EMAILS[0]);
                        targetBusinessId = businessId;
                    } catch (e) {
                        const savedProfile = await AsyncStorage.getItem('businessProfile');
                        if (savedProfile) {
                            targetBusinessId = JSON.parse(savedProfile).id;
                        }
                    }
                } else {
                    // App Universal: Intentar recordar el último negocio visitado por el cliente
                    const savedProfile = await AsyncStorage.getItem('businessProfile');
                    if (savedProfile) {
                        try {
                            const parsed = JSON.parse(savedProfile);
                            if (parsed && parsed.id) targetBusinessId = parsed.id;
                        } catch(e) {}
                    }
                }

                // Restaura guest orders PRIMERO para poder pasarlo a la carga inicial
                const guestOrdersSave = await AsyncStorage.getItem('guestOrderIds');
                let localGuestIds: string[] = [];
                if (guestOrdersSave) {
                    try {
                        localGuestIds = JSON.parse(guestOrdersSave);
                        setGuestOrderIds(localGuestIds);
                    } catch(e) {}
                }

                // Restaura el carrito
                const cartSave = await AsyncStorage.getItem('cart');
                if (cartSave) {
                    try {
                        let parsedCart: OrderItem[] = JSON.parse(cartSave);
                        setCart(parsedCart);
                    } catch(e) {}
                }

                // Llama a la carga inicial del negocio pasando el usuario y los IDs de invitado
                if (productsSave && profileSave && targetBusinessId) {
                    console.log("[AppContext] Carga rápida usando caché local.");
                    setIsReady(true);
                    setIsLoading(false);
                    loadBusinessById(targetBusinessId, currentUser, localGuestIds).catch(err => {
                        console.warn("[AppContext] Error en segundo plano actualizando catálogo:", err);
                    });
                } else if (targetBusinessId) {
                    console.log("[AppContext] Sin caché previa, forzando descarga.");
                    await loadBusinessById(targetBusinessId, currentUser, localGuestIds);
                } else {
                    console.log("[AppContext] No target business ID, omitiendo carga.");
                }

            } catch (error) {
                console.warn("Error en carga inicial, usando caché local si existe.");
            } finally {
                setIsReady(true);
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        if (!isReady) return;
        
        // If we already loaded data for this user ID and role, skip reloading
        if (lastLoadedUserRef.current.id === user?.id && lastLoadedUserRef.current.role === user?.role) {
            return;
        }
        
        const reloadDataOnUserChange = async () => {
            try {
                let targetBusinessId = CURRENT_BUSINESS_ID;

                if (user?.email === 'cocobustos.93@gmail.com') {
                    const saved = await AsyncStorage.getItem('businessProfile');
                    targetBusinessId = saved ? JSON.parse(saved).id : user.id;
                } else if (user?.role === 'business') {
                    const saved = await AsyncStorage.getItem('businessProfile');
                    if (saved) {
                        try {
                            const parsed = JSON.parse(saved);
                            targetBusinessId = parsed.id || user.id;
                        } catch (e) {
                            targetBusinessId = user.id;
                        }
                    } else {
                        targetBusinessId = user.id;
                    }
                } else if (IS_DEDICATED_APP) {
                    const savedProfile = await AsyncStorage.getItem('businessProfile');
                    if (savedProfile) {
                        targetBusinessId = JSON.parse(savedProfile).id;
                    }
                } else {
                    const savedProfile = await AsyncStorage.getItem('businessProfile');
                    if (savedProfile) {
                        targetBusinessId = JSON.parse(savedProfile).id;
                    }
                }

                console.log(`[AppContext] User changed to id: ${user?.id || 'guest'}, role: ${user?.role || 'guest'}. Reloading business ${targetBusinessId} data.`);
                await loadBusinessById(targetBusinessId, user);
            } catch (error) {
                console.warn("[AppContext] Error reloading data on user change:", error);
            }
        };

        reloadDataOnUserChange();
    }, [user?.id, user?.role, isReady]);

    const addRafflePoints = async (amount: number) => {
        if (!user) return;
        const newPoints = (user.rafflePoints || 0) + amount;
        const updatedUser = { ...user, rafflePoints: newPoints };
        setUser(updatedUser);
    };
 
    const syncFutureOrders = async () => {
        if (!businessProfile?.id) return;
        setIsSyncingFuture(true);
        try {
            console.log("[Sync] Sincronizando pedidos desde hoy en adelante...");
            
            // 1. Auto-cleanup deleted orders older than 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const oldDeletedOrders = orders.filter(o => o.deleted && o.deletedAt && new Date(o.deletedAt).getTime() < thirtyDaysAgo.getTime());
            for (let oldOrder of oldDeletedOrders) {
                try {
                    await deleteOrderFromFirebase(businessProfile.id, oldOrder.id);
                    console.log(`[Auto Cleanup] Pedido ${oldOrder.id} eliminado permanentemente.`);
                } catch (e) {
                    console.error("[Auto Cleanup] Error eliminando pedido viejo:", e);
                }
            }

            // 2. Fetch fresh orders from today onwards
            const future = await getFutureOrders(businessProfile.id);
            setOrders(prev => {
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);

                // Exclude local orders that are today or future (since we have the fresh list)
                const cleanPrev = prev.filter(o => {
                    const orderTime = new Date(o.scheduledTime).getTime();
                    return orderTime < startOfToday.getTime();
                });

                // Merge and filter out any orders that were permanently deleted above
                const cleanedFuture = future.filter(fo => !oldDeletedOrders.some(oo => oo.id === fo.id));
                const merged = [...cleanPrev, ...cleanedFuture];
                return Array.from(new Map(merged.map(o => [o.id, o])).values());
            });
            console.log("[Sync] Pedidos sincronizados con éxito.");
        } catch (error) {
            console.error("Error in syncFutureOrders:", error);
        } finally {
            setIsSyncingFuture(false);
        }
    };

    const syncPastOrders = async () => {
        if (!businessProfile?.id) return;
        setIsSyncingPast(true);
        try {
            const past = await getPastOrders(businessProfile.id);
            setOrders(prev => {
                const merged = [...prev, ...past];
                return Array.from(new Map(merged.map(o => [o.id, o])).values());
            });
        } catch (error) {
            console.error("Error syncing past orders in AppContext:", error);
        } finally {
            setIsSyncingPast(false);
        }
    };

    useEffect(() => {
        if (!isReady) return;
        AsyncStorage.setItem('user', JSON.stringify(user));
        AsyncStorage.setItem('cart', JSON.stringify(cart));
        AsyncStorage.setItem('guestOrderIds', JSON.stringify(guestOrderIds));
    }, [user, cart, guestOrderIds, isReady]);

    return (
        <AppContext.Provider value={{
            user, setUser,
            businessProfile, setBusinessProfile,
            products, setProducts,
            orders, setOrders,
            offers, setOffers,
            settings, setSettings,
            cart, setCart,
            modifyingOrder, setModifyingOrder,
            notifications, setNotifications,
            unreadOrderUpdates, setUnreadOrderUpdates,
            loadBusinessById,
            addRafflePoints,
            isLoading,
            isLoadingOrders,
        flashOfferState,
        setFlashOfferState,
            isSyncingFuture,
            isSyncingPast,
            syncFutureOrders,
            syncPastOrders,
            activeCouponCode,
            setActiveCouponCode,
            guestOrderIds, setGuestOrderIds,
            addGuestOrder: (orderId: string) => setGuestOrderIds(prev => [...prev, orderId]),
            clearGuestOrders: () => setGuestOrderIds([]),
            trackTesterInteraction: handleTrackTesterInteraction,
            favorites,
            toggleFavorite
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

