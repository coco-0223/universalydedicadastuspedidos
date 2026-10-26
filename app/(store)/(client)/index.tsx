import { FontAwesome } from '@expo/vector-icons';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useLocalSearchParams, Redirect, router } from 'expo-router';
import { Alert, FlatList, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../../src/config/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useAppContext } from '../../../src/context/AppContext';
import { IS_DEDICATED_APP } from '../../../src/data/mockData';
import { Product, Offer, OrderItem } from '../../../src/types';
import { isSpecialActive } from '../../../src/utils/productUtils';

interface DisplayItem {
    id: string;
    baseProduct: Product;
    variants: Product[];
    isOffer: boolean;
    featured?: boolean;
    specialActive?: boolean;
    originalSpecialPrice?: number;
    specialConfig?: any;
}
const QuantitySelector = ({ product, cart, setCart, settings, mode, businessProfile }: any) => {
    if (!product.available) {
        return (
            <View style={{ paddingVertical: 4 }}>
                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: 'bold', textAlign: 'center' }}>producto sin stock actualmente</Text>
            </View>
        );
    }
    const cartItem = cart.find((c: any) => c.product.id === product.id);
    const qty = cartItem ? cartItem.quantity : 0;
    const isUnit = product.unitType === 'unit' || product.unitType === 'piece';
    const step = isUnit ? 1 : (Number(settings.checkoutRules?.weightStep) || 1);
    const minWeight = isUnit ? 1 : (Number(settings.checkoutRules?.minWeightPerItem) || 1);

    const [inputValue, setInputValue] = React.useState(qty > 0 ? qty.toString() : '');

    React.useEffect(() => {
        setInputValue(qty > 0 ? qty.toString() : '');
    }, [qty]);

    const maxStock = product.stock !== undefined && product.stock !== null ? product.stock : Infinity;

    const handleUpdate = (valStr: string | number, isDirectInput: boolean = false) => {
        let newQty: number;
        if (typeof valStr === 'number') {
            newQty = valStr;
        } else {
            newQty = parseFloat(valStr.replace(',', '.'));
        }
        if (isNaN(newQty)) newQty = 0;

        if (newQty > maxStock) {
            newQty = maxStock;
            Alert.alert('Límite de Stock', `No podés agregar más de ${maxStock} unidades ya que es el stock disponible.`);
        }

        if (newQty <= 0) {
            setCart(cart.filter((c: any) => c.product.id !== product.id));
        } else {
            if (isDirectInput && step > 0) {
                const remainder = newQty % step;
                if (remainder > 0) {
                    if (remainder >= step / 2) newQty = newQty + (step - remainder);
                    else newQty = newQty - remainder;
                }
            }
            if (isDirectInput && newQty < minWeight && newQty > 0) newQty = minWeight;

            const finalQty = parseFloat(newQty.toFixed(2));
            setInputValue(finalQty.toString());
            if (cartItem) {
                setCart(cart.map((c: any) => c.product.id === product.id ? { ...c, quantity: finalQty } : c));
            } else {
                let initialQty = newQty;
                if (!isDirectInput) {
                    initialQty = minWeight;
                    if (product.bulkPricing) {
                        const bulks = product.bulkPricing.map((b: any) => b.quantity).sort((a:any,b:any) => a - b);
                        for (let b of bulks) {
                            if (0 < b && initialQty >= b) {
                                initialQty = b; break;
                            }
                        }
                    }
                }
                setCart([...cart, { product, quantity: parseFloat(initialQty.toFixed(2)) }]);
            }
        }
    };

    if (qty === 0) {
        if (mode === 'food') {
            return (
                <Pressable style={{ backgroundColor: businessProfile?.primaryColor || '#1e293b', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' }} onPress={() => handleUpdate(minWeight, false)}>
                    <FontAwesome name="plus" size={14} color="#fff" />
                </Pressable>
            );
        }
        if (mode === 'list') {
             return (
                <Pressable style={styles.literalListAdd} onPress={() => handleUpdate(minWeight, false)}>
                    <FontAwesome name="plus" size={16} color="#fff" />
                </Pressable>
             );
        }
        if (mode === 'small') {
            return (
                <Pressable style={styles.smallAddButton} onPress={() => handleUpdate(minWeight, false)}>
                    <Text style={styles.smallAddButtonText}>+</Text>
                </Pressable>
            );
        }
        if (mode === 'button') {
            return (
                <Pressable style={[styles.actionButton, { backgroundColor: businessProfile?.primaryColor || '#1a1a1a' }]} onPress={() => handleUpdate(minWeight, false)}>
                    <Text style={[styles.actionButtonText, { color: '#fff' }]}>Agregar</Text>
                </Pressable>
            );
        }
        return (
            <Pressable style={styles.addButton} onPress={() => handleUpdate(minWeight, false)}>
                <Text style={styles.addButtonText}>+</Text>
            </Pressable>
        );
    }

    if (mode === 'food') {
        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 4 }}>
                <Pressable style={{ width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e2e8f0' }} onPress={() => handleUpdate(qty - (step || 1), false)}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b' }}>-</Text>
                </Pressable>
                <TextInput
                    style={{ width: 32, height: 32, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#1e293b', padding: 0 }}
                    keyboardType="numeric"
                    value={inputValue}
                    onChangeText={setInputValue}
                    onEndEditing={() => handleUpdate(inputValue, true)}
                />
                <Pressable style={{ width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b' }} onPress={() => handleUpdate(qty + (step || 1), false)}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>+</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
            <Pressable style={{ paddingHorizontal: mode === 'list' || mode === 'small' ? 8 : 12, paddingVertical: mode === 'list' || mode === 'small' ? 4 : 6, backgroundColor: '#e5e7eb' }} onPress={() => handleUpdate(qty - (step || 1), false)}>
                <Text style={{ fontSize: mode === 'list' || mode === 'small' ? 14 : 16, fontWeight: 'bold' }}>-</Text>
            </Pressable>
            <TextInput
                style={{ width: mode === 'list' || mode === 'small' ? 50 : 65, height: mode === 'list' || mode === 'small' ? 32 : 40, textAlign: 'center', fontSize: mode === 'list' || mode === 'small' ? 14 : 15, fontWeight: 'bold', padding: 0 }}
                keyboardType="numeric"
                value={inputValue}
                onChangeText={setInputValue}
                onEndEditing={() => handleUpdate(inputValue, true)}
            />
            <Pressable style={{ paddingHorizontal: mode === 'list' || mode === 'small' ? 8 : 12, paddingVertical: mode === 'list' || mode === 'small' ? 4 : 6, backgroundColor: '#e5e7eb' }} onPress={() => handleUpdate(qty + (step || 1), false)}>
                <Text style={{ fontSize: mode === 'list' || mode === 'small' ? 14 : 16, fontWeight: 'bold' }}>+</Text>
            </Pressable>
        </View>
    );
};


const CarouselWithArrows = ({ children, style }: any) => {
    const scrollRef = React.useRef<any>(null);
    const [scrollX, setScrollX] = React.useState(0);
    const scrollAmount = 300;
    
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {Platform.OS === 'web' && scrollX > 10 && (
                <Pressable 
                    onPress={() => scrollRef.current?.scrollTo({ x: Math.max(0, scrollX - scrollAmount), animated: true })} 
                    style={{ position: 'absolute', left: 5, zIndex: 10, backgroundColor: '#fff', width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, elevation: 5, borderWidth: 1, borderColor: '#ddd' }}
                >
                    <FontAwesome name="chevron-left" size={16} color="#333" />
                </Pressable>
            )}
            <ScrollView 
                ref={scrollRef} 
                horizontal 
                showsHorizontalScrollIndicator={Platform.OS === 'web'} 
                style={[style, { flex: 1 }]}
                onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
                scrollEventThrottle={200}
            >
                {children}
            </ScrollView>
            {Platform.OS === 'web' && (
                <Pressable 
                    onPress={() => scrollRef.current?.scrollTo({ x: scrollX + scrollAmount, animated: true })} 
                    style={{ position: 'absolute', right: 5, zIndex: 10, backgroundColor: '#fff', width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, elevation: 5, borderWidth: 1, borderColor: '#ddd' }}
                >
                    <FontAwesome name="chevron-right" size={16} color="#333" />
                </Pressable>
            )}
        </View>
    );
};

export default function ClientShopScreen() {
    const { user, orders, products, offers, cart, setCart, settings, businessProfile, setActiveCouponCode, isLoading, guestOrderIds, favorites, toggleFavorite, flashOfferState, setFlashOfferState } = useAppContext();
    const params = useLocalSearchParams();
    const promo = params.promo as string;
    
    // Redirect to welcome if Universal App and no business loaded
    if (!IS_DEDICATED_APP && (!businessProfile || !businessProfile.id || businessProfile.id === 'default')) {
        if (params.store) {
            return <Redirect href={`/welcome?store=${params.store}`} />;
        }
        return <Redirect href="/welcome" />;
    }
    
    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                <Text style={{ color: '#64748b', fontSize: 16 }}>Cargando catálogo...</Text>
            </View>
        );
    }
    
    // Feedback toast if promo exists
    
    const [showClaimOfferModal, setShowClaimOfferModal] = useState(false);

    useEffect(() => {
        const claimOfferSettings = settings?.marketingModules?.claimOffer;
        if (claimOfferSettings?.active && !flashOfferState) {
            // Solo si no hay un flash offer activo y la config lo habilita
            const timer = setTimeout(() => {
                setShowClaimOfferModal(true);
            }, (claimOfferSettings.triggerDelaySeconds || 0) * 1000);
            return () => clearTimeout(timer);
        }
    }, [settings?.marketingModules?.claimOffer?.active, flashOfferState]);

    const handleClaimOffer = () => {
        const claimOfferSettings = settings.marketingModules?.claimOffer;
        if (!claimOfferSettings) return;
        setFlashOfferState({
            expiresAt: Date.now() + (claimOfferSettings.durationMinutes || 15) * 60000,
            discount: claimOfferSettings.discountValue || 10,
            type: claimOfferSettings.discountType || 'percentage',
            title: claimOfferSettings.title || 'Oferta Relámpago'
        });
        setShowClaimOfferModal(false);
    };

    const [promoFeedback, setPromoFeedback] = useState(false);
    
    // Welcome Raffle Popup
    const [welcomeRaffle, setWelcomeRaffle] = useState<any>(null);

    useEffect(() => {
        const checkWelcomeRaffle = async () => {
            if (!settings?.marketingModules?.rafflesActive) return;
            const hasSeen = await AsyncStorage.getItem('hasSeenWelcomeRaffle');
            const now = new Date();
            const activeRaffle = (settings.raffles || []).find((r: any) => 
                r.active && 
                r.showWelcomePopup && 
                new Date(r.drawStartDate) <= now && 
                new Date(r.drawEndDate) >= now
            );

            if (activeRaffle && hasSeen !== activeRaffle.id) {
                setWelcomeRaffle(activeRaffle);
            }
        };
        checkWelcomeRaffle();
    }, [settings]);

    const closeWelcomeRaffle = async () => {
        if (welcomeRaffle) {
            await AsyncStorage.setItem('hasSeenWelcomeRaffle', welcomeRaffle.id);
            setWelcomeRaffle(null);
        }
    };

    useEffect(() => {
        if (promo) {
            const isModuleActive = settings?.marketingModules?.couponsActive;
            const coupon = settings?.coupons?.find((c: any) => c.code.toUpperCase() === promo.toUpperCase());
            const isCouponActive = coupon?.active;
            
            if (isModuleActive && isCouponActive) {
                setPromoFeedback(true);
                setActiveCouponCode(promo);
            }
        }
    }, [promo, settings]);
    const myProducts = useMemo(() => {
        let prods = IS_DEDICATED_APP ? products : products.filter(p => !p.businessId || p.businessId === businessProfile.id);
        
        // Dynamic auto-restock check
        const now = new Date();
        prods = prods.map(p => {
            if (!p.available && p.autoRestock && p.restockDate && p.restockTime) {
                const [year, month, day] = p.restockDate.split('-').map(Number);
                const [hour, minute] = p.restockTime.split(':').map(Number);
                const restockDateTime = new Date(year, month - 1, day, hour, minute);
                if (now >= restockDateTime) {
                    return { ...p, available: true }; // Restocked dynamically!
                }
            }
            return p;
        });

        const childrenMap = new Map<string, { quantity: number; price: number }[]>();
        prods.forEach(p => {
            if (p.parentId && p.volumeLevelQuantity) {
                if (!childrenMap.has(p.parentId)) childrenMap.set(p.parentId, []);
                childrenMap.get(p.parentId)!.push({ quantity: p.volumeLevelQuantity, price: p.promotionalPrice || p.price });
            }
        });

        return prods.filter(p => !p.parentId).map(p => {
            const mergedBulk = [...(p.bulkPricing || [])];
            if (childrenMap.has(p.id)) {
                childrenMap.get(p.id)!.forEach(child => {
                    const idx = mergedBulk.findIndex(b => b.quantity === child.quantity);
                    if (idx !== -1) {
                        mergedBulk[idx] = child; // Favor child product definition
                    } else {
                        mergedBulk.push(child);
                    }
                });
            }
            return { ...p, bulkPricing: mergedBulk.length > 0 ? mergedBulk.sort((a,b) => a.quantity - b.quantity) : undefined };
        });
    }, [products, businessProfile.id]);
    
    const myOffers = useMemo(() => {
        if (IS_DEDICATED_APP) return offers;
        return offers.filter(o => !o.businessId || o.businessId === businessProfile.id);
    }, [offers, businessProfile.id]);
    const [searchQuery, setSearchQuery] = useState('');
    const [dismissedRestrictionModal, setDismissedRestrictionModal] = useState(false);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const flatListRef = useRef<FlatList>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const categoriesText = new Set([
        ...myProducts.map(p => p.category),
        ...myOffers.filter(o => o.active).flatMap(o => o.categories || [])
    ]);
    const hasDailyOffers = myProducts.some(p => p.isDailyOffer);
    const hasFavorites = favorites && favorites.length > 0;
    
    let categories = Array.from(categoriesText).filter(Boolean).sort((a, b) => {
        const orderA = settings.categorySortOrder?.[a] ?? 999;
        const orderB = settings.categorySortOrder?.[b] ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
    });
    
    if (hasFavorites) {
        categories = ['⭐ Favoritos', ...categories];
    }
    
    if (hasDailyOffers) {
        categories = ['🔥 Ofertas del Día', ...categories];
    }

    const productsViewMode = settings.displaySettings?.productsView || 'list';
    const offersViewMode = settings.displaySettings?.offersView || 'cards';
    const showOfferDiscountPercentage = settings.displaySettings?.showOfferDiscountPercentage ?? true;

    // Check purchase restrictions
    const restrictionData = useMemo(() => {
        if (!settings.purchaseRestrictions?.active) return { restricted: false };
        const now = new Date();
        const day = now.getDay();
        const shifts = settings.purchaseRestrictions.schedule[day] || [];
        if (shifts.length === 0) return { restricted: false }; 

        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        for (const shift of shifts) {
            if (currentTime >= shift.startTime && currentTime <= shift.endTime) {
                return { restricted: true, reopensAt: shift.endTime }; 
            }
        }
        return { restricted: false };
    }, [settings.purchaseRestrictions]);

    const isRestricted = restrictionData.restricted;

    const hidePrices = isRestricted && !settings.purchaseRestrictions?.showPricesWhenRestricted;

    // Filter for active offers
    const specialBanners = myProducts.filter(p => p.available && isSpecialActive(p) && p.specialOffer?.highlightMode === 'banner').map(p => ({
        id: 'special_' + p.id,
        name: p.name,
        description: p.description || '¡Oferta Especial por Tiempo Limitado!',
        bundlePrice: p.specialOffer!.price,
        requirements: [{ productId: p.id, quantity: 1 }],
        active: true,
        categories: [p.category],
        isSpecialBanner: true,
        specialConfig: p.specialOffer
    }));

    const activeOffers: Offer[] = [
        ...specialBanners,
        ...myOffers.filter(o => o.active),
        ...myProducts.filter(p => p.isOfferActive && p.isOfferCard && p.available).map(p => ({
            id: 'prod_' + p.id,
            name: p.name,
            description: p.description || '¡Aprovechá esta oferta!',
            bundlePrice: p.promotionalPrice || p.price,
            requirements: [{ productId: p.id, quantity: 1 }],
            active: true,
            categories: [p.category],
            isSpecialBanner: false,
            specialConfig: undefined
        })),
    ].filter(o => {
        const matchesCategory = selectedCategory ? (o.categories || []).includes(selectedCategory) : true;
        const matchesSearch = searchQuery ? o.name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
        return matchesCategory && matchesSearch;
    });

    // Intelligent Tracking (Repeated Orders)
    const userOrders = useMemo(() => {
        return [...orders]
            .filter(o => (user && o.clientId === user.id) || guestOrderIds.includes(o.id))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [user, orders, guestOrderIds]);
    const lastOrder = userOrders.length > 0 ? userOrders[0] : null;
    const [showRepeatModal, setShowRepeatModal] = useState<boolean>(false);
    const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
    const [ratingsData, setRatingsData] = useState<Record<string, number>>({});
    const [suggestedOrderItems, setSuggestedOrderItems] = useState<OrderItem[]>([]);
    const [modalSearchQuery, setModalSearchQuery] = useState('');

    const [dialog, setDialog] = useState<{
        visible: boolean;
        title: string;
        message: string | React.ReactNode;
        buttons: { text: string; style?: 'cancel'; onPress?: () => void }[];
    }>({ visible: false, title: '', message: '', buttons: [] });

    const closeDialog = () => setDialog(prev => ({ ...prev, visible: false }));

    const showCustomAlert = (title: string, message: string | React.ReactNode, buttons?: { text: string; style?: 'cancel'; onPress?: () => void }[]) => {
        setDialog({
            visible: true,
            title,
            message,
            buttons: buttons || [{ text: 'OK', onPress: closeDialog }]
        });
    };

    const smartSuggestion = useMemo(() => {
        if (userOrders.length === 0) return null;
        if (userOrders.length === 1) {
            return userOrders[0].items.map(i => {
                const catalogProd = myProducts.find(p => p.id === i.product.id);
                return catalogProd ? { product: catalogProd, quantity: i.quantity } : i;
            });
        }

        const getOrderFingerprint = (items: OrderItem[]) => {
            return items.map(i => `${i.product.id}:${i.quantity}`).sort().join('|');
        };
        const calcPrice = (items: OrderItem[]) => {
            return items.reduce((sum, item) => {
                const catalogProd = myProducts.find(p => p.id === item.product.id);
                const price = catalogProd ? (catalogProd.promotionalPrice || catalogProd.price) : item.product.price;
                return sum + price * item.quantity;
            }, 0);
        };

        const today = new Date().getDay(); // 0 is Sunday
        
        const countsAll = new Map<string, { count: number, items: OrderItem[] }>();
        const countsToday = new Map<string, { count: number, items: OrderItem[] }>();

        userOrders.forEach(o => {
            const fp = getOrderFingerprint(o.items);
            const prevAll = countsAll.get(fp) || { count: 0, items: o.items };
            countsAll.set(fp, { count: prevAll.count + 1, items: prevAll.items });

            const orderDay = new Date(o.createdAt).getDay();
            if (orderDay === today) {
                const prevToday = countsToday.get(fp) || { count: 0, items: o.items };
                countsToday.set(fp, { count: prevToday.count + 1, items: prevToday.items });
            }
        });

        let typicalOrder: OrderItem[] | null = null;
        let maxCountAll = 0;
        countsAll.forEach(val => {
            if (val.count > maxCountAll) { maxCountAll = val.count; typicalOrder = val.items; }
        });

        let dayOrder: OrderItem[] | null = null;
        let maxCountToday = 0;
        countsToday.forEach(val => {
            if (val.count > maxCountToday) { maxCountToday = val.count; dayOrder = val.items; }
        });

        let chosenOrderItems: OrderItem[] = typicalOrder || userOrders[0].items;

        if (typicalOrder && dayOrder && getOrderFingerprint(typicalOrder) !== getOrderFingerprint(dayOrder)) {
            const priceTypical = calcPrice(typicalOrder);
            const priceDay = calcPrice(dayOrder);

            if (priceTypical > priceDay) {
                chosenOrderItems = typicalOrder;
            } else if (priceDay >= priceTypical) {
                chosenOrderItems = dayOrder;
            }
        }

        return chosenOrderItems.map(i => {
            const catalogProd = myProducts.find(p => p.id === i.product.id);
            return catalogProd ? { product: catalogProd, quantity: i.quantity } : i;
        });
    }, [userOrders, myProducts]);

    useEffect(() => {
        if (!lastOrder || !smartSuggestion) return;
        const checkModalFreq = async () => {
            try {
                const justReg = await AsyncStorage.getItem('justRegistered');
                if (justReg === 'true') {
                    await AsyncStorage.removeItem('justRegistered');
                    return;
                }

                const orderTime = new Date(lastOrder.createdAt).getTime();
                const now = Date.now();
                if (now - orderTime < 15 * 60 * 1000) {
                    return;
                }

                const lastTime = await AsyncStorage.getItem('lastWelcomeModalTime');
                if (!lastTime || now - parseInt(lastTime, 10) > 12 * 60 * 60 * 1000) {
                    setSuggestedOrderItems(smartSuggestion);
                    setShowRepeatModal(true);
                    await AsyncStorage.setItem('lastWelcomeModalTime', now.toString());
                }
            } catch(e) {}
        };
        checkModalFreq();
    }, [lastOrder, smartSuggestion]);

    useEffect(() => {
        const checkRatingModal = async () => {
            if (!lastOrder) return;
            try {
                const isFood = businessProfile.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && settings?.isFoodBusiness;
                if (!isFood) return;

                const isFinalStatus = lastOrder.status === 'Listo' || 
                                     lastOrder.status === 'Entregado' || 
                                     lastOrder.status === 'Finalizado' ||
                                     lastOrder.status === 'delivered' ||
                                     lastOrder.status === 'completed';

                if (!isFinalStatus) return;

                const lastRatedId = await AsyncStorage.getItem('lastRatedOrderId');
                if (lastRatedId !== lastOrder.id) {
                    setShowRatingModal(true);
                }
            } catch (e) {}
        };
        checkRatingModal();
    }, [lastOrder, settings, businessProfile]);

    const handleConfirmOrderDirectly = () => {
        setCart(suggestedOrderItems);
        setShowRepeatModal(false);
        router.push('/cart');
    };

    const handleConfirmOrderToCatalog = () => {
        setCart(suggestedOrderItems);
        setShowRepeatModal(false);
    };

    // AI Suggestions based on past orders
    const suggestedProducts = useMemo(() => {
        if (userOrders.length === 0) return [];
        let map = new Map<string, number>();
        userOrders.forEach(o => {
            o.items.forEach(i => map.set(i.product.id, (map.get(i.product.id) || 0) + i.quantity));
        });
        const sortedIds = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0]);
        // Return max 3 products that they like
        return sortedIds.map(id => myProducts.find(p => p.id === id)).filter(p => p).slice(0, 3) as Product[];
    }, [userOrders, myProducts]);

    // Just show a few products as "Featured"
    const featuredProductsKeys = myProducts.slice(0, 4).map(p => p.id);



    const normalizeText = (text: string) => {
        if (!text) return '';
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    };

    // Meta and Hierarchy
    const productsWithMeta = myProducts.map(p => {
        const isOffer = myOffers.some(o => o.active && (o.requirements || []).some(r => r.productId === p.id));
        const specialActive = isSpecialActive(p);
        
        const featured = featuredProductsKeys.includes(p.id) || (specialActive && p.specialOffer?.highlightMode === 'destacado');
        const price = specialActive ? p.specialOffer!.price : p.price;
        
        return { ...p, price, isOffer, featured, specialActive, originalSpecialPrice: specialActive ? p.price : undefined, specialConfig: specialActive ? p.specialOffer : undefined };
    });

    const isSearchingOrFiltering = searchQuery.length > 0 || selectedCategory !== null;

    const filtered = [...productsWithMeta];

    const showOffersOnTopLevel = settings.displaySettings?.showOffersOnTop ?? false;
    const normalizedSearch = normalizeText(searchQuery);

    // Sort by hierarchy
    filtered.sort((a, b) => {
        const matchesSearchA = normalizedSearch.length > 0 && normalizeText(a.name).includes(normalizedSearch);
        const matchesSearchB = normalizedSearch.length > 0 && normalizeText(b.name).includes(normalizedSearch);

        if (matchesSearchA && !matchesSearchB) return -1;
        if (!matchesSearchA && matchesSearchB) return 1;

        if (selectedCategory) {
            const matchesA = selectedCategory === '🔥 Ofertas del Día' ? a.isDailyOffer : (selectedCategory === '⭐ Favoritos' ? favorites.includes(a.id) : a.category === selectedCategory);
            const matchesB = selectedCategory === '🔥 Ofertas del Día' ? b.isDailyOffer : (selectedCategory === '⭐ Favoritos' ? favorites.includes(b.id) : b.category === selectedCategory);
            if (matchesA && !matchesB) return -1;
            if (!matchesA && matchesB) return 1;
        }

        // Show in-stock products first, out of stock last
        if (a.available && !b.available) return -1;
        if (!a.available && b.available) return 1;

        const catOrderA = settings.categorySortOrder?.[a.category] ?? 999;
        const catOrderB = settings.categorySortOrder?.[b.category] ?? 999;
        if (catOrderA !== catOrderB) return catOrderA - catOrderB;

        const prodOrderA = a.sortOrder ?? 999;
        const prodOrderB = b.sortOrder ?? 999;
        if (prodOrderA !== prodOrderB) return prodOrderA - prodOrderB;

        if (showOffersOnTopLevel) {
            if (a.isOffer && !b.isOffer) return -1;
            if (!a.isOffer && b.isOffer) return 1;
        }
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return a.name.localeCompare(b.name);
    });

    // Grouping
    const displayItems: DisplayItem[] = [];
    const groupedMap = new Map<string, DisplayItem>();

    filtered.forEach(p => {
        if (p.groupId) {
            if (groupedMap.has(p.groupId)) {
                groupedMap.get(p.groupId)!.variants.push(p);
                const currentMin = groupedMap.get(p.groupId)!.baseProduct.minQuantityForGroupPrice || 1;
                const newMin = p.minQuantityForGroupPrice || 1;
                if (newMin < currentMin) {
                    groupedMap.get(p.groupId)!.baseProduct = p;
                }
            } else {
                const newItem = { id: p.groupId, baseProduct: p, variants: [p], isOffer: !!p.isOffer, featured: !!p.featured, specialActive: p.specialActive, originalSpecialPrice: p.originalSpecialPrice, specialConfig: p.specialConfig };
                groupedMap.set(p.groupId, newItem);
                displayItems.push(newItem);
            }
        } else {
            displayItems.push({ id: p.id, baseProduct: p, variants: [p], isOffer: !!p.isOffer, featured: !!p.featured, specialActive: p.specialActive, originalSpecialPrice: p.originalSpecialPrice, specialConfig: p.specialConfig });
        }
    });

    const addToCart = (product: Product) => {
        const step = Number(settings.checkoutRules?.weightStep) || 1;
        const minWeight = Number(settings.checkoutRules?.minWeightPerItem) || 1;

        const existingItem = cart.find(item => item.product.id === product.id);
        if (existingItem) {
            let current = existingItem.quantity;
            let nextQty = current + step;

            if (product.bulkPricing) {
                const bulks = product.bulkPricing.map(b => b.quantity).sort((a,b) => a - b);
                for (let b of bulks) {
                    if (current < b && nextQty >= b) {
                        nextQty = b; break;
                    }
                }
            }
            setCart(cart.map(item =>
                item.product.id === product.id
                    ? { ...item, quantity: parseFloat(nextQty.toFixed(2)) }
                    : item
            ));
        } else {
            let initialQty = minWeight;
            if (product.bulkPricing) {
                const bulks = product.bulkPricing.map(b => b.quantity).sort((a,b) => a - b);
                for (let b of bulks) {
                    if (0 < b && initialQty >= b) {
                        initialQty = b; break;
                    }
                }
            }
            setCart([...cart, { product, quantity: parseFloat(initialQty.toFixed(2)) }]);
        }
    };

    const addComboToCart = (offer: any) => {
        let currentCart = [...cart];
        const isSpecial = offer.isSpecialBanner;
        
        for (let req of (offer.requirements || [])) {
            const product = myProducts.find(p => p.id === req.productId);
            if (!product) continue;

            // If it's a special banner, we want to ensure we use the special price
            // However, the cart logic in cart.tsx should ideally handle this.
            // For now, we just add the product.
            
            const existingItem = currentCart.find(item => item.product.id === product.id);
            if (existingItem) {
                currentCart = currentCart.map(item =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + req.quantity }
                        : item
                );
            } else {
                currentCart.push({ product, quantity: req.quantity });
            }
        }
        setCart(currentCart);
        
        if (!isSpecial) {
            showCustomAlert('Éxito', '¡Combo añadido al carrito!');
        }
    };

    const renderProduct = ({ item }: { item: DisplayItem }) => {
        const isMatchingFilter = selectedCategory && (
            selectedCategory === '🔥 Ofertas del Día' ? item.baseProduct.isDailyOffer :
            selectedCategory === '⭐ Favoritos' ? favorites.includes(item.baseProduct.id) :
            item.baseProduct.category === selectedCategory
        );
        const normalizedSearch = normalizeText(searchQuery);
        const isMatchingSearch = normalizedSearch.length > 0 && normalizeText(item.baseProduct.name).includes(normalizedSearch);
        const specialActive = isSpecialActive(item.baseProduct);
        const basePrice = item.baseProduct.price;
        const bestVariant = item.variants.find(v => v.price < basePrice);
        
        let bulkTiers = item.baseProduct.bulkPricing ? [...item.baseProduct.bulkPricing] : [];
        const singleItemOffers = offers.filter(o => o.active && o.requirements?.length === 1 && o.requirements[0].productId === item.baseProduct.id);
        for (let o of singleItemOffers) {
            bulkTiers.push({ quantity: o.requirements[0].quantity, price: o.bundlePrice });
        }
        bulkTiers.sort((a, b) => a.quantity - b.quantity);

        const cartItem = cart.find((c: any) => c.product.id === item.baseProduct.id);
        const cartQty = cartItem ? cartItem.quantity : 0;
        const availableStock = item.baseProduct.stock !== undefined && item.baseProduct.stock !== null
            ? Math.max(0, item.baseProduct.stock - cartQty)
            : null;

        const isFood = businessProfile.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && settings?.isFoodBusiness;
        const hasPromo = item.isOffer || specialActive || item.baseProduct.isDailyOffer;

        if (isFood) {
            const promoView = item.baseProduct.promotionalPrice && item.baseProduct.promotionalPrice < basePrice ? item.baseProduct.promotionalPrice : null;
            return (
                <View style={[
                    styles.foodProductCard,
                    hasPromo && { backgroundColor: '#fefce8', borderColor: '#fde047', borderWidth: 1 },
                    !item.baseProduct.available && { opacity: 0.6 },
                    isMatchingFilter && {
                        borderColor: businessProfile.primaryColor || '#1e293b',
                        borderWidth: 1.5,
                        backgroundColor: (businessProfile.primaryColor || '#1e293b') + '0c',
                    },
                    isMatchingSearch && {
                        backgroundColor: '#e0f2fe',
                        borderColor: '#0284c7',
                        borderWidth: 1.5
                    }
                ]}>
                    {item.baseProduct.imageUrl ? (
                        <Image source={{ uri: item.baseProduct.imageUrl }} style={styles.foodProductImage} />
                    ) : (
                        <View style={[styles.foodProductImage, { backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' }]}>
                            <FontAwesome name="image" size={24} color="#cbd5e1" />
                        </View>
                    )}
                    
                    <View style={styles.foodProductInfo}>
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 }}>
                                <Text style={[styles.foodProductName, { flex: 1 }]} numberOfLines={1}>{item.baseProduct.name}</Text>
                                <Pressable onPress={() => toggleFavorite(item.baseProduct.id)} style={{ padding: 4 }}>
                                    <FontAwesome name={favorites.includes(item.baseProduct.id) ? 'star' : 'star-o'} size={18} color={favorites.includes(item.baseProduct.id) ? '#fbbf24' : '#ccc'} />
                                </Pressable>
                            </View>
                            
                            {item.baseProduct.ingredients ? (
                                <Text style={styles.foodProductIngredients} numberOfLines={2}>
                                    🌱 Ingredientes: {item.baseProduct.ingredients}
                                </Text>
                            ) : item.baseProduct.description ? (
                                <Text style={styles.foodProductIngredients} numberOfLines={2}>
                                    {item.baseProduct.description}
                                </Text>
                            ) : null}

                            {availableStock !== null && (
                                <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: 'bold', marginTop: 3 }}>
                                    📦 {availableStock} disponibles
                                </Text>
                            )}
                        </View>
                        
                        <View style={styles.foodProductFooter}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                {promoView && !hidePrices ? (
                                    <>
                                        <Text style={styles.foodProductPromoPrice}>
                                            {settings?.currency || '$'}{promoView}
                                        </Text>
                                        <Text style={styles.foodProductOldPrice}>
                                            {settings?.currency || '$'}{basePrice}
                                        </Text>
                                    </>
                                ) : (
                                    <View>
                                        <Text style={styles.foodProductPrice}>
                                            {hidePrices ? (restrictionData.reopensAt ? `Volvé a mirar nuestros precios a las ${restrictionData.reopensAt} hs` : '') : `${settings?.currency || '$'}${basePrice} (Hoy)`}
                                        </Text>
                                        {item.baseProduct.isDailyOffer && item.baseProduct.dailyOfferPrice && !hidePrices && (
                                            <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: 'bold', marginTop: 2 }}>
                                                💵 Efectivo (mín. ${item.baseProduct.dailyOfferMinQty || 1}${item.baseProduct.unitType === "unit" ? "u" : "kg"}): ${item.baseProduct.dailyOfferPrice} | 💳 Otros: ${basePrice * (item.baseProduct.dailyOfferMinQty || 1)}
                                            </Text>
                                        )}
                                        {item.baseProduct.advancePrice !== undefined && item.baseProduct.advancePrice > 0 && !hidePrices && (
                                            <Text style={{ fontSize: 11, color: '#10b981', fontWeight: 'bold', marginTop: 1 }}>
                                                {settings?.currency || '$'}{item.baseProduct.advancePrice} (Anticipado)
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </View>
                            
                            <View style={{ alignSelf: 'flex-end' }}>
                                {!item.baseProduct.available || (availableStock !== null && availableStock <= 0) ? (
                                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: 'bold' }}>Sin stock</Text>
                                ) : isRestricted ? (
                                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: 'bold' }}>Cerrado</Text>
                                ) : (
                                    <QuantitySelector product={item.baseProduct} cart={cart} setCart={setCart} settings={settings} mode="food" businessProfile={businessProfile} />
                                )}
                            </View>
                        </View>
                    </View>
                </View>
            );
        }

        if (productsViewMode === 'list') {
            const promoView = item.baseProduct.promotionalPrice && item.baseProduct.promotionalPrice < basePrice ? item.baseProduct.promotionalPrice : null;
            return (
                <View style={[
                    styles.literalListRow,
                    hasPromo && { backgroundColor: '#fefce8' },
                    isMatchingFilter && {
                        backgroundColor: (businessProfile.primaryColor || '#1e293b') + '0c',
                        borderLeftWidth: 4,
                        borderLeftColor: businessProfile.primaryColor || '#1e293b',
                    },
                    isMatchingSearch && {
                        backgroundColor: '#e0f2fe',
                        borderLeftWidth: 4,
                        borderLeftColor: '#0284c7',
                    }
                ]}>
                    <View style={styles.literalListInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Text style={[styles.literalListName, !item.baseProduct.available && { color: '#94a3b8' }, { flex: 1 }]}>{item.baseProduct.name}</Text>
                        </View>
                        {availableStock !== null && (
                            <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: 'bold', marginTop: 1 }}>
                                📦 {availableStock} disponibles
                            </Text>
                        )}
                        <View style={{ flexDirection: 'column', gap: 2, marginTop: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                {promoView && !hidePrices ? (
                                    <>
                                        <Text style={[styles.literalListPrice, { textDecorationLine: 'line-through', color: '#999', fontSize: 13 }]}>{settings?.currency || '$'}{basePrice}/{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}</Text>
                                        <Text style={[styles.literalListPrice, { color: businessProfile.primaryColor, fontWeight: 'bold' }]}>{settings?.currency || '$'}{promoView}/{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}</Text>
                                    </>
                                ) : (
                                    <View>
                                        <Text style={styles.literalListPrice}>{hidePrices ? (restrictionData.reopensAt ? `Volvé a mirar nuestros precios a las ${restrictionData.reopensAt} hs` : '') : `${settings?.currency || '$'}${basePrice} / ${item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}`}{item.baseProduct.advancePrice !== undefined && item.baseProduct.advancePrice > 0 ? ' (Hoy)' : ''}</Text>
                                        {item.baseProduct.advancePrice !== undefined && item.baseProduct.advancePrice > 0 && !hidePrices && (
                                            <Text style={{ fontSize: 11, color: '#10b981', fontWeight: 'bold', marginTop: 1 }}>
                                                {settings?.currency || '$'}{item.baseProduct.advancePrice} / {item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'} (Anticipado)
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </View>
                            {bulkTiers.map((bp, i) => (
                                !hidePrices && (
                                    <Text key={i} style={[styles.literalListPrice, { color: '#cf2e2e', fontSize: 12, fontStyle: 'italic' }]}>
                                        (Llevando {bp.quantity}{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'} a ${(bp.price / bp.quantity).toFixed(0)} cada {item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'})
                                    </Text>
                                )
                            ))}
                            {item.baseProduct.isDailyOffer && !hidePrices && (
                                <Text style={[styles.literalListPrice, { color: '#d97706', fontSize: 12, fontStyle: 'italic', fontWeight: 'bold' }]}>
                                    💵 Efectivo (mín. ${item.baseProduct.dailyOfferMinQty || 1}${item.baseProduct.unitType === "unit" ? "u" : "kg"}): ${item.baseProduct.dailyOfferPrice} | 💳 Otros: ${basePrice * (item.baseProduct.dailyOfferMinQty || 1)}
                                </Text>
                            )}
                        </View>
                    </View>
                    {!item.baseProduct.available || (availableStock !== null && availableStock <= 0) ? (
                        <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: 'bold', alignSelf: 'center', textAlign: 'right' }}>Sin stock</Text>
                    ) : isRestricted ? (
                        <Text style={{color:'#ef4444', fontSize:12, fontWeight:'bold', alignSelf:'center'}}>{restrictionData.reopensAt ? `Cerrado (Abre ${restrictionData.reopensAt})` : 'Comercio Cerrado'}</Text>
                    ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => toggleFavorite(item.baseProduct.id)} style={{ padding: 4 }}>
            <FontAwesome name={favorites.includes(item.baseProduct.id) ? 'star' : 'star-o'} size={20} color={favorites.includes(item.baseProduct.id) ? '#fbbf24' : '#ccc'} />
        </Pressable>
        <QuantitySelector product={item.baseProduct} cart={cart} setCart={setCart} settings={settings} mode="list" />
    </View>
                    )}
                </View>
            );
        }

        return (
            <View style={[
                styles.productCard,
                hasPromo && { backgroundColor: '#fefce8' },
                item.specialActive && item.specialConfig?.highlightMode === 'destacado' && { borderColor: '#eab308', borderWidth: 2, backgroundColor: '#fefce8' },
                (!item.baseProduct.available || (availableStock !== null && availableStock <= 0)) && { opacity: 0.6 },
                isMatchingFilter && {
                    borderColor: businessProfile.primaryColor || '#1e293b',
                    borderWidth: 1.5,
                    backgroundColor: (businessProfile.primaryColor || '#1e293b') + '0c',
                },
                isMatchingSearch && {
                    backgroundColor: '#e0f2fe',
                    borderColor: '#0284c7',
                    borderWidth: 1.5
                }
            ]}>
                <Image source={{ uri: item.baseProduct.imageUrl }} style={styles.productImage} />
                <View style={styles.productInfo}>
                    {item.specialActive && item.specialConfig?.highlightMode === 'destacado' && (
                        <View style={{ backgroundColor: '#eab308', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 5 }}>
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 10 }}>⚡ OFERTA FLASH</Text>
                        </View>
                    )}
                    {item.baseProduct.isDailyOffer && !hidePrices && (
                        <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 5, borderWidth: 1, borderColor: '#f59e0b' }}>
                            <Text style={{ color: '#d97706', fontWeight: 'bold', fontSize: 10 }}>💵 EFECTIVO (MÍN. ${item.baseProduct.dailyOfferMinQty || 1}${item.baseProduct.unitType === "unit" ? "U" : "KG"}): ${item.baseProduct.dailyOfferPrice} | 💳 OTROS: ${basePrice * (item.baseProduct.dailyOfferMinQty || 1)}</Text>
                        </View>
                    )}
                    {item.isOffer && !item.specialActive && !item.baseProduct.isDailyOffer && <Text style={[styles.offerBadge, { backgroundColor: businessProfile.primaryColor }]}>¡EN OFERTA!</Text>}
                    {item.featured && !item.isOffer && !item.specialActive && !item.baseProduct.isDailyOffer && <Text style={styles.featuredBadge}>Destacado</Text>}

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginBottom: 4 }}>
                        <Text style={[styles.productName, { marginBottom: 0, flex: 1 }]}>
                            {item.baseProduct.name}
                            {!hidePrices && ` 1 ${item.baseProduct.unitType === "unit" ? "u." : "kg"} ${settings?.currency || "$"}${bestVariant ? bestVariant.price : basePrice}`}
                        </Text>
                        <Pressable onPress={() => toggleFavorite(item.baseProduct.id)} style={{ padding: 4 }}>
                            <FontAwesome name={favorites.includes(item.baseProduct.id) ? 'star' : 'star-o'} size={18} color={favorites.includes(item.baseProduct.id) ? '#fbbf24' : '#ccc'} />
                        </Pressable>
                    </View>
                    
                    {availableStock !== null && (
                        <Text style={{ fontSize: 12, color: '#f59e0b', fontWeight: 'bold', marginBottom: 2 }}>
                            📦 {availableStock} disponibles
                        </Text>
                    )}
                    
                    {item.specialActive && item.specialConfig?.limitByStock && item.specialConfig.stockVisibility !== 'hidden' && (
                        <Text style={{ fontSize: 12, color: '#b45309', marginBottom: 2, fontWeight: 'bold' }}>
                            {item.specialConfig.stockVisibility === 'exact' ? `¡Quedan solo ${item.specialConfig.stockRemaining} ${item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}!` : `🔥 ¡Poco stock disponible!`}
                        </Text>
                    )}
                    
                    <Text style={styles.productDesc}>{item.baseProduct.description}</Text>

                    {bestVariant && !hidePrices && (
                        <Text style={[styles.savingsText, { color: businessProfile.primaryColor }]}>
                            🔥 Llevando {bestVariant.minQuantityForGroupPrice}{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'} ahorrás {settings?.currency || '$'}{basePrice - bestVariant.price} x {item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}
                        </Text>
                    )}

                    {item.variants.length > 1 ? (
                        <View style={styles.variantsContainer}>
                            {item.variants.sort((a, b) => (a.minQuantityForGroupPrice || 1) - (b.minQuantityForGroupPrice || 1)).map(v => (
                                <View key={v.id} style={styles.variantRow}>
                                    <Text style={[styles.variantText, !v.available && { color: '#94a3b8' }]}>
                                        {(v.minQuantityForGroupPrice || 1) > 1 ? `+${v.minQuantityForGroupPrice}${item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}` : 'Normal'}: <Text style={{ fontWeight: 'bold' }}>{hidePrices ? '' : `${settings?.currency || '$'}${v.price}`}</Text>
                                    </Text>
                                    {!v.available ? (
                                        <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: 'bold' }}>producto sin stock actualmente</Text>
                                    ) : isRestricted ? (
                                        <Text style={{color:'#ef4444', fontSize:12, fontWeight:'bold'}}>{restrictionData.reopensAt ? `Cerrado (Abre ${restrictionData.reopensAt})` : 'Comercio Cerrado'}</Text>
                                    ) : (
                                        <QuantitySelector product={v} cart={cart} setCart={setCart} settings={settings} mode="small" />
                                    )}
                                </View>
                            ))}
                        </View>
                    ) : (
                        <>
                            <View style={{ flexDirection: "column", gap: 4, marginTop: 10 }}>
                                {bulkTiers.length > 0 && !hidePrices && (
                                    <View style={{ backgroundColor: "#f3f4f6", padding: 6, borderRadius: 6 }}>
                                        {bulkTiers.map((bp, i) => (
                                            <Text key={i} style={{ color: "#1f2937", fontSize: 12, fontWeight: "bold" }}>
                                                Llevando {bp.quantity}{item.baseProduct.unitType === "unit" ? "u." : "kg"}: {settings?.currency || "$"}{(bp.price / bp.quantity).toFixed(0)} c/u
                                            </Text>
                                        ))}
                                    </View>
                                )}
                                {item.baseProduct.isDailyOffer && !hidePrices && (
                                    <View style={{ backgroundColor: "#fef3c7", padding: 6, borderRadius: 6, borderWidth: 1, borderColor: "#f59e0b" }}>
                                        <Text style={{ color: "#d97706", fontSize: 12, fontWeight: "bold" }}>
                                            💵 PRECIO EFECTIVO (Mín. {item.baseProduct.dailyOfferMinQty || 1}{item.baseProduct.unitType === "unit" ? "u." : "kg"})
                                        </Text>
                                        <Text style={{ color: "#d97706", fontSize: 13, fontWeight: "bold" }}>
                                            {settings?.currency || "$"}{item.baseProduct.dailyOfferPrice}
                                        </Text>
                                        <Text style={{ color: "#d97706", fontSize: 11, marginTop: 2 }}>
                                            (💳 Otros medios: {settings?.currency || "$"}{basePrice * (item.baseProduct.dailyOfferMinQty || 1)})
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <View style={styles.singlePriceRow}>
                            <View>
                                {item.specialActive && item.originalSpecialPrice !== undefined && !hidePrices ? (
                                    <>
                                        <Text style={{ fontSize: 12, color: '#999', textDecorationLine: 'line-through' }}>{settings?.currency || '$'}{item.originalSpecialPrice} / {item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}</Text>
                                        <Text style={[styles.productPrice, { color: '#eab308' }]}>{settings?.currency || '$'}{item.baseProduct.price} / {item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}</Text>
                                    </>
                                ) : (
                                    <View>
                                        <Text style={styles.productPrice}>{hidePrices ? (restrictionData.reopensAt ? `Volvé a mirar nuestros precios a las ${restrictionData.reopensAt} hs` : '') : `${settings?.currency || '$'}${item.baseProduct.price} / ${item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}`}{item.baseProduct.advancePrice !== undefined && item.baseProduct.advancePrice > 0 ? ' (Hoy)' : ''}</Text>
                                        {item.baseProduct.advancePrice !== undefined && item.baseProduct.advancePrice > 0 && !hidePrices && (
                                            <Text style={{ fontSize: 11, color: '#10b981', fontWeight: 'bold', marginTop: 1 }}>
                                                {settings?.currency || '$'}{item.baseProduct.advancePrice} / {item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'} (Anticipado)
                                            </Text>
                                        )}
                                    </View>
                                )}
                                {!hidePrices && bulkTiers.map((bp, i) => (
                                    <Text key={i} style={{ color: '#cf2e2e', fontSize: 12, fontWeight: 'bold', marginTop: 2 }}>🔥 ≥{bp.quantity} a ${(bp.price / bp.quantity).toFixed(0)} c/u</Text>
                                ))}
                            </View>
                            {!item.baseProduct.available || (availableStock !== null && availableStock <= 0) ? (
                                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: 'bold', alignSelf: 'center', textAlign: 'right' }}>Sin stock</Text>
                            ) : isRestricted ? (
                                <Text style={{color:'#ef4444', fontSize:12, fontWeight:'bold', alignSelf:'center'}}>{restrictionData.reopensAt ? `Cerrado (Abre ${restrictionData.reopensAt})` : 'Comercio Cerrado'}</Text>
                            ) : (
                                <QuantitySelector product={item.baseProduct} cart={cart} setCart={setCart} settings={settings} mode="normal" />
                            )}
                        </View>
                        </>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* CUSTOM DIALOG MODAL */}
            <Modal visible={dialog.visible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{dialog.title}</Text>
                        {typeof dialog.message === 'string' ? (
                            <Text style={styles.modalText}>{dialog.message}</Text>
                        ) : (
                            dialog.message
                        )}
                        <View style={{ flexDirection: 'row', gap: 10, width: '100%', justifyContent: 'center', marginTop: 15 }}>
                            {dialog.buttons.map((btn, idx) => (
                                <Pressable
                                    key={idx}
                                    style={[
                                        styles.modalBtn,
                                        { flex: 1, alignItems: 'center', justifyContent: 'center' },
                                        btn.style === 'cancel'
                                            ? { backgroundColor: '#f1f1f1', borderWidth: 1, borderColor: '#ddd' }
                                            : { backgroundColor: businessProfile.primaryColor || '#1e293b' }
                                    ]}
                                    onPress={btn.onPress}
                                >
                                    <Text style={[{ fontWeight: 'bold' }, btn.style === 'cancel' ? { color: '#333' } : { color: '#fff' }]}>
                                        {btn.text}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </View>
            </Modal>

            {welcomeRaffle && (
                <Modal visible={!!welcomeRaffle} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { maxHeight: '90%' }]}>
                            <View style={{ position: 'absolute', top: 15, right: 15, zIndex: 10 }}>
                                <Pressable onPress={closeWelcomeRaffle}>
                                    <FontAwesome name="times" size={24} color="#999" />
                                </Pressable>
                            </View>
                            <Text style={{ fontSize: 40, marginBottom: 10, textAlign: 'center' }}>🎁</Text>
                            <Text style={styles.modalTitle}>{welcomeRaffle.title}</Text>
                            <Text style={[styles.modalText, { marginBottom: 10 }]}>{welcomeRaffle.description}</Text>
                            <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: 'bold', marginBottom: 10 }}>
                                Sortea el {new Date(welcomeRaffle.drawEndDate).toLocaleDateString()}
                            </Text>
                            
                            {(welcomeRaffle.prizes || []).length > 0 && (
                                <View style={{ width: '100%', backgroundColor: '#f1f5f9', padding: 15, borderRadius: 12, marginBottom: 15 }}>
                                    <Text style={{ fontWeight: 'bold', color: '#0f766e', marginBottom: 5 }}>Premios:</Text>
                                    {(welcomeRaffle.prizes || []).map((p: any) => (
                                        <Text key={p.id} style={{ fontSize: 14, color: '#334155', marginBottom: 3 }}>
                                            • #{p.position}: {p.description}
                                        </Text>
                                    ))}
                                </View>
                            )}

                            <Pressable
                                style={[styles.modalBtn, { backgroundColor: businessProfile.primaryColor || '#1e293b', width: '100%', alignItems: 'center' }]}
                                onPress={closeWelcomeRaffle}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>¡Entendido!</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>
            )}

            {lastOrder && (
                <Modal visible={showRepeatModal} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { maxHeight: '90%' }]}>
                            <View style={{ position: 'absolute', top: 15, right: 15 }}>
                                <Pressable onPress={() => setShowRepeatModal(false)}>
                                    <FontAwesome name="times" size={24} color="#999" />
                                </Pressable>
                            </View>
                            <Image source={{ uri: businessProfile.logoUrl || 'https://via.placeholder.com/150' }} style={{ width: 60, height: 60, borderRadius: 30, marginBottom: 15 }} />
                            <Text style={styles.modalTitle}>¡Hola de nuevo!</Text>
                            <Text style={styles.modalText}>Vemos que ya compraste anteriormente. ¿Querés agilizar tu compra y repetir tu pedido?</Text>

                            <View style={{ width: '100%', marginBottom: 10, zIndex: 10 }}>
                                <TextInput
                                    style={[styles.searchInput, { borderColor: '#ddd', borderWidth: 1, paddingVertical: 8, fontSize: 14 }]}
                                    placeholder="Buscar más cortes para añadir..."
                                    value={modalSearchQuery}
                                    onChangeText={setModalSearchQuery}
                                />
                                {modalSearchQuery.length > 2 && (
                                    <View style={{ backgroundColor: '#fff', borderColor: '#eee', borderWidth: 1, borderRadius: 8, maxHeight: 150, marginTop: 5, position: 'absolute', top: 40, width: '100%', zIndex: 10, elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}>
                                        <ScrollView keyboardShouldPersistTaps="handled">
                                            {myProducts.filter(p => p.name.toLowerCase().includes(modalSearchQuery.toLowerCase()) && p.available).slice(0, 5).map(p => (
                                                <Pressable key={p.id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' }} onPress={() => {
                                                    const existing = suggestedOrderItems.find(i => i.product.id === p.id);
                                                    const minW = p.unitType === 'unit' ? 1 : (Number(settings.checkoutRules?.minWeightPerItem) || 1);
                                                    if (existing) {
                                                        setSuggestedOrderItems(suggestedOrderItems.map(i => i.product.id === p.id ? { ...i, quantity: i.quantity + minW } : i));
                                                    } else {
                                                        setSuggestedOrderItems([...suggestedOrderItems, { product: p, quantity: minW }]);
                                                    }
                                                    setModalSearchQuery('');
                                                }}>
                                                    <Text style={{ fontSize: 13 }}>{p.name}</Text>
                                                    <Text style={{ color: businessProfile.primaryColor, fontWeight: 'bold', fontSize: 13 }}>+ Añadir</Text>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}
                            </View>
                            
                            <ScrollView style={{ width: '100%', maxHeight: 220, marginBottom: 15 }} keyboardShouldPersistTaps="handled">
                                {suggestedOrderItems.map((item, idx) => {
                                    const isUnit = item.product.unitType === 'unit';
                                    const step = isUnit ? 1 : (Number(settings.checkoutRules?.weightStep) || 1);
                                    const minW = isUnit ? 1 : (Number(settings.checkoutRules?.minWeightPerItem) || 1);
                                    
                                    const currentPrice = item.product.promotionalPrice || item.product.price;
                                    
                                    const updateQty = (delta: number) => {
                                        const nQ = item.quantity + delta;
                                        if (nQ < minW) {
                                            setSuggestedOrderItems(suggestedOrderItems.filter(i => i.product.id !== item.product.id));
                                        } else {
                                            setSuggestedOrderItems(suggestedOrderItems.map(i => i.product.id === item.product.id ? { ...i, quantity: parseFloat(nQ.toFixed(2)) } : i));
                                        }
                                    };

                                    return (
                                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f9fafb', padding: 10, borderRadius: 8, marginBottom: 8 }}>
                                            <View style={{ flex: 1, paddingRight: 5 }}>
                                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#333' }}>{item.product.name}</Text>
                                                <Text style={{ fontSize: 12, color: businessProfile.primaryColor }}>{settings?.currency || '$'}{(currentPrice * item.quantity).toFixed(2)}</Text>
                                            </View>
                                            
                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                                                <Pressable style={{ paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => updateQty(-step)}>
                                                    <Text style={{ fontWeight: 'bold' }}>-</Text>
                                                </Pressable>
                                                <Text style={{ width: 35, textAlign: 'center', fontSize: 13, fontWeight: 'bold' }}>{item.quantity}</Text>
                                                <Pressable style={{ paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => updateQty(step)}>
                                                    <Text style={{ fontWeight: 'bold' }}>+</Text>
                                                </Pressable>
                                            </View>
                                            <Pressable style={{ padding: 10, marginLeft: 5 }} onPress={() => setSuggestedOrderItems(suggestedOrderItems.filter(i => i.product.id !== item.product.id))}>
                                                <FontAwesome name="trash" size={16} color="#ef4444" />
                                            </Pressable>
                                        </View>
                                    );
                                })}
                                {suggestedOrderItems.length === 0 && (
                                    <Text style={{ color: '#888', textAlign: 'center', marginVertical: 20 }}>No hay ítems en la sugerencia. Usa el buscador para añadir cortes.</Text>
                                )}
                            </ScrollView>

                            <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eee', marginBottom: 15 }}>
                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111' }}>Total Sugerido:</Text>
                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: businessProfile.primaryColor }}>
                                    {settings?.currency || '$'}{suggestedOrderItems.reduce((sum, item) => sum + (item.product.promotionalPrice || item.product.price) * item.quantity, 0).toFixed(2)}
                                </Text>
                            </View>

                            <View style={{ gap: 10, width: '100%' }}>
                                <Pressable style={[styles.modalBtn, { backgroundColor: businessProfile.primaryColor, opacity: suggestedOrderItems.length === 0 ? 0.5 : 1 }]} onPress={handleConfirmOrderDirectly} disabled={suggestedOrderItems.length === 0}>
                                    <Text style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: 16 }}>Hacer Pedido</Text>
                                </Pressable>
                                <Pressable style={[styles.modalBtn, { backgroundColor: '#f1f1f1', borderWidth: 1, borderColor: '#ddd', opacity: suggestedOrderItems.length === 0 ? 0.5 : 1 }]} onPress={handleConfirmOrderToCatalog} disabled={suggestedOrderItems.length === 0}>
                                    <Text style={{ color: '#333', fontWeight: 'bold', textAlign: 'center', fontSize: 15 }}>Modificar Pedidos</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            {/* RATING MODAL */}
            {lastOrder && showRatingModal && (
                <Modal visible={showRatingModal} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { width: '90%', maxWidth: 450, padding: 25 }]}>
                            <Text style={[styles.modalTitle, { fontSize: 18, textAlign: 'center', marginBottom: 10, fontWeight: 'bold' }]}>¿Qué puntaje les ponés? ⭐</Text>
                            <Text style={{ textAlign: 'center', color: '#666', marginBottom: 20, fontSize: 13 }}>
                                ¡Contanos qué tal estuvieron los productos de tu último pedido!
                            </Text>

                            <ScrollView style={{ maxHeight: 250, width: '100%', marginBottom: 20 }}>
                                {lastOrder.items.map((item: any) => {
                                    const currentRating = ratingsData[item.product.id] || 0;
                                    return (
                                        <View key={item.product.id} style={{ borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 12, gap: 8 }}>
                                            <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#333' }}>
                                                {item.product.name}
                                            </Text>
                                            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <Pressable 
                                                        key={star} 
                                                        onPress={() => setRatingsData({ ...ratingsData, [item.product.id]: star })}
                                                        style={{ padding: 4 }}
                                                    >
                                                        <FontAwesome 
                                                            name={star <= currentRating ? "star" : "star-o"} 
                                                            size={22} 
                                                            color={star <= currentRating ? "#fbbf24" : "#ccc"} 
                                                        />
                                                    </Pressable>
                                                ))}
                                                <Text style={{ fontSize: 12, color: '#888', marginLeft: 5 }}>
                                                    {currentRating > 0 ? `${currentRating} estrella${currentRating > 1 ? 's' : ''}` : 'Sin puntuar'}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </ScrollView>

                            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                                <Pressable 
                                    style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' }} 
                                    onPress={async () => {
                                        try {
                                            await AsyncStorage.setItem('lastRatedOrderId', lastOrder.id);
                                            setShowRatingModal(false);
                                        } catch (e) {}
                                    }}
                                >
                                    <Text style={{ color: '#666', fontWeight: 'bold' }}>Omitir</Text>
                                </Pressable>
                                <Pressable 
                                    style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: businessProfile.primaryColor || '#1e293b', alignItems: 'center' }} 
                                    onPress={async () => {
                                        try {
                                            const ratingRef = doc(db, `businesses/${businessProfile.id}/ratings`, lastOrder.id);
                                            await setDoc(ratingRef, {
                                                orderId: lastOrder.id,
                                                ratings: ratingsData,
                                                clientId: user?.id || 'guest',
                                                clientName: lastOrder.clientName || 'Invitado',
                                                createdAt: new Date().toISOString()
                                            });
                                            await AsyncStorage.setItem('lastRatedOrderId', lastOrder.id);
                                            setShowRatingModal(false);
                                            showCustomAlert('¡Muchas gracias!', 'Tu valoración fue enviada con éxito.');
                                        } catch (e) {
                                            console.warn("Error al guardar rating:", e);
                                            await AsyncStorage.setItem('lastRatedOrderId', lastOrder.id);
                                            setShowRatingModal(false);
                                        }
                                    }}
                                >
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Enviar</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            {isRestricted && !dismissedRestrictionModal && (
        <Modal visible={true} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 9999 }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 30, alignItems: 'center', maxWidth: 400, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }}>
                    <Text style={{ fontSize: 40, marginBottom: 15 }}>🕒</Text>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 10, textAlign: 'center' }}>
                        Comercio Cerrado
                    </Text>
                    <Text style={{ fontSize: 15, color: '#555', textAlign: 'center', marginBottom: 20, lineHeight: 22 }}>
                        Las compras están temporalmente inhabilitadas por horario comercial.
                        {restrictionData.reopensAt ? ` Volvé a fijarte a las ${restrictionData.reopensAt} hs.` : ''}
                    </Text>
                    <Pressable 
                        style={{ backgroundColor: businessProfile?.primaryColor || '#111', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 12 }}
                        onPress={() => setDismissedRestrictionModal(true)}
                    >
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Entendido</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    )}

            <View style={[styles.header, { padding: 0, borderBottomWidth: 0 }]}>
                {businessProfile.bannerUrl ? (
                    <Image source={{ uri: businessProfile.bannerUrl }} style={styles.bannerImage} resizeMode="cover" />
                ) : (
                    <View style={[styles.bannerPlaceholder, { backgroundColor: businessProfile.primaryColor }]} />
                )}
                
                <View style={styles.headerContent}>
                    <View style={[styles.brandRow, { justifyContent: "center" }]}>
                        <View style={{ width: 60, alignItems: "flex-end" }}>
                            {businessProfile.logoUrl ? (
                                <Image source={{ uri: businessProfile.logoUrl }} style={styles.logoImage} />
                            ) : null}
                        </View>
                        <View style={{ alignItems: "center", flex: 1, paddingHorizontal: 10 }}>
                            <Text style={[styles.title, { textAlign: "center" }]}>{businessProfile.name}</Text>
                            {!!businessProfile.description && (
                                <Text style={[styles.businessDesc, { textAlign: "center" }]}>{businessProfile.description}</Text>
                            )}
                        </View>
                        <View style={{ width: 60 }} />
                    </View>

                    <View style={[styles.searchContainer, { zIndex: 999 }]}>
                        <FontAwesome name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
                        <TextInput
                            style={[styles.searchInput, { borderColor: businessProfile.primaryColor || '#ff6600' }]}
                            placeholder="Buscar cortes, ofertas o productos..."
                            placeholderTextColor="#64748b"
                            value={searchQuery}
                            onFocus={() => setShowSearchDropdown(true)}
                            onChangeText={(t) => {
                                setSearchQuery(t);
                                setShowSearchDropdown(true);
                            }}
                        />
                        {searchQuery.length > 0 && (
                            <Pressable style={styles.clearSearchBtn} onPress={() => { setSearchQuery(''); setShowSearchDropdown(false); }}>
                                <FontAwesome name="times-circle" size={18} color="#999" />
                            </Pressable>
                        )}
                        
                        {showSearchDropdown && searchQuery.length > 0 && (
                            <View style={{ position: 'absolute', top: 52, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 8, elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, zIndex: 1000, maxHeight: 350, borderWidth: 1, borderColor: '#e2e8f0' }}>
                                <ScrollView keyboardShouldPersistTaps="handled">
                                    {displayItems.filter(i => normalizeText(i.baseProduct.name).includes(normalizedSearch)).slice(0, 10).map(item => (
                                        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                                            <Pressable style={{ flex: 1 }} onPress={() => {
                                                setSearchQuery(item.baseProduct.name);
                                                setShowSearchDropdown(false);
                                                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                                            }}>
                                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#1e293b' }}>{item.baseProduct.name}</Text>
                                                {item.baseProduct.price ? <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{settings?.currency || '$'}{item.baseProduct.price}</Text> : null}
                                            </Pressable>
                                            <View>
                                                <QuantitySelector product={item.baseProduct} cart={cart} setCart={setCart} settings={settings} mode="small" businessProfile={businessProfile} />
                                            </View>
                                        </View>
                                    ))}
                                    {displayItems.filter(i => normalizeText(i.baseProduct.name).includes(normalizedSearch)).length === 0 && (
                                        <Text style={{ padding: 15, color: '#64748b', textAlign: 'center' }}>No hay coincidencias</Text>
                                    )}
                                </ScrollView>
                            </View>
                        )}
                    </View>
                </View>
            </View>

            <View style={styles.categoriesContainer}>
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={['Todos', ...categories]}
                    keyExtractor={item => item}
                    renderItem={({ item }) => {
                        const isSelected = selectedCategory === item || (item === 'Todos' && !selectedCategory);
                        const isFood = businessProfile.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && settings?.isFoodBusiness;
                        
                        if (isFood) {
                            let iconName: any = 'tag';
                            const nameLower = item.toLowerCase();
                            if (item === 'Todos') iconName = 'list-ul';
                            else if (nameLower.includes('food') || nameLower.includes('plato') || nameLower.includes('minuta') || nameLower.includes('carne') || nameLower.includes('menu')) iconName = 'cutlery';
                            else if (nameLower.includes('snack') || nameLower.includes('pica') || nameLower.includes('papa') || nameLower.includes('frita') || nameLower.includes('entrada')) iconName = 'cutlery';
                            else if (nameLower.includes('dessert') || nameLower.includes('postre') || nameLower.includes('dulce') || nameLower.includes('helado')) iconName = 'birthday-cake';
                            else if (nameLower.includes('drink') || nameLower.includes('bebida') || nameLower.includes('gaseosa') || nameLower.includes('cerveza') || nameLower.includes('trago')) iconName = 'glass';
                            else if (nameLower.includes('pizza') || nameLower.includes('pasta') || nameLower.includes('italiana')) iconName = 'cutlery';
                            
                            return (
                                <Pressable
                                    style={[
                                        styles.foodCategoryBtn,
                                        isSelected ? { backgroundColor: '#1e293b' } : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1 }
                                    ]}
                                    onPress={() => setSelectedCategory(item === 'Todos' || selectedCategory === item ? null : item)}
                                >
                                    <FontAwesome 
                                        name={iconName} 
                                        size={18} 
                                        color={isSelected ? '#fff' : '#475569'} 
                                        style={{ marginBottom: 6 }}
                                    />
                                    <Text
                                        style={[
                                            styles.foodCategoryText,
                                            { color: isSelected ? '#fff' : '#475569', fontSize: 12, fontWeight: '600' }
                                        ]}
                                    >
                                        {item}
                                    </Text>
                                </Pressable>
                            );
                        }
                        
                        return (
                            <Pressable
                                style={[
                                    styles.categoryButton,
                                    isSelected
                                        ? [styles.categoryButtonActive, { backgroundColor: businessProfile.primaryColor }]
                                        : null
                                ]}
                                onPress={() => setSelectedCategory(item === 'Todos' || selectedCategory === item ? null : item)}
                            >
                                <Text
                                    style={[
                                        styles.categoryText,
                                        isSelected
                                            ? styles.categoryTextActive
                                            : null
                                    ]}
                                >
                                    {item}
                                </Text>
                            </Pressable>
                        );
                    }}
                />
            </View>

            <FlatList
                ref={flatListRef}
                data={displayItems}
                keyExtractor={item => item.id}
                renderItem={renderProduct}
                onScrollBeginDrag={() => setShowSearchDropdown(false)}
                contentContainerStyle={styles.listContainer}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                    <>
                        {promo && promoFeedback && (
                            <View style={{ backgroundColor: '#10b981', padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                                <FontAwesome name="gift" size={18} color="#fff" />
                                <Text style={{ color: '#fff', fontWeight: 'bold' }}>¡Tenés el cupón {promo} activado!</Text>
                                <Pressable onPress={() => setPromoFeedback(false)}>
                                    <FontAwesome name="times-circle" size={16} color="#ffffff88" />
                                </Pressable>
                            </View>
                        )}
                        {activeOffers.length > 0 && (
                            <View style={styles.sectionMargin}>
                                <Text style={styles.sectionHdr}>{isSearchingOrFiltering ? 'Ofertas que coinciden 🔥' : 'Ofertas Especiales 🔥'}</Text>
                                {offersViewMode === 'cards' ? (
                                    <CarouselWithArrows style={styles.horizontalScroll}>
                                        {activeOffers.map(offer => {
                                            const originalPrice = offer.isSpecialBanner 
                                                ? (myProducts.find(p => p.id === offer.requirements[0].productId)?.price || 0)
                                                : (offer.requirements || []).reduce((sum: number, req: any) => {
                                                    const p = myProducts.find(prod => prod.id === req.productId);
                                                    return sum + (p ? p.price * req.quantity : 0);
                                                }, 0);
                                            const diff = originalPrice - offer.bundlePrice;
                                            const pct = originalPrice > 0 && diff > 0 ? Math.round((diff / originalPrice) * 100) : 0;
                                            return (
                                                <View key={offer.id} style={[styles.offerCard, offer.isSpecialBanner && { backgroundColor: '#fefce8', borderColor: '#fde047', borderWidth: 2 }]}>
                                                    {showOfferDiscountPercentage && pct > 0 && (
                                                        <View style={[styles.offerBadgeLarge, { backgroundColor: offer.isSpecialBanner ? '#eab308' : businessProfile.primaryColor }]}>
                                                            <Text style={[styles.offerBadgeLargeText, offer.isSpecialBanner && { color: '#000' }]}>{pct}% OFF</Text>
                                                        </View>
                                                    )}
                                                    {offer.isSpecialBanner && (
                                                        <Text style={{ color: '#ca8a04', fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>⚡ OFERTA FLASH DE TIEMPO LIMITADO</Text>
                                                    )}
                                                    <Text style={[styles.offerName, offer.isSpecialBanner && { color: '#1a1a1a' }]}>{offer.name}</Text>
                                                    
                                                    {offer.isSpecialBanner && offer.specialConfig?.limitByStock && offer.specialConfig.stockVisibility !== 'hidden' && (
                                                        <Text style={{ fontSize: 12, color: '#b45309', marginBottom: 4, fontWeight: 'bold' }}>
                                                            {offer.specialConfig.stockVisibility === 'exact' ? `¡Quedan solo ${offer.specialConfig.stockRemaining} disponibles!` : `🔥 ¡Poco stock disponible!`}
                                                        </Text>
                                                    )}
                                                    
                                                    <Text style={[styles.offerName, offer.isSpecialBanner && { color: '#444' }]}>{offer.description || 'Llevá todos los cortes con rebaja'}</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 }}>
                                                        <Text style={{ color: '#999', textDecorationLine: 'line-through' }}>{settings?.currency || '$'}{originalPrice.toFixed(2)}</Text>
                                                        <Text style={{ color: offer.isSpecialBanner ? '#eab308' : businessProfile.primaryColor, fontWeight: 'bold', fontSize: 20 }}>{settings?.currency || '$'}{offer.bundlePrice.toFixed(2)}</Text>
                                                    </View>
                                                    <Pressable style={[styles.actionButton, offer.isSpecialBanner && { backgroundColor: '#eab308' }]} onPress={() => addComboToCart(offer)}>
                                                        <Text style={[styles.actionButtonText, offer.isSpecialBanner && { color: '#000' }]}>{offer.isSpecialBanner ? 'Añadir Oferta' : 'Añadir Combo Entero'}</Text>
                                                    </Pressable>
                                                </View>
                                            )
                                        })}
                                    </CarouselWithArrows>
                                ) : (
                                    <View>
                                        <Text style={{ color: '#666', marginBottom: 10 }}>Las ofertas se muestran integradas en el catálogo de abajo.</Text>
                                    </View>
                                )}
                            </View>
                        )}
                        
                        {/* Daily Offers Section */}
                        {hasDailyOffers && !isSearchingOrFiltering && (
                            <View style={styles.sectionMargin}>
                                <Text style={styles.sectionHdr}>Ofertas del Día (Efectivo) 🔥</Text>
                                <CarouselWithArrows style={styles.horizontalScroll}>
                                    {displayItems.filter(i => i.baseProduct.isDailyOffer).map(item => (
                                        <View key={item.id} style={[styles.offerCard, { backgroundColor: '#fefce8', width: 200, borderWidth: 1, borderColor: '#fde047', padding: 15 }]}>
                                            <Image source={{ uri: item.baseProduct.imageUrl }} style={{ width: '100%', height: 100, borderRadius: 8, marginBottom: 10 }} />
                                            <Text style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 2 }} numberOfLines={1}>{item.baseProduct.name}</Text>
                                            
                                            <View style={{ flexDirection: 'column', gap: 2, marginBottom: 15 }}>
                                                <Text style={{ color: '#d97706', fontWeight: 'bold', fontSize: 14 }}>💵 Efe: ${item.baseProduct.dailyOfferPrice}</Text>
                                                <Text style={{ color: '#666', fontSize: 12 }}>💳 Otros: ${item.baseProduct.price}</Text>
                                            </View>
                                            
                                            <View style={{ alignItems: 'center' }}>
                                                <QuantitySelector product={item.baseProduct} cart={cart} setCart={setCart} settings={settings} mode="button" businessProfile={businessProfile} />
                                            </View>
                                        </View>
                                    ))}
                                </CarouselWithArrows>
                            </View>
                        )}
                        {/* Intelligent Suggestions */}
                        {suggestedProducts.length > 0 && !isSearchingOrFiltering && (
                            <View style={styles.sectionMargin}>
                                <Text style={styles.sectionHdr}>Te podría interesar 🧠</Text>
                                <Text style={{ color: '#666', marginBottom: 10, fontSize: 13, marginTop: -5 }}>Basado en tus compras anteriores</Text>
                                <CarouselWithArrows style={styles.horizontalScroll}>
                                    {suggestedProducts.map(p => (
                                        <View key={p.id} style={[styles.offerCard, { backgroundColor: '#fff', width: 200, borderWidth: 1, borderColor: '#eee', padding: 15 }]}>
                                            <Image source={{ uri: p.imageUrl }} style={{ width: '100%', height: 100, borderRadius: 8, marginBottom: 10 }} />
                                            <Text style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 2 }} numberOfLines={1}>{p.name}</Text>
                                            <Text style={{ color: businessProfile.primaryColor, fontWeight: 'bold', marginBottom: 15 }}>{settings?.currency || '$'}{p.price}/{p.unitType === 'unit' ? 'u.' : 'kg'}</Text>
                                            <View style={{ alignItems: 'center' }}>
                                                <QuantitySelector product={p} cart={cart} setCart={setCart} settings={settings} mode="button" businessProfile={businessProfile} />
                                            </View>
                                        </View>
                                    ))}
                                </CarouselWithArrows>
                            </View>
                        )}
                        {!isSearchingOrFiltering && displayItems.some(i => i.featured && !i.isOffer) && (
                            <View style={styles.sectionMargin}>
                                <Text style={styles.sectionHdr}>Destacados ⭐</Text>
                            </View>
                        )}
                        {isSearchingOrFiltering && displayItems.length > 0 && (
                            <View style={styles.sectionMargin}>
                                <Text style={styles.sectionHdr}>Resultados para tu búsqueda:</Text>
                            </View>
                        )}
                        {isSearchingOrFiltering && displayItems.length === 0 && (
                            <View style={styles.emptyContainer}>
                                <FontAwesome name="search-minus" size={40} color="#ccc" style={{ marginBottom: 15 }} />
                                <Text style={styles.emptyTitle}>Sin resultados</Text>
                                <Text style={styles.emptyText}>No se encontraron los productos que buscás.</Text>
                            </View>
                        )}
                    </>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerContent: {
        padding: 20,
        paddingTop: 15,
    },
    bannerImage: {
        width: '100%',
        height: 140,
    },
    bannerPlaceholder: {
        width: '100%',
        height: 60,
        backgroundColor: '#94a3b8',
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
        gap: 15,
    },
    logoImage: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 2,
        borderColor: '#fff',
        marginTop: -30, // Overlap banner
        backgroundColor: '#94a3b8',
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: '#1a1a1a',
    },
    businessDesc: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
    searchContainer: {
        position: 'relative',
        justifyContent: 'center',
        marginTop: 5,
        marginBottom: 5,
    },
    searchIcon: {
        position: 'absolute',
        left: 14,
        zIndex: 1,
    },
    searchInput: {
        backgroundColor: '#f8fafc',
        height: 48,
        paddingLeft: 42,
        paddingRight: 40,
        borderRadius: 12,
        fontSize: 15,
        color: '#1e293b',
        borderWidth: 1.5,
    },
    clearSearchBtn: {
        position: 'absolute',
        right: 12,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
    },
    categoriesContainer: {
        paddingVertical: 15,
        paddingLeft: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    categoryButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 10,
        backgroundColor: '#e9e9e9',
    },
    categoryButtonActive: {
        backgroundColor: '#FF3B30',
    },
    categoryText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    categoryTextActive: {
        color: '#fff',
    },
    foodCategoryBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        minWidth: 80,
        height: 64,
    },
    foodCategoryText: {
        fontSize: 11,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    foodProductCard: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        alignItems: 'center',
    },
    foodProductImage: {
        width: 90,
        height: 90,
        borderRadius: 12,
        marginRight: 12,
    },
    foodProductInfo: {
        flex: 1,
        height: 90,
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    foodProductName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 4,
    },
    foodProductIngredients: {
        fontSize: 12,
        color: '#64748b',
        lineHeight: 16,
    },
    foodProductFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    foodProductPrice: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1e293b',
    },
    foodProductPromoPrice: {
        fontSize: 15,
        fontWeight: '700',
        color: '#f97316',
    },
    foodProductOldPrice: {
        fontSize: 12,
        color: '#94a3b8',
        textDecorationLine: 'line-through',
    },
    listContainer: {
        padding: 20,
    },
    productCard: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 15,
        padding: 15,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    productImage: {
        width: 80,
        height: 80,
        borderRadius: 8,
        backgroundColor: '#94a3b8',
    },
    productInfo: {
        flex: 1,
        marginLeft: 15,
    },
    productName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1a1a1a',
        marginBottom: 4,
    },
    productDesc: {
        fontSize: 12,
        color: '#888',
        marginBottom: 6,
    },
    productPrice: {
        fontSize: 16,
        fontWeight: '700',
        color: '#333',
    },
    addButton: {
        backgroundColor: '#1a1a1a',
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButtonText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    offerBadge: {
        backgroundColor: '#FF3B30',
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginBottom: 4,
    },
    featuredBadge: {
        backgroundColor: '#FF9500',
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginBottom: 4,
    },
    savingsText: {
        color: '#FF3B30',
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 4,
        marginBottom: 8,
    },
    variantsContainer: {
        marginTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingTop: 10,
    },
    variantRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    variantText: {
        fontSize: 13,
        color: '#444',
    },
    smallAddButton: {
        backgroundColor: '#1a1a1a',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    smallAddButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    singlePriceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },
    literalListRow: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    literalListInfo: {
        flex: 1,
    },
    literalListName: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#1a1a1a',
        marginBottom: 2
    },
    literalListPrice: {
        color: '#555',
        fontSize: 14,
        fontWeight: '600'
    },
    literalListAdd: {
        backgroundColor: '#1a1a1a',
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center'
    },
    sectionMargin: {
        marginBottom: 15,
        marginTop: 5
    },
    sectionHdr: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1a1a1a',
        marginBottom: 10
    },
    horizontalScroll: {
        marginHorizontal: -20,
        paddingHorizontal: 20,
    },
    offerCard: {
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 20,
        width: 250,
        marginRight: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
    },
    offerBadgeLarge: {
        backgroundColor: '#FF3B30',
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        marginBottom: 15,
    },
    offerBadgeLargeText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    offerName: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    offerDesc: {
        color: '#aaa',
        fontSize: 14,
        marginBottom: 20,
    },
    actionButton: {
        backgroundColor: '#fff',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    actionButtonText: {
        color: '#1a1a1a',
        fontWeight: '700',
        fontSize: 14,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: '#fff',
        width: '100%',
        maxWidth: 400,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#111',
        marginBottom: 10
    },
    modalText: {
        fontSize: 14,
        color: '#555',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20
    },
    modalBtn: {
        padding: 14,
        borderRadius: 12
    },
    emptyContainer: {
        marginTop: 50,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 5,
    },
    emptyText: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    }
});

