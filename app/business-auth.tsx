import { getFirestore, query, collection, where, getDocs } from "firebase/firestore";
import { app } from "../src/config/firebase";
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, TextInput, View, Pressable, Platform, Alert, ActivityIndicator, Modal } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { router } from 'expo-router';
import { auth, db } from '../src/config/firebase';
import { useAppContext } from '../src/context/AppContext';
import { fetchBusinessData } from '../src/services/businessService';
import { defaultSettings, DEDICATED_OWNER_EMAILS, IS_DEDICATED_APP } from '../src/data/mockData';

import { useLocalSearchParams } from "expo-router";
export default function BusinessAuthScreen() {
    const params = useLocalSearchParams();
    const isDemo = params.demo === "true";

    const { user, setUser, loadBusinessById, isLoading } = useAppContext();
    const [isLogin, setIsLogin] = useState(isDemo ? true : true);
    const [isDemoLogin, setIsDemoLogin] = useState(typeof params !== "undefined" ? params.demo === "true" : false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    
    // Register only fields
    const [businessName, setBusinessName] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [errorFields, setErrorFields] = useState<string[]>([]);

    // Refs for Focus
    const businessNameRef = React.useRef<TextInput>(null);
    const emailRef = React.useRef<TextInput>(null);
    const passwordRef = React.useRef<TextInput>(null);
    const confirmPasswordRef = React.useRef<TextInput>(null);

    // Bloquear acceso al panel de negocio desde la app móvil
    useEffect(() => {
        if (Platform.OS !== 'web') {
            router.replace('/(store)');
        }
    }, []);

    // Auto-redirect if already logged in
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        if (!isLoading && user) {
            const currentUserEmail = user?.email?.toLowerCase().trim();
            if (currentUserEmail === 'cocobustos.93@gmail.com') {
                const currentHost = typeof window !== 'undefined' ? (window.location.hostname || '').toLowerCase() : '';
                const isTusPedidosDomain = currentHost.includes('tuspedidos-mu.vercel.app') || currentHost.includes('tuspedidos');
                if (isTusPedidosDomain) {
                    router.replace('/(admin)/dashboard');
                } else {
                    router.replace('/(business)/admin');
                }
            } else if (user.role === 'business') {
                router.replace('/(business)/admin');
            }
        }
    }, [user, isLoading]);

    // showAlert removed

    const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);
    const [recoveryEmail, setRecoveryEmail] = useState('');

    const handleForgotPassword = () => {
        setRecoveryEmail(email || '');
        setRecoveryModalVisible(true);
    };

    const handleAuth = async () => {
        if (Platform.OS !== 'web') {
            setError('Credenciales inválidas');
            return;
        }
        if (isDemoLogin) {
            if (!email.trim()) {
                setError('Por favor ingresá tu nombre de usuario de demo.');
                return;
            }
            setLoading(true);
            setError('');
            try {
                const demoEmail = email.trim().toLowerCase() + '@demo.tuspedidos.com';
                const demoPassword = 'TusPedidosDemo2026';
                const userCredential = await signInWithEmailAndPassword(auth, demoEmail, demoPassword);
                const uid = userCredential.user.uid;
                const db = getFirestore(app);
                const q = query(collection(db, 'businesses'), where('ownerId', '==', uid));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const businessDoc = querySnapshot.docs[0];
                    await loadBusinessById(businessDoc.id);
                    setUser({ id: uid, email: userCredential.user.email || '', role: 'business', name: '', surname: '', address: '' });
                    router.replace('/(business)/admin');
                } else {
                    setError('No se encontró el negocio de demo.');
                    await auth.signOut();
                }
            } catch (err: any) {
                setError('Usuario de demo incorrecto o expirado.');
            } finally {
                setLoading(false);
            }
            return;
        }
        setErrorFields([]);

        if (!email) {
            setErrorFields(['email']);
            emailRef.current?.focus();
            setError('Completá tu email');
            return;
        }
        if (!password) {
            setErrorFields(['password']);
            passwordRef.current?.focus();
            setError('Completá tu contraseña');
            return;
        }

        if (!isLogin && !confirmPassword) {
            setErrorFields(['confirmPassword']);
            confirmPasswordRef.current?.focus();
            setError('Confirmá tu contraseña');
            return;
        }

        if (!isLogin && confirmPassword !== password) {
            setErrorFields(['confirmPassword']);
            confirmPasswordRef.current?.focus();
            setError('Las contraseñas no coinciden');
            return;
        }
        
        if (!isLogin && !businessName.trim()) {
            setErrorFields(['businessName']);
            businessNameRef.current?.focus();
            setError('Ingresá el nombre de tu negocio');
            return;
        }
        
        setError('');
        setLoading(true);

        try {
            let authId = '';
            
            if (isLogin) {
                // Iniciar Sesión Existente
                const cred = await signInWithEmailAndPassword(auth, email, password);
                authId = cred.user.uid;
                
                if (email.trim().toLowerCase() === 'cocobustos.93@gmail.com') {
                    await setDoc(doc(db, 'users', authId), { email: email.toLowerCase().trim(), role: 'business' }, { merge: true });
                    const currentHost = typeof window !== 'undefined' ? (window.location.hostname || '').toLowerCase() : '';
                    const isTusPedidosDomain = currentHost.includes('tuspedidos-mu.vercel.app') || currentHost.includes('tuspedidos');
                    
                    if (!isTusPedidosDomain) {
                        // En rociocarnicerias o cualquier dominio que no sea tuspedidos, ingresa exclusivamente a administrar el negocio
                        const businessUser = {
                            id: 'VfxrjO1hPyeq71vQrLc3JUAgxq93',
                            name: 'Admin',
                            surname: '',
                            address: '',
                            role: 'business' as const,
                            email: email.trim().toLowerCase()
                        };
                        setUser(businessUser);
                        try {
                            await loadBusinessById('VfxrjO1hPyeq71vQrLc3JUAgxq93', businessUser);
                        } catch (e) {}
                        router.replace('/(business)/admin');
                        return;
                    }

                    const adminUser = {
                        id: authId,
                        name: 'Super Admin',
                        surname: '',
                        address: '',
                        role: 'business' as const,
                        email: email.trim().toLowerCase()
                    };
                    setUser(adminUser);
                    router.replace('/(admin)/dashboard');
                    return;
                }
                
                // Verificar si es dueño
                const d = await getDoc(doc(db, 'users', authId));
                if (d.exists()) {
                    const data = d.data();
                    if (data.role !== 'business') {
                        if (DEDICATED_OWNER_EMAILS.includes(email.trim().toLowerCase())) {
                            // Self-heal: It's the owner, grant them access forceably
                            await setDoc(doc(db, 'users', authId), { email: email.toLowerCase(), role: 'business' }, { merge: true });
                        } else {
                            throw new Error("Esta cuenta no tiene permisos de negocio.");
                        }
                    }
                    let finalAuthId = authId;
                    if (DEDICATED_OWNER_EMAILS.includes(email.trim().toLowerCase())) {
                        finalAuthId = 'VfxrjO1hPyeq71vQrLc3JUAgxq93'; // El verdadero ID en base de datos
                    }

                    const businessUser = {
                        id: finalAuthId,
                        name: 'Admin',
                        surname: '',
                        address: '',
                        role: 'business' as const,
                        email: email.trim().toLowerCase()
                    };
                    setUser(businessUser);
                    
                    // Fetch specific business data and initialize listeners
                    try {
                        await loadBusinessById(finalAuthId, businessUser);
                    } catch (e) {
                        console.warn("No se pudo cargar la data del negocio", e);
                    }
                } else {
                    if (DEDICATED_OWNER_EMAILS.includes(email.trim().toLowerCase())) {
                        await setDoc(doc(db, 'users', authId), { email: email.toLowerCase(), role: 'business' });
                        setUser({ id: authId, name: 'Admin', surname: '', address: '', role: 'business', email: email.trim().toLowerCase() });
                    } else {
                        throw new Error("No existe un perfil para este usuario.");
                    }
                }
            } else {
                // Registrar Nuevo Dueño de Carnicería
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                authId = cred.user.uid;
                
                // 1. Guardar el rol en la tabla genérica users
                await setDoc(doc(db, 'users', authId), {
                    email: email,
                    role: 'business'
                });
                
                // 2. Crear su perfil de negocio (tenant) con los datos básicos
                const brandProfile = {
                    id: authId,
                    name: businessName,
                    primaryColor: '#FF3B30', // Default Butcher color
                };
                
                await setDoc(doc(db, 'businesses', authId), {
                    profile: brandProfile,
                    settings: defaultSettings
                });

                const businessUser = {
                    id: authId,
                    name: businessName,
                    surname: '',
                    address: '',
                    role: 'business' as const,
                    email: email.trim().toLowerCase()
                };
                setUser(businessUser);
                
                await loadBusinessById(authId, businessUser);
            }

            // Forzamos ir al panel admin después de loguear exitosamente
            router.replace('/(business)/admin');

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Error al autenticar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>¡Bienvenido!</Text>
                <Text style={styles.subtitle}>{isDemoLogin ? 'Ingresá al Panel de tu Tienda' : (isLogin ? (IS_DEDICATED_APP ? 'Bienvenido de nuevo! Email - Contraseña' : 'Iniciá sesión en tu Panel') : 'Registrá tu negocio')}</Text>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {!isLogin && !isDemoLogin && (
                    <TextInput
                        ref={businessNameRef}
                        style={[styles.input, errorFields.includes('businessName') && styles.inputError]}
                        placeholder="Nombre de tu negocio"
                        value={businessName}
                        onChangeText={(text) => {
                            setBusinessName(text);
                            if (errorFields.includes('businessName')) setErrorFields(errorFields.filter(f => f !== 'businessName'));
                        }}
                    />
                )}

                <TextInput
                    ref={emailRef}
                    style={[styles.input, errorFields.includes('email') && styles.inputError]}
                    placeholder={isDemoLogin ? "Usuario (ej: carniceriapepe)" : "Email"}
                    value={email}
                    onChangeText={(text) => {
                        const filteredText = isDemoLogin ? text.replace(/[^a-zA-Z0-9.\-_]/g, '') : text;
                        setEmail(filteredText);
                        if (errorFields.includes('email')) setErrorFields(errorFields.filter(f => f !== 'email'));
                    }}
                    keyboardType={isDemoLogin ? "default" : "email-address"}
                    autoCapitalize="none"
                />

                {!isDemoLogin && (
                    <View style={[styles.passwordContainer, errorFields.includes('password') && styles.inputError]}>
                        <TextInput
                            ref={passwordRef}
                            style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent' }]}
                            placeholder="Contraseña"
                            value={password}
                            onChangeText={(text) => {
                                setPassword(text);
                                if (errorFields.includes('password')) setErrorFields(errorFields.filter(f => f !== 'password'));
                            }}
                            secureTextEntry={!showPassword}
                        />
                        <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                            <FontAwesome name={showPassword ? "eye" : "eye-slash"} size={20} color="#666" />
                        </Pressable>
                    </View>
                )}

                {!isLogin && !isDemoLogin && (
                    <View style={[styles.passwordContainer, errorFields.includes('confirmPassword') && styles.inputError]}>
                        <TextInput
                            ref={confirmPasswordRef}
                            style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent' }]}
                            placeholder="Verificar contraseña"
                            value={confirmPassword}
                            onChangeText={(text) => {
                                setConfirmPassword(text);
                                if (errorFields.includes('confirmPassword')) setErrorFields(errorFields.filter(f => f !== 'confirmPassword'));
                            }}
                            secureTextEntry={!showConfirmPassword}
                            contextMenuHidden={true}
                            {...(Platform.OS === 'web' ? { onPaste: (e: any) => e.preventDefault() } : {})}
                        />
                        <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                            <FontAwesome name={showConfirmPassword ? "eye" : "eye-slash"} size={20} color="#666" />
                        </Pressable>
                    </View>
                )}

                {isLogin && !isDemoLogin && (
                    <Pressable onPress={handleForgotPassword} style={{ alignSelf: 'flex-end', marginTop: 5, marginBottom: 15 }}>
                        <Text style={{ color: '#ea580c', fontSize: 13, fontWeight: '600' }}>¿Olvidaste tu contraseña?</Text>
                    </Pressable>
                )}

                <Pressable style={styles.mainBtn} onPress={handleAuth} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>{isDemoLogin ? 'Ingresar al Demo' : (isLogin ? 'Ingresar' : 'Registrarme')}</Text>}
                </Pressable>

                {(typeof params === "undefined" || params.demo !== "true") && !IS_DEDICATED_APP && (
                    <Pressable
                        style={styles.switchBtn}
                        onPress={() => {
                            if (isDemoLogin) {
                                setIsDemoLogin(false);
                                setIsLogin(true);
                            } else {
                                setIsLogin(!isLogin);
                            }
                            setError('');
                            setConfirmPassword('');
                            setErrorFields([]);
                        }}
                    >
                        <Text style={styles.switchBtnText}>
                            {isDemoLogin ? 'Volver al ingreso normal' : (isLogin ? '¿No tenés cuenta? Registrá tu negocio acá' : '¿Ya tenés cuenta? Iniciá sesión')}
                        </Text>
                    </Pressable>
                )}

                {!isDemoLogin && isLogin && !IS_DEDICATED_APP && (typeof params === "undefined" || params.demo !== "true") && (
                    <Pressable
                        style={[styles.switchBtn, { marginTop: 10 }]}
                        onPress={() => {
                            setIsDemoLogin(true);
                            setError('');
                            setErrorFields([]);
                        }}
                    >
                        <Text style={[styles.switchBtnText, { color: '#8b5cf6' }]}>
                            Tengo un acceso de Demo
                        </Text>
                    </Pressable>
                )}
            </View>

            {/* MODAL DE RECUPERAR CONTRASEÑA */}
            <Modal visible={recoveryModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Text style={styles.title}>Recuperar Contraseña</Text>
                        <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 15 }]}>
                            Ingresá tu correo electrónico para recibir el enlace de restablecimiento:
                        </Text>
                        <TextInput
                            style={[
                                styles.input, 
                                { 
                                    width: '100%', 
                                    backgroundColor: '#f1f5f9', 
                                    borderColor: '#cbd5e1', 
                                    borderWidth: 1, 
                                    marginBottom: 20, 
                                    padding: 12, 
                                    borderRadius: 8 
                                }
                            ]}
                            placeholder="ejemplo@correo.com"
                            value={recoveryEmail}
                            onChangeText={setRecoveryEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 10, width: '100%', justifyContent: 'space-between' }}>
                            <Pressable 
                                style={[styles.mainBtn, { flex: 1, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', marginTop: 0 }]} 
                                onPress={() => setRecoveryModalVisible(false)}
                            >
                                <Text style={{ color: '#475569', fontWeight: 'bold' }}>Cancelar</Text>
                            </Pressable>
                            <Pressable 
                                style={[styles.mainBtn, { flex: 1, backgroundColor: '#ea580c', marginTop: 0 }]} 
                                onPress={async () => {
                                    if (!recoveryEmail.trim()) {
                                        setError('Por favor, ingresá un email válido.');
                                        return;
                                    }
                                    setRecoveryModalVisible(false);
                                    setLoading(true);
                                    setError('');
                                    try {
                                        auth.languageCode = 'es'; // Fuerza idioma español para el email
                                        await sendPasswordResetEmail(auth, recoveryEmail.trim());
                                        if (Platform.OS === 'web') alert('Te enviamos un correo a ' + recoveryEmail.trim() + ' para restablecer tu contraseña. Revisá tu casilla (y la carpeta de spam si es necesario).');
                                        else Alert.alert('Enlace Enviado', 'Te enviamos un correo a ' + recoveryEmail.trim() + ' para restablecer tu contraseña. Revisá tu casilla (y la carpeta de spam si es necesario).');
                                    } catch (error: any) {
                                        console.error('Password Reset Error:', error);
                                        let msg = 'Ocurrió un error al intentar enviar el correo.';
                                        if (error.code === 'auth/user-not-found') {
                                            msg = 'No hay ninguna cuenta registrada con este email.';
                                        } else if (error.code === 'auth/invalid-email') {
                                            msg = 'El formato de email no es válido.';
                                        }
                                        setError(msg);
                                    } finally {
                                        setLoading(false);
                                    }
                                }}
                            >
                                <Text style={styles.mainBtnText}>Enviar</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
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
        fontSize: 28,
        fontWeight: '900',
        color: '#1e293b',
        textAlign: 'center',
        marginBottom: 5
    },
    subtitle: {
        fontSize: 15,
        color: '#64748b',
        textAlign: 'center',
        marginBottom: 25
    },
    input: {
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 14,
        borderRadius: 10,
        fontSize: 15,
        marginBottom: 15
    },
    inputError: {
        borderColor: '#ef4444',
        borderWidth: 1.5,
        backgroundColor: '#fff5f5'
    },
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        marginBottom: 15,
    },
    eyeIcon: {
        padding: 14,
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
        backgroundColor: '#0f172a',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 5
    },
    mainBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    },
    switchBtn: {
        marginTop: 20,
        alignItems: 'center'
    },
    switchBtnText: {
        color: '#3b82f6',
        fontWeight: '600',
        fontSize: 14
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalBox: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 25,
        width: '90%',
        maxWidth: 400,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5
    }
});

