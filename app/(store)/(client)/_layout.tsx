import { FontAwesome } from '@expo/vector-icons';
import { Tabs, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View, Animated, PanResponder, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppContext } from '../../../src/context/AppContext';
import { Order } from '../../../src/types';
import { registerForPushNotificationsAsync } from '../../../src/utils/notificationHelper';
import * as Notifications from 'expo-notifications';
import { savePushTokenToFirebase, listenToNotifications } from '../../../src/services/businessService';

export default function ClientLayout() {
    const { cart, setCart, orders, user, businessProfile, settings, unreadOrderUpdates, setUnreadOrderUpdates, notifications, setNotifications, modifyingOrder, setModifyingOrder, offers, loadBusinessById, trackTesterInteraction, flashOfferState, setFlashOfferState } = useAppContext();
    const unreadNotifsCount = notifications.filter(n => !n.read).length;
    const { store } = useLocalSearchParams();
    const [orderUpdatePopup, setOrderUpdatePopup] = useState<{ visible: boolean, title: string, message: string } | null>(null);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showFlashModal, setShowFlashModal] = useState(false);
    const [flashTimeLeft, setFlashTimeLeft] = useState<number | null>(null);

    useEffect(() => {
        const checkFlashOffer = async () => {
            if (!businessProfile?.id) return;
            if (settings?.flashOffer?.active) {
                const storageKey = 'flashOffer_' + businessProfile.id;
                const saved = await AsyncStorage.getItem(storageKey);
                
                if (!saved) {
                    // Show modal!
                    setTimeout(() => setShowFlashModal(true), 2000); // delay so they see the shop first
                } else {
                    const parsed = JSON.parse(saved);
                    if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
                        setFlashOfferState(parsed);
                    }
                }
            }
        };
        checkFlashOffer();
    }, [businessProfile?.id, settings?.flashOffer?.active]);

    useEffect(() => {
        if (!flashOfferState) return;
        const interval = setInterval(() => {
            const left = flashOfferState.expiresAt - Date.now();
            if (left <= 0) {
                setFlashOfferState(null);
                setFlashTimeLeft(null);
                clearInterval(interval);
            } else {
                setFlashTimeLeft(left);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [flashOfferState]);

    const handleClaimFlashOffer = async () => {
        if (!settings?.flashOffer) return;
        const durationMs = settings.flashOffer.durationMinutes * 60000;
        const newState = { expiresAt: Date.now() + durationMs, discount: settings.flashOffer.discountPercentage };
        await AsyncStorage.setItem('flashOffer_' + businessProfile.id, JSON.stringify(newState));
        setFlashOfferState(newState);
        setShowFlashModal(false);
    };

    const handleDeclineFlashOffer = async () => {
        await AsyncStorage.setItem('flashOffer_' + businessProfile.id, JSON.stringify({ expired: true }));
        setShowFlashModal(false);
    };

    const formatTime = (ms: number) => {
        const totalSecs = Math.floor(ms / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Si la URL tiene un store distinto al cargado (o el default), lo cargamos
    useEffect(() => {
        if (store && typeof store === 'string') {
            const currentId = businessProfile?.id;
            if (currentId !== store) {
                console.log(`[ClientLayout] URL param store (${store}) no coincide con el actual (${currentId}). Cargando...`);
                // Llamar a loadBusinessById asincrónicamente
                loadBusinessById(store).catch(err => {
                    console.error("No se pudo cargar el negocio de la URL:", err);
                    // Opcionalmente redirigir a un 404 o al inicio
                });
            }
        }
    }, [store, businessProfile?.id]);

    // Calculate total and count based on the cart contents
    let cashTotal = 0;
    const total = cart.reduce((sum, item) => {
        let unitPrice = item.product.price;
        let effectiveTiers = item.product.bulkPricing ? [...item.product.bulkPricing] : [];
        const singleItemOffers = (offers || []).filter(o => o.active && o.requirements?.length === 1 && o.requirements[0].productId === item.product.id);
        for (let o of singleItemOffers) {
            effectiveTiers.push({ quantity: o.requirements[0].quantity, price: o.bundlePrice });
        }

        if (effectiveTiers.length > 0) {
            const sortedTiers = [...effectiveTiers].sort((a, b) => b.quantity - a.quantity);
            for (let tier of sortedTiers) {
                if (item.quantity >= tier.quantity) {
                    unitPrice = (tier.price / tier.quantity);
                    break;
                }
            }
        }
        
        let cashUnitPrice = unitPrice;
        if (item.product.isDailyOffer && item.product.dailyOfferMinQty && item.product.dailyOfferPrice) {
            if (item.quantity >= item.product.dailyOfferMinQty) {
                cashUnitPrice = item.product.dailyOfferPrice / item.product.dailyOfferMinQty;
            }
        }
        cashTotal += cashUnitPrice * item.quantity;

        return sum + (unitPrice * item.quantity);
    }, 0);
    const itemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    const prevOrdersRef = useRef<Order[]>([]);

    useEffect(() => {
        if (!user) return;
        const myOrders = orders.filter(o => o.clientId === user.id);
        const prev = prevOrdersRef.current;

        if (prev.length > 0) {
            myOrders.forEach(async (mo) => {
                const old = prev.find(p => p.id === mo.id);
                if (old) {
                    if (modifyingOrder && modifyingOrder.id === mo.id) return;

                    const statusChanged = old.status !== mo.status;
                    const priceChanged = old.totalPrice !== mo.totalPrice;
                    const wasModified = mo.isCustomTotal && !old.isCustomTotal;

                    // Ignorar la notificación de precio modificado si el que modificó fue el cliente
                    let shouldNotifyPrice = (priceChanged || wasModified);
                    if (shouldNotifyPrice && mo.lastModifiedBy === 'client') {
                        shouldNotifyPrice = false;
                    }

                    if (statusChanged || shouldNotifyPrice) {
                        let title = '🔔 Actualización de Pedido';
                        const statusConfig = settings?.orderStatuses?.find((s: any) => s.id === mo.status);
                        let statusName = statusConfig?.label;
                        if (!statusName) {
                            if (mo.status === 'pending') statusName = 'Pendiente';
                            else if (mo.status === 'confirmed') statusName = 'Confirmado';
                            else if (mo.status === 'ready') statusName = mo.deliveryMethod === 'delivery' ? 'Listo / En Camino' : 'Listo para Retiro';
                            else if (mo.status === 'delivered') statusName = 'Recibido';
                            else if (mo.status === 'cancelled') statusName = 'Cancelado';
                            else statusName = mo.status;
                        }
                        let msg = `Tu pedido #${mo.id} ahora está en estado: ${statusName}`;
                        
                        if (wasModified || priceChanged) {
                            title = '¡Pedido Modificado!';
                            msg = `La carnicería ha ajustado los pesos/precios de tu pedido #${mo.id}. Revisa los detalles en la sección de Pedidos.`;
                        }
                        
                        const newNotif = {
                            id: Date.now().toString() + Math.random().toString(),
                            businessId: mo.businessId || 'default',
                            userId: mo.clientId,
                            title: title,
                            message: msg,
                            type: 'order_update' as const,
                            read: false,
                            createdAt: new Date().toISOString(),
                            actionUrl: `/orders`
                        };
                        setNotifications(prev => [...prev, newNotif]);

                        if (Platform.OS === 'web') {
                            setUnreadOrderUpdates(prev => prev + 1);
                            setOrderUpdatePopup({ visible: true, title, message: msg });
                        } else {
                            setUnreadOrderUpdates(prev => prev + 1);
                            setOrderUpdatePopup({ visible: true, title, message: msg });
                            await Notifications.scheduleNotificationAsync({
                                content: {
                                    title: title,
                                    body: msg,
                                    data: { orderId: mo.id },
                                },
                                trigger: null,
                            });
                        }
                    }
                }
            });
        }

        prevOrdersRef.current = myOrders;
    }, [orders, user, setNotifications, setUnreadOrderUpdates, modifyingOrder]);

    // Escuchar notificaciones cloud de Firebase
    useEffect(() => {
        if (!user || !businessProfile.id) return;
        const unsubscribe = listenToNotifications(businessProfile.id, user.id, (cloudNotifs) => {
            // Unificamos las notificaciones cloud con las que genera localmente la app (eg: order_updates)
            // Se puede sobrescribir usando el originario
            setNotifications(prevLocal => {
                const map = new Map();
                prevLocal.forEach(n => map.set(n.id, n));
                cloudNotifs.forEach(n => map.set(n.id, n));
                // Sort by new
                return Array.from(map.values()).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            });
        });
        return () => unsubscribe();
    }, [user, businessProfile.id, setNotifications]);

    // Registro de Notificaciones Real
    useEffect(() => {
        if (Platform.OS !== 'web') {
            registerForPushNotificationsAsync().then(token => {
                if (token) {
                    console.log('Token obtenido:', token);
                    if (user) {
                        savePushTokenToFirebase(businessProfile.id, user.id, token);
                    }
                }
            });
        }
    }, [user, businessProfile.id]);

    useEffect(() => {
        if (Platform.OS === 'web') {
            const handleInteraction = () => {
                trackTesterInteraction();
            };
            window.addEventListener('pointerdown', handleInteraction, true);
            return () => window.removeEventListener('pointerdown', handleInteraction, true);
        }
    }, [trackTesterInteraction]);

    useEffect(() => {
        if (Platform.OS === 'web' && window !== window.top) {
            const style = document.createElement('style');
            style.innerText = `
                ::-webkit-scrollbar { display: none; }
                * { -ms-overflow-style: none; scrollbar-width: none; }
            `;
            document.head.appendChild(style);

            let isDragging = false;
            let hasDragged = false;
            let startX = 0;
            let startY = 0;
            let scrollLeft = 0;
            let scrollTop = 0;
            let target: HTMLElement | null = null;

            const mouseDownHandler = function (e: MouseEvent) {
                if (e.button !== 0) return;
                hasDragged = false;
                let el = e.target as HTMLElement | null;

                while (el && el !== document.body) {
                    const compStyle = window.getComputedStyle(el);
                    if (compStyle.overflowX === 'auto' || compStyle.overflowX === 'scroll' || compStyle.overflowY === 'auto' || compStyle.overflowY === 'scroll') {
                        target = el;
                        isDragging = true;
                        startX = e.pageX - target.offsetLeft;
                        startY = e.pageY - target.offsetTop;
                        scrollLeft = target.scrollLeft;
                        scrollTop = target.scrollTop;
                        target.style.cursor = 'grabbing';
                        target.style.setProperty('user-select', 'none', 'important');
                        break;
                    }
                    el = el.parentElement;
                }
            };

            const mouseMoveHandler = function (e: MouseEvent) {
                if (!isDragging || !target) return;
                e.preventDefault();
                const x = e.pageX - target.offsetLeft;
                const y = e.pageY - target.offsetTop;
                if (Math.abs(x - startX) > 3 || Math.abs(y - startY) > 3) {
                    hasDragged = true;
                }
                const walkX = (x - startX) * 1.5;
                const walkY = (y - startY) * 1.5;

                const compStyle = window.getComputedStyle(target);
                if (compStyle.overflowX === 'auto' || compStyle.overflowX === 'scroll') {
                    target.scrollLeft = scrollLeft - walkX;
                }
                if (compStyle.overflowY === 'auto' || compStyle.overflowY === 'scroll') {
                    target.scrollTop = scrollTop - walkY;
                }
            };

            const mouseUpHandler = function () {
                if (target) {
                    target.style.cursor = '';
                    target.style.removeProperty('user-select');
                }
                isDragging = false;
                target = null;
                setTimeout(() => { hasDragged = false; }, 50);
            };

            const clickHandler = function (e: MouseEvent) {
                if (hasDragged) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            };

            document.addEventListener('mousedown', mouseDownHandler, { passive: false, capture: true });
            document.addEventListener('mousemove', mouseMoveHandler, { passive: false, capture: true });
            document.addEventListener('mouseup', mouseUpHandler, { capture: true });
            document.addEventListener('mouseleave', mouseUpHandler);
            document.addEventListener('click', clickHandler, { capture: true });
        }
    }, []);

    // Floating Cart Logic
    const [showCart, setShowCart] = useState(false);
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const translateXAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (itemsCount > 0) {
            setShowCart(true);
            translateXAnim.setValue(0);
            Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

            const timer = setTimeout(() => {
                Animated.timing(opacityAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
                    setShowCart(false);
                });
            }, 3000);
            return () => clearTimeout(timer);
        } else {
            setShowCart(false);
        }
    }, [itemsCount]);

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dx) > 10,
            onPanResponderRelease: (evt, gestureState) => {
                if (Math.abs(gestureState.dx) > 40) {
                    Animated.timing(translateXAnim, {
                        toValue: Math.sign(gestureState.dx) * 500,
                        duration: 300,
                        useNativeDriver: true
                    }).start(() => setShowCart(false));
                }
            }
        })
    ).current;

    if (businessProfile?.isActive === false) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f8fafc' }}>
                <FontAwesome name="lock" size={64} color="#94a3b8" style={{ marginBottom: 20 }} />
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#334155', textAlign: 'center', marginBottom: 10 }}>Tienda no disponible</Text>
                <Text style={{ fontSize: 16, color: '#64748b', textAlign: 'center' }}>La tienda a la que querés acceder no se encuentra disponible en estos momentos</Text>
            </View>
        );
    }

    const content = (
        <Tabs 
            {...(modifyingOrder ? { tabBar: props => <CustomTabBar {...props} businessProfile={businessProfile} setShowCancelModal={setShowCancelModal} /> } : {})}
            screenOptions={{ 
                tabBarActiveTintColor: businessProfile.primaryColor, 
                headerShown: false,
                tabBarStyle: Platform.OS === 'web' ? { 
                    maxWidth: 600, 
                    alignSelf: 'center', 
                    width: '100%',
                    borderTopWidth: 1,
                    borderTopColor: '#eee',
                    height: 60,
                    paddingBottom: 10
                } : {}
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Catálogo',
                    tabBarIcon: ({ color }) => <FontAwesome name="shopping-bag" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="cart"
                options={{
                    title: 'Carrito',
                    tabBarIcon: ({ color }) => <FontAwesome name="shopping-cart" size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="orders"
                options={{
                    title: 'Pedidos',
                    tabBarIcon: ({ color }) => <FontAwesome name="list" size={24} color={color} />,
                    tabBarBadge: unreadOrderUpdates > 0 ? unreadOrderUpdates : undefined,
                    href: modifyingOrder ? null : undefined,
                }}
            />
            <Tabs.Screen
                name="notifications"
                options={{
                    title: 'Avisos',
                    tabBarIcon: ({ color }) => <FontAwesome name="bell" size={24} color={color} />,
                    tabBarBadge: unreadNotifsCount > 0 ? unreadNotifsCount : undefined,
                    href: modifyingOrder ? null : undefined,
                }}
            />
            <Tabs.Screen
                name="raffles"
                options={{
                    title: 'Sorteos',
                    tabBarIcon: ({ color }) => <FontAwesome name="gift" size={24} color={color} />,
                    href: (!modifyingOrder && businessProfile && settings?.marketingModules?.rafflesActive) ? '/raffles' : null,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Mi Perfil',
                    tabBarIcon: ({ color }) => <FontAwesome name="user" size={24} color={color} />,
                    href: modifyingOrder ? null : undefined,
                }}
            />
            <Tabs.Screen
                name="cancel-edit"
                listeners={{
                    tabPress: (e) => {
                        e.preventDefault();
                        setShowCancelModal(true);
                    }
                }}
                options={{
                    title: 'Cancelar Edición',
                    tabBarIcon: ({ color }) => <FontAwesome name="times-circle" size={24} color={color} />,
                    tabBarLabelStyle: { fontWeight: 'bold' },
                    tabBarActiveTintColor: '#ef4444',
                    tabBarInactiveTintColor: '#ef4444',
                    href: modifyingOrder ? '/cancel-edit' : null,
                }}
            />
            <Tabs.Screen
                name="success"
                options={{
                    href: null,
                    tabBarStyle: { display: 'none' }
                }}
            />
            <Tabs.Screen
                name="scan-qr"
                options={{
                    href: null,
                }}
            />
        </Tabs>
    );

    return (
        <View 
            style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#f0f2f5' : '#fff' }}
            onStartShouldSetResponderCapture={() => {
                trackTesterInteraction();
                return false;
            }}
        >
            <View style={Platform.OS === 'web' ? styles.webContainer : { flex: 1 }}>
                
                {flashOfferState && flashTimeLeft !== null && flashTimeLeft > 0 && (
                    <View style={{ backgroundColor: '#ef4444', padding: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                        <FontAwesome name="bolt" size={16} color="#fef08a" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                            {flashOfferState.title || "¡Oferta Relámpago activada!"} - Descuento: {flashOfferState.type === "fixed" ? `${flashOfferState.discount}` : `${flashOfferState.discount}%`} - Termina en: {formatTime(flashTimeLeft)}
                        </Text>
                    </View>
                )}
                
                <Modal visible={showFlashModal} transparent animationType="slide">
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 30, width: '100%', maxWidth: 400, alignItems: 'center' }}>
                            <View style={{ backgroundColor: '#fef08a', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 15 }}>
                                <FontAwesome name="bolt" size={30} color="#ca8a04" />
                            </View>
                            <Text style={{ fontSize: 24, fontWeight: '900', color: '#0f172a', textAlign: 'center', marginBottom: 10 }}>
                                {settings?.flashOffer?.title || '¡Oferta Relámpago!'}
                            </Text>
                            <Text style={{ fontSize: 16, color: '#475569', textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
                                {settings?.flashOffer?.message || 'Llevate un descuento exclusivo si confirmás tu pedido en los próximos minutos.'}
                            </Text>
                            <Text style={{ fontSize: 40, fontWeight: '900', color: '#ef4444', marginBottom: 25 }}>
                                -{settings?.flashOffer?.discountPercentage}%
                            </Text>
                            <Pressable style={{ backgroundColor: '#ef4444', padding: 15, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 10 }} onPress={handleClaimFlashOffer}>
                                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>CLAIM OFFER</Text>
                            </Pressable>
                            <Pressable style={{ padding: 15 }} onPress={handleDeclineFlashOffer}>
                                <Text style={{ color: '#94a3b8', fontWeight: 'bold' }}>No, gracias. Prefiero pagar precio full.</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>
    
                {content}

                {showCart && (
                    <Animated.View
                        {...panResponder.panHandlers}
                        style={[
                            styles.floatingCart, 
                            { 
                                opacity: opacityAnim, 
                                transform: [{ translateX: translateXAnim }],
                                maxWidth: Platform.OS === 'web' ? 560 : 'auto',
                                alignSelf: Platform.OS === 'web' ? 'center' : 'auto'
                            }
                        ]}
                    >
                        <Pressable
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}
                            onPress={() => router.push('/cart')}
                        >
                            <View style={styles.cartInfo}>
                                <FontAwesome name="shopping-basket" size={20} color="#fff" style={{ marginRight: 10 }} />
                                <Text style={styles.cartText}>
                                    {itemsCount} {itemsCount === 1 ? 'ítem' : 'ítems'} añadidos
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.cartTotal}>Ver ${total.toFixed(2)}</Text>
                                {cashTotal < total && (
                                    <Text style={{ color: '#4ade80', fontSize: 13, fontWeight: 'bold' }}>Efectivo: ${cashTotal.toFixed(2)}</Text>
                                )}
                            </View>
                        </Pressable>
                    </Animated.View>
                )}

                {/* IN-APP NOTIFICATION POPUP */}
                <Modal visible={!!orderUpdatePopup?.visible} transparent animationType="fade">
                    <View style={clientStyles.modalOverlay}>
                        <View style={[clientStyles.modalBox, { borderTopWidth: 8, borderTopColor: businessProfile.primaryColor }]}>
                            <View style={{ alignItems: 'center', marginBottom: 15 }}>
                                <View style={{ backgroundColor: `${businessProfile.primaryColor}15`, padding: 15, borderRadius: 40, marginBottom: 10 }}>
                                    <FontAwesome name="bell" size={30} color={businessProfile.primaryColor} />
                                </View>
                                <Text style={clientStyles.modalTitle}>{orderUpdatePopup?.title}</Text>
                                <Text style={clientStyles.modalMessage}>{orderUpdatePopup?.message}</Text>
                            </View>
                            
                            <Pressable 
                                style={[clientStyles.actionBtn, { backgroundColor: businessProfile.primaryColor }]} 
                                onPress={() => {
                                    setOrderUpdatePopup(null);
                                    router.push('/orders');
                                }}
                            >
                                <Text style={clientStyles.actionBtnText}>Ver Mis Pedidos</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={{ marginTop: 15, alignItems: 'center' }} 
                                onPress={() => setOrderUpdatePopup(null)}
                            >
                                <Text style={{ color: '#666', fontSize: 14 }}>Cerrar</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>

                {/* CANCEL EDIT CONFIRMATION MODAL */}
                <Modal visible={showCancelModal} transparent animationType="fade">
                    <View style={clientStyles.modalOverlay}>
                        <View style={clientStyles.modalBox}>
                            <View style={{ alignItems: 'center', marginBottom: 20 }}>
                                <View style={{ backgroundColor: '#fee2e2', padding: 20, borderRadius: 100, marginBottom: 15 }}>
                                    <FontAwesome name="exclamation-triangle" size={40} color="#ef4444" />
                                </View>
                                <Text style={clientStyles.modalTitle}>¿Cancelar edición?</Text>
                                <Text style={[clientStyles.modalMessage, { textAlign: 'center' }]}>
                                    Los cambios no guardados se perderán y volverás a tu historial de pedidos.
                                </Text>
                            </View>
                            
                            <Pressable 
                                style={[clientStyles.actionBtn, { backgroundColor: '#ef4444' }]} 
                                onPress={() => {
                                    setCart([]);
                                    setModifyingOrder(null);
                                    setShowCancelModal(false);
                                    router.push('/orders');
                                }}
                            >
                                <Text style={clientStyles.actionBtnText}>Sí, cancelar cambios</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={{ marginTop: 15, alignItems: 'center' }} 
                                onPress={() => setShowCancelModal(false)}
                            >
                                <Text style={{ color: '#666', fontSize: 14, fontWeight: '600' }}>Continuar editando</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>
            </View>
        </View>
    );
}

function CustomTabBar({ state, navigation, businessProfile, setShowCancelModal }: any) {
    return (
        <View style={{ 
            flexDirection: 'row', 
            height: 75, 
            backgroundColor: '#000', 
            paddingHorizontal: 15, 
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: '#333',
            paddingBottom: Platform.OS === 'ios' ? 15 : 5
        }}>
            {/* Catálogo */}
            <Pressable 
                onPress={() => navigation.navigate('index')}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
                <FontAwesome name="shopping-bag" size={20} color={state.index === 0 ? businessProfile.primaryColor : '#888'} />
                <Text style={{ color: state.index === 0 ? businessProfile.primaryColor : '#888', fontSize: 10, marginTop: 4, fontWeight: '600' }}>Catálogo</Text>
            </Pressable>

            {/* Carrito */}
            <Pressable 
                onPress={() => navigation.navigate('cart')}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
                <FontAwesome name="shopping-cart" size={20} color={state.index === 1 ? businessProfile.primaryColor : '#888'} />
                <Text style={{ color: state.index === 1 ? businessProfile.primaryColor : '#888', fontSize: 10, marginTop: 4, fontWeight: '600' }}>Carrito</Text>
            </Pressable>

            {/* Cancelar Edición Button */}
            <Pressable 
                onPress={() => setShowCancelModal(true)}
                style={{ 
                    backgroundColor: '#ff3b30', 
                    height: 54, 
                    borderRadius: 14, 
                    paddingHorizontal: 15, 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    flex: 2.8,
                    marginLeft: 10,
                    shadowColor: '#ff3b30',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 5
                }}
            >
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Cancelar Edición</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    webContainer: {
        flex: 1,
        maxWidth: 600,
        width: '100%',
        alignSelf: 'center',
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10
    },
    floatingCart: {
        position: 'absolute',
        bottom: 90,
        left: 20,
        right: 20,
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8,
    },
    cartInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cartText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    cartTotal: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    }
});

const clientStyles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalBox: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 25,
        width: '100%',
        maxWidth: 340,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 10
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111',
        marginBottom: 10,
        textAlign: 'center'
    },
    modalMessage: {
        fontSize: 15,
        color: '#444',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 5
    },
    actionBtn: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        width: '100%'
    },
    actionBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    }
});
