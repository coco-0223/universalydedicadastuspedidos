import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, Alert, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { useAppContext } from '../../src/context/AppContext';
import { Branch, Coupon, Milestone, MilestoneGroup, Raffle } from '../../src/types';
import { saveBusinessSettings } from '../../src/services/businessService';
import { FontAwesome } from '@expo/vector-icons';
import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../../src/config/firebase';
import { IS_DEDICATED_APP } from '../../src/data/mockData';

export default function BusinessSettingsScreen() {
    const { settings, setSettings, businessProfile } = useAppContext();
    const { width } = useWindowDimensions();
    const [isSaving, setIsSaving] = useState(false);

    const isDesktop = width > 900;



    // Delivery & Pickup Status
    const [allowDelivery, setAllowDelivery] = useState(settings.allowDelivery);
    const [allowPickup, setAllowPickup] = useState(settings.allowPickup ?? true);

    const [nativeAppUrl, setNativeAppUrl] = useState(settings.nativeAppUrl || '');

    const [leadTimeHours, setLeadTimeHours] = useState(settings.leadTimeHours.toString());
    const [maxDaysInAdvance, setMaxDaysInAdvance] = useState(settings.maxDaysInAdvance.toString());
    const [slotInterval, setSlotInterval] = useState(settings.slotIntervalMinutes.toString());

    // Delivery Financials & Days
    const [standardCost, setStandardCost] = useState(settings.deliveryRules.standardCost.toString());
    const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(settings.deliveryRules.freeDeliveryThreshold.toString());
    const [deliveryDays, setDeliveryDays] = useState<number[]>(settings.deliveryRules.deliveryDays);

    // Manage branches array
    const [branches, setBranches] = useState<Branch[]>(settings.branches);

    // Configure Payment Methods
    const [paymentMethods, setPaymentMethods] = useState<string[]>(settings.paymentMethods || ['Efectivo']);
    const [newPaymentMethod, setNewPaymentMethod] = useState('');

    // Purchase restrictions
    const [purchaseRestricted, setPurchaseRestricted] = useState(settings.purchaseRestrictions?.active || false);
    const [showPricesWhenRestricted, setShowPricesWhenRestricted] = useState(settings.purchaseRestrictions?.showPricesWhenRestricted || false);
    const [restrictionSchedule, setRestrictionSchedule] = useState<Record<number, { startTime: string, endTime: string }[]>>(settings.purchaseRestrictions?.schedule || {0:[],1:[],2:[],3:[],4:[],5:[],6:[]});
    const [orderStatuses, setOrderStatuses] = useState(settings.orderStatuses || []);
    const [showOrderStatusToClients, setShowOrderStatusToClients] = useState(settings.displaySettings.showOrderStatusToClients ?? true);
    const [offersView, setOffersView] = useState(settings.displaySettings.offersView || 'cards');
    const [productsView, setProductsView] = useState(settings.displaySettings.productsView || 'list');
    const [showOfferDiscountPercentage, setShowOfferDiscountPercentage] = useState(settings.displaySettings.showOfferDiscountPercentage ?? true);
    const [showOffersOnTop, setShowOffersOnTop] = useState(settings.displaySettings.showOffersOnTop ?? true);
    const [expandedBranches, setExpandedBranches] = useState<string[]>([]);
    
    // Scheduling Controls
    const [deliveryScheduling, setDeliveryScheduling] = useState(settings.deliveryScheduling?.active ?? true);
    const [pickupScheduling, setPickupScheduling] = useState(settings.pickupScheduling?.active ?? true);
    const [disabledPickupBranches, setDisabledPickupBranches] = useState<string[]>(settings.pickupScheduling?.disabledBranches || []);

    const [currency, setCurrency] = useState(settings.currency || '$');
    const [isFoodBusiness, setIsFoodBusiness] = useState(settings.isFoodBusiness ?? false);

    const [showSuccess, setShowSuccess] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const [requestingWeb, setRequestingWeb] = useState(false);
    const [requestingApp, setRequestingApp] = useState(false);

    const handleRequest = async (type: 'web' | 'app') => {
        if (type === 'web') setRequestingWeb(true);
        else setRequestingApp(true);
        
        try {
            const ownerEmail = auth.currentUser?.email || '';
            await addDoc(collection(db, 'admin_requests'), {
                businessId: businessProfile.id,
                businessName: businessProfile.name,
                ownerEmail: ownerEmail,
                requestType: type,
                createdAt: new Date().toISOString(),
                status: 'pending'
            });
            Alert.alert("Solicitud Enviada", `Tu solicitud para tener tu propia ${type === 'web' ? 'página Web' : 'Aplicación de PlayStore'} fue registrada con éxito. Nos pondremos en contacto a la brevedad.`);
        } catch (err: any) {
            console.error("Error making admin request: ", err);
            Alert.alert("Error", "No se pudo procesar la solicitud en este momento. Intentalo de nuevo más tarde.");
        } finally {
            setRequestingWeb(false);
            setRequestingApp(false);
        }
    };

    useEffect(() => {
        setAllowDelivery(settings.allowDelivery);
        setAllowPickup(settings.allowPickup ?? true);
        setLeadTimeHours(settings.leadTimeHours.toString());
        setMaxDaysInAdvance(settings.maxDaysInAdvance.toString());
        setSlotInterval(settings.slotIntervalMinutes.toString());
        setStandardCost(settings.deliveryRules.standardCost.toString());
        setFreeDeliveryThreshold(settings.deliveryRules.freeDeliveryThreshold.toString());
        setDeliveryDays(settings.deliveryRules.deliveryDays);
        setBranches(settings.branches);
        setPaymentMethods(settings.paymentMethods || ['Efectivo']);
        setPurchaseRestricted(settings.purchaseRestrictions?.active || false);
        setShowPricesWhenRestricted(settings.purchaseRestrictions?.showPricesWhenRestricted || false);
        setRestrictionSchedule(settings.purchaseRestrictions?.schedule || {0:[],1:[],2:[],3:[],4:[],5:[],6:[]});
        setOrderStatuses(settings.orderStatuses || []);
        setShowOrderStatusToClients(settings.displaySettings.showOrderStatusToClients ?? true);
        setNativeAppUrl(settings.nativeAppUrl || '');
        setDeliveryScheduling(settings.deliveryScheduling?.active ?? true);
        setPickupScheduling(settings.pickupScheduling?.active ?? true);
        setDisabledPickupBranches(settings.pickupScheduling?.disabledBranches || []);
        setCurrency(settings.currency || '$');
        setIsFoodBusiness(settings.isFoodBusiness ?? false);
    }, [settings]);

    const isDirty = useMemo(() => {
        const currentObj = {
            allowDelivery,
            allowPickup,
            leadTimeHours: parseInt(leadTimeHours) || 0,
            maxDaysInAdvance: parseInt(maxDaysInAdvance) || 1,
            slotIntervalMinutes: parseInt(slotInterval) || 30,
            deliveryRules: {
                ...settings.deliveryRules,
                standardCost: parseFloat(standardCost) || 0,
                freeDeliveryThreshold: parseFloat(freeDeliveryThreshold) || 0,
                deliveryDays
            },
            paymentMethods,
            branches,
            purchaseRestrictions: {
                active: purchaseRestricted,
                showPricesWhenRestricted: showPricesWhenRestricted,
                schedule: restrictionSchedule
            },
            orderStatuses,
            displaySettings: {
                ...settings.displaySettings,
                offersView, productsView, showOfferDiscountPercentage, showOffersOnTop, showOrderStatusToClients
            },
            nativeAppUrl,
            deliveryScheduling: { active: deliveryScheduling },
            pickupScheduling: { active: pickupScheduling, disabledBranches: disabledPickupBranches },
            currency,
            isFoodBusiness
        };
        const savedObj = {
            allowDelivery: settings.allowDelivery ?? true,
            allowPickup: settings.allowPickup ?? true,
            leadTimeHours: settings.leadTimeHours ?? 2,
            maxDaysInAdvance: settings.maxDaysInAdvance ?? 7,
            slotIntervalMinutes: settings.slotIntervalMinutes ?? 30,
            deliveryRules: settings.deliveryRules || { standardCost: 0, freeDeliveryThreshold: 0, deliveryDays: [0, 1, 2, 3, 4, 5, 6] },
            purchaseRestrictions: settings.purchaseRestrictions || { active: false, showPricesWhenRestricted: true, schedule: {} },
            branches: settings.branches || [],
            paymentMethods: settings.paymentMethods || [],
            orderStatuses: settings.orderStatuses || [],
            displaySettings: settings.displaySettings || { offersView: 'cards', productsView: 'list', showOfferDiscountPercentage: true },
            nativeAppUrl: settings.nativeAppUrl || '',
            deliveryScheduling: settings.deliveryScheduling || { active: true },
            pickupScheduling: settings.pickupScheduling || { active: true, disabledBranches: [] },
            currency: settings.currency || '$',
            isFoodBusiness: settings.isFoodBusiness ?? false
        };
        return JSON.stringify(currentObj) !== JSON.stringify(savedObj);
    }, [
        allowDelivery, allowPickup, leadTimeHours, maxDaysInAdvance, slotInterval,
        standardCost, freeDeliveryThreshold, deliveryDays,
        purchaseRestricted, showPricesWhenRestricted, restrictionSchedule,
        branches, paymentMethods, orderStatuses,
        offersView, productsView, showOfferDiscountPercentage, showOffersOnTop, showOrderStatusToClients,
        nativeAppUrl, settings, currency, isFoodBusiness
    ]);

    const handleSave = async () => {
        if (!isDirty) return;
        setIsSaving(true);
        const newSettings = {
            ...settings,
            allowDelivery,
            allowPickup,
            leadTimeHours: parseInt(leadTimeHours) || 0,
            maxDaysInAdvance: parseInt(maxDaysInAdvance) || 1,
            slotIntervalMinutes: parseInt(slotInterval) || 30,
            deliveryRules: {
                ...settings.deliveryRules,
                standardCost: parseFloat(standardCost) || 0,
                freeDeliveryThreshold: parseFloat(freeDeliveryThreshold) || 0,
                deliveryDays
            },
            paymentMethods,
            branches: branches,
            purchaseRestrictions: {
                active: purchaseRestricted,
                showPricesWhenRestricted: showPricesWhenRestricted,
                schedule: restrictionSchedule
            },
            orderStatuses,
            displaySettings: {
                ...settings.displaySettings,
                offersView: offersView as 'cards' | 'list',
                productsView: productsView as 'cards' | 'list',
                showOfferDiscountPercentage,
                showOffersOnTop,
                showOrderStatusToClients
            },
            nativeAppUrl: nativeAppUrl.trim() || undefined,
            deliveryScheduling: { active: deliveryScheduling },
            pickupScheduling: { active: pickupScheduling, disabledBranches: disabledPickupBranches },
            currency,
            isFoodBusiness
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
            Alert.alert("Error de conexión", "No se pudo guardar.");
        } finally {
            setIsSaving(false);
        }
    };

    const toggleDeliveryDay = (day: number) => {
        setDeliveryDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
        );
    };

    const addRestrShift = (dayIndex: number) => {
        const newSched = { ...restrictionSchedule };
        const dayShifts = [...(newSched[dayIndex] || [])];
        dayShifts.push({ startTime: '00:00', endTime: '23:59' });
        newSched[dayIndex] = dayShifts;
        setRestrictionSchedule(newSched);
    };

    const removeRestrShift = (dayIndex: number, shiftIdx: number) => {
        const newSched = { ...restrictionSchedule };
        const dayShifts = [...(newSched[dayIndex] || [])];
        dayShifts.splice(shiftIdx, 1);
        newSched[dayIndex] = dayShifts;
        setRestrictionSchedule(newSched);
    };

    const updateRestrShiftTime = (dayIndex: number, shiftIdx: number, field: 'startTime' | 'endTime', val: string) => {
        const newSched = { ...restrictionSchedule };
        const dayShifts = [...(newSched[dayIndex] || [])];
        dayShifts[shiftIdx] = { ...dayShifts[shiftIdx], [field]: val };
        newSched[dayIndex] = dayShifts;
        setRestrictionSchedule(newSched);
    };

    const updateBranchString = (idx: number, field: keyof Branch, val: string) => {
        const newBranches = [...branches];
        newBranches[idx] = { ...newBranches[idx], [field]: val };
        setBranches(newBranches);
    };

    const addShift = (branchIdx: number, dayIndex: number) => {
        const newBranches = [...branches];
        const dayShifts = [...(newBranches[branchIdx].schedule[dayIndex] || [])];
        dayShifts.push({ openTime: '08:00', closeTime: '13:00' });
        newBranches[branchIdx].schedule[dayIndex] = dayShifts;
        setBranches(newBranches);
    };

    const removeShift = (branchIdx: number, dayIndex: number, shiftIdx: number) => {
        const newBranches = [...branches];
        const dayShifts = [...(newBranches[branchIdx].schedule[dayIndex] || [])];
        dayShifts.splice(shiftIdx, 1);
        newBranches[branchIdx].schedule[dayIndex] = dayShifts;
        setBranches(newBranches);
    };

    const updateShiftTime = (branchIdx: number, dayIndex: number, shiftIdx: number, field: 'openTime' | 'closeTime', val: string) => {
        const newBranches = [...branches];
        const dayShifts = [...(newBranches[branchIdx].schedule[dayIndex] || [])];
        dayShifts[shiftIdx] = { ...dayShifts[shiftIdx], [field]: val };
        newBranches[branchIdx].schedule[dayIndex] = dayShifts;
        setBranches(newBranches);
    };

    const addBranch = () => {
        const emptySchedule = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
        const createWithSchedule = (scheduleToUse: any) => {
            setBranches([...branches, {
                id: Date.now().toString(),
                name: 'Nueva Sucursal',
                address: '',
                phone: '',
                schedule: scheduleToUse
            }]);
        };
        if (branches.length > 0) {
            if (Platform.OS === 'web') {
                if (window.confirm("¿Querés copiar los horarios de tu sucursal principal?")) {
                    createWithSchedule(JSON.parse(JSON.stringify(branches[0].schedule)));
                } else {
                    createWithSchedule(emptySchedule);
                }
            } else {
                Alert.alert("Copiar Horarios", "¿Querés copiar los horarios?", [
                    { text: "No", onPress: () => createWithSchedule(emptySchedule) },
                    { text: "Sí", onPress: () => createWithSchedule(JSON.parse(JSON.stringify(branches[0].schedule))) }
                ]);
            }
        } else {
            createWithSchedule(emptySchedule);
        }
    };

    const removeBranch = (idx: number) => {
        if (Platform.OS === 'web') {
            if (window.confirm("¿Eliminar sucursal?")) setBranches(branches.filter((_, i) => i !== idx));
        } else {
            Alert.alert("Eliminar", "¿Eliminar sucursal?", [
                { text: "Cancelar" },
                { text: "Eliminar", onPress: () => setBranches(branches.filter((_, i) => i !== idx)) }
            ]);
        }
    };

    const addPaymentMethod = () => {
        if (newPaymentMethod.trim() && !paymentMethods.includes(newPaymentMethod.trim())) {
            setPaymentMethods([...paymentMethods, newPaymentMethod.trim()]);
            setNewPaymentMethod('');
        }
    };

    const removePaymentMethod = (idx: number) => setPaymentMethods(paymentMethods.filter((_, i) => i !== idx));
    const updatePaymentMethod = (idx: number, val: string) => {
        const newMethods = [...paymentMethods];
        newMethods[idx] = val;
        setPaymentMethods(newMethods);
    };

    const toggleBranchExpand = (id: string) => {
        setExpandedBranches(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const shareUrl = Platform.OS === 'web' ? `${window.location.origin}/?store=${businessProfile.id}` : `https://tuspedidos-listapp.vercel.app/?store=${businessProfile.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shareUrl)}`;
    
    // For Dedicated Native App (e.g. Rocío Carnicerías)
    const nativeAppQrUrl = nativeAppUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(nativeAppUrl)}` : null;

    return (
        <View style={styles.container}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>Centro de Control de Negocio</Text>
                </View>

                <View style={styles.grid}>
                    {/* CARD: COMPARTIR */}
                    {!IS_DEDICATED_APP && (
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%' }]}>
                        <Text style={styles.cardTitle}>📢 Compartir mi Negocio</Text>
                        <View style={styles.qrContainer}>
                            <Animated.Image source={{ uri: qrUrl }} style={styles.qrImage} />
                            <View style={{ flex: 1, paddingLeft: 15 }}>
                                <Text style={styles.qrLabel}>CÓDIGO QR PARA TU WEBAPP:</Text>
                                <Text style={styles.qrText}>Tus clientes pueden escanearlo para abrir la web directamente en su navegador.</Text>
                            </View>
                        </View>
                        <View style={styles.linkContainer}>
                            <Text style={styles.linkSub}>TU LINK DIRECTO (WEBAPP):</Text>
                            <TextInput style={styles.linkInput} value={shareUrl} editable={false} />
                            <Pressable style={styles.copyBtn} onPress={() => { if(Platform.OS==='web') navigator.clipboard.writeText(shareUrl); Alert.alert('Copiado', 'Link copiado.'); }}>
                                <Text style={styles.copyBtnText}>📋 Copiar Link</Text>
                            </Pressable>
                        </View>

                        <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 15 }} />
                        
                        <Text style={[styles.cardTitle, { marginBottom: 5 }]}>📱 Tu Web o App propia</Text>
                        <Text style={[styles.qrText, { marginBottom: 15, fontSize: 13, color: '#475569' }]}>
                            ¿Querés tu propia web o tu aplicación en PlayStore? Apretá este botón:
                        </Text>
                        
                        <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                            <Pressable 
                                style={({ pressed }) => [
                                    styles.reqBtn, 
                                    { backgroundColor: '#0284c7', flex: 1 },
                                    pressed && { opacity: 0.8 }
                                ]}
                                onPress={() => handleRequest('web')}
                                disabled={requestingWeb || requestingApp}
                            >
                                {requestingWeb ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <>
                                        <FontAwesome name="globe" size={16} color="#fff" style={{ marginRight: 8 }} />
                                        <Text style={styles.reqBtnText}>BOTON WEB</Text>
                                    </>
                                )}
                            </Pressable>
                            
                            <Pressable 
                                style={({ pressed }) => [
                                    styles.reqBtn, 
                                    { backgroundColor: '#10b981', flex: 1 },
                                    pressed && { opacity: 0.8 }
                                ]}
                                onPress={() => handleRequest('app')}
                                disabled={requestingWeb || requestingApp}
                            >
                                {requestingApp ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <>
                                        <FontAwesome name="android" size={16} color="#fff" style={{ marginRight: 8 }} />
                                        <Text style={styles.reqBtnText}>BOTON APP</Text>
                                    </>
                                )}
                            </Pressable>
                        </View>
                    </View>
                    )}

                    {/* BOTÓN DE MARKETING (Para todas excepto Rocio) */}
                    {businessProfile?.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && (
                        <View style={[styles.card, { width: isDesktop ? '49%' : '100%', backgroundColor: '#fdf4ff', borderColor: '#fbcfe8' }]}>
                            <Text style={[styles.cardTitle, { color: '#c026d3', marginBottom: 5 }]}>🚀 Potenciá tus ventas</Text>
                            <Text style={[styles.qrText, { marginBottom: 15, fontSize: 13, color: '#701a75' }]}>
                                Aumentá tu clientela y visibilidad solicitando nuestro servicio de Marketing Digital especializado para comercios.
                            </Text>
                            <Pressable 
                                style={({ pressed }) => [
                                    styles.reqBtn, 
                                    { backgroundColor: '#d946ef', width: '100%' },
                                    pressed && { opacity: 0.8 }
                                ]}
                                onPress={() => Alert.alert('Marketing', 'Solicitud de Marketing enviada a los administradores.')}
                            >
                                <FontAwesome name="bullhorn" size={16} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.reqBtnText}>SOLICITAR MARKETING</Text>
                            </Pressable>
                        </View>
                    )}

                    {/* CARD: BLOQUEO COMPRAS */}
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%', backgroundColor: '#fff1f2' }]}>
                        <Text style={[styles.cardTitle, { color: '#be123c' }]}>🚫 Bloqueo de Compras</Text>
                        <View style={styles.row}>
                            <Text style={styles.label}>Activar Bloqueo de Compras</Text>
                            <Switch trackColor={{ false: '#d1d5db', true: '#ef4444' }} value={purchaseRestricted} onValueChange={setPurchaseRestricted} />
                        </View>
                        {purchaseRestricted && (
                            <View style={{ marginTop: 10 }}>
                                <View style={styles.row}>
                                    <Text style={styles.label}>¿Mostrar precios?</Text>
                                    <Switch value={showPricesWhenRestricted} onValueChange={setShowPricesWhenRestricted} />
                                </View>
                                <Text style={styles.hint}>Horarios de prohibición definidos:</Text>
                                {dayNames.map((day, dIdx) => (
                                    <View key={dIdx} style={styles.miniSched}>
                                        <Text style={styles.miniDay}>{day}</Text>
                                        <Pressable style={styles.addShiftBtn} onPress={() => addRestrShift(dIdx)}>
                                            <Text style={styles.addShiftBtnText}>+ Bloquear</Text>
                                        </Pressable>
                                        {(restrictionSchedule[dIdx] || []).map((s, si) => (
                                            <View key={si} style={styles.shiftRow}>
                                                <TextInput style={styles.shiftInput} value={s.startTime} onChangeText={v => updateRestrShiftTime(dIdx, si, 'startTime', v)} />
                                                <Text>-</Text>
                                                <TextInput style={styles.shiftInput} value={s.endTime} onChangeText={v => updateRestrShiftTime(dIdx, si, 'endTime', v)} />
                                                <Pressable onPress={() => removeRestrShift(dIdx, si)}><FontAwesome name="times-circle" size={16} color="#ef4444" /></Pressable>
                                            </View>
                                        ))}
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* CARD: ESTRATEGIA ENVÍOS */}
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%' }]}>
                        <Text style={styles.cardTitle}>🚚 Estrategia de Envíos</Text>
                        <View style={styles.row}>
                            <Text style={styles.label}>Permitir Delivery</Text>
                            <Switch value={allowDelivery} onValueChange={setAllowDelivery} />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Costo Estándar ($):</Text>
                            <TextInput style={styles.fullInput} value={standardCost} onChangeText={setStandardCost} keyboardType="numeric" />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Envío Gratis desde ($):</Text>
                            <TextInput style={styles.fullInput} value={freeDeliveryThreshold} onChangeText={setFreeDeliveryThreshold} keyboardType="numeric" />
                        </View>
                        <Text style={styles.subTitle}>Días de Reparto:</Text>
                        <View style={styles.chipRow}>
                            {dayNames.map((d, i) => (
                                <Pressable key={i} style={[styles.chip, deliveryDays.includes(i) && styles.chipActive]} onPress={() => toggleDeliveryDay(i)}>
                                    <Text style={[styles.chipText, deliveryDays.includes(i) && styles.chipTextActive]}>{d}</Text>
                                </Pressable>
                            ))}
                        </View>
                        <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 15 }} />
                        <View style={styles.row}>
                            <View style={{ flex: 1, paddingRight: 10 }}>
                                <Text style={styles.label}>Elección de horario para Envíos</Text>
                                <Text style={styles.hint}>Si se desactiva, se pedirá el día pero no el horario exacto.</Text>
                            </View>
                            <Switch value={deliveryScheduling} onValueChange={setDeliveryScheduling} />
                        </View>
                    </View>

                    {/* CARD: ESTRATEGIA RETIRO */}
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%' }]}>
                        <Text style={styles.cardTitle}>🏪 Estrategia de Retiro</Text>
                        <View style={styles.row}>
                            <Text style={styles.label}>Permitir Retiro por Sucursal</Text>
                            <Switch value={allowPickup} onValueChange={setAllowPickup} />
                        </View>
                        {allowPickup && (
                            <>
                                <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 15 }} />
                                <View style={styles.row}>
                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                        <Text style={styles.label}>Elección de horario para Retiro</Text>
                                        <Text style={styles.hint}>Habilita que el cliente elija cuándo pasará.</Text>
                                    </View>
                                    <Switch value={pickupScheduling} onValueChange={setPickupScheduling} />
                                </View>
                                {pickupScheduling && (
                                    <View style={{ marginTop: 15, backgroundColor: '#f8fafc', padding: 12, borderRadius: 8 }}>
                                        <Text style={[styles.label, { fontSize: 13, color: '#64748b', marginBottom: 10 }]}>HORARIOS ACTIVOS POR SUCURSAL:</Text>
                                        {branches.map(b => (
                                            <View key={b.id} style={[styles.row, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }]}>
                                                <Text style={{ flex: 1, fontSize: 14 }}>{b.name || 'Sucursal sin nombre'}</Text>
                                                <Switch 
                                                    value={!disabledPickupBranches.includes(b.id)} 
                                                    onValueChange={(val) => {
                                                        if (val) setDisabledPickupBranches(prev => prev.filter(id => id !== b.id));
                                                        else setDisabledPickupBranches(prev => [...prev, b.id]);
                                                    }} 
                                                />
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </>
                        )}
                    </View>

                    {/* CARD: TIEMPOS Y SLOTS */}
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%' }]}>
                        <Text style={styles.cardTitle}>⏰ Antelación y Slots</Text>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Horas de preparación (antelación):</Text>
                            <TextInput style={styles.fullInput} value={leadTimeHours} onChangeText={setLeadTimeHours} keyboardType="numeric" />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Días permitidos a futuro:</Text>
                            <TextInput style={styles.fullInput} value={maxDaysInAdvance} onChangeText={setMaxDaysInAdvance} keyboardType="numeric" />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Intervalos de turnos (Minutos):</Text>
                            <TextInput style={styles.fullInput} value={slotInterval} onChangeText={setSlotInterval} keyboardType="numeric" />
                        </View>
                    </View>

                    {/* CARD: SUCURSALES (ANCHO COMPLETO) */}
                    <View style={[styles.card, { width: '100%', backgroundColor: '#f8fafc' }]}>
                        <View style={styles.row}>
                            <Text style={styles.cardTitle}>🏢 Sucursales y Horarios</Text>
                            <Pressable style={styles.addBtn} onPress={addBranch}>
                                <Text style={styles.addBtnText}>+ Añadir Sucursal</Text>
                            </Pressable>
                        </View>
                        {branches.map((b, bIdx) => {
                            const isExpanded = expandedBranches.includes(b.id);
                            return (
                                <View key={b.id} style={styles.branchItem}>
                                    <Pressable style={styles.branchHeader} onPress={() => toggleBranchExpand(b.id)}>
                                        <Text style={styles.branchName}>🏪 {b.name || 'Nueva Sucursal'}</Text>
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <FontAwesome name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#64748b" />
                                            <Pressable onPress={() => removeBranch(bIdx)}><FontAwesome name="trash" size={16} color="#ef4444" /></Pressable>
                                        </View>
                                    </Pressable>
                                    {isExpanded && (
                                        <View style={styles.branchContent}>
                                            <TextInput style={styles.fullInput} value={b.name} onChangeText={t => updateBranchString(bIdx, 'name', t)} placeholder="Nombre" />
                                            <TextInput style={styles.fullInput} value={b.address} onChangeText={t => updateBranchString(bIdx, 'address', t)} placeholder="Dirección" />
                                            <TextInput style={styles.fullInput} value={b.phone} onChangeText={t => updateBranchString(bIdx, 'phone', t)} placeholder="Teléfono" keyboardType="phone-pad" />
                                            <Text style={styles.subTitle}>Horarios de Operación:</Text>
                                            {dayNames.map((d, di) => (
                                                <View key={di} style={styles.miniSched}>
                                                    <Text style={styles.miniDay}>{d}</Text>
                                                    <Switch value={(b.schedule[di] || []).length > 0} onValueChange={v => v ? addShift(bIdx, di) : (()=>{const nb=[...branches]; nb[bIdx].schedule[di]=[]; setBranches(nb)})()} />
                                                    {(b.schedule[di] || []).length > 0 && (
                                                        <Pressable onPress={() => addShift(bIdx, di)} style={{ marginLeft: 2, marginRight: 5 }}>
                                                            <FontAwesome name="plus-circle" size={20} color="#10b981" />
                                                        </Pressable>
                                                    )}
                                                    {(b.schedule[di] || []).map((s, si) => (
                                                        <View key={si} style={styles.shiftRow}>
                                                            <TextInput style={styles.shiftInput} value={s.openTime} onChangeText={v => updateShiftTime(bIdx, di, si, 'openTime', v)} />
                                                            <Text>-</Text>
                                                            <TextInput style={styles.shiftInput} value={s.closeTime} onChangeText={v => updateShiftTime(bIdx, di, si, 'closeTime', v)} />
                                                            <Pressable onPress={() => removeShift(bIdx, di, si)}><FontAwesome name="minus-circle" size={16} color="#64748b" /></Pressable>
                                                        </View>
                                                    ))}
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                        <View style={[styles.row, { marginTop: 15 }]}>
                            <Text style={styles.label}>Habilitar Retiro Presencial (Global)</Text>
                            <Switch value={allowPickup} onValueChange={setAllowPickup} />
                        </View>
                    </View>

                    {/* CARD: PAGO */}
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%' }]}>
                        <Text style={styles.cardTitle}>💳 Métodos de Pago</Text>
                        {paymentMethods.map((pm, idx) => (
                            <View key={idx} style={styles.listItem}>
                                <TextInput style={styles.listInput} value={pm} onChangeText={v => updatePaymentMethod(idx, v)} />
                                <Pressable onPress={() => removePaymentMethod(idx)}><FontAwesome name="times" size={16} color="#ef4444" /></Pressable>
                            </View>
                        ))}
                        <View style={styles.row}>
                            <TextInput style={[styles.listInput, { flex: 1, backgroundColor: '#f0fdf4' }]} placeholder="Nuevo método..." value={newPaymentMethod} onChangeText={setNewPaymentMethod} />
                            <Pressable style={styles.miniAddBtn} onPress={addPaymentMethod}><Text style={styles.miniAddBtnText}>Añadir</Text></Pressable>
                        </View>
                        {businessProfile?.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && (
                            <View style={{ marginTop: 15 }}>
                                <View style={{ height: 1, backgroundColor: '#e2e8f0', marginBottom: 15 }} />
                                <Text style={styles.subTitle}>Moneda Principal:</Text>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <Pressable 
                                        style={[styles.chip, currency === '$' && styles.chipActive]} 
                                        onPress={() => setCurrency('$')}
                                    >
                                        <Text style={[styles.chipText, currency === '$' && styles.chipTextActive]}>$ (Pesos/Dólares)</Text>
                                    </Pressable>
                                    <Pressable 
                                        style={[styles.chip, currency === '€' && styles.chipActive]} 
                                        onPress={() => setCurrency('€')}
                                    >
                                        <Text style={[styles.chipText, currency === '€' && styles.chipTextActive]}>€ (Euros)</Text>
                                    </Pressable>
                                </View>
                                
                                <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 15 }} />
                                <View style={styles.row}>
                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                        <Text style={styles.label}>Negocio Comidas / Rotisería</Text>
                                        <Text style={styles.hint}>Activa la vista de tarjetas gastronómicas y el carrito de pedidos especial.</Text>
                                    </View>
                                    <Switch value={isFoodBusiness} onValueChange={setIsFoodBusiness} />
                                </View>
                            </View>
                        )}
                    </View>

                    {/* CARD: WORKFLOW */}
                    <View style={[styles.card, { width: isDesktop ? '49%' : '100%', backgroundColor: '#fefce8' }]}>
                        <Text style={[styles.cardTitle, { color: '#854d0e' }]}>⚙️ Workflow y Estados</Text>
                        <View style={styles.row}>
                            <Text style={styles.label}>Ver estados en App Cliente</Text>
                            <Switch value={showOrderStatusToClients} onValueChange={setShowOrderStatusToClients} />
                        </View>
                        {orderStatuses.map((os, idx) => (
                            <View key={os.id} style={[styles.statusItem, { borderLeftColor: os.color }]}>
                                <View style={styles.row}>
                                    <TextInput style={[styles.listInput, { flex: 1 }]} value={os.label} onChangeText={v => { const n = [...orderStatuses]; n[idx].label = v; setOrderStatuses(n); }} />
                                    <View style={[styles.colorBox, { backgroundColor: os.color }]} />
                                    <Pressable onPress={() => { if(os.id==='delivered'||os.id==='pending') return; setOrderStatuses(orderStatuses.filter((_,i)=>i!==idx)) }}><FontAwesome name="trash" size={16} color="#ef4444" /></Pressable>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
                                    <View style={styles.miniSwitch}><Switch style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }} value={os.isSuccess} onValueChange={v => { const n = [...orderStatuses]; if(v) n.forEach(s=>s.isSuccess=false); n[idx].isSuccess=v; setOrderStatuses(n); }} /><Text style={styles.miniSwitchLabel}>Termina</Text></View>
                                    <View style={styles.miniSwitch}><Switch style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }} value={os.isCancelled} onValueChange={v => { const n = [...orderStatuses]; n[idx].isCancelled=v; setOrderStatuses(n); }} /><Text style={styles.miniSwitchLabel}>Cancela</Text></View>
                                    <View style={styles.miniSwitch}><Switch style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }} value={os.isReady} onValueChange={v => { const n = [...orderStatuses]; if(v) n.forEach(s=>s.isReady=false); n[idx].isReady=v; setOrderStatuses(n); }} /><Text style={styles.miniSwitchLabel}>Listos</Text></View>
                                </View>
                            </View>
                        ))}
                        <Pressable style={styles.btnAddSmall} onPress={() => setOrderStatuses([...orderStatuses, { id: Date.now().toString(), label: 'Nuevo', color: '#666' }])}>
                            <Text style={styles.btnAddSmallText}>+ Nuevo Estado</Text>
                        </Pressable>
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            <View style={styles.footer}>
                <Pressable style={[styles.saveBtn, (!isDirty || isSaving) && styles.saveBtnDisabled]} onPress={handleSave} disabled={!isDirty || isSaving}>
                    {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar Configuración</Text>}
                </Pressable>
            </View>

            {showSuccess && (
                <Animated.View style={[styles.toast, { opacity: fadeAnim }]}>
                    <Text style={styles.toastText}>✅ Guardado online</Text>
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
    cardTitle: { fontSize: 18, fontWeight: '700', color: '#334155', marginBottom: 15 },
    subTitle: { fontSize: 14, fontWeight: 'bold', color: '#64748b', marginTop: 15, marginBottom: 5 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    label: { fontSize: 14, fontWeight: '600', color: '#475569' },
    qrContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 15, borderRadius: 15, marginBottom: 15 },
    qrImage: { width: 100, height: 100, borderRadius: 8 },
    qrLabel: { fontSize: 11, fontWeight: '900', color: '#64748b', marginBottom: 4 },
    qrText: { fontSize: 12, color: '#94a3b8' },
    linkContainer: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', padding: 12, borderRadius: 12 },
    linkSub: { fontSize: 10, fontWeight: 'bold', color: '#94a3b8', marginBottom: 5 },
    linkInput: { fontSize: 13, color: '#1e293b', fontWeight: '500', marginBottom: 10 },
    copyBtn: { alignSelf: 'flex-start', backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    copyBtnText: { color: '#2563eb', fontWeight: 'bold', fontSize: 12 },
    inputGroup: { marginBottom: 12 },
    fullInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 14, marginTop: 5 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
    chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    chipText: { fontSize: 12, color: '#64748b', fontWeight: 'bold' },
    chipTextActive: { color: '#fff' },
    branchItem: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9', marginBottom: 10 },
    branchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
    branchName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
    branchContent: { paddingBottom: 15 },
    addBtn: { backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
    listItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    listInput: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, fontSize: 14 },
    miniAddBtn: { backgroundColor: '#10b981', paddingHorizontal: 15, height: 40, justifyContent: 'center', borderRadius: 8, marginLeft: 10 },
    miniAddBtnText: { color: '#fff', fontWeight: 'bold' },
    statusItem: { backgroundColor: '#fff', padding: 10, borderRadius: 12, borderLeftWidth: 5, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.02, elevation: 1 },
    colorBox: { width: 20, height: 20, borderRadius: 10 },
    miniSwitch: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    miniSwitchLabel: { fontSize: 10, color: '#64748b' },
    btnAddSmall: { marginTop: 10, padding: 8, borderRadius: 8, backgroundColor: '#fef9c3', alignItems: 'center' },
    btnAddSmallText: { color: '#854d0e', fontWeight: 'bold', fontSize: 12 },
    miniSched: { backgroundColor: '#f8fafc', padding: 8, borderRadius: 8, marginBottom: 5, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
    miniDay: { width: 35, fontSize: 12, fontWeight: 'bold', color: '#64748b' },
    addShiftBtn: { backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    addShiftBtnText: { color: '#2563eb', fontSize: 11, fontWeight: 'bold' },
    shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    shiftInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, width: 45, fontSize: 11, textAlign: 'center' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(255,255,255,0.9)', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
    saveBtn: { backgroundColor: '#10b981', padding: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#10b981', shadowOpacity: 0.2, shadowRadius: 10 },
    saveBtnDisabled: { backgroundColor: '#94a3b8' },
    saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    toast: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 30, elevation: 5 },
    toastText: { color: '#10b981', fontWeight: 'bold' },
    hint: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginBottom: 5 },
    reqBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    reqBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    }
});
