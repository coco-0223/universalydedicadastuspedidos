import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc } from 'firebase/firestore';
import { FontAwesome } from '@expo/vector-icons';
import { app } from '../src/config/firebase';
import { useAppContext } from '../src/context/AppContext';
import { BusinessProfile } from '../src/types';
import { getOrGenerateAccessPin } from '../src/utils/prospectManager';

export default function IniciarDemoScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();

    // Función para obtener parámetros tanto de Expo Router como de la URL de navegación en Web
    const getQueryParam = (key: string): string => {
        if (params && params[key]) return params[key].toString();
        if (typeof window !== 'undefined' && window.location) {
            const search = window.location.search || '';
            if (search) {
                const urlParams = new URLSearchParams(search);
                const val = urlParams.get(key);
                if (val) return val;
            }
            // También revisar si la URL vino en el hash o path (ej: /iniciar-demo?b=...)
            const href = window.location.href || '';
            const qIndex = href.indexOf('?');
            if (qIndex !== -1) {
                const queryStr = href.substring(qIndex);
                const urlParams = new URLSearchParams(queryStr);
                const val = urlParams.get(key);
                if (val) return val;
            }
        }
        return '';
    };

    // Códigos de campaña opacos y decodificador automático de precio:
    const [promoCode, setPromoCode] = useState(() => (getQueryParam('c') || getQueryParam('promo') || getQueryParam('plan')).toLowerCase());
    const [planPrice, setPlanPrice] = useState(() => {
        const c = (getQueryParam('c') || getQueryParam('promo') || getQueryParam('plan')).toLowerCase();
        if (c === 'vp26' || c === 'vip' || c === 'pro') return 20000;
        const kMatch = c.match(/^k(\d+)$/);
        if (kMatch) {
            const parsedK = parseInt(kMatch[1], 10);
            if (!isNaN(parsedK) && parsedK > 0) return parsedK * 1000;
        }
        return 9000;
    });

    const isProPlan = planPrice >= 20000;
    const originalPrice = Math.round(planPrice * 1.8 / 1000) * 1000; // Precio tachado automático con descuento visible

    const { loadBusinessById, setUser } = useAppContext();

    // Precarga automática desde los parámetros del link de WhatsApp (b=usuario, name=Nombre) o de la URL directa en web
    const [businessName, setBusinessName] = useState(() => getQueryParam('name') || getQueryParam('n') || '');
    const [username, setUsername] = useState(() => getQueryParam('b') || getQueryParam('u') || '');
    const [isDirectInvite, setIsDirectInvite] = useState(() => Boolean(getQueryParam('b') || getQueryParam('u') || getQueryParam('name') || getQueryParam('n') || getQueryParam('lead')));
    const [ownerPhone, setOwnerPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [leadRecord, setLeadRecord] = useState<any>(null);

    // Estado de pertenencia: 'checking' | 'owner' | 'claimed_by_other' | 'available'
    const [existingOwnership, setExistingOwnership] = useState<'checking' | 'owner' | 'claimed_by_other' | 'available'>('available');
    const [claimedBusinessName, setClaimedBusinessName] = useState('');
    const [expectedAccessPin, setExpectedAccessPin] = useState('');
    const [inputPin, setInputPin] = useState('');
    
    // Función para verificar si el negocio ya fue creado y si este dispositivo es el dueño
    const checkBusinessOwnership = async (slug: string) => {
        if (!slug) return;
        try {
            const db = getFirestore(app);
            const businessDoc = await getDoc(doc(db, 'businesses', slug));

            if (businessDoc.exists()) {
                const bData = businessDoc.data();
                const bProfile = bData.profile || {};
                const pin = bData.accessPin || bProfile.accessPin || getOrGenerateAccessPin(slug);
                setExpectedAccessPin(pin);
                setClaimedBusinessName(bProfile.name || slug);

                // Comprobar si ESTE dispositivo es el legítimo creador
                const savedDeviceKey = await AsyncStorage.getItem('tp_device_key_' + slug) || await AsyncStorage.getItem('tp_device_key');
                const savedBusinessId = await AsyncStorage.getItem('tp_trial_business_id');

                const isAuthorizedDevice = Boolean(
                    (bData.deviceKey && bData.deviceKey === savedDeviceKey) ||
                    (bProfile.deviceKey && bProfile.deviceKey === savedDeviceKey) ||
                    (savedBusinessId === slug)
                );

                if (isAuthorizedDevice) {
                    // Es el cliente legítimo en su mismo teléfono/navegador
                    setExistingOwnership('owner');
                    // Reingreso automático y directo
                    handleReEnterDemo(slug, bProfile.name || slug);
                } else {
                    // Si no está registrado en este navegador aún, verificar si vino el pin por URL
                    const urlPin = (getQueryParam('pin') || getQueryParam('p') || '').toLowerCase();
                    if (urlPin && urlPin === pin.toLowerCase()) {
                        const deviceKey = 'dev_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
                        await AsyncStorage.setItem('tp_device_key_' + slug, deviceKey);
                        await AsyncStorage.setItem('tp_device_key', deviceKey);
                        await AsyncStorage.setItem('tp_trial_business_id', slug);
                        setExistingOwnership('owner');
                        handleReEnterDemo(slug, bProfile.name || slug);
                    } else {
                        // Es un dispositivo nuevo o reenviado: pedir la clave de acceso de 6 caracteres
                        setExistingOwnership('claimed_by_other');
                    }
                }
            } else {
                setExistingOwnership('available');
                setExpectedAccessPin(getOrGenerateAccessPin(slug));
            }
        } catch (e) {
            console.warn('Error checking business ownership:', e);
        }
    };

    // Validar el PIN de 6 caracteres (3 números + 3 letras) e ingresar
    const handleValidatePinAndEnter = async () => {
        const cleanInput = inputPin.trim().toLowerCase();
        if (!cleanInput) {
            setError('Por favor ingresá tu clave de acceso de 6 caracteres.');
            return;
        }

        const targetSlug = (username || getQueryParam('b') || getQueryParam('lead') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const validPin = (expectedAccessPin || getOrGenerateAccessPin(targetSlug)).toLowerCase();

        if (cleanInput !== validPin) {
            setError('Clave incorrecta. Por favor revisá el mensaje de WhatsApp que te enviamos.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            // Clave CORRECTA: Autorizar inmediatamente este dispositivo
            const deviceKey = 'dev_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
            await AsyncStorage.setItem('tp_device_key_' + targetSlug, deviceKey);
            await AsyncStorage.setItem('tp_device_key', deviceKey);
            await AsyncStorage.setItem('tp_trial_business_id', targetSlug);
            await AsyncStorage.setItem('tp_trial_created', 'true');

            // Guardar en Firestore para sincronizar
            const db = getFirestore(app);
            await setDoc(doc(db, 'businesses', targetSlug), {
                deviceKey,
                accessPin: validPin
            }, { merge: true });

            // Reingresar suavemente al panel
            await handleReEnterDemo(targetSlug, claimedBusinessName || businessName);
        } catch (e) {
            console.error('Error authorizing device with pin:', e);
            setError('Hubo un error al validar. Intentá de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    // Reingresar a la demo existente del cliente
    const handleReEnterDemo = async (slug: string, name?: string) => {
        setLoading(true);
        setError('');
        try {
            const auth = getAuth(app);
            const finalAuthEmail = `${slug}@demo.tuspedidos.com`;
            const finalAuthPassword = 'TusPedidosDemo2026';

            try {
                const userCredential = await signInWithEmailAndPassword(auth, finalAuthEmail, finalAuthPassword);
                const uid = userCredential.user.uid;
                await loadBusinessById(slug);
                setUser({ id: uid, email: finalAuthEmail, role: 'business', name: name || '', surname: '', address: '' });
                router.replace('/(business)/admin');
                return;
            } catch (signInErr: any) {
                console.log('SignIn error, attempting direct load:', signInErr);
                await loadBusinessById(slug);
                router.replace('/(business)/admin');
                return;
            }
        } catch (err: any) {
            console.error('Error re-entering demo:', err);
            setError('Tu catálogo ya está activo. Podés ingresar desde la pantalla de login con tu usuario: ' + slug);
        } finally {
            setLoading(false);
        }
    };
    
    // Si los params llegan luego de la hidratación inicial de Expo Router en Web o si viene 'lead' para leer desde Firestore
    useEffect(() => {
        const leadId = getQueryParam('lead') || getQueryParam('b');
        const nameFromUrl = getQueryParam('name') || getQueryParam('n');
        const userFromUrl = getQueryParam('b') || getQueryParam('u');
        const codeFromUrl = (getQueryParam('c') || getQueryParam('promo') || getQueryParam('plan')).toLowerCase();

        if (nameFromUrl) {
            setBusinessName(nameFromUrl);
        }
        if (userFromUrl) {
            setUsername(userFromUrl);
        }
        if (nameFromUrl || userFromUrl || leadId) {
            setIsDirectInvite(true);
        }
        if (codeFromUrl) {
            setPromoCode(codeFromUrl);
            if (codeFromUrl === 'vp26' || codeFromUrl === 'vip' || codeFromUrl === 'pro') {
                setPlanPrice(20000);
            } else {
                const kMatch = codeFromUrl.match(/^k(\d+)$/);
                if (kMatch) {
                    const parsedK = parseInt(kMatch[1], 10);
                    if (!isNaN(parsedK) && parsedK > 0) {
                        setPlanPrice(parsedK * 1000);
                    }
                }
            }
        }

        const targetSlug = (userFromUrl || leadId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (targetSlug) {
            checkBusinessOwnership(targetSlug);
        }

        // Consultar los datos completos del prospecto en Firestore (SuperAdmin)
        if (leadId) {
            const db = getFirestore(app);
            getDoc(doc(db, 'prospect_leads', leadId)).then((snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setLeadRecord(data);
                    if (data.businessName || data.name) {
                        setBusinessName(data.businessName || data.name);
                    }
                    if (data.id) {
                        setUsername(data.id);
                    }
                    if (data.phone) {
                        setOwnerPhone(data.phone);
                    }
                    if (data.email) {
                        setEmail(data.email);
                    }
                    if (data.planPrice) {
                        setPlanPrice(data.planPrice);
                    }
                    setIsDirectInvite(true);
                }
            }).catch((err) => {
                console.warn('Error fetching lead data from superadmin:', err);
            });
        }
    }, [params]);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const getClientIp = async (): Promise<string | null> => {
        try {
            const res = await fetch('https://api.ipify.org?format=json');
            const data = await res.json();
            return data.ip || null;
        } catch (e) {
            return null;
        }
    };

    const handleCreateDemo = async () => {
        if (!businessName.trim()) {
            setError('Por favor completá el nombre de tu negocio.');
            return;
        }

        // Si no vino de un enlace directo con usuario asignado, validamos datos orgánicos
        if (!isDirectInvite) {
            if (!ownerPhone.trim()) {
                setError('Por favor ingresá tu número de WhatsApp para contacto.');
                return;
            }
            if (!email.trim() || !email.includes('@')) {
                setError('Por favor ingresá un correo electrónico válido.');
                return;
            }
            if (!password || password.length < 6) {
                setError('La contraseña debe tener al menos 6 caracteres.');
                return;
            }
        }

        // Generar o sanitizar slug
        let rawSlug = username.trim() || businessName.trim();
        const safeUsername = rawSlug
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, '');

        if (safeUsername.length < 3) {
            setError('El nombre o usuario debe tener al menos 3 letras o números.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Capa 2: Huella local (AsyncStorage / LocalStorage)
            // Solo bloquear si intentan crear OTRO negocio diferente en el mismo dispositivo
            const localTrialUsed = await AsyncStorage.getItem('tp_trial_created');
            const localTrialBusinessId = await AsyncStorage.getItem('tp_trial_business_id');
            if (localTrialUsed && localTrialBusinessId && localTrialBusinessId !== safeUsername) {
                // Registrar intento bloqueado para el SuperAdmin
                try {
                    const db = getFirestore(app);
                    await addDoc(collection(db, 'blocked_attempts'), {
                        businessName: businessName.trim(),
                        username: safeUsername,
                        reason: 'Dispositivo ya utilizó prueba gratuita para otro negocio (Local)',
                        type: 'device',
                        createdAt: new Date().toISOString()
                    });
                } catch (e) {}

                setError('Ya se ha creado un período de prueba desde este dispositivo para otro negocio. Si deseas extender o activar tu plan, comunícate con soporte.');
                setLoading(false);
                return;
            }

            const auth = getAuth(app);
            const db = getFirestore(app);

            // Capa 1: Validación por IP
            const clientIp = await getClientIp();
            if (clientIp) {
                // Las IPs con puntos se pueden usar como ID sanitizado
                const ipDocId = clientIp.replace(/[^a-zA-Z0-9_-]/g, '_');
                const ipRef = doc(db, 'trial_ips', ipDocId);
                const ipSnap = await getDoc(ipRef);

                if (ipSnap.exists()) {
                    const ipData = ipSnap.data();
                    const lastCreated = ipData?.createdAt ? new Date(ipData.createdAt) : null;
                    // Límite de 30 días entre pruebas por IP para NEGOCIOS DISTINTOS
                    if (lastCreated && ipData.businessId !== safeUsername) {
                        const daysDiff = (Date.now() - lastCreated.getTime()) / (1000 * 60 * 60 * 24);
                        if (daysDiff < 30) {
                            // Registrar intento bloqueado para el SuperAdmin
                            try {
                                await addDoc(collection(db, 'blocked_attempts'), {
                                    businessName: businessName.trim(),
                                    username: safeUsername,
                                    ip: clientIp,
                                    previousBusinessId: ipData.businessId || 'desconocido',
                                    reason: `Misma IP (${clientIp}) que negocio previo: ${ipData.businessId || 'desconocido'}`,
                                    type: 'ip',
                                    createdAt: new Date().toISOString()
                                });
                            } catch (e) {}

                            setError('Ya se ha registrado una prueba gratuita desde esta red recientemente. Escribinos para activar tu cuenta.');
                            setLoading(false);
                            return;
                        }
                    }
                }
            }
            
            // Check if slug exists
            const businessRef = doc(db, 'businesses', safeUsername);
            const snap = await getDoc(businessRef);
            if (snap.exists()) {
                const bData = snap.data();
                const bProfile = bData.profile || {};
                const savedDeviceKey = await AsyncStorage.getItem('tp_device_key_' + safeUsername) || await AsyncStorage.getItem('tp_device_key');
                const savedBusinessId = await AsyncStorage.getItem('tp_trial_business_id');

                const isAuthorizedDevice = Boolean(
                    (bData.deviceKey && bData.deviceKey === savedDeviceKey) ||
                    (bProfile.deviceKey && bProfile.deviceKey === savedDeviceKey) ||
                    (savedBusinessId === safeUsername)
                );

                if (isAuthorizedDevice) {
                    // Es el mismo cliente legítimo volviendo a entrar desde su propio dispositivo
                    await handleReEnterDemo(safeUsername, businessName.trim());
                    return;
                } else {
                    // Es OTRA persona a la que le reenviaron el link: BLOQUEO
                    setExistingOwnership('claimed_by_other');
                    setClaimedBusinessName(bProfile.name || safeUsername);
                    setError('Este enlace exclusivo ya fue activado por su titular.');
                    setLoading(false);
                    return;
                }
            }

            // Determinar credenciales según si es directo de WhatsApp o registro orgánico
            const finalAuthEmail = isDirectInvite 
                ? `${safeUsername}@demo.tuspedidos.com` 
                : email.trim().toLowerCase();
            const finalAuthPassword = isDirectInvite 
                ? 'TusPedidosDemo2026' 
                : password;

            // Create Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, finalAuthEmail, finalAuthPassword);
            const uid = userCredential.user.uid;

            // Guardar documento del usuario en 'users'
            await setDoc(doc(db, 'users', uid), {
                id: uid,
                email: finalAuthEmail,
                role: 'business',
                phone: ownerPhone.trim() || '',
                createdAt: new Date().toISOString()
            }, { merge: true });

            // Create Business Profile
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days trial

            // Clave única de dispositivo para vincular este teléfono/navegador con su tienda
            const deviceKey = 'dev_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
            const accessPin = getOrGenerateAccessPin(safeUsername, leadRecord?.accessPin);

            const newProfile: BusinessProfile = {
                id: safeUsername,
                name: businessName.trim(),
                primaryColor: '#0f172a',
                status: 'trial',
                trialExpiresAt: expiresAt.toISOString(),
                planPrice: planPrice,
                promoTag: isProPlan ? 'pro' : 'founder',
                contactPhone: ownerPhone.trim() || leadRecord?.phone || undefined,
                ownerEmail: finalAuthEmail,
                onboardingCompleted: false
            };

            await setDoc(businessRef, {
                ownerId: uid,
                deviceKey: deviceKey,
                accessPin: accessPin,
                profile: {
                    ...newProfile,
                    deviceKey: deviceKey,
                    accessPin: accessPin
                },
                settings: {
                    categories: [],
                    currency: '$',
                    deliveryRules: {
                        methods: { delivery: true, pickup: true },
                        cost: 0,
                        freeDeliveryThreshold: 0
                    },
                    paymentMethods: {
                        cash: true,
                        transfer: false
                    }
                }
            });

            // Guardar registro de IP y huella digital
            if (clientIp) {
                const ipDocId = clientIp.replace(/[^a-zA-Z0-9_-]/g, '_');
                await setDoc(doc(db, 'trial_ips', ipDocId), {
                    ip: clientIp,
                    businessId: safeUsername,
                    createdAt: new Date().toISOString()
                }, { merge: true });
            }
            await AsyncStorage.setItem('tp_trial_created', 'true');
            await AsyncStorage.setItem('tp_trial_business_id', safeUsername);
            await AsyncStorage.setItem('tp_device_key_' + safeUsername, deviceKey);
            await AsyncStorage.setItem('tp_device_key', deviceKey);
            await AsyncStorage.setItem('tp_owner_email_' + safeUsername, finalAuthEmail);

            await loadBusinessById(safeUsername);
            setUser({ id: uid, email: finalAuthEmail, role: 'business', name: '', surname: '', address: '' });
            router.replace('/(business)/admin');

        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                // Si el email ya existía, comprobar si es el dueño para reingresar inmediatamente
                const savedDeviceKey = await AsyncStorage.getItem('tp_device_key_' + safeUsername) || await AsyncStorage.getItem('tp_device_key');
                const savedBusinessId = await AsyncStorage.getItem('tp_trial_business_id');
                if (savedBusinessId === safeUsername || savedDeviceKey) {
                    await handleReEnterDemo(safeUsername, businessName.trim());
                    return;
                }
                setError('Ese usuario ya está en uso por otro demo.');
            } else {
                setError('Ocurrió un error al crear el demo. Intentá de nuevo.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Caso 1: Enlace abierto sin autorización de dispositivo (pide la Clave de Acceso de 6 caracteres)
    if (existingOwnership === 'claimed_by_other') {
        return (
            <View style={styles.container}>
                <View style={styles.card}>
                    <View style={{ alignItems: 'center', marginBottom: 16 }}>
                        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                            <FontAwesome name="key" size={26} color="#0284c7" />
                        </View>
                        <Text style={[styles.title, { textAlign: 'center', fontSize: 22 }]}>Esta demo ya fue activada</Text>
                        <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 6 }]}>
                            El catálogo de <Text style={{ fontWeight: 'bold', color: '#0f172a' }}>"{claimedBusinessName || businessName || username}"</Text> ya está en marcha.
                        </Text>
                    </View>

                    {/* Validación por Clave de Acceso (3 números + 3 letras) sin usuario ni mail */}
                    <View style={{ backgroundColor: '#f8fafc', padding: 18, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 18 }}>
                        <Text style={{ fontWeight: '700', color: '#1e293b', fontSize: 14, marginBottom: 4 }}>
                            ¿Sos el titular de este negocio?
                        </Text>
                        <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                            Ingresá la clave de acceso de 6 caracteres que te enviamos por WhatsApp para vincular este dispositivo y entrar a tu panel:
                        </Text>

                        <Text style={styles.label}>Clave de Acceso (3 números y 3 letras)</Text>
                        <TextInput
                            style={[styles.input, { letterSpacing: 4, fontWeight: 'bold', fontSize: 20, textAlign: 'center', textTransform: 'lowercase', backgroundColor: '#fff' }]}
                            placeholder="ej: 384kpt"
                            value={inputPin}
                            onChangeText={t => { setInputPin(t.trim().toLowerCase()); setError(''); }}
                            autoCapitalize="none"
                            maxLength={6}
                        />

                        {error ? <Text style={[styles.errorText, { marginTop: 6, marginBottom: 10 }]}>{error}</Text> : null}

                        <Pressable
                            style={[styles.mainBtn, { marginTop: 6 }]}
                            onPress={handleValidatePinAndEnter}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>Entrar a mi Panel 📋</Text>}
                        </Pressable>
                    </View>

                    <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 14, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 8 }}>
                            ¿Te reenviaron este enlace y querés una tienda para vos?
                        </Text>
                        <Pressable
                            style={{ backgroundColor: '#f1f5f9', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 }}
                            onPress={() => {
                                setExistingOwnership('available');
                                setUsername('');
                                setBusinessName('');
                                setIsDirectInvite(false);
                                if (typeof window !== 'undefined') {
                                    window.history.replaceState({}, '', '/iniciar-demo');
                                }
                            }}
                        >
                            <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 13 }}>Crear mi Propia Prueba Gratis 🚀</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        );
    }

    // Caso 2: El cliente legítimo vuelve a hacer click en su propio enlace
    if (existingOwnership === 'owner') {
        return (
            <View style={styles.container}>
                <View style={styles.card}>
                    <View style={{ alignItems: 'center', marginBottom: 20 }}>
                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                            <FontAwesome name="check-circle" size={36} color="#16a34a" />
                        </View>
                        <Text style={[styles.title, { textAlign: 'center' }]}>¡Bienvenido de nuevo!</Text>
                        <Text style={[styles.subtitle, { textAlign: 'center', marginTop: 8 }]}>
                            Tu catálogo de <Text style={{ fontWeight: 'bold', color: '#0f172a' }}>"{businessName || username}"</Text> ya está activo en tu dispositivo.
                        </Text>
                    </View>

                    <Pressable
                        style={styles.mainBtn}
                        onPress={() => handleReEnterDemo(username, businessName)}
                        disabled={loading}
                    >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>Entrar a mi Panel 📋</Text>}
                    </Pressable>

                    <Pressable style={{ marginTop: 20, alignItems: 'center' }} onPress={() => router.push('/business-auth')}>
                        <Text style={{ color: '#3b82f6', fontWeight: '600' }}>Ingresar con otra cuenta</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                {/* Banner FOMO con Precio Dinámico */}
                <View style={{ backgroundColor: isProPlan ? '#4338ca' : '#b45309', padding: 12, borderRadius: 10, marginBottom: 18 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                        <FontAwesome name="fire" size={16} color="#fbbf24" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {isProPlan ? 'Promoción Especial Pro' : 'Tarifa Fundador • Solo 4 Cupos'}
                        </Text>
                    </View>
                    <Text style={{ color: '#fef08a', textAlign: 'center', fontWeight: 'bold', fontSize: 15 }}>
                        Congelá ${planPrice.toLocaleString()}/mes <Text style={{ textDecorationLine: 'line-through', color: '#fed7aa', fontSize: 12 }}>${originalPrice.toLocaleString()}</Text>
                    </Text>
                    <Text style={{ color: '#f8fafc', textAlign: 'center', fontSize: 11, marginTop: 3 }}>
                        {isProPlan 
                            ? 'Incluye catálogo web y soporte prioritario. 7 días gratis para probar.'
                            : 'Cupo reservado automáticamente durante tus 7 días de prueba.'}
                    </Text>
                </View>

                <Text style={styles.title}>Empezá tu Prueba Gratis</Text>
                <Text style={styles.subtitle}>Creá tu catálogo digital en 10 segundos y probalo sin compromiso durante 7 días.</Text>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <Text style={styles.label}>Nombre de tu Negocio</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Ej: Carnicería Los Amigos"
                    value={businessName}
                    onChangeText={(val) => {
                        setBusinessName(val);
                        if (!isDirectInvite && !username) {
                            // Sugerir usuario automáticamente basado en el nombre
                            const suggested = val.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
                            setUsername(suggested);
                        }
                    }}
                />

                <Text style={styles.label}>Usuario (para tu link)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Ej: carnicerialosamigos"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                />
                <Text style={styles.hintText}>Tus clientes entrarán a: tuspedidos.com/?store={username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tu-usuario'}</Text>

                {/* Si viene orgánico de redes/web, pedimos WhatsApp, Email y Contraseña */}
                {!isDirectInvite && (
                    <>
                        <Text style={styles.label}>Tu WhatsApp (para recibir pedidos y contacto)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej: 3512345678"
                            value={ownerPhone}
                            onChangeText={setOwnerPhone}
                            keyboardType="phone-pad"
                        />

                        <Text style={styles.label}>Correo Electrónico (para tu acceso)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="tu@email.com"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />

                        <Text style={styles.label}>Contraseña</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Mínimo 6 caracteres"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                    </>
                )}

                <Pressable style={styles.mainBtn} onPress={handleCreateDemo} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>Crear mi Demo Ahora</Text>}
                </Pressable>

                <Pressable style={{ marginTop: 20, alignItems: 'center' }} onPress={() => router.push(isDirectInvite ? '/business-auth?demo=true' : '/business-auth')}>
                    <Text style={{ color: '#3b82f6', fontWeight: '600' }}>¿Ya tenés cuenta? Ingresá acá</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    card: {
        backgroundColor: '#fff',
        width: '100%',
        maxWidth: 400,
        padding: 30,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5
    },
    title: {
        fontSize: 26,
        fontWeight: '900',
        color: '#1e293b',
        textAlign: 'center',
        marginBottom: 8
    },
    subtitle: {
        fontSize: 15,
        color: '#64748b',
        textAlign: 'center',
        marginBottom: 25,
        lineHeight: 22
    },
    label: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#334155',
        marginBottom: 8
    },
    input: {
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 14,
        borderRadius: 10,
        fontSize: 15,
        marginBottom: 5
    },
    hintText: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 20,
        marginTop: 2
    },
    errorText: {
        color: '#ef4444',
        marginBottom: 15,
        textAlign: 'center',
        fontWeight: 'bold',
        backgroundColor: '#fef2f2',
        padding: 10,
        borderRadius: 8
    },
    mainBtn: {
        backgroundColor: '#10b981',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 10
    },
    mainBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    }
});
