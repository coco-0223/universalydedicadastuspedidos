import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Animated, Modal, FlatList, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useAppContext } from '../../../src/context/AppContext';
import { Product } from '../../../src/types';
import { isSpecialActive, getItemPricing, getOrderPricing } from '../../../src/utils/productUtils';

import { saveOrderToFirebase } from '../../../src/services/businessService';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
const CartItemRow = ({ item, updateQuantity, setCart, cart, step, minWeight, styles, offers, settings, businessProfile, overrideUnitPrice }: any) => {
    const [inputValue, setInputValue] = React.useState(item.quantity.toString());
    React.useEffect(() => setInputValue(item.quantity.toString()), [item.quantity]);
    
    const specialActive = isSpecialActive(item.product);
    let unitPrice = overrideUnitPrice !== undefined ? overrideUnitPrice : (specialActive ? (item.product.specialOffer?.price || item.product.price) : item.product.price);
    
    let effectiveTiers = !settings?.isFoodBusiness && item.product.bulkPricing ? [...item.product.bulkPricing] : [];
    const singleItemOffers = !settings?.isFoodBusiness ? (offers || []).filter((o: any) => o.active && o.requirements?.length === 1 && o.requirements[0].productId === item.product.id) : [];
    for (let o of singleItemOffers) {
        effectiveTiers.push({ quantity: o.requirements[0].quantity, price: o.bundlePrice, isCombo: true, name: o.name });
    }
    if (!settings?.isFoodBusiness && item.product.isDailyOffer && item.product.dailyOfferMinQty && item.product.dailyOfferPrice) {
        effectiveTiers.push({ quantity: item.product.dailyOfferMinQty, price: item.product.dailyOfferPrice, isCombo: true, name: 'Oferta del Día' });
    }
    
    let appliedTier = null;
    let nextTier = null;
    
    if (effectiveTiers.length > 0) {
        const sortedTiers = [...effectiveTiers].sort((a: any, b: any) => b.quantity - a.quantity);
        for (let tier of sortedTiers) {
            if (item.quantity >= tier.quantity) {
                unitPrice = (tier.price / tier.quantity);
                appliedTier = tier;
                break;
            }
        }
        
        const ascendingTiers = [...effectiveTiers].sort((a: any, b: any) => a.quantity - b.quantity);
        nextTier = ascendingTiers.find((t: any) => t.quantity > item.quantity);
    }

    // Build list of all price levels to show them one below the other
    let allDisplayTiers = [];
    const hasOneKgTier = effectiveTiers.some((t: any) => t.quantity === 1);
    if (!hasOneKgTier) {
        allDisplayTiers.push({ quantity: 1, price: (specialActive ? (item.product.specialOffer?.price || item.product.price) : item.product.price) });
    }
    effectiveTiers.forEach((t: any) => {
        allDisplayTiers.push(t);
    });
    allDisplayTiers.sort((a: any, b: any) => a.quantity - b.quantity);

    let activeTierObj: any = null;
    const sortedDesc = [...allDisplayTiers].sort((a: any, b: any) => b.quantity - a.quantity);
    for (let t of sortedDesc) {
        if (item.quantity >= t.quantity) {
            activeTierObj = t;
            break;
        }
    }

    // Calculo del subtotal en efectivo del item
    let itemCashUnitPrice = unitPrice;
    if (!settings?.isFoodBusiness && item.product.isDailyOffer && item.product.dailyOfferPrice) {
        const minQty = item.product.dailyOfferMinQty || 1;
        if (item.quantity >= minQty) {
            itemCashUnitPrice = item.product.dailyOfferPrice / minQty;
        }
    }
    const hasItemCashDiscount = itemCashUnitPrice < (unitPrice - 0.001);
    const itemCashSubtotal = Math.round((hasItemCashDiscount ? itemCashUnitPrice : unitPrice) * item.quantity);

    const animatedWidth = React.useRef(new Animated.Value(0)).current;
    
    React.useEffect(() => {
        if (nextTier) {
            let previousTierQty = appliedTier ? appliedTier.quantity : 0;
            let range = nextTier.quantity - previousTierQty;
            let currentProgress = item.quantity - previousTierQty;
            let percentage = Math.min(100, Math.max(0, (currentProgress / range) * 100));
            
            Animated.timing(animatedWidth, {
                toValue: percentage,
                duration: 200,
                useNativeDriver: false
            }).start();
        }
    }, [item.quantity, nextTier, appliedTier]);
    
    const handleManualUpdate = (valStr: string) => {
         let newQty = parseFloat(valStr.replace(',', '.'));
         if (isNaN(newQty) || newQty <= 0) {
             setCart(cart.filter((c: any) => c.product.id !== item.product.id));
             return;
         }
         if (step > 0) {
             const remainder = newQty % step;
             if (remainder > 0) {
                 if (remainder >= step / 2) newQty = newQty + (step - remainder);
                 else newQty = newQty - remainder;
             }
             if (newQty < minWeight && newQty > 0) newQty = minWeight;
         }
         const finalQty = parseFloat(newQty.toFixed(2));
         setInputValue(finalQty.toString());
         setCart(cart.map((c: any) => c.product.id === item.product.id ? { ...c, quantity: finalQty } : c));
    };

    const isFood = businessProfile?.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && settings?.isFoodBusiness;
    
    if (isFood) {
        return (
            <View style={styles.foodCartItem}>
                {item.product.imageUrl ? (
                    <Image source={{ uri: item.product.imageUrl }} style={styles.foodCartItemImage} />
                ) : (
                    <View style={[styles.foodCartItemImage, { backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' }]}>
                        <FontAwesome name="image" size={20} color="#cbd5e1" />
                    </View>
                )}
                
                <View style={styles.foodCartItemInfo}>
                    <View>
                        <Text style={styles.foodCartItemName}>{item.product.name}</Text>
                        {item.product.ingredients ? (
                            <Text style={styles.foodCartItemIngredients} numberOfLines={1}>
                                🌱 {item.product.ingredients}
                            </Text>
                        ) : item.product.description ? (
                            <Text style={styles.foodCartItemIngredients} numberOfLines={1}>
                                {item.product.description}
                            </Text>
                        ) : null}
                    </View>
                    <Text style={[styles.foodCartItemPrice, { color: businessProfile?.primaryColor || '#f97316' }]}>
                        {settings?.currency || '$'}{Math.round(unitPrice * item.quantity).toLocaleString('es-AR')}
                    </Text>
                </View>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.foodCartQuantityControls}>
                        <Pressable style={styles.foodCartQtyBtn} onPress={() => updateQuantity(item.product.id, -1)}>
                            <Text style={styles.foodCartQtyBtnText}>-</Text>
                        </Pressable>
                        <TextInput 
                            style={styles.foodCartQtyInput} 
                            keyboardType="numeric" 
                            value={inputValue} 
                            onChangeText={setInputValue}
                            onEndEditing={() => handleManualUpdate(inputValue)}
                        />
                        <Pressable style={[styles.foodCartQtyBtn, { backgroundColor: businessProfile?.primaryColor || '#1e293b' }]} onPress={() => updateQuantity(item.product.id, 1)}>
                            <Text style={[styles.foodCartQtyBtnText, { color: '#fff' }]}>+</Text>
                        </Pressable>
                    </View>
                    <Pressable 
                        style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center' }} 
                        onPress={() => setCart(cart.filter((c: any) => c.product.id !== item.product.id))}
                    >
                        <FontAwesome name="trash" size={13} color="#dc2626" />
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
    <View style={styles.cartItem}>
        <View style={[styles.itemInfo, { flex: 1, paddingRight: 10 }]}>
            <Text style={styles.itemName}>{item.product.name}</Text>
            
            {/* Show all quantity discounts one below the other */}
            {!settings?.isFoodBusiness && (
                <View style={{ marginTop: 4, marginBottom: 6, gap: 3 }}>
                    {allDisplayTiers.map((tier: any, idx: number) => {
                        const isActive = activeTierObj && activeTierObj.quantity === tier.quantity;
                        const tierPrice = tier.price / tier.quantity;
                        const isDailyOfferTier = item.product.isDailyOffer && item.product.dailyOfferMinQty === tier.quantity && Math.abs(tier.price - item.product.dailyOfferPrice) < 0.01;
                        const unitLabel = item.product.unitType === 'unit' ? 'u.' : 'kg';
                        const perUnitLabel = tier.quantity > 1 ? (item.product.unitType === 'unit' ? ' c/u' : ' el kg') : '';

                        if (isDailyOfferTier) {
                             const minQty = item.product.dailyOfferMinQty || 1;
                             return (
                                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, color: '#16a34a', marginRight: 5, lineHeight: 14 }}>•</Text>
                                    <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: isActive ? 'bold' : '600' }}>
                                        Pagando en efectivo (mín. {minQty}{unitLabel}): {settings?.currency || '$'}{Math.round(tierPrice).toLocaleString('es-AR')}{perUnitLabel}
                                    </Text>
                                </View>
                             );
                        } else {
                            return (
                                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={{ fontSize: 12, color: '#ea580c', marginRight: 5, lineHeight: 14 }}>•</Text>
                                    <Text style={{ fontSize: 12, color: '#ea580c', fontWeight: isActive ? 'bold' : '600' }}>
                                        {item.product.name} {tier.quantity}{unitLabel} = {settings?.currency || '$'}{Math.round(tierPrice).toLocaleString('es-AR')}{perUnitLabel}
                                    </Text>
                                </View>
                            );
                        }
                    })}
                </View>
            )}
            
            {!settings?.isFoodBusiness && nextTier && (
                <View style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
                        Añadí {parseFloat((nextTier.quantity - item.quantity).toFixed(2))} más para pagar ${(nextTier.price / nextTier.quantity).toFixed(2)} c/u
                    </Text>
                    <View style={{ height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', width: '100%', maxWidth: 200 }}>
                        <Animated.View style={{ 
                            height: '100%', 
                            backgroundColor: '#10b981', 
                            width: animatedWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) 
                        }} />
                    </View>
                </View>
            )}
        </View>
        <View style={{ flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {/* Input de cantidad */}
            <TextInput 
                style={[styles.qtyText, { padding: 0, width: 72, height: 38, textAlign: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', marginHorizontal: 0 }]} 
                keyboardType="numeric" 
                value={inputValue} 
                onChangeText={setInputValue}
                onEndEditing={() => handleManualUpdate(inputValue)}
            />
            {/* Botones debajo del input de cantidad: '-' amarillito, '+' naranja fuerte, eliminar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <Pressable 
                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#fef08a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#fde047' }} 
                    onPress={() => updateQuantity(item.product.id, -1)}
                >
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#854d0e', lineHeight: 18 }}>-</Text>
                </Pressable>
                <Pressable 
                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#ea580c', justifyContent: 'center', alignItems: 'center' }} 
                    onPress={() => updateQuantity(item.product.id, 1)}
                >
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ffffff', lineHeight: 18 }}>+</Text>
                </Pressable>
                <Pressable 
                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' }} 
                    onPress={() => setCart(cart.filter((c: any) => c.product.id !== item.product.id))}
                >
                    <FontAwesome name="trash" size={13} color="#dc2626" />
                </Pressable>
            </View>

            {/* Subtotales: Normal y en Efectivo */}
            <View style={{ alignItems: 'center', marginTop: 3 }}>
                <Text style={{ fontSize: 13, color: '#374151', fontWeight: 'bold' }}>
                    Subtotal: ${Math.round(unitPrice * item.quantity).toLocaleString('es-AR')}
                </Text>
                {hasItemCashDiscount && (
                    <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: 'bold', marginTop: 2 }}>
                        En efectivo: ${itemCashSubtotal.toLocaleString('es-AR')}
                    </Text>
                )}
            </View>
        </View>
    </View>
    );
};

export default function ClientCartScreen() {
    const { flashOfferState, user, cart, setCart, settings, orders, setOrders, products, setUser, offers, businessProfile, modifyingOrder, setModifyingOrder, activeCouponCode, guestOrderIds, setGuestOrderIds, setActiveCouponCode } = useAppContext();
    const params = useLocalSearchParams();
    const promo = params.promo as string;

    const [selectedMethod, setSelectedMethod] = useState<'pickup' | 'delivery'>('pickup');
    const [selectedBranchId, setSelectedBranchId] = useState<string>(settings.branches[0]?.id || '');

    // Delivery Dates Logic (Mocked 7 days)
    const availableDates = useMemo(() => {
        let dates = [];
        let today = new Date();
        for (let i = 0; i < settings.maxDaysInAdvance; i++) {
            let d = new Date(today);
            d.setDate(today.getDate() + i);

            // Si es delivery, chequear si el negocio reparte este día de la semana
            if (selectedMethod === 'delivery' && !settings.deliveryRules.deliveryDays.includes(d.getDay())) {
                continue;
            }

            // Check specific branch schedule or default to first branch
            const branch = settings.branches?.find(b => b.id === selectedBranchId) || settings.branches?.[0];
            const daySchedule = branch?.schedule?.[d.getDay()];
            if (!daySchedule || daySchedule.length === 0) {
                continue;
            }

            // Chequear si quedan horarios disponibles en alguna de las franjas
            let hasValidSlot = false;
            for (let shift of daySchedule) {
                let [startH, startM] = shift.openTime.split(':').map(Number);
                let [endH, endM] = shift.closeTime.split(':').map(Number);

                if (d.toDateString() === today.toDateString()) {
                    let earliestH = today.getHours() + settings.leadTimeHours;
                    if (earliestH > startH) {
                        startH = earliestH;
                        startM = 0;
                    }
                }

                if (startH < endH || (startH === endH && startM <= endM)) {
                    hasValidSlot = true;
                    break;
                }
            }

            if (!hasValidSlot) continue;

            dates.push(d);
        }
        return dates;
    }, [selectedMethod, settings.maxDaysInAdvance, settings.deliveryRules.deliveryDays, settings.branches, settings.leadTimeHours, selectedBranchId]);

    const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(null);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);

    React.useEffect(() => {
        // Find if the currently selected date is still valid
        const stillValid = selectedDateObj && availableDates.find(d => d.toDateString() === selectedDateObj.toDateString());
        if (!stillValid && availableDates.length > 0) {
            setSelectedDateObj(availableDates[0]);
            setSelectedTime(null);
        } else if (availableDates.length === 0) {
            setSelectedDateObj(null);
            setSelectedTime(null);
        }
    }, [availableDates, selectedDateObj]);

    // Guest / User Data
    const [buyerName, setBuyerName] = useState(user?.name || '');
    const [buyerPhone, setBuyerPhone] = useState(user?.phone || '');
    const [buyerAddress, setBuyerAddress] = useState(user?.address || '');
    
    // Order specific info
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>(settings.paymentMethods?.[0] || 'Efectivo');
    const [notes, setNotes] = useState('');

    // Cupones
    const [couponInput, setCouponInput] = useState('');
    const [activeCoupon, setActiveCoupon] = useState<any>(null);

    // Date Selection Check
    const isTodaySelected = useMemo(() => {
        if (!selectedDateObj) return true;
        const today = new Date();
        return selectedDateObj.toDateString() === today.toDateString();
    }, [selectedDateObj]);

    const getCartItemUnitPrice = (product: Product) => {
        const isFood = businessProfile?.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && settings?.isFoodBusiness;
        const specialActive = isSpecialActive(product);
        if (specialActive) {
            return product.specialOffer?.price || product.price;
        }
        if (isFood && !isTodaySelected && product.advancePrice !== undefined && product.advancePrice > 0) {
            return product.advancePrice;
        }
        return product.price;
    };

    // Calculate Mix & Match discounts dynamically on the subtotal
    const itemUnitPrices = useMemo(() => {
        let prices: Record<string, number> = {};
        cart.forEach(item => {
            prices[item.product.id] = getCartItemUnitPrice(item.product);
        });

        const isFood = businessProfile?.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && settings?.isFoodBusiness;
        const mixAndMatchRules = settings?.mixAndMatchRules || [];

        if (isFood && mixAndMatchRules.length > 0) {
            const sortedRules = [...mixAndMatchRules].sort((a, b) => b.minQuantity - a.minQuantity);
            const appliedProductIds = new Set<string>();

            for (const rule of sortedRules) {
                const matchedItems = cart.filter(item => {
                    if (appliedProductIds.has(item.product.id)) return false;
                    if (rule.type === 'category') {
                        return item.product.category === rule.categoryId;
                    } else {
                        return rule.productIds?.includes(item.product.id);
                    }
                });

                const totalQty = matchedItems.reduce((sum, item) => sum + item.quantity, 0);
                if (totalQty >= rule.minQuantity) {
                    matchedItems.forEach(item => {
                        prices[item.product.id] = Math.min(prices[item.product.id], rule.discountPricePerUnit);
                        appliedProductIds.add(item.product.id);
                    });
                }
            }
        }

        // Apply Cross-selling discount overrides
        const crossSellRules = settings?.crossSellRules || [];
        if (isFood && crossSellRules.length > 0) {
            for (const rule of crossSellRules) {
                let triggerSatisfied = false;
                if (rule.triggerType === 'category') {
                    const totalTriggerQty = cart
                        .filter(item => item.product.category === rule.triggerCategoryId)
                        .reduce((sum, item) => sum + item.quantity, 0);
                    triggerSatisfied = totalTriggerQty >= rule.triggerQuantity;
                } else {
                    const triggerItem = cart.find(item => item.product.id === rule.triggerProductId);
                    triggerSatisfied = triggerItem !== undefined && triggerItem.quantity >= rule.triggerQuantity;
                }

                if (triggerSatisfied) {
                    const rewardItem = cart.find(item => item.product.id === rule.rewardProductId);
                    if (rewardItem) {
                        prices[rule.rewardProductId] = Math.min(prices[rule.rewardProductId] ?? Infinity, rule.rewardPrice);
                    }
                }
            }
        }

        return prices;
    }, [cart, selectedDateObj, settings?.mixAndMatchRules, settings?.crossSellRules, settings?.isFoodBusiness]);

    // Financial calculations - declared early to avoid block-scoped reference errors
    const { normalSubtotal, cashSubtotal } = useMemo(() => {
        let normal = 0;
        let cash = 0;
        cart.forEach(item => {
            let unitPrice = itemUnitPrices[item.product.id] ?? getCartItemUnitPrice(item.product);
            let cashUnitPrice = unitPrice;
            
            if (!settings?.isFoodBusiness) {
                let effectiveTiers = item.product.bulkPricing ? [...item.product.bulkPricing] : [];
                const singleItemOffers = offers.filter(o => o.active && o.requirements?.length === 1 && o.requirements[0].productId === item.product.id);
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
                
                // For cash price, we check if it meets the daily offer minimum
                cashUnitPrice = unitPrice;
                if (item.product.isDailyOffer && item.product.dailyOfferMinQty && item.product.dailyOfferPrice) {
                    if (item.quantity >= item.product.dailyOfferMinQty) {
                        // dailyOfferPrice is the TOTAL bundle price for the minQty. 
                        cashUnitPrice = item.product.dailyOfferPrice / item.product.dailyOfferMinQty;
                    }
                }
            }
            normal += unitPrice * item.quantity;
            cash += cashUnitPrice * item.quantity;
        });
        return { normalSubtotal: normal, cashSubtotal: cash };
    }, [cart, itemUnitPrices, settings?.isFoodBusiness, offers]);
    const subtotal = normalSubtotal; // preserve subtotal variable

    const [dialog, setDialog] = useState<{
        visible: boolean;
        title: string;
        message: string | React.ReactNode;
        buttons: { text: string; style?: 'cancel'; onPress?: () => void }[];
    }>({ visible: false, title: '', message: '', buttons: [] });
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const closeDialog = () => setDialog(prev => ({ ...prev, visible: false }));

    const showCustomAlert = (title: string, message: string | React.ReactNode, buttons?: { text: string; style?: 'cancel'; onPress?: () => void }[]) => {
        setDialog({
            visible: true,
            title,
            message,
            buttons: buttons || [{ text: 'OK', onPress: closeDialog }]
        });
    };

    // Permissions logic
    const isGuest = !user || user.id === 'guest' || user.role !== 'client';
    
    // Configuración de restricciones por horario
    const isRestricted = useMemo(() => {
        if (!settings.purchaseRestrictions?.active) return false;
        const now = new Date();
        const day = now.getDay();
        const shifts = settings.purchaseRestrictions.schedule[day] || [];
        if (shifts.length === 0) return false; 
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;
        for (const shift of shifts) {
            if (currentTime >= shift.startTime && currentTime <= shift.endTime) return true; 
        }
        return false;
    }, [settings.purchaseRestrictions]);

    const canPurchase = (!isGuest || settings.guestCheckout?.allowPurchases) && !isRestricted;
    const canUseCoupons = (settings?.marketingModules?.couponsActive || activeCoupon) && (!isGuest || settings?.guestCheckout?.allowCoupons);
    const canUseMilestones = settings?.marketingModules?.milestonesActive && (!isGuest || settings?.guestCheckout?.allowMilestones);



    // Dynamic Time Slots based on leadTime and open/close schedule
    const availableTimeSlots = useMemo(() => {
        if (!selectedDateObj) return [];
        const branch = settings.branches?.find(b => b.id === selectedBranchId) || settings.branches?.[0];
        const daySchedule = branch?.schedule?.[selectedDateObj.getDay()];
        if (!daySchedule || daySchedule.length === 0) return [];

        let slots: string[] = [];
        let today = new Date();

        for (let shift of daySchedule) {
            let [startH, startM] = shift.openTime.split(':').map(Number);
            let [endH, endM] = shift.closeTime.split(':').map(Number);

            // Add lead time if it's today
            if (selectedDateObj.toDateString() === today.toDateString()) {
                let earliestH = today.getHours() + settings.leadTimeHours;
                if (earliestH > startH) {
                    startH = earliestH;
                    startM = 0;
                }
            }

            let currH = startH;
            let currM = startM;
            while (currH < endH || (currH === endH && currM <= endM)) {
                let timeStr = `${currH.toString().padStart(2, '0')}:${currM.toString().padStart(2, '0')}`;
                slots.push(timeStr);
                currM += settings.slotIntervalMinutes;
                if (currM >= 60) {
                    currH += Math.floor(currM / 60);
                    currM = currM % 60;
                }
            }
        }
        return slots;
    }, [selectedDateObj, settings.branches, settings.leadTimeHours, settings.slotIntervalMinutes, selectedBranchId]);



    React.useEffect(() => {
        if (modifyingOrder) {
            setBuyerName(modifyingOrder.clientName || user?.name || '');
            setBuyerPhone(modifyingOrder.clientPhone || user?.phone || '');
            setBuyerAddress(modifyingOrder.clientAddress || user?.address || '');
            if (modifyingOrder.deliveryMethod === 'pickup' || modifyingOrder.deliveryMethod === 'delivery') {
                setSelectedMethod(modifyingOrder.deliveryMethod);
            }
            if (modifyingOrder.branchId) setSelectedBranchId(modifyingOrder.branchId);
            if (modifyingOrder.paymentMethod) setSelectedPaymentMethod(modifyingOrder.paymentMethod);
            if (modifyingOrder.notes) setNotes(modifyingOrder.notes);

            if (modifyingOrder.scheduledTime) {
                const prevDate = new Date(modifyingOrder.scheduledTime);
                setSelectedDateObj(prevDate);
                const hrs = prevDate.getHours().toString().padStart(2, '0');
                const mins = prevDate.getMinutes().toString().padStart(2, '0');
                setSelectedTime(`${hrs}:${mins}`);
            }
        } else if (user) {
            setBuyerName(user.name || '');
            setBuyerPhone(user.phone || '');
            setBuyerAddress(user.address || '');
        }

        // Auto-apply promo from URL or Context
        const effectivePromo = promo || activeCouponCode;
        if (effectivePromo && !activeCoupon) {
            const isModuleActive = settings?.marketingModules?.couponsActive;
            if (isModuleActive) {
                const found = settings.coupons?.find(c => c.code.toUpperCase() === effectivePromo.toUpperCase() && c.active);
                if (found) {
                    // Check conditions silently for auto-apply
                    if (found.isWelcome && user?.hasOrderedBefore) return;
                    if (found.minOrderAmount && subtotal < found.minOrderAmount) return;

                    setActiveCoupon(found);
                    setCouponInput(found.code);
                }
            }
        }

        // Validate active coupon still exists and is active
        if (activeCoupon) {
            const stillActive = settings.coupons?.find(c => c.code === activeCoupon.code && c.active);
            if (!stillActive) {
                setActiveCoupon(null);
                setCouponInput('');
                if (activeCouponCode === activeCoupon.code) {
                    setActiveCouponCode(null);
                }
            }
        }
    }, [user, modifyingOrder, promo, activeCouponCode, activeCoupon, subtotal, settings.coupons]);

    const applyCoupon = (code?: string, silent = false) => {
        if (!canUseCoupons) return;
        const codeToUse = code !== undefined ? code : couponInput;
        const found = settings.coupons?.find(c => c.code.toUpperCase() === codeToUse.toUpperCase() && c.active);
        if (found) {
            if (found.isWelcome && user?.hasOrderedBefore) {
                if (!silent) showCustomAlert("Cupón Inválido", "Este cupón es solo para nuevos clientes.");
                return;
            }

            if (found.minOrderAmount && found.minOrderAmount > 0) {
                if (subtotal < found.minOrderAmount) {
                    if (!silent) showCustomAlert("Monto Insuficiente", `Este cupón requiere una compra mínima de ${settings?.currency || '$'}${found.minOrderAmount}.\n(Tu total actual es ${settings?.currency || '$'}${subtotal})`);
                    return;
                }
            }
            
            if (found.expirationDate && new Date() > new Date(found.expirationDate)) {
                 if (!silent) showCustomAlert("Cupón Vencido", "Este cupón ya expiró.");
                 return;
            }
            
            if (found.maxUsesPerClient && user?.usedCoupons?.[found.code] !== undefined && user.usedCoupons[found.code] >= found.maxUsesPerClient) {
                 if (!silent) showCustomAlert("Cupón Agotado", "Ya has utilizado este cupón el máximo de veces permitidas.");
                 return;
            }

            setActiveCoupon(found);
            const discText = found.fixedDiscountAmount ? `${settings?.currency || '$'}${found.fixedDiscountAmount}` : `${found.discountPercentage}%`;
            if (!silent) showCustomAlert("¡Éxito!", `Cúpon ${found.code} aplicado (${discText} OFF)`);
        } else {
            if (!silent) showCustomAlert("Error", "Cupón no encontrado o inválido.");
        }
    };

    const onSelectCouponFromList = (c: any) => {
        const discText = c.fixedDiscountAmount ? `${settings?.currency || '$'}${c.fixedDiscountAmount} de descuento` : `${c.discountPercentage}% de descuento`;
        let condText = "";
        if (c.minOrderAmount && c.minOrderAmount > 0) condText += `• El pedido debe ser mayor a ${settings?.currency || '$'}${c.minOrderAmount}.\n`;
        if (c.isWelcome) condText += `• Solo para tu primera compra.\n`;
        
        showCustomAlert(
            `Cupón: ${c.code}`,
            `Beneficio: ${discText}.\n\nRequisitos:\n${condText || "• Sin requisitos especiales"}`,
            [
                { text: 'Cancelar', style: 'cancel', onPress: closeDialog },
                { text: 'Aplicar Beneficio', onPress: () => {
                    setCouponInput(c.code);
                    applyCoupon(c.code, false); 
                }}
            ]
        );
    };

    // Auto Bundle calculations
    let remainingCart = cart.map(item => ({ ...item }));
    let autoBundleDiscounts = 0;

    // Sort offers greedy based on discount
    const activeOffers = offers.filter(o => o.active && o.requirements?.length > 1); // Single-item combos are treated as bulk pricing now
    const offerDiscounts = activeOffers.map(o => {
        let originalPrice = (o.requirements || []).reduce((sum, req) => {
            const p = products.find(prod => prod.id === req.productId);
            return sum + (p ? p.price * req.quantity : 0);
        }, 0);
        return { offer: o, discount: originalPrice - o.bundlePrice };
    }).sort((a, b) => b.discount - a.discount);

    offerDiscounts.forEach(({ offer, discount }) => {
        if (discount <= 0 || !offer.requirements || offer.requirements.length === 0) return;
        let possibleTimes = Infinity;
        for (let req of offer.requirements) {
            const cartItem = remainingCart.find(c => c.product.id === req.productId);
            if (!cartItem) {
                possibleTimes = 0;
                break;
            }
            possibleTimes = Math.floor(Math.min(possibleTimes, cartItem.quantity / req.quantity));
        }

        if (possibleTimes > 0 && possibleTimes !== Infinity) {
            offer.requirements.forEach(req => {
                const cartItem = remainingCart.find(c => c.product.id === req.productId)!;
                cartItem.quantity -= req.quantity * possibleTimes;
            });
            autoBundleDiscounts += discount * possibleTimes;
        }
    });

    // Milestones
    let milestoneDiscount = 0;
    let nextMilestone = null;
    if (canUseMilestones && settings.milestoneGroups) {
        let totalGroupDiscounts = 0;
        let allUpcoming: any[] = [];

        settings.milestoneGroups.forEach(g => {
            let reachedInG = g.milestones.filter(m => subtotal >= m.amountThreshold);
            if (reachedInG.length > 0) {
                let highest = reachedInG.reduce((prev, curr) => (prev.amountThreshold > curr.amountThreshold) ? prev : curr);
                let pctValue = highest.discountPercentage ? (subtotal * highest.discountPercentage) / 100 : 0;
                
                // Aplicar tope de descuento si existe
                if (highest.maxDiscountAmount && pctValue > highest.maxDiscountAmount) {
                    pctValue = highest.maxDiscountAmount;
                }
                
                let fixValue = highest.fixedDiscountAmount || 0;
                totalGroupDiscounts += pctValue + fixValue;
            }
            let upcomingInG = g.milestones.filter(m => subtotal < m.amountThreshold);
            allUpcoming.push(...upcomingInG);
        });

        milestoneDiscount = totalGroupDiscounts;

        if (allUpcoming.length > 0) {
            nextMilestone = allUpcoming.sort((a, b) => a.amountThreshold - b.amountThreshold)[0];
        }
    }

    let couponDiscountValue = 0;
    if (activeCoupon) {
        if (activeCoupon.discountPercentage) {
            let pDesc = (subtotal * activeCoupon.discountPercentage) / 100;
            if (activeCoupon.hasMaxDiscount && activeCoupon.maxDiscountAmount && pDesc > activeCoupon.maxDiscountAmount) {
                pDesc = activeCoupon.maxDiscountAmount;
            }
            couponDiscountValue += pDesc;
        }
        if (activeCoupon.fixedDiscountAmount) {
            couponDiscountValue += activeCoupon.fixedDiscountAmount;
        }
    }
    
    let flashDiscountValue = 0;
    if (flashOfferState && flashOfferState.expiresAt > Date.now()) {
        if (flashOfferState.type === 'fixed') {
            flashDiscountValue = flashOfferState.discount;
        } else {
            flashDiscountValue = (subtotal * flashOfferState.discount) / 100;
        }
    }
    let totalDiscount = milestoneDiscount + couponDiscountValue + autoBundleDiscounts + flashDiscountValue;


    // Delivery cost
    let deliveryCost = 0;
    let missingForFreeDelivery = 0;
    if (selectedMethod === 'delivery' && settings.allowDelivery) {
        if (subtotal >= settings.deliveryRules.freeDeliveryThreshold) {
            deliveryCost = 0;
        } else {
            deliveryCost = settings.deliveryRules.standardCost;
            missingForFreeDelivery = settings.deliveryRules.freeDeliveryThreshold - subtotal;
        }
    }

    const total = Math.max(0, subtotal - totalDiscount + deliveryCost);

    // AI Upsell Logic
    const suggestedItem = useMemo(() => {
        if (!settings.marketingModules.aiUpsellActive) return null;
        if (missingForFreeDelivery > 0 || nextMilestone) {
            // Buscar algo barato que lo ayude a llegar
            let candidates = products.filter(p => p.availableForSuggestions && !cart.find(c => c.product.id === p.id));
            if (candidates.length > 0) return candidates[0];
        }
        return null;
    }, [subtotal, missingForFreeDelivery, nextMilestone, cart, products, settings.marketingModules.aiUpsellActive]);

    const gastronomicSuggestions = useMemo(() => {
        const isFood = businessProfile?.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && settings?.isFoodBusiness;
        if (!isFood) return [];

        const suggestions: { id: string; type: 'upsell' | 'crosssell'; message: string; action?: () => void }[] = [];

        // 1. Quantity Upsell suggestions
        const mixAndMatchRules = settings?.mixAndMatchRules || [];
        mixAndMatchRules.forEach(rule => {
            const matchedItems = cart.filter(item => {
                if (rule.type === 'category') {
                    return item.product.category === rule.categoryId;
                } else {
                    return rule.productIds?.includes(item.product.id);
                }
            });
            const totalQty = matchedItems.reduce((sum, item) => sum + item.quantity, 0);
            if (totalQty > 0 && totalQty < rule.minQuantity) {
                suggestions.push({
                    id: `upsell_${rule.id}`,
                    type: 'upsell',
                    message: `Llevá ${rule.minQuantity - totalQty} más para acceder a la promo: "${rule.name}" (${settings?.currency || '$'}${rule.discountPricePerUnit} c/u)`
                });
            }
        });

        // 2. Cross-selling suggestions
        const crossSellRules = settings?.crossSellRules || [];
        crossSellRules.forEach(rule => {
            let triggerQty = 0;
            if (rule.triggerType === 'category') {
                triggerQty = cart
                    .filter(item => item.product.category === rule.triggerCategoryId)
                    .reduce((sum, item) => sum + item.quantity, 0);
            } else {
                const triggerItem = cart.find(item => item.product.id === rule.triggerProductId);
                triggerQty = triggerItem ? triggerItem.quantity : 0;
            }

            const rewardInCart = cart.some(item => item.product.id === rule.rewardProductId);
            
            // If trigger condition is met but reward is NOT in cart, suggest it!
            if (triggerQty >= rule.triggerQuantity && !rewardInCart) {
                const rewardProduct = products.find(p => p.id === rule.rewardProductId);
                if (rewardProduct) {
                    suggestions.push({
                        id: `cross_${rule.id}`,
                        type: 'crosssell',
                        message: `${rule.message} (¡Sumar ${rewardProduct.name} a solo ${settings?.currency || '$'}${rule.rewardPrice}!)`,
                        action: () => {
                            addToCart(rewardProduct);
                        }
                    });
                }
            }
        });

        return suggestions;
    }, [cart, products, settings, selectedDateObj]);


    const updateQuantity = (productId: string, delta: number) => {
        setCart(cart.map((item: any) => {
            if (item.product.id === productId) {
                const isUnit = item.product.unitType === 'unit';
                const step = isUnit ? 1 : (Number(settings.checkoutRules?.weightStep) || 1);
                const minWeight = isUnit ? 1 : (Number(settings.checkoutRules?.minWeightPerItem) || 1);
                let current = item.quantity;
                let nextQty = current + (delta * step);

                if (delta > 0) {
                    nextQty = current + step;
                    if (item.product.bulkPricing) {
                        const bulks = item.product.bulkPricing.map((b: any) => b.quantity).sort((a: any, b: any) => a - b);
                        for (let b of bulks) {
                            if (current < b && nextQty >= b) {
                                nextQty = b;
                                break;
                            }
                        }
                    }
                } else if (delta < 0) {
                    nextQty = current - step;
                    if (item.product.bulkPricing) {
                        const bulks = item.product.bulkPricing.map((b: any) => b.quantity).sort((a: any, b: any) => b - a);
                        for (let b of bulks) {
                            if (current > b && nextQty <= b) {
                                nextQty = b;
                                break;
                            }
                        }
                    }
                }

                if (nextQty <= 0) nextQty = 0;
                
                // Allow floating point like 0.25 smoothly
                const formattedQty = parseFloat(nextQty.toFixed(2));
                return { ...item, quantity: formattedQty };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const addToCart = (product: Product) => {
        setCart([...cart, { product, quantity: 1 }]);
    };

    const handleCheckout = () => {
        if (cart.length === 0) return;

        if (!canPurchase) {
            if (isRestricted) {
                showCustomAlert('Cerrado temporalmente', 'Las compras están inhabilitadas en este horario según lapso configurado por el negocio.');
            } else {
                showCustomAlert('Requiere Registro', 'Solo los clientes registrados pueden comprar.', [
                    { text: 'Cancelar', style: 'cancel', onPress: closeDialog },
                    { text: 'Iniciar Sesión', onPress: () => { closeDialog(); router.push('/profile?mode=login' as any); } },
                    { text: 'Registrarme', onPress: () => { closeDialog(); router.push('/profile?mode=register' as any); } }
                ]);
            }
            return;
        }

        if (!buyerName.trim() || !buyerPhone.trim() || (selectedMethod === 'delivery' && !buyerAddress.trim())) {
            showCustomAlert('Faltan datos', 'Completá tus datos personales para continuar.');
            return;
        }

        const isTimeRequired = selectedMethod === 'delivery' ? settings.deliveryScheduling?.active : settings.pickupScheduling?.active;
        const isDateRequired = selectedMethod === 'delivery' || (selectedMethod === 'pickup' && settings.pickupScheduling?.active);

        if (isDateRequired && !selectedDateObj) {
            showCustomAlert('Falta completar', 'Por favor seleccioná el día de entrega/retiro.');
            return;
        }
        if (isTimeRequired && !selectedTime) {
            showCustomAlert('Falta completar', 'Por favor seleccioná el horario.');
            return;
        }

        if (!selectedPaymentMethod) {
            showCustomAlert('Falta completar', 'Por favor seleccioná un medio de pago.');
            return;
        }

        const minDelivery = settings.checkoutRules?.minOrderValueDelivery || 0;
        const minPickup = settings.checkoutRules?.minOrderValuePickup || 0;

        if (selectedMethod === 'delivery' && total < minDelivery) {
            showCustomAlert('Compra mínima', `Para envío a domicilio la compra mínima es de ${settings?.currency || '$'}${minDelivery}.\nTe faltan ${settings?.currency || '$'}${(minDelivery - total).toFixed(2)}`);
            return;
        }
        if (selectedMethod === 'pickup' && total < minPickup) {
            showCustomAlert('Compra mínima', `Para retiro por sucursal la compra mínima es de ${settings?.currency || '$'}${minPickup}.\nTe faltan ${settings?.currency || '$'}${(minPickup - total).toFixed(2)}`);
            return;
        }

        if (settings.marketingModules?.volumeUpsellActive) {
            let candidate: any = null;
            let missingQty = 0;
            let currentPrice = 0;
            let nextPrice = 0;

            for (let item of cart) {
                let effectiveTiers = item.product.bulkPricing ? [...item.product.bulkPricing] : [];
                const singleItemOffers = offers.filter(o => o.active && o.requirements?.length === 1 && o.requirements[0].productId === item.product.id);
                for (let o of singleItemOffers) {
                    effectiveTiers.push({ quantity: o.requirements[0].quantity, price: o.bundlePrice });
                }
                
                if (effectiveTiers.length > 0) {
                    const sortedTiers = [...effectiveTiers].sort((a, b) => b.quantity - a.quantity);
                    let unitP = item.product.price;
                    for (let tier of sortedTiers) {
                        if (item.quantity >= tier.quantity) {
                            unitP = (tier.price / tier.quantity);
                            break;
                        }
                    }

                    const ascendingTiers = [...effectiveTiers].sort((a, b) => a.quantity - b.quantity);
                    let nextT = ascendingTiers.find(t => t.quantity > item.quantity);
                    
                    if (nextT) {
                        let diff = nextT.quantity - item.quantity;
                        if (diff <= Math.max(2, nextT.quantity * 0.3)) {
                            candidate = item;
                            missingQty = diff;
                            currentPrice = unitP;
                            nextPrice = nextT.price / nextT.quantity;
                            break;
                        }
                    }
                }
            }

            if (candidate) {
                // Formatear cantidad de manera que si es entero o termina en .0 o .00 desaparezcan los decimales
                const qtyVal = Number(missingQty.toFixed(2));
                const qtyUnit = qtyVal === 1 ? 'kilo' : 'kilos';
                const qtyDisplay = `${qtyVal.toString()} ${qtyUnit}`;

                const formattedNextPrice = `${settings?.currency || '$'}${nextPrice.toFixed(0)}`;
                const formattedCurrentPrice = `${settings?.currency || '$'}${currentPrice.toFixed(0)}`;

                const upsellMessage = (
                    <Text style={{ fontSize: 14, color: '#444', textAlign: 'center', lineHeight: 22 }}>
                        ¿Querés añadir <Text style={{ fontWeight: 'bold' }}>{qtyDisplay}</Text> más de <Text style={{ fontWeight: 'bold' }}>{candidate.product.name}</Text> para obtener el precio promocional?{"\n\n"}
                        Terminarías pagando <Text style={{ fontWeight: 'bold' }}>{candidate.product.name}</Text> a <Text style={{ fontWeight: 'bold', color: '#16a34a' }}>{formattedNextPrice} el kilo</Text> en lugar de <Text style={{ color: '#666' }}>{formattedCurrentPrice}</Text>.
                    </Text>
                );

                showCustomAlert(
                    '¡Llevá más y pagá menos!', 
                    upsellMessage,
                    [
                        { text: 'No, gracias', style: 'cancel', onPress: () => { closeDialog(); setShowSummaryModal(true); } },
                        { text: '¡Sí, agregar!', onPress: () => {
                            setCart(cart.map(c => c.product.id === candidate.product.id ? { ...c, quantity: parseFloat((c.quantity + missingQty).toFixed(2)) } : c));
                            closeDialog();
                        }}
                    ]
                );
                return;
            }
        }

        setShowSummaryModal(true);
    };

    const proceedWithOrder = async () => {
        const isTimeRequired = selectedMethod === 'delivery' ? settings.deliveryScheduling?.active : settings.pickupScheduling?.active;
        const isDateRequired = selectedMethod === 'delivery' || (selectedMethod === 'pickup' && settings.pickupScheduling?.active);

        if (isDateRequired && !selectedDateObj) return;
        if (isTimeRequired && !selectedTime) return;
        
        let finalScheduledTime = new Date().toISOString();
        if (isDateRequired && selectedDateObj) {
            let hours = 0;
            let minutes = 0;
            if (isTimeRequired && selectedTime) {
                const parts = selectedTime.split(':');
                hours = parseInt(parts[0]) || 0;
                minutes = parseInt(parts[1]) || 0;
            }
            const localDate = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), hours, minutes, 0);
            finalScheduledTime = localDate.toISOString();
        }

        let updatedHistory = modifyingOrder?.modificationHistory ? [...modifyingOrder.modificationHistory] : [];
        if (modifyingOrder) {
            updatedHistory.push({
                timestamp: new Date().toISOString(),
                modifiedBy: 'client',
                description: `El cliente modificó su pedido. Nuevo total: $${total}`
            });
        }

        const cashTotal = Math.max(0, total - (normalSubtotal - cashSubtotal));

        const itemsWithPrices = cart.map(item => {
            const pricing = getItemPricing(item, offers, settings?.isFoodBusiness);
            return {
                ...item,
                unitPrice: pricing.unitPrice,
                cashUnitPrice: pricing.cashUnitPrice,
                hasCashDiscount: pricing.hasCashDiscount
            };
        });

        const newOrder: any = modifyingOrder ? {
            ...modifyingOrder,
            items: itemsWithPrices,
            subtotal,
            cashSubtotal,
            discountApplied: totalDiscount,
            deliveryCost,
            totalPrice: total,
            cashTotalPrice: cashTotal,
            deliveryMethod: selectedMethod,
            paymentMethod: selectedPaymentMethod,
            scheduledTime: finalScheduledTime,
            clientAddress: selectedMethod === 'delivery' ? buyerAddress : undefined,
            clientName: buyerName,
            clientPhone: buyerPhone,
            branchId: selectedBranchId,
            notes: notes.trim() || undefined,
            clientModified: true,
            isCustomTotal: false,
            lastModifiedBy: 'client',
            modificationHistory: updatedHistory
        } : {
            id: '', // Sequential ID generated in services
            clientId: user ? user.id : 'guest',
            clientName: buyerName,
            clientPhone: buyerPhone,
            businessId: businessProfile.id,
            branchId: selectedBranchId,
            items: itemsWithPrices,
            subtotal,
            cashSubtotal,
            discountApplied: totalDiscount,
            deliveryCost,
            totalPrice: total,
            cashTotalPrice: cashTotal,
            status: 'pending',
            deliveryMethod: selectedMethod,
            paymentMethod: selectedPaymentMethod,
            scheduledTime: finalScheduledTime,
            createdAt: new Date().toISOString()
        };

        if (!modifyingOrder) {
            if (selectedMethod === 'delivery' && buyerAddress) newOrder.clientAddress = buyerAddress;
            if (notes.trim()) newOrder.notes = notes.trim();
        }

        setIsSubmitting(true);
        try {
            const finalSavedOrder = await saveOrderToFirebase(businessProfile.id, newOrder);
            
            if (modifyingOrder) {
                setOrders((prev: any) => prev.map((o: any) => o.id === finalSavedOrder.id ? finalSavedOrder : o));
            } else {
                setOrders((prev: any) => {
                    // Evitamos duplicados si el listener de Firebase ya capturó el pedido
                    const filtered = prev.filter((o: any) => o.id !== finalSavedOrder.id);
                    return [finalSavedOrder, ...filtered];
                });
                if (!user || user.id === 'guest') {
                    setGuestOrderIds((prev: any) => prev.includes(finalSavedOrder.id) ? prev : [...prev, finalSavedOrder.id]);
                }
            }
            
            const isMod = !!modifyingOrder;
            const orderIdStr = finalSavedOrder.id;

            // Raffle points calculation
            let pointsEarned = 0;
            if (!isMod && settings.marketingModules?.rafflesActive) {
                const now = new Date();
                const activeRaffles = (settings.raffles || []).filter(r => r.active && new Date(r.drawStartDate) <= now && new Date(r.drawEndDate) >= now);
                
                activeRaffles.forEach(raffle => {
                    const meetsMin = !raffle.minOrderAmount || total >= raffle.minOrderAmount;
                    if (meetsMin) {
                        const rules = raffle.pointRules || {};
                        const dayOfWeek = now.getDay();
                        const isEligibleDay = !rules.eligibleDays || rules.eligibleDays.includes(dayOfWeek);

                        if (isEligibleDay) {
                            if (rules.pointsPerOrder) pointsEarned += rules.pointsPerOrder;
                            if (rules.amountForOnePoint && rules.amountForOnePoint > 0) {
                                pointsEarned += Math.floor(total / rules.amountForOnePoint);
                            }
                            if (selectedMethod === 'pickup' && rules.pointsForPickup) {
                                pointsEarned += rules.pointsForPickup;
                            }
                            if (selectedMethod === 'delivery' && rules.pointsForDelivery) {
                                pointsEarned += rules.pointsForDelivery;
                            }
                        }
                    }
                });
            }
            
            // Limpiamos el carrito y el estado de edición INMEDIATAMENTE tras el éxito
            setCart([]);
            setModifyingOrder(null);
            setShowSummaryModal(false);

            // Navegamos al éxito
            router.push({ 
                pathname: '/success', 
                params: { type: isMod ? 'modified' : 'confirmed', id: orderIdStr, points: pointsEarned.toString() } 
            } as any);

            if (user && user.id !== 'guest') {
                let userUpdates: any = {
                    hasOrderedBefore: true,
                    name: buyerName,
                    phone: buyerPhone
                };
                if (selectedMethod === 'delivery') userUpdates.address = buyerAddress;
                
                if (activeCoupon) {
                    const currentUses = user.usedCoupons?.[activeCoupon.code] || 0;
                    userUpdates.usedCoupons = { ...(user.usedCoupons || {}), [activeCoupon.code]: currentUses + 1 };
                }

                setUser({ ...user, ...userUpdates });
                
                try {
                    await updateDoc(doc(db, 'users', user.id), userUpdates);
                } catch(e) {
                    console.error("Error al actualizar info del usuario: ", e);
                }
            }

            if (activeCoupon) {
                if (Platform.OS === 'web') alert("¡Gracias por usar tu cupón!");
                else Alert.alert("¡Gracias!", "¡Gracias por usar tu cupón!");
            }
        } catch (err: any) {
            console.error("No se pudo guardar la orden", err);
            let errorMessage = 'No pudimos registrar tu pedido en este momento. Intenta de nuevo.';
            
            if (err.code === 'permission-denied') {
                errorMessage = 'Error de permisos al registrar el pedido. Por favor, contacta al soporte o intenta registrarte.';
            } else if (err.code === 'unavailable') {
                errorMessage = 'Sin conexión. Por favor verifica tu internet e intenta de nuevo.';
            }
            
            showCustomAlert('Error', errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    const onConfirmData = () => {
        proceedWithOrder();
    };

    const renderCartItem = ({ item }: { item: any }) => {
        const isUnit = item.product.unitType === 'unit';
        const step = isUnit ? 1 : (Number(settings.checkoutRules?.weightStep) || 1);
        const minWeight = isUnit ? 1 : (Number(settings.checkoutRules?.minWeightPerItem) || 1);
        return <CartItemRow item={item} updateQuantity={updateQuantity} setCart={setCart} cart={cart} step={step} minWeight={minWeight} styles={styles} offers={offers} settings={settings} businessProfile={businessProfile} overrideUnitPrice={itemUnitPrices[item.product.id]} />;
    };

    if (cart.length === 0) {
        return (
            <View style={[styles.container, styles.center]}>
                <Text style={styles.emptyText}>Tu carrito está vacío</Text>
                <Pressable style={[styles.shopButton, { backgroundColor: businessProfile.primaryColor }]} onPress={() => router.push('/')}>
                    <Text style={styles.shopButtonText}>Ir al catálogo</Text>
                </Pressable>
                {modifyingOrder && (
                     <Pressable style={{ marginTop: 20 }} onPress={() => { setModifyingOrder(null); router.push('/orders'); }}>
                        <Text style={{color: '#ef4444', fontWeight: 'bold' }}>✖ Cancelar Edición de Ticket</Text>
                    </Pressable>
                )}
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{modifyingOrder ? `Modificando #${modifyingOrder.id}` : 'Mi Pedido'}</Text>
                {modifyingOrder && (
                    <Pressable style={{ marginTop: 8 }} onPress={() => { setCart([]); setModifyingOrder(null); router.push('/orders'); }}>
                        <Text style={{color: '#ef4444', fontWeight: 'bold' }}>✖ Descartar Edición</Text>
                    </Pressable>
                )}
            </View>

            {/* PROGRESS BAR (Milestones / Free Shipping) - Solo para Envío */}
            {selectedMethod === 'delivery' && (
            <View style={styles.progressContainer}>
                {missingForFreeDelivery > 0 ? (
                    <Text style={styles.progressText}>¡Estás a solo <Text style={styles.bold}>{settings?.currency || '$'}{missingForFreeDelivery}</Text> de tu envío gratis!</Text>
                ) : nextMilestone ? (
                    <Text style={styles.progressText}>¡Estás a <Text style={styles.bold}>{settings?.currency || '$'}{nextMilestone.amountThreshold - subtotal}</Text> de desbloquear una recompensa! ({nextMilestone.discountPercentage ? `${nextMilestone.discountPercentage}% OFF` : `${settings?.currency || '$'}${nextMilestone.fixedDiscountAmount} OFF`})</Text>
                ) : (
                    <Text style={styles.progressText}>¡Alcanzaste todos los beneficios locales! 🎉</Text>
                )}
                <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: missingForFreeDelivery > 0 ? `${(subtotal / settings.deliveryRules.freeDeliveryThreshold) * 100}%` : '100%' }]} />
                </View>
            </View>
            )}

            {/* GASTRONOMIC RULES SUGGESTIONS (Mix & Match / Cross-selling) */}
            {gastronomicSuggestions.map(sug => (
                <Pressable 
                    key={sug.id} 
                    onPress={sug.action}
                    disabled={!sug.action}
                    style={{ 
                        backgroundColor: sug.type === 'crosssell' ? '#e0f2fe' : '#fdf2f8', 
                        borderColor: sug.type === 'crosssell' ? '#bae6fd' : '#fbcfe8',
                        borderWidth: 1,
                        padding: 12, 
                        borderRadius: 8, 
                        marginHorizontal: 15,
                        marginBottom: 15,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10
                    }}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: sug.type === 'crosssell' ? '#0369a1' : '#be185d' }}>
                            {sug.type === 'crosssell' ? '🍕 ¡Venta Cruzada!' : '🍡 ¡Llegá a la Promo!'}
                        </Text>
                        <Text style={{ fontSize: 12, color: sug.type === 'crosssell' ? '#0c4a6e' : '#831843', marginTop: 2 }}>
                            {sug.message}
                        </Text>
                    </View>
                    {sug.action && (
                        <View style={{ backgroundColor: '#0284c7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Sumar</Text>
                        </View>
                    )}
                </Pressable>
            ))}

            <View style={styles.list}>
                {cart.map((item: any) => (
                    <React.Fragment key={item.product.id}>
                        {renderCartItem({ item })}
                    </React.Fragment>
                ))}
            </View>

            {/* AI UPSELL */}
            {suggestedItem && (
                <View style={styles.aiBox}>
                    <View style={styles.aiHeader}>
                        <Text style={styles.aiTitle}>🤖 Sugerencia Inteligente</Text>
                    </View>
                    <Text style={styles.aiText}>Veo que te falta poco para acceder al próximo beneficio. ¿Te sumo esto al carrito?</Text>
                    <View style={styles.aiProductRow}>
                        <Image source={{ uri: suggestedItem.imageUrl }} style={styles.aiImage} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.aiProductName}>{suggestedItem.name}</Text>
                            <Text style={[styles.aiProductPrice, { color: businessProfile.primaryColor }]}>{settings?.currency || '$'}{suggestedItem.price}</Text>
                        </View>
                        <Pressable style={styles.aiAddBtn} onPress={() => addToCart(suggestedItem)}>
                            <Text style={styles.aiAddBtnText}>Añadir</Text>
                        </Pressable>
                    </View>
                </View>
            )}

            <View style={styles.checkoutSection}>
                <Text style={styles.sectionTitle}>Método de entrega</Text>
                <View style={styles.row}>
                    <Pressable
                        style={[styles.methodBtn, selectedMethod === 'pickup' && [styles.methodBtnActive, { borderColor: businessProfile.primaryColor }]]}
                        onPress={() => setSelectedMethod('pickup')}
                        disabled={!settings.allowPickup}
                    >
                        <Text style={[styles.methodText, selectedMethod === 'pickup' && [styles.methodTextActive, { color: businessProfile.primaryColor }]]}>Retiro Local</Text>
                    </Pressable>

                    <Pressable
                        style={[styles.methodBtn, selectedMethod === 'delivery' && [styles.methodBtnActive, { borderColor: businessProfile.primaryColor }]]}
                        onPress={() => setSelectedMethod('delivery')}
                        disabled={!settings.allowDelivery}
                    >
                        <Text style={[styles.methodText, selectedMethod === 'delivery' && [styles.methodTextActive, { color: businessProfile.primaryColor }]]}>Envío</Text>
                    </Pressable>
                </View>

                {selectedMethod === 'pickup' && settings.branches.length > 0 && (
                    <View style={{ marginTop: 15 }}>
                        <Text style={styles.sectionTitle}>Sucursal de retiro</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 5 }}>
                            {settings.branches.map(b => (
                                <Pressable
                                    key={b.id}
                                    style={[styles.timeBtn, selectedBranchId === b.id && styles.timeBtnActive]}
                                    onPress={() => setSelectedBranchId(b.id)}
                                >
                                    <Text style={[styles.timeText, selectedBranchId === b.id && styles.timeTextActive]}>{b.name}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {(selectedMethod === 'delivery' || (selectedMethod === 'pickup' && settings.pickupScheduling?.active)) && (
                    availableDates.length > 0 ? (
                        <>
                            <Text style={styles.sectionTitle}>Día de {selectedMethod === 'delivery' ? 'entrega' : 'retiro'}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                                {availableDates.map(d => (
                                    <Pressable
                                        key={d.toISOString()}
                                        style={[styles.dateBtn, selectedDateObj?.getDate() === d.getDate() && styles.dateBtnActive]}
                                        onPress={() => { setSelectedDateObj(d); setSelectedTime(null); }}
                                    >
                                        <Text style={[styles.dateText, selectedDateObj?.getDate() === d.getDate() && styles.dateTextActive]}>
                                            {d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                                        </Text>
                                    </Pressable>
                                ))}
                            </ScrollView>

                            {((selectedMethod === 'delivery' ? settings.deliveryScheduling?.active : settings.pickupScheduling?.active)) && availableTimeSlots.length > 0 && (
                                <>
                                    <Text style={styles.sectionTitle}>Horario aproximado</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                                        {availableTimeSlots.map(t => (
                                            <Pressable
                                                key={t}
                                                style={[styles.timeBtn, selectedTime === t && styles.timeBtnActive]}
                                                onPress={() => setSelectedTime(t)}
                                            >
                                                <Text style={[styles.timeText, selectedTime === t && styles.timeTextActive]}>{t}</Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                </>
                            )}
                        </>
                    ) : (
                        <Text style={styles.noDatesText}>No existen días de {selectedMethod} disponibles pronto.</Text>
                    )
                )}

                {/* Métodos de Pago */}
                {(() => {
                    const methods = settings.paymentMethods?.length ? settings.paymentMethods : ['Efectivo'];
                    return (
                        <>
                            <Text style={styles.sectionTitle}>Medio de Pago Aceptado</Text>
                            <Text style={{ fontSize: 13, color: '#666', marginBottom: 10, marginTop: -10 }}>Acordarás el pago directamente con el negocio.</Text>
                            <View style={styles.row}>
                                {methods.map(pm => (
                                    <Pressable
                                        key={pm}
                                        style={[styles.methodBtn, selectedPaymentMethod === pm && [styles.methodBtnActive, { borderColor: businessProfile.primaryColor }]]}
                                        onPress={() => setSelectedPaymentMethod(pm)}
                                    >
                                        <Text style={[styles.methodText, selectedPaymentMethod === pm && [styles.methodTextActive, { color: businessProfile.primaryColor }]]}>{pm}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        </>
                    );
                })()}

                {/* Resumen Finaciero */}
                <View style={styles.summaryBox}>
                    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryVal}>{settings?.currency || '$'}{Number.isInteger(subtotal) ? subtotal : subtotal.toFixed(2)}</Text></View>
                    {cashSubtotal < normalSubtotal && (
                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: '#16a34a', fontWeight: 'bold' }]}>En efectivo:</Text>
                            <Text style={[styles.summaryVal, { color: '#16a34a', fontWeight: 'bold' }]}>
                                {settings?.currency || '$'}{Number.isInteger(cashSubtotal) ? cashSubtotal : cashSubtotal.toFixed(2)}
                            </Text>
                        </View>
                    )}
                    {autoBundleDiscounts > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Descuento Combos Especiales</Text><Text style={[styles.summaryVal, { color: '#cf2e2e' }]}>-${Number.isInteger(autoBundleDiscounts) ? autoBundleDiscounts : autoBundleDiscounts.toFixed(2)}</Text></View>}
                    {(totalDiscount - autoBundleDiscounts) > 0 && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Otros Descuentos</Text><Text style={[styles.summaryVal, { color: '#cf2e2e' }]}>-${Number.isInteger(totalDiscount - autoBundleDiscounts) ? (totalDiscount - autoBundleDiscounts) : (totalDiscount - autoBundleDiscounts).toFixed(2)}</Text></View>}
                    {selectedMethod === 'delivery' && (
                        <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Envío</Text><Text style={styles.summaryVal}>{deliveryCost === 0 ? '¡GRATIS!' : `${settings?.currency || '$'}${deliveryCost}`}</Text></View>
                    )}
                </View>

                <Text style={styles.sectionTitle}>Tus Datos Personales</Text>

                {isGuest && (
                    <View style={styles.guestNotice}>
                        <Text style={styles.guestNoticeText}>Estás comprando como invitado (sin cuenta).</Text>
                        <Pressable onPress={() => router.push('/profile?mode=register' as any)}>
                            <Text style={styles.guestNoticeLink}>¡Registrate para acceder a beneficios y cupones de descuento!</Text>
                        </Pressable>
                    </View>
                )}

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Nombre completo</Text>
                    <TextInput style={styles.textInput} value={buyerName} onChangeText={setBuyerName} placeholder="Ej: Juan Pérez" />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Número de teléfono (WhatsApp)</Text>
                    <TextInput style={styles.textInput} value={buyerPhone} onChangeText={setBuyerPhone} placeholder="Ej: 1123456789" keyboardType="phone-pad" />
                </View>

                {selectedMethod === 'delivery' && (
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Dirección de envío completa</Text>
                        <TextInput style={styles.textInput} value={buyerAddress} onChangeText={setBuyerAddress} placeholder="Ej: Calle Falsa 123, Piso 1 Dpto A" />
                    </View>
                )}



                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Indicaciones Especiales (Opcional)</Text>
                    <TextInput 
                        style={[styles.textInput, { height: 80, textAlignVertical: 'top' }]} 
                        value={notes} 
                        onChangeText={setNotes} 
                        placeholder="Ej: La carne picada sin grasa, o cortar para milanesas..." 
                        placeholderTextColor="#aaa"
                        multiline 
                        numberOfLines={3} 
                    />
                </View>

                <View style={{ marginVertical: 15, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 15 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ fontSize: 15, color: '#64748b' }}>Productos:</Text>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b' }}>
                            ${(subtotal - totalDiscount).toFixed(2).replace(/\.00$/, '')}
                        </Text>
                    </View>
                    {selectedMethod === 'delivery' && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ fontSize: 15, color: '#64748b' }}>Costo de envío:</Text>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b' }}>
                                {deliveryCost > 0 ? `$${deliveryCost.toFixed(2).replace(/\.00$/, '')}` : 'Gratis'}
                            </Text>
                        </View>
                    )}
                    {selectedMethod === 'delivery' && missingForFreeDelivery > 0 && settings.deliveryRules?.freeDeliveryThreshold > 0 && (
                        <Text style={{ fontSize: 13, color: '#f59e0b', fontStyle: 'italic', marginBottom: 8, textAlign: 'right' }}>
                            (Te faltan ${missingForFreeDelivery.toFixed(2).replace(/\.00$/, '')} para tener el envío gratis)
                        </Text>
                    )}
                    <View style={[styles.totalRow, { marginVertical: 10 }]}>
                        <Text style={styles.totalLabel}>{(cashSubtotal < normalSubtotal) ? 'Total Otros Medios:' : 'Total a pagar:'}</Text>
                        <View style={{ alignItems: 'flex-end' }}>
                            {activeCoupon && (
                                <Text style={[styles.totalAmount, { fontSize: 18, textDecorationLine: 'line-through', color: '#94a3b8' }]}>
                                    ${(total + couponDiscountValue).toFixed(2).replace(/\.00$/, '')}
                                </Text>
                            )}
                            <Text style={[styles.totalAmount, activeCoupon && { color: businessProfile.primaryColor }]}>
                                ${Number.isInteger(total) ? total : total.toFixed(2).replace(/\.00$/, '')}
                            </Text>
                            {activeCoupon && (
                                <Text style={{ fontSize: 12, color: businessProfile.primaryColor, fontWeight: 'bold' }}>
                                    (Con cupón {activeCoupon.code})
                                </Text>
                            )}
                        </View>
                    </View>

                    {(cashSubtotal < normalSubtotal) && (
                        <View style={[styles.totalRow, { marginVertical: 0, marginBottom: 15 }]}>
                            <Text style={[styles.totalLabel, { color: '#16a34a', fontWeight: 'bold' }]}>Total en Efectivo:</Text>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.totalAmount, { color: '#16a34a', fontWeight: 'bold' }]}>
                                    ${Number.isInteger(total - (normalSubtotal - cashSubtotal)) ? (total - (normalSubtotal - cashSubtotal)) : (total - (normalSubtotal - cashSubtotal)).toFixed(2).replace(/\.00$/, '')}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>

                {businessProfile.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && settings?.isFoodBusiness ? (
                    <Pressable 
                        style={[styles.foodConfirmBtn, { backgroundColor: businessProfile.primaryColor || '#f97316' }]} 
                        onPress={handleCheckout}
                    >
                        <Text style={styles.foodConfirmBtnPrice}>
                            {settings?.currency || '$'}{Number.isInteger(total) ? total : total.toFixed(2).replace(/\.00$/, '')}
                        </Text>
                        <View style={styles.foodConfirmDivider} />
                        <Text style={styles.foodConfirmBtnText}>
                            {modifyingOrder ? 'Confirmar Cambios' : 'Confirmar Pedido'}
                        </Text>
                    </Pressable>
                ) : (
                    <Pressable style={[styles.checkoutBtn, { backgroundColor: businessProfile.primaryColor }]} onPress={handleCheckout}>
                        <Text style={styles.checkoutBtnText}>{modifyingOrder ? 'Confirmar Cambios' : 'Confirmar Pedido'}</Text>
                    </Pressable>
                )}

                {/* CUPONES DISPONIBLES */}
                {canUseCoupons && (
                    <View style={{ marginTop: 25, backgroundColor: '#f8fafc', padding: 15, borderRadius: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#64748b', marginBottom: 10 }}>CUPONES DISPONIBLES PARA VOS</Text>
                        
                        {(() => {
                            const availableCoupons = (settings.coupons || []).filter(c => 
                                c.active && 
                                c.public !== false &&
                                !c.requiresManualCode &&
                                !(c.isWelcome && user?.hasOrderedBefore)
                            );

                            return availableCoupons.length > 0 ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                                    {availableCoupons.map(c => (
                                        <Pressable 
                                            key={c.code}
                                            style={[styles.couponChip, activeCoupon?.code === c.code && { backgroundColor: businessProfile.primaryColor, borderColor: businessProfile.primaryColor }]}
                                            onPress={() => {
                                                if (activeCoupon?.code === c.code) {
                                                    setActiveCoupon(null);
                                                    setCouponInput('');
                                                } else {
                                                    onSelectCouponFromList(c);
                                                }
                                            }}
                                        >
                                            <FontAwesome name="tag" size={12} color={activeCoupon?.code === c.code ? '#fff' : '#64748b'} style={{ marginRight: 5 }} />
                                            <Text style={[styles.couponChipText, activeCoupon?.code === c.code && { color: '#fff' }]}>
                                                {c.code} (-{c.discountPercentage ? `${c.discountPercentage}%` : `${settings?.currency || '$'}${c.fixedDiscountAmount}`})
                                            </Text>
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            ) : (
                                <Text style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginBottom: 10 }}>No tenés cupones disponibles en este momento.</Text>
                            );
                        })()}

                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#64748b', marginBottom: 5 }}>¿Tenés otro código?</Text>
                        <View style={{ flexDirection: 'row' }}>
                            <TextInput
                                style={[styles.couponInput, { backgroundColor: '#fff' }]}
                                placeholder="Escribir..."
                                value={couponInput}
                                onChangeText={setCouponInput}
                            />
                            <Pressable style={styles.couponBtn} onPress={() => applyCoupon()}>
                                <Text style={styles.couponBtnText}>Aplicar</Text>
                            </Pressable>
                        </View>
                    </View>
                )}
            </View>

            {/* CUSTOM DIALOG MODAL */}
            <Modal visible={dialog.visible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Text style={styles.modalTitle}>{dialog.title}</Text>
                        {typeof dialog.message === 'string' ? (
                            <Text style={styles.modalMessage}>{dialog.message}</Text>
                        ) : (
                            dialog.message
                        )}
                        <View style={styles.modalActions}>
                            {dialog.buttons.map((btn, idx) => (
                                <Pressable
                                    key={idx}
                                    style={[styles.modalBtn, btn.style === 'cancel' ? styles.modalBtnCancel : { backgroundColor: businessProfile.primaryColor }]}
                                    onPress={btn.onPress}
                                >
                                    <Text style={[styles.modalBtnText, btn.style === 'cancel' && { color: '#333' }]}>{btn.text}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* SUMMARY CHECKOUT MODAL */}
            <Modal visible={showSummaryModal} animationType="slide" transparent={false}>
                <View style={[styles.container, { padding: 20 }]}>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: '#1a1a1a', marginBottom: 20, marginTop: 40 }}>Resumen Final</Text>
                    
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={{ backgroundColor: '#fff', padding: 15, borderRadius: 16, marginBottom: 15, elevation: 2 }}>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#555', marginBottom: 10 }}>PRODUCTOS</Text>
                            {cart.map((item, idx) => {
                                const pricing = getItemPricing(item, offers, settings?.isFoodBusiness);
                                const unit = item.product.unitType === 'unit' ? 'u.' : 'kg';
                                return (
                                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'flex-start' }}>
                                        <Text style={{ flex: 1, fontSize: 15, color: '#333', paddingRight: 8 }}>
                                            {item.quantity}{unit} {item.product.name}
                                        </Text>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={{ fontSize: 15, fontWeight: '800', color: '#111' }}>
                                                {settings?.currency || '$'}{pricing.totalPrice.toFixed(2)}
                                            </Text>
                                            {pricing.hasCashDiscount && (
                                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#16a34a', marginTop: 2 }}>
                                                    En efectivo: {settings?.currency || '$'}{pricing.cashTotalPrice.toFixed(2)}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                            <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 10 }} />
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{ fontSize: 16, color: '#666' }}>Subtotal</Text>
                                <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{settings?.currency || '$'}{subtotal.toFixed(2)}</Text>
                            </View>
                            {totalDiscount > 0 && (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontSize: 16, color: '#FF3B30', fontWeight: 'bold' }}>Ahorros aplicados</Text>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FF3B30' }}>-${totalDiscount.toFixed(2)}</Text>
                                </View>
                            )}
                            {selectedMethod === 'delivery' && (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontSize: 16, color: '#666' }}>Costo Envío</Text>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{deliveryCost > 0 ? `${settings?.currency || '$'}${deliveryCost.toFixed(2)}` : '¡Bonificado!'}</Text>
                                </View>
                            )}
                            {cashSubtotal < normalSubtotal ? (
                                <>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, alignItems: 'center' }}>
                                        <Text style={{ fontSize: 17, fontWeight: '800', color: '#64748b' }}>Total Otros Medios</Text>
                                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#475569' }}>
                                            {settings?.currency || '$'}{total.toFixed(2)}
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
                                        <Text style={{ fontSize: 22, fontWeight: '900', color: '#16a34a' }}>Total en Efectivo</Text>
                                        <Text style={{ fontSize: 22, fontWeight: '900', color: '#16a34a' }}>
                                            {settings?.currency || '$'}{(total - (normalSubtotal - cashSubtotal)).toFixed(2)}
                                        </Text>
                                    </View>
                                </>
                            ) : (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
                                    <Text style={{ fontSize: 22, fontWeight: '900', color: '#111' }}>Total a Pagar</Text>
                                    <Text style={{ fontSize: 22, fontWeight: '900', color: businessProfile.primaryColor || '#f97316' }}>{settings?.currency || '$'}{total.toFixed(2)}</Text>
                                </View>
                            )}
                        </View>

                        <View style={{ backgroundColor: '#fff', padding: 15, borderRadius: 16, elevation: 2, marginBottom: 30 }}>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#555', marginBottom: 15 }}>DATOS Y ENTREGA</Text>
                            
                            <View style={{ marginBottom: 10 }}>
                                <Text style={{ fontSize: 12, color: '#888', fontWeight: 'bold' }}>CLIENTE</Text>
                                <Text style={{ fontSize: 15, color: '#222' }}>{buyerName} - {buyerPhone}</Text>
                            </View>
                            
                            <View style={{ marginBottom: 10 }}>
                                <Text style={{ fontSize: 12, color: '#888', fontWeight: 'bold' }}>MÉTODO DE ENTREGA</Text>
                                <Text style={{ fontSize: 15, color: '#222', textTransform: 'capitalize' }}>
                                    {selectedMethod === 'delivery' ? `Envío: ${buyerAddress}` : `Retiro: ${settings.branches.find(b => b.id === selectedBranchId)?.name}`}
                                </Text>
                            </View>

                            <View style={{ marginBottom: 10 }}>
                                <Text style={{ fontSize: 12, color: '#888', fontWeight: 'bold' }}>FECHA Y HORA</Text>
                                <Text style={{ fontSize: 15, color: '#222' }}>
                                    {selectedDateObj ? (selectedDateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) + ((selectedMethod === 'delivery' ? settings.deliveryScheduling?.active : settings.pickupScheduling?.active) && selectedTime ? ' a las ' + selectedTime : '')) : 'Seleccionar...'}
                                </Text>
                            </View>

                            <View>
                                <Text style={{ fontSize: 12, color: '#888', fontWeight: 'bold' }}>PAGO</Text>
                                <Text style={{ fontSize: 15, color: '#222' }}>{selectedPaymentMethod}</Text>
                            </View>
                        </View>
                    </ScrollView>

                    <View style={{ paddingTop: 10, paddingBottom: 20, gap: 12 }}>
                        <Pressable 
                            style={[{ backgroundColor: '#10b981', padding: 18, borderRadius: 12, alignItems: 'center', shadowColor: '#10b981', shadowOffset: {height: 4, width: 0}, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 }, isSubmitting && { opacity: 0.6 }]} 
                            onPress={onConfirmData}
                            disabled={isSubmitting}
                        >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>
                                {isSubmitting ? 'PROCESANDO...' : (modifyingOrder ? 'CONFIRMAR MODIFICACIÓN' : 'CONFIRMAR PEDIDO')}
                            </Text>
                        </Pressable>
                        <Pressable 
                            style={[{ padding: 15, borderRadius: 12, alignItems: 'center', backgroundColor: '#e2e8f0' }, isSubmitting && { opacity: 0.6 }]} 
                            onPress={() => setShowSummaryModal(false)}
                            disabled={isSubmitting}
                        >
                            <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#475569' }}>
                                Atrás, quiero cambiar algo
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { justifyContent: 'center', alignItems: 'center', padding: 20 },
    header: { padding: 20, paddingTop: 40, backgroundColor: '#fff' },
    title: { fontSize: 28, fontWeight: '800', color: '#1a1a1a' },
    emptyText: { fontSize: 18, color: '#666', marginBottom: 20 },
    shopButton: { backgroundColor: '#FF3B30', padding: 15, borderRadius: 8 },
    shopButtonText: { color: '#fff', fontWeight: 'bold' },

    progressContainer: { backgroundColor: '#fff', marginHorizontal: 20, marginTop: 0, padding: 15, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
    progressText: { fontSize: 13, color: '#444', marginBottom: 10, textAlign: 'center' },
    bold: { fontWeight: 'bold', color: '#1a1a1a' },
    progressBarBg: { height: 8, backgroundColor: '#eee', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#34c759' },

    list: { padding: 20 },
    cartItem: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center', elevation: 1 },
    itemInfo: { flex: 1 },
    itemName: { fontSize: 16, fontWeight: 'bold' },
    itemPrice: { color: '#666', marginTop: 5 },
    quantityControls: { flexDirection: 'row', alignItems: 'center' },
    btn: { width: 30, height: 30, backgroundColor: '#f1f1f1', borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    btnText: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    qtyText: { marginHorizontal: 15, fontSize: 16, fontWeight: 'bold' },
    foodCartItem: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    foodCartItemImage: {
        width: 75,
        height: 75,
        borderRadius: 12,
        marginRight: 12,
    },
    foodCartItemInfo: {
        flex: 1,
        height: 75,
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    foodCartItemName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1e293b',
    },
    foodCartItemIngredients: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
    },
    foodCartItemPrice: {
        fontSize: 14,
        fontWeight: '700',
    },
    foodCartQuantityControls: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        paddingHorizontal: 2,
    },
    foodCartQtyBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#e2e8f0',
    },
    foodCartQtyBtnText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    foodCartQtyInput: {
        width: 28,
        height: 28,
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '700',
        color: '#1e293b',
        padding: 0,
    },
    foodConfirmBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 24,
        marginBottom: 20,
    },
    foodConfirmBtnPrice: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
        marginRight: 15,
    },
    foodConfirmDivider: {
        width: 1,
        height: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        marginRight: 15,
    },
    foodConfirmBtnText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },

    aiBox: { backgroundColor: '#f0f9ff', marginHorizontal: 20, marginBottom: 20, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#bae6fd' },
    aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
    aiTitle: { fontWeight: 'bold', color: '#0369a1', fontSize: 16 },
    aiText: { fontSize: 13, color: '#0c4a6e', marginBottom: 15 },
    aiProductRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, borderRadius: 8 },
    aiImage: { width: 40, height: 40, borderRadius: 6, marginRight: 10 },
    aiProductName: { fontWeight: '600', fontSize: 14, color: '#111' },
    aiProductPrice: { color: '#FF3B30', fontWeight: 'bold', fontSize: 13 },
    aiAddBtn: { backgroundColor: '#0284c7', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12 },
    aiAddBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

    checkoutSection: { padding: 20, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: 10, paddingBottom: 100 },
    couponSection: { flexDirection: 'row', marginBottom: 20 },
    couponInput: { flex: 1, backgroundColor: '#e9e9e9', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, marginRight: 10, color: '#111' },
    couponBtn: { backgroundColor: '#1a1a1a', padding: 12, borderRadius: 8, justifyContent: 'center' },
    couponBtnText: { color: '#fff', fontWeight: 'bold' },
    couponChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#cbd5e1', marginRight: 8 },
    couponChipText: { fontSize: 13, fontWeight: 'bold', color: '#334155' },

    guestNotice: { backgroundColor: '#FEF9C3', padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#FEF08A' },
    guestNoticeText: { color: '#854D0E', fontSize: 13, marginBottom: 5 },
    guestNoticeLink: { color: '#EAB308', fontWeight: 'bold', fontSize: 13, textDecorationLine: 'underline' },

    inputGroup: { marginBottom: 15 },
    label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 5 },
    textInput: { backgroundColor: '#e9e9e9', borderWidth: 1, borderColor: '#cbd5e1', padding: 12, borderRadius: 10, fontSize: 15, color: '#111' },

    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 15, color: '#333' },
    row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
    methodBtn: { flex: 1, minWidth: 120, padding: 15, borderWidth: 1, borderColor: '#eee', borderRadius: 12, alignItems: 'center' },
    methodBtnActive: { borderColor: '#FF3B30', backgroundColor: '#FFF5F5' },
    methodText: { color: '#666', fontWeight: '600' },
    methodTextActive: { color: '#FF3B30' },

    dateBtn: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, backgroundColor: '#f1f1f1', marginRight: 10 },
    dateBtnActive: { backgroundColor: '#1a1a1a' },
    dateText: { color: '#666', fontWeight: '600', textTransform: 'capitalize' },
    dateTextActive: { color: '#fff' },

    timeBtn: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, backgroundColor: '#f1f1f1', marginRight: 10 },
    timeBtnActive: { backgroundColor: '#1a1a1a' },
    timeText: { color: '#666', fontWeight: '600' },
    timeTextActive: { color: '#fff' },

    noDatesText: { color: '#cf2e2e', fontStyle: 'italic', marginBottom: 20 },

    summaryBox: { backgroundColor: '#f8f9fa', padding: 15, borderRadius: 12, marginTop: 10 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    summaryLabel: { color: '#666' },
    summaryVal: { fontWeight: '600', color: '#111' },

    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 25 },
    totalLabel: { fontSize: 18, fontWeight: '600', color: '#666' },
    totalAmount: { fontSize: 28, fontWeight: '800', color: '#1a1a1a' },
    checkoutBtn: { backgroundColor: '#10b981', padding: 16, borderRadius: 12, alignItems: 'center' },
    checkoutBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 350, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 10, textAlign: 'center' },
    modalMessage: { fontSize: 14, color: '#444', marginBottom: 20, textAlign: 'center', lineHeight: 22 },
    modalActions: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
    modalBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, minWidth: 100, alignItems: 'center' },
    modalBtnCancel: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
    modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

    successIconBox: { width: 140, height: 140, borderRadius: 70, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    successTitle: { fontSize: 28, fontWeight: 'bold', color: '#1e293b', marginBottom: 10, textAlign: 'center' },
    successSubtitle: { fontSize: 16, color: '#64748b', textAlign: 'center', marginBottom: 10, paddingHorizontal: 20 },
    successHint: { fontSize: 14, color: '#94a3b8', textAlign: 'center' }
});


