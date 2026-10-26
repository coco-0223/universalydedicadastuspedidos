import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, Alert, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { useAppContext } from '../../src/context/AppContext';
import { Coupon, Milestone, MilestoneGroup, Raffle, RafflePrize } from '../../src/types';
import { saveBusinessSettings, saveNotificationToFirebase } from '../../src/services/businessService';
import { FontAwesome } from '@expo/vector-icons';
import { DatePickerModal } from '../../src/components/DatePickerModal';

export default function BusinessMarketingScreen() {
    const { settings, setSettings, businessProfile, user } = useAppContext();
    const { width } = useWindowDimensions();
    const [isSaving, setIsSaving] = useState(false);
    
    
    // Flash Offer
    const [flashActive, setFlashActive] = useState(settings.flashOffer?.active ?? false);
    const [flashDiscount, setFlashDiscount] = useState((settings.flashOffer?.discountPercentage ?? 10).toString());
    const [flashDuration, setFlashDuration] = useState((settings.flashOffer?.durationMinutes ?? 15).toString());
    const [flashTitle, setFlashTitle] = useState(settings.flashOffer?.title ?? '¡Oferta Relámpago!');
    const [flashMessage, setFlashMessage] = useState(settings.flashOffer?.message ?? 'Llevate un descuento exclusivo si confirmás tu pedido en los próximos minutos.');

    // Carniketing Pro States
    const [pushTitle, setPushTitle] = useState('');
    const [pushBody, setPushBody] = useState('');
    const [pushActionType, setPushActionType] = useState<'catalog' | 'coupon'>('catalog');
    const [pushCoupon, setPushCoupon] = useState('');
    const [isSendingPush, setIsSendingPush] = useState(false);
    const isDesktop = width > 900;

    // Marketing Modules
    const [milestonesActive, setMilestonesActive] = useState(settings.marketingModules?.milestonesActive ?? false);
    const [aiUpsellActive, setAiUpsellActive] = useState(settings.marketingModules?.aiUpsellActive ?? false);
    const [volumeUpsellActive, setVolumeUpsellActive] = useState(settings.marketingModules?.volumeUpsellActive ?? false);
    const [couponsActive, setCouponsActive] = useState(settings.marketingModules?.couponsActive ?? false);
    const [rafflesActive, setRafflesActive] = useState(settings.marketingModules?.rafflesActive ?? false);
    
    // Loyalty Points
    const [pointsActive, setPointsActive] = useState(settings.loyaltyPoints?.active ?? false);
    const [pointsSpendAmount, setPointsSpendAmount] = useState(settings.loyaltyPoints?.spendAmount?.toString() || '10000');
    const [pointsCashbackAmount, setPointsCashbackAmount] = useState(settings.loyaltyPoints?.cashbackAmount?.toString() || '350');
    const [pointsCashbackPercent, setPointsCashbackPercent] = useState(() => {
        const spend = settings.loyaltyPoints?.spendAmount || 10000;
        const cash = settings.loyaltyPoints?.cashbackAmount || 350;
        return ((cash / spend) * 100).toString();
    });
    const [testSpendAmount, setTestSpendAmount] = useState('');

    const [raffles, setRaffles] = useState<Raffle[]>(settings.raffles || []);

    // Push Re-engagement
    const [pushReActive, setPushReActive] = useState(settings.pushReengagement?.active ?? false);
    const [pushReDays, setPushReDays] = useState(settings.pushReengagement?.daysInactive?.toString() || '15');
    const [pushReDiscount, setPushReDiscount] = useState(settings.pushReengagement?.discountPercentage?.toString() || '10');

    // Guest Policies
    const [guestAllowPurchases, setGuestAllowPurchases] = useState(settings.guestCheckout?.allowPurchases ?? true);
    const [guestAllowCoupons, setGuestAllowCoupons] = useState(settings.guestCheckout?.allowCoupons ?? false);
    const [guestAllowMilestones, setGuestAllowMilestones] = useState(settings.guestCheckout?.allowMilestones ?? false);

    const [milestoneGroups, setMilestoneGroups] = useState<MilestoneGroup[]>(settings.milestoneGroups || []);
    const [coupons, setCoupons] = useState<Coupon[]>(settings.coupons);

    const [showSuccess, setShowSuccess] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const [datePickerState, setDatePickerState] = useState<{ visible: boolean, target: 'coupon' | 'raffleStart' | 'raffleEnd' | null, index: number, currentStr?: string }>({ visible: false, target: null, index: -1 });

    const openDatePicker = (target: 'coupon' | 'raffleStart' | 'raffleEnd', index: number, currentStr?: string) => {
        setDatePickerState({ visible: true, target, index, currentStr });
    };

    const handleDateSelect = (date: Date) => {
        if (datePickerState.target === 'coupon') {
            updateCouponStr(datePickerState.index, 'expirationDate', date.toISOString());
        } else if (datePickerState.target === 'raffleStart') {
            updateRaffleStr(datePickerState.index, 'drawStartDate', date.toISOString());
        } else if (datePickerState.target === 'raffleEnd') {
            updateRaffleStr(datePickerState.index, 'drawEndDate', date.toISOString());
        }
    };

    const renderDateStr = (isoStr?: string) => {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getFullYear()}`;
    };

    useEffect(() => {
        setMilestonesActive(settings.marketingModules?.milestonesActive ?? false);
        setAiUpsellActive(settings.marketingModules?.aiUpsellActive ?? false);
        setVolumeUpsellActive(settings.marketingModules?.volumeUpsellActive ?? false);
        setCouponsActive(settings.marketingModules?.couponsActive ?? false);
        setRafflesActive(settings.marketingModules?.rafflesActive ?? false);
        setPointsActive(settings.loyaltyPoints?.active ?? false);
        setPointsSpendAmount(settings.loyaltyPoints?.spendAmount?.toString() || '10000');
        setPointsCashbackAmount(settings.loyaltyPoints?.cashbackAmount?.toString() || '350');
        setRaffles(settings.raffles || []);
        setPushReActive(settings.pushReengagement?.active ?? false);
        setPushReDays(settings.pushReengagement?.daysInactive?.toString() || '15');
        setPushReDiscount(settings.pushReengagement?.discountPercentage?.toString() || '10');
        setGuestAllowPurchases(settings.guestCheckout?.allowPurchases ?? true);
        setGuestAllowCoupons(settings.guestCheckout?.allowCoupons ?? false);
        setGuestAllowMilestones(settings.guestCheckout?.allowMilestones ?? false);
        setMilestoneGroups(settings.milestoneGroups || []);
        setCoupons(settings.coupons);
    }, [settings]);

    const handleSpendAmountChange = (val: string) => {
        setPointsSpendAmount(val);
        const spend = parseFloat(val) || 0;
        const pct = parseFloat(pointsCashbackPercent) || 0;
        setPointsCashbackAmount(((pct / 100) * spend).toString());
    };

    const handleCashbackAmountChange = (val: string) => {
        setPointsCashbackAmount(val);
        const amt = parseFloat(val) || 0;
        const spend = parseFloat(pointsSpendAmount) || 0;
        if (spend > 0) {
            setPointsCashbackPercent(((amt / spend) * 100).toString());
        }
    };

    const handleCashbackPercentChange = (val: string) => {
        setPointsCashbackPercent(val);
        const pct = parseFloat(val) || 0;
        const spend = parseFloat(pointsSpendAmount) || 0;
        setPointsCashbackAmount(((pct / 100) * spend).toString());
    };

    const isDirty = useMemo(() => {
        const spend = parseFloat(pointsSpendAmount) || 10000;
        const cashback = parseFloat(pointsCashbackAmount) || 350;
        const pointsAwarded = Math.floor(cashback / 3.6) || 1;
        const currentObj: any = {
            marketingModules: { milestonesActive, aiUpsellActive, volumeUpsellActive, couponsActive, rafflesActive },
            loyaltyPoints: { active: pointsActive, spendAmount: spend, cashbackAmount: cashback, spentForOnePoint: spend / pointsAwarded, valuePerPoint: cashback / pointsAwarded },
            pushReengagement: { active: pushReActive, daysInactive: parseInt(pushReDays) || 15, discountPercentage: parseFloat(pushReDiscount) || 10 },
            guestCheckout: { allowPurchases: guestAllowPurchases, allowCoupons: guestAllowCoupons, allowMilestones: guestAllowMilestones },
            milestoneGroups, coupons, raffles
        };
        const savedObj = {
            marketingModules: settings.marketingModules || { milestonesActive: false, aiUpsellActive: false, volumeUpsellActive: false, couponsActive: false, rafflesActive: false },
            loyaltyPoints: settings.loyaltyPoints || { active: false, spendAmount: 10000, cashbackAmount: 350, spentForOnePoint: 1000, valuePerPoint: 100 },
            pushReengagement: settings.pushReengagement || { active: false, daysInactive: 15, discountPercentage: 10 },
            guestCheckout: settings.guestCheckout || { allowPurchases: true, allowCoupons: false, allowMilestones: false },
            milestoneGroups: settings.milestoneGroups || [],
            coupons: settings.coupons,
            raffles: settings.raffles || []
        };
        currentObj.flashOffer = { active: flashActive, discountPercentage: parseInt(flashDiscount)||10, durationMinutes: parseInt(flashDuration)||15, title: flashTitle, message: flashMessage };
            return JSON.stringify(currentObj) !== JSON.stringify(savedObj);
    }, [milestonesActive, aiUpsellActive, volumeUpsellActive, couponsActive, rafflesActive, pointsActive, pointsSpendAmount, pointsCashbackAmount, pushReActive, pushReDays, pushReDiscount, guestAllowPurchases, guestAllowCoupons, guestAllowMilestones, milestoneGroups, coupons, raffles, settings]);

    const handleSave = async () => {
        if (!isDirty) return;
        setIsSaving(true);
        const spend = parseFloat(pointsSpendAmount) || 10000;
        const cashback = parseFloat(pointsCashbackAmount) || 350;
        const pointsAwarded = Math.floor(cashback / 3.6) || 1;
        const newSettings = {
                ...settings,
                flashOffer: {
                    active: flashActive,
                    discountPercentage: parseInt(flashDiscount) || 10,
                    durationMinutes: parseInt(flashDuration) || 15,
                    title: flashTitle,
                    message: flashMessage
                },
            ...settings,
            marketingModules: { milestonesActive, aiUpsellActive, volumeUpsellActive, couponsActive, rafflesActive },
            loyaltyPoints: { active: pointsActive, spendAmount: spend, cashbackAmount: cashback, spentForOnePoint: spend / pointsAwarded, valuePerPoint: cashback / pointsAwarded },
            pushReengagement: { active: pushReActive, daysInactive: parseInt(pushReDays) || 15, discountPercentage: parseFloat(pushReDiscount) || 10 },
            guestCheckout: { ...settings.guestCheckout, allowPurchases: guestAllowPurchases, allowCoupons: guestAllowCoupons, allowMilestones: guestAllowMilestones },
            milestoneGroups, coupons, raffles
        };
        try {
            await saveBusinessSettings(businessProfile.id, newSettings);
            setSettings(newSettings);
            setShowSuccess(true);
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.delay(2000),
                Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true })
            ]).start(() => setShowSuccess(false));
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "No se pudo guardar.");
        } finally {
            setIsSaving(false);
        }
    };

    const addMilestoneGroup = () => setMilestoneGroups([...milestoneGroups, { id: Date.now().toString(), name: 'Nuevos Beneficios', timeLimitDays: 30, milestones: [] }]);
    const removeMilestoneGroup = (idx: number) => setMilestoneGroups(milestoneGroups.filter((_, i) => i !== idx));
    const updateMilestoneGroupStr = (idx: number, field: keyof MilestoneGroup, val: string) => {
        const n = [...milestoneGroups]; n[idx] = { ...n[idx], [field]: val }; setMilestoneGroups(n);
    };
    const updateMilestoneGroupNum = (idx: number, field: keyof MilestoneGroup, val: string) => {
        const n = [...milestoneGroups]; n[idx] = { ...n[idx], [field]: parseFloat(val) || undefined }; setMilestoneGroups(n);
    };
    const addMilestoneToGroup = (gIdx: number) => {
        const n = [...milestoneGroups]; 
        n[gIdx].milestones.push({ 
            id: Date.now().toString(), 
            amountThreshold: 0, 
            discountPercentage: 0, 
            fixedDiscountAmount: 0,
            maxDiscountAmount: 0 
        }); 
        setMilestoneGroups(n);
    };
    const removeMilestoneFromGroup = (gIdx: number, mIdx: number) => {
        const n = [...milestoneGroups]; n[gIdx].milestones.splice(mIdx, 1); setMilestoneGroups(n);
    };
    const updateMilestoneNum = (gIdx: number, mIdx: number, field: keyof Milestone, val: string) => {
        const n = [...milestoneGroups]; n[gIdx].milestones[mIdx] = { ...n[gIdx].milestones[mIdx], [field]: parseFloat(val) || 0 }; setMilestoneGroups(n);
    };

    const addCoupon = () => setCoupons([...coupons, { code: 'NUEVO', discountPercentage: 0, maxDiscountAmount: 0, hasMaxDiscount: false, fixedDiscountAmount: 0, isWelcome: false, active: true, public: true, minOrderAmount: 0 }]);
    const updateCouponStr = (idx: number, field: 'code' | 'expirationDate', val: string) => {
        const n = [...coupons]; 
        if (field === 'expirationDate' && val === '') {
            delete n[idx].expirationDate;
        } else {
            n[idx][field] = val as any;
        }
        setCoupons(n);
    };
    const updateCouponNum = (idx: number, field: 'discountPercentage' | 'maxDiscountAmount' | 'fixedDiscountAmount' | 'minOrderAmount' | 'maxUsesPerClient', val: string) => {
        const n = [...coupons]; n[idx][field] = parseFloat(val) || 0; setCoupons(n);
    };
    const toggleCouponBool = (idx: number, field: 'isWelcome' | 'active' | 'public' | 'hasMaxDiscount' | 'showTimer' | 'requiresManualCode') => {
        const n = [...coupons]; 
        n[idx][field] = !n[idx][field]; 
        setCoupons(n);
    };
    const removeCoupon = (idx: number) => setCoupons(coupons.filter((_, i) => i !== idx));

    const addRaffle = () => {
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        setRaffles([...raffles, { id: Date.now().toString(), title: 'Nuevo Sorteo', description: '', drawStartDate: now.toISOString(), drawEndDate: nextWeek.toISOString(), redemptionDeadlineDays: 7, conditions: '', active: true, minOrderAmount: 0, maxWinners: 1, prizes: [] }]);
    };
    const updateRaffleStr = (idx: number, field: keyof Raffle, val: string) => {
        const n = [...raffles]; (n[idx] as any)[field] = val; setRaffles(n);
    };
    const updateRaffleNum = (idx: number, field: 'minOrderAmount' | 'maxWinners' | 'redemptionDeadlineDays', val: string) => {
        const n = [...raffles]; (n[idx] as any)[field] = parseFloat(val) || 0; setRaffles(n);
    };
    const toggleRaffleActive = (idx: number) => {
        const n = [...raffles]; n[idx].active = !n[idx].active; setRaffles(n);
    };
    const removeRaffle = (idx: number) => {
        setRaffles(raffles.filter((_, i) => i !== idx));
    };

    const updateRafflePointRuleNum = (idx: number, field: 'amountForOnePoint' | 'pointsPerOrder' | 'pointsForPickup' | 'pointsForDelivery', val: string) => {
        const n = [...raffles];
        if (!n[idx].pointRules) n[idx].pointRules = {};
        const parsed = parseFloat(val);
        n[idx].pointRules![field] = isNaN(parsed) ? undefined : parsed;
        setRaffles(n);
    };

    const toggleRaffleEligibleDay = (idx: number, day: number) => {
        const n = [...raffles];
        if (!n[idx].pointRules) n[idx].pointRules = {};
        const days = n[idx].pointRules!.eligibleDays || [0,1,2,3,4,5,6];
        if (days.includes(day)) {
            n[idx].pointRules!.eligibleDays = days.filter(d => d !== day);
        } else {
            n[idx].pointRules!.eligibleDays = [...days, day].sort();
        }
        setRaffles(n);
    };

    const toggleRaffleWelcomePopup = (idx: number) => {
        const n = [...raffles];
        n[idx].showWelcomePopup = !n[idx].showWelcomePopup;
        setRaffles(n);
    };

    const addRafflePrize = (idx: number) => {
        const n = [...raffles];
        if (!n[idx].prizes) n[idx].prizes = [];
        n[idx].prizes.push({ id: Date.now().toString(), type: 'text', description: 'Premio Nuevo', position: n[idx].prizes.length + 1 });
        setRaffles(n);
    };

    const removeRafflePrize = (rIdx: number, pIdx: number) => {
        const n = [...raffles];
        n[rIdx].prizes.splice(pIdx, 1);
        setRaffles(n);
    };

    const updateRafflePrizeStr = (rIdx: number, pIdx: number, field: keyof RafflePrize, val: string) => {
        const n = [...raffles];
        (n[rIdx].prizes[pIdx] as any)[field] = val;
        setRaffles(n);
    };

    const isCarniketing = user?.email === 'carniketing@gmail.com';

    const sendBroadcastNotification = async () => {
        if (!pushTitle.trim() || !pushBody.trim()) {
            Alert.alert('Falta Información', 'Por favor ingresá un título y un cuerpo para la notificación push.');
            return;
        }
        setIsSendingPush(true);
        try {
            const notifId = 'notif_' + Math.random().toString(36).substring(2, 9);
            const notif = {
                id: notifId,
                businessId: businessProfile.id,
                title: pushTitle.trim(),
                message: pushBody.trim(),
                createdAt: new Date().toISOString(),
                read: false,
                type: (pushActionType === 'coupon' ? 'coupon' : 'custom') as any,
                userId: 'all' as const,
                actionUrl: pushActionType === 'coupon' ? `/index?promo=${pushCoupon.trim().toUpperCase()}` : undefined
            };
            const ok = await saveNotificationToFirebase(businessProfile.id, notif);
            if (ok) {
                Alert.alert('¡Campaña Push Enviada!', 'La notificación se ha emitido como broadcast exitosamente.');
                setPushTitle('');
                setPushBody('');
                setPushCoupon('');
            } else {
                Alert.alert('Error', 'No se pudo registrar la campaña en Firestore.');
            }
        } catch (err) {
            console.error(err);
            Alert.alert('Error', 'Problema al procesar el envío de campaña.');
        } finally {
            setIsSendingPush(false);
        }
    };

    const generateBulkCoupons = () => {
        const bulk = [
            { code: 'CARNI10', discountPercentage: 10, maxDiscountAmount: 1500, hasMaxDiscount: true, fixedDiscountAmount: 0, isWelcome: false, active: true, public: true, minOrderAmount: 2000 },
            { code: 'PROMO20', discountPercentage: 20, maxDiscountAmount: 3000, hasMaxDiscount: true, fixedDiscountAmount: 0, isWelcome: false, active: true, public: true, minOrderAmount: 4000 },
            { code: 'BIENVENIDA', discountPercentage: 15, maxDiscountAmount: 1000, hasMaxDiscount: true, fixedDiscountAmount: 0, isWelcome: true, active: true, public: true, minOrderAmount: 0 },
            { code: 'DELIVERYGRATIS', discountPercentage: 0, maxDiscountAmount: 0, hasMaxDiscount: false, fixedDiscountAmount: 500, isWelcome: false, active: true, public: true, minOrderAmount: 1500 },
            { code: 'FINDE25', discountPercentage: 25, maxDiscountAmount: 5000, hasMaxDiscount: true, fixedDiscountAmount: 0, isWelcome: false, active: true, public: false, minOrderAmount: 6000 }
        ];
        const currentCodes = new Set(coupons.map(c => c.code.toUpperCase()));
        const toAdd = bulk.filter(b => !currentCodes.has(b.code));
        
        if (toAdd.length === 0) {
            Alert.alert('Aviso', 'Los cupones Pro ya se encuentran cargados en tu catálogo.');
            return;
        }

        setCoupons([...coupons, ...toAdd]);
        Alert.alert('¡Éxito!', `Se agregaron ${toAdd.length} cupones al catálogo. Hacé click en "Guardar Marketing" para confirmar.`);
    };

    return (
        <View style={styles.container}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>Marketing y Promociones</Text>
                </View>

                {isCarniketing && (
                    <View style={styles.proPanel}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 }}>
                            <FontAwesome name="trophy" size={24} color="#d97706" />
                            <Text style={styles.proTitle}>Panel de Control CarniKeting Pro 👑</Text>
                        </View>
                        
                        <View style={styles.grid}>
                            {/* Push notification simulator */}
                            <View style={[styles.card, { flex: 1, minWidth: 300, borderLeftWidth: 4, borderLeftColor: '#a855f7' }]}>
                                <Text style={styles.proCardTitle}>📢 Simulador de Campañas Push</Text>
                                <Text style={styles.proCardDesc}>Envía un aviso directo de inmediato a todos tus clientes registrados.</Text>
                                
                                <View style={{ gap: 10, marginTop: 10 }}>
                                    <View>
                                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#475569', marginBottom: 4 }}>Título:</Text>
                                        <TextInput 
                                            style={styles.proInput} 
                                            value={pushTitle} 
                                            onChangeText={setPushTitle} 
                                            placeholder="¡Ofertas imperdibles de hoy! 🥩"
                                        />
                                    </View>
                                    <View>
                                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#475569', marginBottom: 4 }}>Mensaje:</Text>
                                        <TextInput 
                                            style={[styles.proInput, { height: 60, textAlignVertical: 'top' }]} 
                                            value={pushBody} 
                                            onChangeText={setPushBody} 
                                            multiline
                                            placeholder="15% OFF llevando asado de tira..."
                                        />
                                    </View>
                                    <View>
                                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#475569', marginBottom: 4 }}>Acción al tocar:</Text>
                                        <View style={{ flexDirection: 'row', gap: 10, marginVertical: 5 }}>
                                            <Pressable 
                                                style={[styles.choiceBtn, pushActionType === 'catalog' && styles.choiceBtnActive]}
                                                onPress={() => setPushActionType('catalog')}
                                            >
                                                <Text style={[styles.choiceBtnText, pushActionType === 'catalog' && styles.choiceBtnTextActive]}>Ver Catálogo</Text>
                                            </Pressable>
                                            <Pressable 
                                                style={[styles.choiceBtn, pushActionType === 'coupon' && styles.choiceBtnActive]}
                                                onPress={() => setPushActionType('coupon')}
                                            >
                                                <Text style={[styles.choiceBtnText, pushActionType === 'coupon' && styles.choiceBtnTextActive]}>Canjear Cupón</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                    {pushActionType === 'coupon' && (
                                        <View>
                                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#475569', marginBottom: 4 }}>Código del Cupón:</Text>
                                            <TextInput 
                                                style={styles.proInput} 
                                                value={pushCoupon} 
                                                onChangeText={setPushCoupon} 
                                                placeholder="Ej: CARNI10"
                                            />
                                        </View>
                                    )}
                                    
                                    <Pressable 
                                        style={[styles.actionBtn, { backgroundColor: '#a855f7', marginTop: 10 }]} 
                                        onPress={sendBroadcastNotification}
                                        disabled={isSendingPush}
                                    >
                                        {isSendingPush ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <Text style={styles.saveBtnText}>⚡ Lanzar Notificación Broadcast</Text>
                                        )}
                                    </Pressable>
                                </View>
                            </View>

                            {/* One-click bulk coupons generator */}
                            <View style={[styles.card, { flex: 1, minWidth: 300, borderLeftWidth: 4, borderLeftColor: '#d97706' }]}>
                                <Text style={styles.proCardTitle}>🎟️ Generador de Cupones en Lote</Text>
                                <Text style={styles.proCardDesc}>Inyecta instantáneamente 5 cupones optimizados para marketing y remarketing.</Text>
                                
                                <View style={{ gap: 12, marginTop: 15 }}>
                                    <View style={{ backgroundColor: '#fffbeb', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fef3c7' }}>
                                        <Text style={{ fontSize: 12, color: '#b45309', fontWeight: 'bold' }}>🎁 Cupones a Generar:</Text>
                                        <Text style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>• CARNI10 (10% OFF, mín. $2000)</Text>
                                        <Text style={{ fontSize: 11, color: '#b45309' }}>• PROMO20 (20% OFF, mín. $4000)</Text>
                                        <Text style={{ fontSize: 11, color: '#b45309' }}>• BIENVENIDA (15% Mínimo de Bienvenida)</Text>
                                        <Text style={{ fontSize: 11, color: '#b45309' }}>• DELIVERYGRATIS ($500 Envíos de Bonificación)</Text>
                                        <Text style={{ fontSize: 11, color: '#b45309' }}>• FINDE25 (25% OFF, Cupón Oculto Mín. $6000)</Text>
                                    </View>
                                    
                                    <Pressable 
                                        style={[styles.actionBtn, { backgroundColor: '#d97706' }]} 
                                        onPress={generateBulkCoupons}
                                    >
                                        <Text style={styles.saveBtnText}>🎟️ Cargar 5 Cupones Especiales</Text>
                                    </Pressable>
                                </View>
                            </View>

                            {/* Simulated Analytics Stats */}
                            <View style={[styles.card, { flex: 1, minWidth: 300, borderLeftWidth: 4, borderLeftColor: '#10b981' }]}>
                                <Text style={styles.proCardTitle}>📈 Métricas Estimadas de Campañas</Text>
                                <Text style={styles.proCardDesc}>Rendimiento estimado de las herramientas Pro de fidelización.</Text>
                                
                                <View style={{ gap: 10, marginTop: 15 }}>
                                    <View style={styles.statRow}>
                                        <Text style={styles.statLabel}>Apertura de Push Notifs:</Text>
                                        <Text style={styles.statValue}>78.4% <Text style={{ color: '#10b981', fontSize: 12 }}>↑ 4.2%</Text></Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <Text style={styles.statLabel}>Uso del Programa de Puntos:</Text>
                                        <Text style={styles.statValue}>64.2% <Text style={{ color: '#10b981', fontSize: 12 }}>↑ 9.1%</Text></Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <Text style={styles.statLabel}>Conversión de Cupones:</Text>
                                        <Text style={styles.statValue}>12.8% <Text style={{ color: '#10b981', fontSize: 12 }}>↑ 1.5%</Text></Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <Text style={styles.statLabel}>Venta Extra Estimada:</Text>
                                        <Text style={[styles.statValue, { color: '#10b981' }]}>$145.200 <Text style={{ fontSize: 12 }}>↑ 8.3%</Text></Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                <View style={styles.grid}>
                    {/* CARD: MODULOS */}
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%' }]}>
                        <Text style={styles.cardTitle}>🚀 Módulos Activos</Text>
                        <View style={styles.row}><Text style={styles.label}>Hitos de Descuento</Text><Switch value={milestonesActive} onValueChange={setMilestonesActive} /></View>
                        <View style={styles.row}><Text style={styles.label}>IA Upselling</Text><Switch value={aiUpsellActive} onValueChange={setAiUpsellActive} /></View>
                        <View style={styles.row}><Text style={styles.label}>Upsell por Volumen</Text><Switch value={volumeUpsellActive} onValueChange={setVolumeUpsellActive} /></View>
                        <View style={styles.row}><Text style={styles.label}>Cupones</Text><Switch value={couponsActive} onValueChange={setCouponsActive} /></View>
                        <View style={styles.row}><Text style={styles.label}>Sorteos</Text><Switch value={rafflesActive} onValueChange={setRafflesActive} /></View>
                    </View>

                    {/* CARD: GUEST POLICIES */}
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%' }]}>
                        <Text style={styles.cardTitle}>👤 Invitados (Sin Registro)</Text>
                        <View style={styles.row}><Text style={styles.label}>Permitir compras</Text><Switch value={guestAllowPurchases} onValueChange={setGuestAllowPurchases} /></View>
                        <View style={styles.row}><Text style={styles.label}>Permitir cupones</Text><Switch disabled={!guestAllowPurchases} value={guestAllowCoupons} onValueChange={setGuestAllowCoupons} /></View>
                        <View style={styles.row}><Text style={styles.label}>Permitir hitos</Text><Switch disabled={!guestAllowPurchases} value={guestAllowMilestones} onValueChange={setGuestAllowMilestones} /></View>
                    </View>

                    {/* CARD: LOYALTY POINTS */}
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%', backgroundColor: '#fdf4ff' }]}>
                        <Text style={[styles.cardTitle, { color: '#86198f' }]}>⭐ Sistema de Puntos (Loyalty)</Text>
                        <View style={styles.row}>
                            <Text style={styles.label}>Activar Puntos</Text>
                            <Switch value={pointsActive} onValueChange={setPointsActive} />
                        </View>
                        {pointsActive && (
                            <View style={{ marginTop: 10 }}>
                                <View style={styles.row}>
                                    <Text style={styles.label}>Por dinero gastado ($):</Text>
                                    <TextInput style={styles.miniInput} value={pointsSpendAmount} onChangeText={handleSpendAmountChange} keyboardType="numeric" />
                                </View>
                                <View style={styles.row}>
                                    <Text style={styles.label}>Dinero que se reintegra ($):</Text>
                                    <TextInput style={styles.miniInput} value={pointsCashbackAmount} onChangeText={handleCashbackAmountChange} keyboardType="numeric" />
                                </View>
                                <View style={styles.row}>
                                    <Text style={styles.label}>% que se reintegra (%):</Text>
                                    <TextInput style={styles.miniInput} value={pointsCashbackPercent} onChangeText={handleCashbackPercentChange} keyboardType="numeric" />
                                </View>
                                <View style={{ backgroundColor: '#f3e8ff', padding: 10, borderRadius: 8, marginTop: 5 }}>
                                    <Text style={{ fontSize: 13, color: '#6b21a8' }}>
                                        💡 Por cada ${parseFloat(pointsSpendAmount) || 0} gastados, el cliente obtiene ${parseFloat(pointsCashbackAmount) || 0} de reintegro en puntos ({(Math.floor((parseFloat(pointsCashbackAmount) || 0) / 3.6))} puntos ganados).
                                    </Text>
                                </View>
                                
                                <View style={{ marginTop: 15, padding: 15, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                                    <Text style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: 10 }}>Probar función (Simulador de compra)</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <Text style={{ fontSize: 14, color: '#475569' }}>Si el cliente gasta $</Text>
                                        <TextInput 
                                            style={[styles.miniInput, { width: 100 }]} 
                                            value={testSpendAmount} 
                                            onChangeText={setTestSpendAmount} 
                                            keyboardType="numeric" 
                                            placeholder="Ej. 1500"
                                        />
                                    </View>
                                    {testSpendAmount !== '' && (
                                        <View style={{ marginTop: 10, padding: 10, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' }}>
                                            {(() => {
                                                const s = parseFloat(pointsSpendAmount) || 1;
                                                const c = parseFloat(pointsCashbackAmount) || 0;
                                                const ptsForS = Math.floor(c / 3.6) || 1;
                                                const t = parseFloat(testSpendAmount) || 0;
                                                const ptsEarned = Math.floor(t * (ptsForS / s));
                                                const cashbackEarned = (ptsEarned * 3.6).toFixed(2);
                                                return (
                                                    <Text style={{ fontSize: 14, color: '#0f172a' }}>
                                                        Ganará <Text style={{ fontWeight: 'bold', color: '#10b981' }}>{ptsEarned} puntos</Text>, que equivalen a un reintegro de <Text style={{ fontWeight: 'bold', color: '#10b981' }}>${cashbackEarned}</Text>.
                                                    </Text>
                                                );
                                            })()}
                                        </View>
                                    )}
                                </View>
                                
                                <Text style={{ fontSize: 11, color: '#86198f', marginTop: 10, fontStyle: 'italic' }}>
                                    *Los puntos se podrán gestionar en la pestaña de clientes.
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* CARD: PUSH RE-ENGAGEMENT */}
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%', backgroundColor: '#f0f9ff' }]}>
                        <Text style={[styles.cardTitle, { color: '#0369a1' }]}>🔔 Re-engagement Push</Text>
                        <View style={styles.row}><Text style={styles.label}>Activar automatización</Text><Switch value={pushReActive} onValueChange={setPushReActive} /></View>
                        {pushReActive && (
                            <View>
                                <Text style={styles.hint}>Se enviará un aviso a quienes no compran hace:</Text>
                                <View style={styles.row}><Text style={styles.label}>Días:</Text><TextInput style={styles.miniInput} value={pushReDays} onChangeText={setPushReDays} keyboardType="numeric" /></View>
                                <View style={styles.row}><Text style={styles.label}>% Off:</Text><TextInput style={styles.miniInput} value={pushReDiscount} onChangeText={setPushReDiscount} keyboardType="numeric" /></View>
                            </View>
                        )}
                    </View>

                    {/* CARD: CUPONES */}
                    <View style={[styles.card, { width: isDesktop ? '100%' : '100%' }]}>
                        <View style={styles.row}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={styles.cardTitle}>🎫 Cupones de Descuento</Text>
                                <Switch value={couponsActive} onValueChange={setCouponsActive} />
                            </View>
                            <Pressable style={styles.addBtn} onPress={addCoupon}><Text style={styles.addBtnText}>+ Crear Cupón</Text></Pressable>
                        </View>
                        <View style={styles.grid}>
                            {coupons.map((c, idx) => (
                                <View key={idx} style={[styles.subCard, { width: isDesktop ? '31%' : '100%' }]}>
                                    <View style={styles.row}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                            <Switch value={c.active} onValueChange={() => toggleCouponBool(idx, 'active')} style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }} />
                                            <TextInput style={[styles.couponCode, { flex: 1 }]} value={c.code} onChangeText={v => updateCouponStr(idx, 'code', v)} />
                                        </View>
                                        <Pressable onPress={() => removeCoupon(idx)}><FontAwesome name="trash" size={16} color="#ef4444" /></Pressable>
                                    </View>
                                    <View style={styles.row}><Text style={styles.miniLabel}>% Off</Text><TextInput style={styles.miniInput} value={(c.discountPercentage || 0).toString()} onChangeText={v => updateCouponNum(idx, 'discountPercentage', v)} keyboardType="numeric" /></View>
                                    <View style={styles.row}><Text style={styles.miniLabel}>$ Fijo</Text><TextInput style={styles.miniInput} value={(c.fixedDiscountAmount || 0).toString()} onChangeText={v => updateCouponNum(idx, 'fixedDiscountAmount', v)} keyboardType="numeric" /></View>
                                    <View style={styles.row}>
                                        <Text style={styles.miniLabel}>Tope $</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                            <Switch 
                                                value={!!c.hasMaxDiscount} 
                                                onValueChange={() => toggleCouponBool(idx, 'hasMaxDiscount')} 
                                                style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                                            />
                                            {c.hasMaxDiscount && (
                                                <TextInput 
                                                    style={styles.miniInput} 
                                                    value={(c.maxDiscountAmount || 0).toString()} 
                                                    onChangeText={v => updateCouponNum(idx, 'maxDiscountAmount', v)} 
                                                    keyboardType="numeric" 
                                                />
                                            )}
                                        </View>
                                    </View>
                                    <View style={styles.row}><Text style={styles.miniLabel}>Min $</Text><TextInput style={styles.miniInput} value={(c.minOrderAmount || 0).toString()} onChangeText={v => updateCouponNum(idx, 'minOrderAmount', v)} keyboardType="numeric" /></View>
                                    <View style={styles.row}><Text style={styles.miniLabel}>Límite de usos</Text><TextInput style={styles.miniInput} value={(c.maxUsesPerClient || '').toString()} placeholder="Sin límite" onChangeText={v => updateCouponNum(idx, 'maxUsesPerClient', v)} keyboardType="numeric" /></View>
                                    <View style={styles.row}>
                                        <Text style={styles.miniLabel}>Expira el</Text>
                                        <Pressable onPress={() => openDatePicker('coupon', idx, c.expirationDate)} style={[styles.miniInput, { width: 100, justifyContent: 'center' }]}>
                                            <Text style={{ color: c.expirationDate ? '#000' : '#a1a1aa' }}>
                                                {c.expirationDate ? renderDateStr(c.expirationDate) : 'DD-MM-AAAA'}
                                            </Text>
                                        </Pressable>
                                        {c.expirationDate && (
                                            <Pressable onPress={() => updateCouponStr(idx, 'expirationDate', '')} style={{ marginLeft: 5 }}>
                                                <FontAwesome name="times-circle" size={16} color="#ef4444" />
                                            </Pressable>
                                        )}
                                    </View>
                                    <View style={styles.chipRow}>
                                        <Pressable style={[styles.chip, c.isWelcome && styles.chipActive]} onPress={() => toggleCouponBool(idx, 'isWelcome')}>
                                            <Text style={[styles.chipText, c.isWelcome && styles.chipTextActive]}>{c.isWelcome ? 'Solo 1ra vez' : 'Cualquier compra'}</Text>
                                        </Pressable>
                                        <Pressable style={[styles.chip, c.public && styles.chipActive]} onPress={() => toggleCouponBool(idx, 'public')}>
                                            <Text style={[styles.chipText, c.public && styles.chipTextActive]}>{c.public ? 'Visible' : 'Oculto'}</Text>
                                        </Pressable>
                                        <Pressable style={[styles.chip, c.requiresManualCode && styles.chipActive]} onPress={() => toggleCouponBool(idx, 'requiresManualCode')}>
                                            <Text style={[styles.chipText, c.requiresManualCode && styles.chipTextActive]}>{c.requiresManualCode ? 'Solo por código' : 'Auto-aplica / Lista'}</Text>
                                        </Pressable>
                                        {c.expirationDate && (
                                            <Pressable style={[styles.chip, c.showTimer && styles.chipActive]} onPress={() => toggleCouponBool(idx, 'showTimer')}>
                                                <Text style={[styles.chipText, c.showTimer && styles.chipTextActive]}>{c.showTimer ? 'Con Reloj' : 'Sin Reloj'}</Text>
                                            </Pressable>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* CARD: HITOS (FIDELIDAD) */}
                    <View style={[styles.card, { width: '100%', backgroundColor: '#f8fafc' }]}>
                        <View style={styles.row}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={styles.cardTitle}>🏅 Fidelidad e Hitos de Gasto</Text>
                                <Switch value={milestonesActive} onValueChange={setMilestonesActive} />
                            </View>
                            <Pressable style={styles.addBtn} onPress={addMilestoneGroup}><Text style={styles.addBtnText}>+ Nuevo Conjunto</Text></Pressable>
                        </View>
                        {milestoneGroups.map((g, gIdx) => (
                            <View key={g.id} style={styles.groupItem}>
                                <View style={styles.row}>
                                    <TextInput style={styles.groupName} value={g.name} onChangeText={v => updateMilestoneGroupStr(gIdx, 'name', v)} />
                                    <Pressable onPress={() => removeMilestoneGroup(gIdx)}><FontAwesome name="trash" size={16} color="#ef4444" /></Pressable>
                                </View>
                                <View style={styles.row}>
                                    <Text style={styles.label}>Límite días:</Text>
                                    <TextInput style={styles.miniInput} value={g.timeLimitDays?.toString()} onChangeText={v => updateMilestoneGroupNum(gIdx, 'timeLimitDays', v)} keyboardType="numeric" />
                                </View>
                                {g.milestones.map((m, mIdx) => (
                                    <View key={m.id} style={[styles.milestoneRow, { flexWrap: 'wrap' }]}>
                                        <View style={styles.miniInputRow}>
                                            <Text style={styles.miniLabel}>Gasto &gt; $</Text>
                                            <TextInput style={styles.miniInput} value={(m.amountThreshold || 0).toString()} onChangeText={v => updateMilestoneNum(gIdx, mIdx, 'amountThreshold', v)} keyboardType="numeric" />
                                        </View>
                                        <View style={styles.miniInputRow}>
                                            <Text style={styles.miniLabel}>Premio %</Text>
                                            <TextInput style={styles.miniInput} value={(m.discountPercentage || 0).toString()} onChangeText={v => updateMilestoneNum(gIdx, mIdx, 'discountPercentage', v)} keyboardType="numeric" />
                                        </View>
                                        <View style={styles.miniInputRow}>
                                            <Text style={styles.miniLabel}>$ Fijo</Text>
                                            <TextInput style={styles.miniInput} value={(m.fixedDiscountAmount || 0).toString()} onChangeText={v => updateMilestoneNum(gIdx, mIdx, 'fixedDiscountAmount', v)} keyboardType="numeric" />
                                        </View>
                                        <View style={styles.miniInputRow}>
                                            <Text style={styles.miniLabel}>Tope $</Text>
                                            <TextInput style={styles.miniInput} value={(m.maxDiscountAmount || 0).toString()} onChangeText={v => updateMilestoneNum(gIdx, mIdx, 'maxDiscountAmount', v)} keyboardType="numeric" />
                                        </View>
                                        <Pressable onPress={() => removeMilestoneFromGroup(gIdx, mIdx)} style={{ marginLeft: 'auto' }}>
                                            <FontAwesome name="trash" size={16} color="#ef4444" />
                                        </Pressable>
                                    </View>
                                ))}
                                <Pressable style={styles.addLink} onPress={() => addMilestoneToGroup(gIdx)}><Text style={styles.addLinkText}>+ Añadir Meta</Text></Pressable>
                            </View>
                        ))}
                    </View>

                    {/* CARD: SORTEOS */}
                    <View style={[styles.card, { width: '100%', backgroundColor: '#f0fdfa' }]}>
                        <View style={styles.row}>
                            <Text style={[styles.cardTitle, { color: '#0f766e' }]}>🎁 Sorteos Activos</Text>
                            <Pressable style={[styles.addBtn, { backgroundColor: '#0f766e' }]} onPress={addRaffle}><Text style={styles.addBtnText}>+ Crear Sorteo</Text></Pressable>
                        </View>
                        {raffles.map((r, idx) => (
                            <View key={r.id} style={styles.groupItem}>
                                <View style={styles.row}>
                                    <TextInput style={styles.groupName} value={r.title} onChangeText={v => updateRaffleStr(idx, 'title', v)} />
                                    <Switch value={r.active} onValueChange={() => toggleRaffleActive(idx)} />
                                    <Pressable onPress={() => removeRaffle(idx)}><FontAwesome name="trash" size={16} color="#ef4444" /></Pressable>
                                </View>
                                <TextInput style={styles.fullInput} value={r.description} onChangeText={v => updateRaffleStr(idx, 'description', v)} placeholder="Descripción..." />
                                <View style={styles.row}>
                                    <View style={{flex:1}}>
                                        <Text style={styles.miniLabel}>Inicio</Text>
                                        <Pressable onPress={() => openDatePicker('raffleStart', idx, r.drawStartDate)} style={[styles.miniInput, { justifyContent: 'center' }]}>
                                            <Text style={{ color: '#000' }}>{renderDateStr(r.drawStartDate)}</Text>
                                        </Pressable>
                                    </View>
                                    <View style={{flex:1}}>
                                        <Text style={styles.miniLabel}>Sorteo</Text>
                                        <Pressable onPress={() => openDatePicker('raffleEnd', idx, r.drawEndDate)} style={[styles.miniInput, { justifyContent: 'center' }]}>
                                            <Text style={{ color: '#000' }}>{renderDateStr(r.drawEndDate)}</Text>
                                        </Pressable>
                                    </View>
                                    <View style={{flex:1}}><Text style={styles.miniLabel}>Min $</Text><TextInput style={styles.miniInput} value={(r.minOrderAmount || 0).toString()} onChangeText={v => updateRaffleNum(idx, 'minOrderAmount', v)} keyboardType="numeric" /></View>
                                </View>
                                <View style={styles.row}>
                                    <Text style={styles.miniLabel}>Popup de Bienvenida</Text>
                                    <Switch value={!!r.showWelcomePopup} onValueChange={() => toggleRaffleWelcomePopup(idx)} />
                                </View>
                                <Text style={[styles.miniLabel, { marginTop: 10, marginBottom: 5, color: '#0f766e' }]}>🎯 Reglas de Participación (Chances):</Text>
                                <View style={styles.row}>
                                    <Text style={styles.miniLabel}>Por cada $</Text>
                                    <TextInput style={styles.miniInput} value={(r.pointRules?.amountForOnePoint || '').toString()} placeholder="Ej. 1000" onChangeText={v => updateRafflePointRuleNum(idx, 'amountForOnePoint', v)} keyboardType="numeric" />
                                    <Text style={styles.miniLabel}>= 1 chance</Text>
                                </View>
                                <View style={styles.row}>
                                    <Text style={styles.miniLabel}>Por realizar un pedido</Text>
                                    <TextInput style={styles.miniInput} value={(r.pointRules?.pointsPerOrder || '').toString()} placeholder="Ej. 1" onChangeText={v => updateRafflePointRuleNum(idx, 'pointsPerOrder', v)} keyboardType="numeric" />
                                    <Text style={styles.miniLabel}>chance(s)</Text>
                                </View>
                                <View style={styles.row}>
                                    <Text style={styles.miniLabel}>Extras por Retiro</Text>
                                    <TextInput style={styles.miniInput} value={(r.pointRules?.pointsForPickup || '').toString()} placeholder="Ej. 1" onChangeText={v => updateRafflePointRuleNum(idx, 'pointsForPickup', v)} keyboardType="numeric" />
                                    <Text style={styles.miniLabel}>chance(s)</Text>
                                </View>
                                <View style={styles.row}>
                                    <Text style={styles.miniLabel}>Extras por Envío</Text>
                                    <TextInput style={styles.miniInput} value={(r.pointRules?.pointsForDelivery || '').toString()} placeholder="Ej. 1" onChangeText={v => updateRafflePointRuleNum(idx, 'pointsForDelivery', v)} keyboardType="numeric" />
                                    <Text style={styles.miniLabel}>chance(s)</Text>
                                </View>
                                <Text style={[styles.miniLabel, { marginTop: 10 }]}>Días válidos para sumar chances:</Text>
                                <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                                    {['D','L','M','X','J','V','S'].map((dayName, dayIdx) => (
                                        <Pressable key={dayIdx} style={[styles.chip, (r.pointRules?.eligibleDays || [0,1,2,3,4,5,6]).includes(dayIdx) && styles.chipActive, { paddingHorizontal: 15 }]} onPress={() => toggleRaffleEligibleDay(idx, dayIdx)}>
                                            <Text style={[styles.chipText, (r.pointRules?.eligibleDays || [0,1,2,3,4,5,6]).includes(dayIdx) && styles.chipTextActive]}>{dayName}</Text>
                                        </Pressable>
                                    ))}
                                </View>

                                <Text style={[styles.miniLabel, { marginTop: 10, marginBottom: 5 }]}>Premios:</Text>
                                {(r.prizes || []).map((p, pIdx) => (
                                    <View key={p.id} style={{ backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 5, borderWidth: 1, borderColor: '#e2e8f0' }}>
                                        <View style={styles.row}>
                                            <Text style={styles.miniLabel}>Premio #{p.position}</Text>
                                            <Pressable onPress={() => removeRafflePrize(idx, pIdx)}><FontAwesome name="trash" size={16} color="#ef4444" /></Pressable>
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginVertical: 5 }}>
                                            {['text', 'cash', 'percent_discount', 'fixed_discount', 'item'].map(pt => (
                                                <Pressable key={pt} style={[styles.chip, p.type === pt && styles.chipActive]} onPress={() => updateRafflePrizeStr(idx, pIdx, 'type', pt)}>
                                                    <Text style={[styles.chipText, p.type === pt && styles.chipTextActive]}>
                                                        {pt === 'text' ? 'Texto' : pt === 'cash' ? 'Efectivo' : pt === 'percent_discount' ? '% Desc' : pt === 'fixed_discount' ? '$ Fijo' : 'Producto'}
                                                    </Text>
                                                </Pressable>
                                            ))}
                                        </View>
                                        <TextInput style={styles.fullInput} value={p.description} onChangeText={v => updateRafflePrizeStr(idx, pIdx, 'description', v)} placeholder="Descripción del premio..." />
                                        {['cash', 'percent_discount', 'fixed_discount'].includes(p.type) && (
                                            <View style={styles.row}>
                                                <Text style={styles.miniLabel}>Valor (Monto/%):</Text>
                                                <TextInput style={styles.miniInput} value={(p.value || '').toString()} onChangeText={v => {
                                                    const n = [...raffles]; n[idx].prizes[pIdx].value = parseFloat(v); setRaffles(n);
                                                }} keyboardType="numeric" />
                                            </View>
                                        )}
                                    </View>
                                ))}
                                <Pressable style={styles.addLink} onPress={() => addRafflePrize(idx)}><Text style={styles.addLinkText}>+ Añadir Premio</Text></Pressable>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            <View style={styles.footer}>
                <Pressable style={[styles.saveBtn, (!isDirty || isSaving) && styles.saveBtnDisabled]} onPress={handleSave} disabled={!isDirty || isSaving}>
                    {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar Marketing</Text>}
                </Pressable>
            </View>

            <DatePickerModal 
                visible={datePickerState.visible} 
                initialDate={datePickerState.currentStr ? new Date(datePickerState.currentStr) : new Date()}
                onSelect={handleDateSelect} 
                onClose={() => setDatePickerState({ ...datePickerState, visible: false })} 
            />

            {showSuccess && (
                <Animated.View style={[styles.toast, { opacity: fadeAnim }]}>
                    <Text style={styles.toastText}>✅ Marketing Actualizado</Text>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f1f5f9' },
    scrollView: { flex: 1 },
    scrollContent: { padding: 20 },
    header: { marginBottom: 25 },
    title: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 20 },
    card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3, borderWidth: 1, borderColor: '#e2e8f0' },
    subCard: { backgroundColor: '#f8fafc', borderRadius: 15, padding: 15, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
    cardTitle: { fontSize: 18, fontWeight: '700', color: '#334155', marginBottom: 15 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    label: { fontSize: 14, fontWeight: '600', color: '#475569' },
    miniLabel: { fontSize: 11, color: '#94a3b8', fontWeight: 'bold' },
    miniInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, width: 60, textAlign: 'center' },
    couponCode: { fontSize: 16, fontWeight: '900', color: '#1e293b', flex: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
    chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#f1f5f9' },
    chipActive: { backgroundColor: '#14b8a6' },
    chipText: { fontSize: 10, color: '#64748b', fontWeight: 'bold' },
    chipTextActive: { color: '#fff' },
    addBtn: { backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
    groupItem: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
    groupName: { fontSize: 16, fontWeight: '700', color: '#1e293b', flex: 1 },
    milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, backgroundColor: '#f8fafc', padding: 8, borderRadius: 10, flexWrap: 'wrap' },
    miniInputRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    addLink: { marginTop: 10, alignSelf: 'flex-start' },
    addLinkText: { color: '#2563eb', fontWeight: 'bold', fontSize: 12 },
    fullInput: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 10 },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(255,255,255,0.9)', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
    saveBtn: { backgroundColor: '#14b8a6', padding: 16, borderRadius: 14, alignItems: 'center' },
    saveBtnDisabled: { backgroundColor: '#94a3b8' },
    saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    toast: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 30, elevation: 5 },
    toastText: { color: '#14b8a6', fontWeight: 'bold' },
    hint: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginBottom: 5 },
    proPanel: {
        marginBottom: 20,
        backgroundColor: '#faf5ff',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e9d5ff',
    },
    proTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#6b21a8',
    },
    proCardTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: 5,
    },
    proCardDesc: {
        fontSize: 11,
        color: '#64748b',
        marginBottom: 10,
    },
    proInput: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 6,
        padding: 8,
        fontSize: 12,
        color: '#0f172a',
    },
    choiceBtn: {
        flex: 1,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 6,
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    choiceBtnActive: {
        borderColor: '#a855f7',
        backgroundColor: '#faf5ff',
    },
    choiceBtnText: {
        fontSize: 11,
        color: '#475569',
        fontWeight: '600',
    },
    choiceBtnTextActive: {
        color: '#a855f7',
        fontWeight: '700',
    },
    actionBtn: {
        paddingVertical: 10,
        borderRadius: 6,
        alignItems: 'center',
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    statLabel: {
        fontSize: 12,
        color: '#475569',
    },
    statValue: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#0f172a',
    },
});

