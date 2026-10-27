import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc } from 'firebase/firestore';
import { FontAwesome } from '@expo/vector-icons';
import { app } from '../src/config/firebase';
import { useAppContext } from '../src/context/AppContext';
import { BusinessProfile } from '../src/types';

export default function IniciarDemoScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();

    // Códigos de campaña opacos y decodificador automático de precio:
    // 1. Códigos estándar: 'vp26', 'vip', 'pro' => 20000. Por defecto => 9000.
    // 2. Códigos automáticos con prefijo 'k' (ej. 'k12' = 12.000, 'k15' = 15.000, 'k18' = 18.000, 'k25' = 25.000):
    //    Totalmente transparente para el cliente (parece un identificador de campaña) pero dinámico para vos.
    const promoCode = (params.c || params.promo || params.plan || '').toString().toLowerCase();

    let planPrice = 9000;
    if (promoCode === 'vp26' || promoCode === 'vip' || promoCode === 'pro') {
        planPrice = 20000;
    } else {
        const kMatch = promoCode.match(/^k(\d+)$/);
        if (kMatch) {
            const parsedK = parseInt(kMatch[1], 10);
            if (!isNaN(parsedK) && parsedK > 0) {
                planPrice = parsedK * 1000; // ej: k14 => 14000
            }
        }
    }

    const isProPlan = planPrice >= 20000;
    const originalPrice = Math.round(planPrice * 1.8 / 1000) * 1000; // Precio tachado automático con descuento visible

    const { loadBusinessById, setUser } = useAppContext();

    // Precarga automática desde los parámetros del link de WhatsApp (b=usuario, name=Nombre)
    const initialName = (params.name || params.n || '').toString();
    const initialUsername = (params.b || params.u || '').toString();

    const [businessName, setBusinessName] = useState(initialName);
    const [username, setUsername] = useState(initialUsername);
    
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
        if (!businessName.trim() || !username.trim()) {
            setError('Por favor completá ambos campos.');
            return;
        }

        const safeUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (safeUsername.length < 3) {
            setError('El usuario debe tener al menos 3 caracteres y solo letras/números.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Capa 2: Huella local (AsyncStorage / LocalStorage)
            const localTrialUsed = await AsyncStorage.getItem('tp_trial_created');
            if (localTrialUsed) {
                // Registrar intento bloqueado para el SuperAdmin
                try {
                    const db = getFirestore(app);
                    await addDoc(collection(db, 'blocked_attempts'), {
                        businessName: businessName.trim(),
                        username: safeUsername,
                        reason: 'Dispositivo ya utilizó prueba gratuita (Local)',
                        type: 'device',
                        createdAt: new Date().toISOString()
                    });
                } catch (e) {}

                setError('Ya se ha creado un período de prueba desde este dispositivo. Si deseas extender o activar tu plan, comunícate con soporte.');
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
                    // Límite de 30 días entre pruebas por IP
                    if (lastCreated) {
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
                setError('Ese usuario ya está en uso. Por favor elegí otro.');
                setLoading(false);
                return;
            }

            const demoEmail = `${safeUsername}@demo.tuspedidos.com`;
            const demoPassword = 'TusPedidosDemo2026';

            // Create Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, demoEmail, demoPassword);
            const uid = userCredential.user.uid;

            // Create Business Profile
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days trial

            const newProfile: BusinessProfile = {
                id: safeUsername,
                name: businessName.trim(),
                primaryColor: '#0f172a',
                status: 'trial',
                trialExpiresAt: expiresAt.toISOString(),
                planPrice: planPrice,
                promoTag: isProPlan ? 'pro' : 'founder',
                onboardingCompleted: false
            };

            await setDoc(businessRef, {
                ownerId: uid,
                profile: newProfile,
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

            await loadBusinessById(safeUsername);
            setUser({ id: uid, email: demoEmail, role: 'business', name: '', surname: '', address: '' });
            router.replace('/(business)/admin');

        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                setError('Ese usuario ya está en uso por otro demo.');
            } else {
                setError('Ocurrió un error al crear el demo. Intentá de nuevo.');
            }
        } finally {
            setLoading(false);
        }
    };

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
                    onChangeText={setBusinessName}
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

                <Text style={styles.label}>Contraseña</Text>
                


                <Pressable style={styles.mainBtn} onPress={handleCreateDemo} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>Crear mi Demo Ahora</Text>}
                </Pressable>

                <Pressable style={{ marginTop: 20, alignItems: 'center' }} onPress={() => router.push('/business-auth?demo=true')}>
                    <Text style={{ color: '#3b82f6', fontWeight: '600' }}>¿Ya tenés un Demo? Ingresá acá</Text>
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
