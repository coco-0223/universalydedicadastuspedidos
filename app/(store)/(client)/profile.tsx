import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert, ScrollView, ActivityIndicator, Platform, Modal } from 'react-native';
import { registerForPushNotificationsAsync } from '../../../src/utils/notificationHelper';
import { useAppContext } from '../../../src/context/AppContext';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../../src/config/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { router, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { savePushTokenToFirebase } from '../../../src/services/businessService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ProfileScreen() {
    const { user, setUser, businessProfile, settings } = useAppContext();
    const params = useLocalSearchParams();
    const [isLogin, setIsLogin] = useState(params.mode !== 'register');
    const [activeTab, setActiveTab] = useState<'datos' | 'sorteos'>('datos');

    useEffect(() => {
        if (params.mode === 'register') {
            setIsLogin(false);
        } else if (params.mode === 'login') {
            setIsLogin(true);
        }
    }, [params.mode]);
    
    // Auth fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    
    // Profile fields
    const [name, setName] = useState('');
    const [countryCode, setCountryCode] = useState('54');
    const [phoneBody, setPhoneBody] = useState('');
    const [neighborhood, setNeighborhood] = useState('');
    const [address, setAddress] = useState('');
    const [doorbell, setDoorbell] = useState('');
    const [deliveryInstructions, setDeliveryInstructions] = useState('');
    const [pushToken, setPushToken] = useState<string | null>(null);

    const [errors, setErrors] = useState<Record<string, string>>({});

    const [hasChanges, setHasChanges] = useState(false);
    const [loading, setLoading] = useState(false);
    const [scanned, setScanned] = useState(false);

    const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);
    const [recoveryEmail, setRecoveryEmail] = useState('');
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);

    const handleForgotPassword = () => {
        setRecoveryEmail(email || '');
        setRecoveryModalVisible(true);
    };

    useEffect(() => {
        if (user && user.id !== 'guest') {
            setName(user.name || '');
            
            // Parse existing phone: +[country]11[body]
            const fullPhone = user.phone || '+5411';
            const phoneMatch = fullPhone.match(/^\+(\d+)11(\d{8})$/);
            if (phoneMatch) {
                setCountryCode(phoneMatch[1]);
                setPhoneBody(phoneMatch[2]);
            } else {
                setCountryCode('54');
                setPhoneBody('');
            }

            setNeighborhood(user.neighborhood || '');
            setAddress(user.address || '');
            setDoorbell(user.doorbell || '');
            setDeliveryInstructions(user.deliveryInstructions || '');
            
            // Ver si tenemos un token para mostrar y guardarlo
            if (Platform.OS !== 'web') {
                registerForPushNotificationsAsync().then(t => {
                    if (t) {
                        setPushToken(t);
                        savePushTokenToFirebase(businessProfile.id, user.id, t);
                    }
                });
            }
            // Reset hasChanges after loading initial data
            setHasChanges(false);
        }
    }, [user]);

    // Track changes
    useEffect(() => {
        if (user && user.id !== 'guest') {
            const currentFullPhone = '+' + countryCode + '11' + phoneBody;
            const isDifferent = 
                name !== (user.name || '') ||
                currentFullPhone !== (user.phone || '+5411') ||
                neighborhood !== (user.neighborhood || '') ||
                address !== (user.address || '') ||
                doorbell !== (user.doorbell || '') ||
                deliveryInstructions !== (user.deliveryInstructions || '');
            setHasChanges(isDifferent);
        }
    }, [name, countryCode, phoneBody, neighborhood, address, doorbell, deliveryInstructions, user]);

    const handleAuth = async () => {
        setErrors({});
        let newErrors: Record<string, string> = {};

        if (!email) newErrors.email = 'Completá tu email';
        if (!password) newErrors.password = 'Completá tu contraseña';
        
        if (!isLogin) {
            if (!confirmPassword) {
                newErrors.confirmPassword = 'Confirmá tu contraseña';
            } else if (confirmPassword !== password) {
                newErrors.confirmPassword = 'Las contraseñas no coinciden';
            }
            if (!name) newErrors.name = 'Completá tu nombre';
            if (!neighborhood) newErrors.neighborhood = 'Completá tu barrio';
            if (!address) newErrors.address = 'Completá tu dirección';
            if (!countryCode) newErrors.countryCode = 'Falta código de país';
            if (phoneBody.length !== 8) newErrors.phoneBody = 'El número debe tener 8 dígitos';
        }
        
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        
        setLoading(true);

        try {
            let authId = '';
            const fullPhone = '+' + countryCode + '11' + phoneBody;
            
            if (isLogin) {
                const cred = await signInWithEmailAndPassword(auth, email, password);
                authId = cred.user.uid;
                
                const d = await getDoc(doc(db, 'users', authId));
                if (d.exists()) {
                    const data = d.data();
                    if (data.role === 'business') {
                        await signOut(auth);
                        const err = new Error("Credenciales inválidas");
                        (err as any).code = 'auth/invalid-credential';
                        throw err;
                    }
                    setUser({
                        id: authId,
                        name: data.name || '',
                        surname: data.surname || '',
                        address: data.address || '',
                        doorbell: data.doorbell || '',
                        deliveryInstructions: data.deliveryInstructions || '',
                        phone: data.phone || '',
                        neighborhood: data.neighborhood || '',
                        role: 'client',
                        scanPoints: data.scanPoints || 0,
                        rafflePoints: data.rafflePoints || 0,
                        totalSpent: data.totalSpent || 0
                    });
                }
            } else {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                authId = cred.user.uid;
                
                const newUser = {
                    id: authId,
                    role: 'client' as const,
                    name: name,
                    surname: '',
                    phone: fullPhone,
                    neighborhood: neighborhood,
                    address: address,
                    doorbell: doorbell,
                    deliveryInstructions: deliveryInstructions,
                    scanPoints: 0,
                    rafflePoints: 0,
                    totalSpent: 0
                };
                
                await setDoc(doc(db, 'users', authId), { ...newUser, email });
                await AsyncStorage.setItem('justRegistered', 'true');
                setUser(newUser);
                setShowSuccessPopup(true);
                setTimeout(() => setShowSuccessPopup(false), 3000);
            }
        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                setErrors({ email: 'Email ya en uso.' });
            } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setErrors({ email: 'Credenciales inválidas', password: ' ' });
            } else {
                Alert.alert('Error', err.message || 'Error al autenticar');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateProfile = async () => {
        if (!user || user.id === 'guest') return;
        
        setErrors({});
        let newErrors: Record<string, string> = {};

        if (!name) newErrors.name = 'Completá tu nombre';
        if (!neighborhood) newErrors.neighborhood = 'Completá tu barrio';
        if (!address) newErrors.address = 'Completá tu dirección';
        if (!countryCode) newErrors.countryCode = 'Falta código de país';
        if (phoneBody.length !== 8) newErrors.phoneBody = 'El número debe tener 8 dígitos';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const fullPhone = '+' + countryCode + '11' + phoneBody;

        setLoading(true);
        try {
            const userRef = doc(db, 'users', user.id);
            await updateDoc(userRef, {
                name,
                phone: fullPhone,
                neighborhood,
                address,
                doorbell,
                deliveryInstructions
            });
            setUser({ ...user, name, phone: fullPhone, neighborhood, address, doorbell, deliveryInstructions });
            Alert.alert('Éxito', 'Perfil actualizado correctamente.');
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo actualizar el perfil.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            setUser(null);
            setEmail('');
            setPassword('');
        } catch (error) {
            console.error(error);
        }
    };

    const mockScanQR = async () => {
        if (!user || user.id === 'guest') {
            Alert.alert("Error", "Necesitas estar registrado para sumar puntos.");
            return;
        }

        setScanned(true);
        setLoading(true);

        try {
            const userRef = doc(db, 'users', user.id);
            const userSnap = await getDoc(userRef);
            
            let currentPoints = 0;
            if (userSnap.exists()) {
                currentPoints = userSnap.data().scanPoints || 0;
            }

            const newPoints = currentPoints + 1;
            
            await updateDoc(userRef, {
                scanPoints: newPoints
            });

            setUser({ ...user, scanPoints: newPoints });

            Alert.alert(
                "¡Éxito!", 
                `Has escaneado tu código en la sucursal de ${businessProfile.name}.\n\nTienes ${newPoints} punto(s) acumulados para el sorteo mensual. ¡Suerte!`
            );
        } catch (error) {
            console.error("Error al sumar punto:", error);
            Alert.alert("Error", "No pudimos registrar tu escaneo en este momento.");
            setScanned(false);
        } finally {
            setLoading(false);
        }
    };

    if (!user || user.id === 'guest') {
        return (
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.card}>
                    <Text style={styles.title}>Mi Cuenta</Text>
                    <Text style={styles.subtitle}>{isLogin ? 'Iniciá sesión para continuar' : 'Creá tu perfil de cliente'}</Text>

                    <TextInput 
                        style={[styles.input, errors.email && styles.inputError]} 
                        placeholder="Email" 
                        value={email} 
                        onChangeText={(t) => { setEmail(t); if(errors.email) setErrors({}); }} 
                        keyboardType="email-address" 
                        autoCapitalize="none" 
                    />
                    {errors.email && <Text style={styles.errorLegend}>{errors.email}</Text>}
                    
                    <View style={[styles.passwordContainer, errors.password && styles.inputError]}>
                        <TextInput 
                            style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent' }]} 
                            placeholder="Contraseña" 
                            value={password} 
                            onChangeText={(t) => { setPassword(t); if(errors.password) setErrors({}); }} 
                            secureTextEntry={!showPassword} 
                        />
                        <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                            <FontAwesome name={showPassword ? "eye" : "eye-slash"} size={20} color="#666" />
                        </Pressable>
                    </View>
                    {errors.password && <Text style={styles.errorLegend}>{errors.password}</Text>}

                    {!isLogin && (
                        <>
                            <View style={[styles.passwordContainer, errors.confirmPassword && styles.inputError]}>
                                <TextInput 
                                    style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent' }]} 
                                    placeholder="Verificar contraseña" 
                                    value={confirmPassword} 
                                    onChangeText={(t) => { setConfirmPassword(t); if(errors.confirmPassword) setErrors({}); }} 
                                    secureTextEntry={!showConfirmPassword} 
                                    contextMenuHidden={true}
                                    {...(Platform.OS === 'web' ? { onPaste: (e: any) => e.preventDefault() } : {})}
                                />
                                <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                                    <FontAwesome name={showConfirmPassword ? "eye" : "eye-slash"} size={20} color="#666" />
                                </Pressable>
                            </View>
                            {errors.confirmPassword && <Text style={styles.errorLegend}>{errors.confirmPassword}</Text>}
                        </>
                    )}

                    {isLogin && (
                        <Pressable onPress={handleForgotPassword} style={{ alignSelf: 'flex-end', marginTop: 5, marginBottom: 15 }}>
                            <Text style={{ color: '#3b82f6', fontSize: 13, fontWeight: '600' }}>¿Olvidaste tu contraseña?</Text>
                        </Pressable>
                    )}

                    {!isLogin && (
                        <>
                            <TextInput 
                                style={[styles.input, errors.name && styles.inputError]} 
                                placeholder="Nombre completo" 
                                value={name} 
                                onChangeText={(t) => { setName(t); if(errors.name) setErrors({}); }} 
                            />
                            {errors.name && <Text style={styles.errorLegend}>{errors.name}</Text>}

                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: (errors.phoneBody || errors.countryCode) ? 0 : 10 }}>
                                <View style={[styles.input, { flex: 0.3, flexDirection: 'row', alignItems: 'center', padding: 0 }, (errors.phoneBody || errors.countryCode) && styles.inputError]}>
                                    <Text style={styles.fixedChar}>+</Text>
                                    <TextInput 
                                        style={{ flex: 1, paddingHorizontal: 5, fontSize: 16, fontWeight: '600' }} 
                                        value={countryCode} 
                                        onChangeText={(t) => { setCountryCode(t.replace(/[^0-9]/g, '')); if(errors.countryCode) setErrors({}); }} 
                                        placeholder="54" 
                                        keyboardType="phone-pad" 
                                        maxLength={3}
                                    />
                                </View>
                                <View style={[styles.input, { flex: 0.7, flexDirection: 'row', alignItems: 'center', padding: 0 }, (errors.phoneBody || errors.countryCode) && styles.inputError]}>
                                    <Text style={styles.fixedChar}>11</Text>
                                    <TextInput 
                                        style={{ flex: 1, paddingHorizontal: 10, fontSize: 16 }} 
                                        value={phoneBody} 
                                        onChangeText={(t) => { setPhoneBody(t.replace(/[^0-9]/g, '')); if(errors.phoneBody) setErrors({}); }} 
                                        placeholder="8 números" 
                                        keyboardType="phone-pad" 
                                        maxLength={8}
                                    />
                                </View>
                            </View>
                            {(errors.phoneBody || errors.countryCode) && <Text style={styles.errorLegend}>{errors.phoneBody || errors.countryCode}</Text>}

                            <TextInput 
                                style={[styles.input, errors.neighborhood && styles.inputError]} 
                                placeholder="Barrio" 
                                value={neighborhood} 
                                onChangeText={(t) => { setNeighborhood(t); if(errors.neighborhood) setErrors({}); }} 
                            />
                            {errors.neighborhood && <Text style={styles.errorLegend}>{errors.neighborhood}</Text>}

                            <TextInput 
                                style={[styles.input, errors.address && styles.inputError]} 
                                placeholder="Dirección exacta" 
                                value={address} 
                                onChangeText={(t) => { setAddress(t); if(errors.address) setErrors({}); }} 
                            />
                            {errors.address && <Text style={styles.errorLegend}>{errors.address}</Text>}

                            <TextInput 
                                style={styles.input} 
                                placeholder="Timbre (Opcional)" 
                                value={doorbell} 
                                onChangeText={setDoorbell} 
                            />

                            <TextInput 
                                style={styles.input} 
                                placeholder="Indicaciones al llegar (Opcional)" 
                                value={deliveryInstructions} 
                                onChangeText={setDeliveryInstructions} 
                            />

                            <Text style={styles.hintText}>* El celular debe iniciar con +5411</Text>
                        </>
                    )}

                    <Pressable style={[styles.mainBtn, { backgroundColor: businessProfile.primaryColor || '#0f172a' }]} onPress={handleAuth} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>{isLogin ? 'Ingresar' : 'Registrarme'}</Text>}
                    </Pressable>

                    <Pressable style={styles.switchBtn} onPress={() => {
                        setIsLogin(!isLogin);
                        setConfirmPassword('');
                        setErrors({});
                    }}>
                        <Text style={styles.switchBtnText}>
                            {isLogin ? '¿No tenés cuenta? Registrate acá' : '¿Ya tenés cuenta? Iniciá sesión'}
                        </Text>
                    </Pressable>
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
                                    style={[styles.mainBtn, { flex: 1, backgroundColor: businessProfile.primaryColor || '#0f172a', marginTop: 0 }]} 
                                    onPress={async () => {
                                        if (!recoveryEmail.trim()) {
                                            Alert.alert('Error', 'Por favor, ingresá un email válido.');
                                            return;
                                        }
                                        setRecoveryModalVisible(false);
                                        setLoading(true);
                                        try {
                                            auth.languageCode = 'es'; // Fuerza idioma español para el email
                                            await sendPasswordResetEmail(auth, recoveryEmail.trim());
                                            Alert.alert('Enlace Enviado', 'Te enviamos un correo a ' + recoveryEmail.trim() + ' para restablecer tu contraseña. Revisá tu casilla (y la carpeta de spam si es necesario).');
                                        } catch (error: any) {
                                            console.error('Password Reset Error:', error);
                                            let msg = 'Ocurrió un error al intentar enviar el correo.';
                                            if (error.code === 'auth/user-not-found') {
                                                msg = 'No hay ninguna cuenta registrada con este email.';
                                            } else if (error.code === 'auth/invalid-email') {
                                                msg = 'El formato de email no es válido.';
                                            }
                                            Alert.alert('Error', msg);
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
            </ScrollView>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <View style={{ flexDirection: 'row', marginBottom: 20, backgroundColor: '#f1f5f9', borderRadius: 12, padding: 5 }}>
                <Pressable style={[styles.tabBtn, activeTab === 'datos' && { backgroundColor: '#fff', shadowOpacity: 0.1, shadowRadius: 5 }]} onPress={() => setActiveTab('datos')}>
                    <Text style={[styles.tabBtnText, activeTab === 'datos' && { color: '#0f172a', fontWeight: 'bold' }]}>Datos Personales</Text>
                </Pressable>
                <Pressable style={[styles.tabBtn, activeTab === 'sorteos' && { backgroundColor: '#fff', shadowOpacity: 0.1, shadowRadius: 5 }]} onPress={() => setActiveTab('sorteos')}>
                    <Text style={[styles.tabBtnText, activeTab === 'sorteos' && { color: '#0f172a', fontWeight: 'bold' }]}>Sorteos</Text>
                </Pressable>
            </View>

            {activeTab === 'datos' ? (
                <View style={styles.card}>
                    <Text style={styles.title}>Mi Perfil</Text>
                    
                    <View style={styles.formGroup}>
                    <Text style={styles.label}>Nombre completo</Text>
                    <TextInput style={[styles.input, errors.name && styles.inputError]} value={name} onChangeText={(t) => { setName(t); if(errors.name) setErrors({}); }} />
                    {errors.name && <Text style={styles.errorLegend}>{errors.name}</Text>}
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Celular</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={[styles.input, { flex: 0.3, flexDirection: 'row', alignItems: 'center', padding: 0 }, (errors.phoneBody || errors.countryCode) && styles.inputError]}>
                            <Text style={styles.fixedChar}>+</Text>
                            <TextInput 
                                style={{ flex: 1, paddingHorizontal: 5, fontSize: 16, fontWeight: '600' }} 
                                value={countryCode} 
                                onChangeText={(t) => { setCountryCode(t.replace(/[^0-9]/g, '')); if(errors.countryCode) setErrors({}); }} 
                                placeholder="54" 
                                keyboardType="phone-pad" 
                                maxLength={3}
                            />
                        </View>
                        <View style={[styles.input, { flex: 0.7, flexDirection: 'row', alignItems: 'center', padding: 0 }, (errors.phoneBody || errors.countryCode) && styles.inputError]}>
                            <Text style={styles.fixedChar}>11</Text>
                            <TextInput 
                                style={{ flex: 1, paddingHorizontal: 10, fontSize: 16 }} 
                                value={phoneBody} 
                                onChangeText={(t) => { setPhoneBody(t.replace(/[^0-9]/g, '')); if(errors.phoneBody) setErrors({}); }} 
                                placeholder="8 números" 
                                keyboardType="phone-pad" 
                                maxLength={8}
                            />
                        </View>
                    </View>
                    {(errors.phoneBody || errors.countryCode) && <Text style={styles.errorLegend}>{errors.phoneBody || errors.countryCode}</Text>}
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Barrio</Text>
                    <TextInput style={[styles.input, errors.neighborhood && styles.inputError]} value={neighborhood} onChangeText={(t) => { setNeighborhood(t); if(errors.neighborhood) setErrors({}); }} />
                    {errors.neighborhood && <Text style={styles.errorLegend}>{errors.neighborhood}</Text>}
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Dirección exacta</Text>
                    <TextInput style={[styles.input, errors.address && styles.inputError]} value={address} onChangeText={(t) => { setAddress(t); if(errors.address) setErrors({}); }} />
                    {errors.address && <Text style={styles.errorLegend}>{errors.address}</Text>}
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Timbre (Opcional)</Text>
                    <TextInput style={styles.input} value={doorbell} onChangeText={setDoorbell} placeholder="Ej. 1B / Casa 2" />
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Indicaciones al llegar (Opcional)</Text>
                    <TextInput style={styles.input} value={deliveryInstructions} onChangeText={setDeliveryInstructions} placeholder="Ej. Portón negro..." />
                </View>

                <Pressable 
                    style={[
                        styles.mainBtn, 
                        { backgroundColor: businessProfile.primaryColor || '#0f172a' },
                        !hasChanges && { opacity: 0.5, backgroundColor: '#94a3b8' }
                    ]} 
                    onPress={handleUpdateProfile} 
                    disabled={loading || !hasChanges}
                >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>Guardar Cambios</Text>}
                </Pressable>
                
                <Pressable style={styles.logoutBtn} onPress={handleLogout}>
                    <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
                </Pressable>

                {/* Se eliminó la visualización del token para el usuario final */}
            </View>
            ) : (
                <View style={styles.card}>
                    <Text style={styles.title}>Mis Chances</Text>
                    <Text style={{ fontSize: 40, fontWeight: 'bold', color: '#0f766e', textAlign: 'center', marginVertical: 20 }}>
                        {user.rafflePoints || 0}
                    </Text>
                    <Text style={{ textAlign: 'center', color: '#64748b', marginBottom: 20 }}>chances acumuladas</Text>

                    {(() => {
                        const activeRaffle = (settings?.raffles || []).find((r: any) => r.active);
                        if (!activeRaffle) return <Text style={{ textAlign: 'center', color: '#64748b' }}>No hay sorteos activos en este momento.</Text>;
                        return (
                            <View style={{ backgroundColor: '#f0fdfa', padding: 15, borderRadius: 12 }}>
                                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0f766e' }}>{activeRaffle.title}</Text>
                                <Text style={{ fontSize: 14, color: '#334155', marginTop: 5 }}>{activeRaffle.description}</Text>
                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#ef4444', marginTop: 10 }}>Finaliza el: {new Date(activeRaffle.drawEndDate).toLocaleDateString()}</Text>
                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#334155', marginTop: 15 }}>Premios:</Text>
                                {(activeRaffle.prizes || []).map((p: any) => (
                                    <Text key={p.id} style={{ fontSize: 14, color: '#475569', marginLeft: 10 }}>• #{p.position}: {p.description}</Text>
                                ))}
                            </View>
                        );
                    })()}
                </View>
            )}

            <Modal visible={showSuccessPopup} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: '#dcfce7', borderColor: '#22c55e', borderWidth: 2 }]}>
                        <Text style={{ fontSize: 40, marginBottom: 10 }}>✅</Text>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#166534', textAlign: 'center' }}>
                            Cuenta creada exitosamente!
                        </Text>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        backgroundColor: '#f8fafc',
        padding: 20,
        paddingBottom: 100
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 8,
    },
    tabBtnText: {
        fontSize: 14,
        color: '#64748b',
        fontWeight: '600'
    },
    card: {
        backgroundColor: '#fff',
        padding: 25,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3
    },
    title: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#1e293b',
        textAlign: 'center',
        marginBottom: 8
    },
    subtitle: {
        fontSize: 15,
        color: '#64748b',
        textAlign: 'center',
        marginBottom: 20
    },
    formGroup: {
        marginBottom: 15
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 5
    },
    input: {
        backgroundColor: '#e9e9e9',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        padding: 14,
        borderRadius: 10,
        fontSize: 15,
        marginBottom: 10,
        color: '#1e293b',
    },
    inputError: {
        borderColor: '#ef4444',
        borderWidth: 1.5,
        backgroundColor: '#fff5f5'
    },
    fixedChar: { 
        fontWeight: 'bold', 
        color: '#334155', 
        fontSize: 18,
        marginLeft: 15
    },
    errorLegend: {
        color: '#ef4444',
        fontSize: 12,
        marginBottom: 8,
        marginLeft: 4,
        fontWeight: '600'
    },
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e9e9e9',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 10,
        marginBottom: 10,
    },
    eyeIcon: {
        padding: 14,
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 10,
        backgroundColor: '#fff',
        marginTop: 20,
    },
    googleButtonText: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#444',
    },
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 15,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: '#e2e8f0',
    },
    dividerText: {
        marginHorizontal: 10,
        color: '#666',
        fontSize: 12,
    },
    hintText: {
        fontSize: 12,
        color: '#64748b',
        marginBottom: 15,
        textAlign: 'center'
    },
    mainBtn: {
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 10
    },
    mainBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16
    },
    logoutBtn: {
        marginTop: 15,
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ef4444'
    },
    logoutBtnText: {
        color: '#ef4444',
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
    qrTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111',
        marginBottom: 8,
        textAlign: 'center'
    },
    qrSubtitle: {
        fontSize: 14,
        color: '#555',
        textAlign: 'center',
        marginBottom: 20
    },
    cameraBoxPlaceholder: {
        width: '100%',
        height: 180,
        borderWidth: 2,
        borderColor: '#e2e8f0',
        borderRadius: 16,
        borderStyle: 'dashed',
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20
    },
    placeholderText: {
        color: '#64748b',
        fontSize: 14,
        marginTop: 10,
        fontWeight: '600'
    },
    scanBtn: {
        paddingVertical: 15,
        borderRadius: 12,
        alignItems: 'center'
    },
    scanBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
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
