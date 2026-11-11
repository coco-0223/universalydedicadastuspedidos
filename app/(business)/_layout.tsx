import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, useWindowDimensions, Modal, ScrollView, Alert } from 'react-native';
import { Slot, useRouter, usePathname, Redirect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';
import { auth } from '../../src/config/firebase';
import { useAppContext } from '../../src/context/AppContext';
import { TutorialOverlay } from '../../src/components/TutorialOverlay';
import { getOrGenerateAccessPin } from '../../src/utils/prospectManager';
import { ExcelTemplateWizardModal } from '../../src/components/ExcelTemplateWizardModal';

export default function BusinessLayout() {
    const { user, setUser, isLoading, businessProfile, settings } = useAppContext();
    const router = useRouter();
    const [forceShowTutorial, setForceShowTutorial] = useState(false);
    const [showMoreModal, setShowMoreModal] = useState(false);
    const [showDemoToolsModal, setShowDemoToolsModal] = useState(false);
    const [showExcelWizardDirect, setShowExcelWizardDirect] = useState(false);
    const pathname = usePathname();
    const { width } = useWindowDimensions();
    const isMobile = width < 768;

    useEffect(() => {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
            document.body.style.overflowX = 'hidden';
            document.documentElement.style.overflowX = 'hidden';
        }
    }, []);

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (e) {}
        setUser(null);
        await AsyncStorage.removeItem('user');
    };

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                <ActivityIndicator size="large" color="#0284c7" />
                <Text style={{ marginTop: 10, color: '#64748b', fontWeight: '600' }}>Cargando panel...</Text>
            </View>
        );
    }

    if (Platform.OS !== 'web') {
        return <Redirect href={'/(store)' as any} />;
    }

    if (!user || user.role !== 'business') {
        return <Redirect href="/business-auth" />;
    }

    const navItems = [
        { name: 'admin', label: 'Panel', icon: 'list-alt' },
        { name: 'products', label: 'Catálogo', icon: 'tags' },
        { name: 'clients', label: 'Clientes', icon: 'users' },
        { name: 'settings', label: 'Ajustes', icon: 'cog' },
        { name: 'branding', label: 'Branding', icon: 'paint-brush' },
        { name: 'marketing', label: 'Marketing', icon: 'bullhorn' },
        { name: 'preview', label: 'Ver App', icon: 'mobile' },
    ];

    const currentHost = typeof window !== 'undefined' ? (window.location.hostname || '').toLowerCase() : '';
    const isTusPedidosDomain = currentHost.includes('tuspedidos-web.vercel.app') || currentHost.includes('tuspedidos-mu.vercel.app') || currentHost.includes('tuspedidos') || currentHost === 'localhost' || currentHost === '127.0.0.1';
    const isSuperAdminImpersonating = isTusPedidosDomain && user?.email === 'cocobustos.93@gmail.com' && businessProfile?.id !== user.id;

    const handleStopImpersonating = async () => {
        await AsyncStorage.removeItem('businessProfile');
        router.replace('/(admin)/dashboard');
        if (typeof window !== 'undefined') window.location.href = '/dashboard';
    };

    const handleResetDemo = async () => {
        try {
            if (Platform.OS === 'web') {
                const conf = window.confirm('¿Reiniciar la demo?\n\nEsto limpiará la sesión y el dispositivo de prueba actual para que puedas empezar de cero desde la pantalla de bienvenida / demo.');
                if (!conf) return;
            }
            await AsyncStorage.removeItem('tp_trial_created');
            await AsyncStorage.removeItem('tp_device_key');
            if (businessProfile?.id) {
                await AsyncStorage.removeItem('tp_device_key_' + businessProfile.id);
                await AsyncStorage.removeItem('tp_owner_email_' + businessProfile.id);
            }
            await AsyncStorage.removeItem('tp_trial_business_id');
            await AsyncStorage.removeItem('businessProfile');
            await AsyncStorage.removeItem('user');
            try {
                await signOut(auth);
            } catch (e) {}
            setUser(null);
            setShowDemoToolsModal(false);
            router.replace('/iniciar-demo');
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.location.href = '/iniciar-demo';
            }
        } catch (e) {
            console.error('Error al reiniciar demo:', e);
        }
    };

    const currentAccessPin = getOrGenerateAccessPin(businessProfile?.id);

    return (
        <View style={[styles.container, isMobile && styles.containerMobile]}>
            {isSuperAdminImpersonating && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, backgroundColor: '#ef4444', padding: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: 'white', fontWeight: 'bold', marginRight: 15 }}>Modo SuperAdmin: Gestionando {businessProfile?.name}</Text>
                    <Pressable style={{ backgroundColor: 'white', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5 }} onPress={handleStopImpersonating}>
                        <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12 }}>VOLVER AL SUPERADMIN</Text>
                    </Pressable>
                </View>
            )}

            {/* Sidebar (Desktop Only) */}
            {!isMobile && (
                <View style={styles.sidebar}>
                    {user?.email === 'carniketing@gmail.com' ? (
                        <View style={[styles.logoContainer, { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f3e8ff' }]}>
                            <View style={{ alignItems: 'center' }}>
                                <FontAwesome name="trophy" size={28} color="#d97706" />
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#a855f7', marginTop: 4 }}>CarniKeting Pro 👑</Text>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.logoContainer}>
                            <FontAwesome name="rocket" size={32} color="#1e293b" />
                        </View>
                    )}

                    <View style={styles.navContainer}>
                        {navItems.map((item) => {
                            const isActive = pathname.includes(item.name);
                            const isCarniketing = user?.email === 'carniketing@gmail.com';
                            const activeColor = isCarniketing ? '#a855f7' : '#0284c7';
                            const activeBg = isCarniketing ? '#faf5ff' : '#f0f9ff';
                            
                            return (
                                <Pressable
                                    key={item.name}
                                    style={[
                                        styles.navItem,
                                        isActive && { backgroundColor: activeBg }
                                    ]}
                                    onPress={() => router.push(`/(business)/${item.name}` as any)}
                                >
                                    <FontAwesome 
                                        name={item.icon as any} 
                                        size={20} 
                                        color={isActive ? activeColor : '#64748b'} 
                                    />
                                    <Text style={[
                                        styles.navLabel,
                                        isActive && { color: activeColor, fontWeight: '700' }
                                    ]}>
                                        {item.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <View style={{ paddingVertical: 10, paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
                        <Text style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }} numberOfLines={1}>
                            {user.email}
                        </Text>
                    </View>
                    <Pressable style={styles.logoutBtn} onPress={() => setForceShowTutorial(true)}>
                        <FontAwesome name="question-circle" size={20} color="#10b981" />
                        <Text style={[styles.logoutLabel, { color: '#10b981' }]}>Tutorial</Text>
                    </Pressable>
                    <Pressable style={styles.logoutBtn} onPress={logout}>
                        <FontAwesome name="sign-out" size={20} color="#ef4444" />
                        <Text style={styles.logoutLabel}>Salir</Text>
                    </Pressable>
                </View>
            )}

            {/* Main Content */}
            <View style={[styles.mainContent, isMobile && styles.mainContentMobile]}>
                <Slot />
            </View>

            {/* Bottom Bar (Mobile Only) */}
            {isMobile && (
                <View style={styles.bottomBar}>
                    <Pressable
                        style={styles.bottomTab}
                        onPress={() => router.push('/(business)/admin')}
                    >
                        <FontAwesome 
                            name="list-alt" 
                            size={20} 
                            color={pathname.includes('admin') ? '#0284c7' : '#64748b'} 
                        />
                        <Text style={[styles.bottomTabLabel, pathname.includes('admin') && styles.bottomTabLabelActive]}>
                            Panel
                        </Text>
                    </Pressable>

                    <Pressable
                        style={styles.bottomTab}
                        onPress={() => router.push('/(business)/products')}
                    >
                        <FontAwesome 
                            name="tags" 
                            size={20} 
                            color={pathname.includes('products') ? '#0284c7' : '#64748b'} 
                        />
                        <Text style={[styles.bottomTabLabel, pathname.includes('products') && styles.bottomTabLabelActive]}>
                            Catálogo
                        </Text>
                    </Pressable>

                    <Pressable
                        style={styles.bottomTab}
                        onPress={() => router.push('/(business)/settings')}
                    >
                        <FontAwesome 
                            name="cog" 
                            size={20} 
                            color={pathname.includes('settings') ? '#0284c7' : '#64748b'} 
                        />
                        <Text style={[styles.bottomTabLabel, pathname.includes('settings') && styles.bottomTabLabelActive]}>
                            Ajustes
                        </Text>
                    </Pressable>

                    <Pressable
                        style={styles.bottomTab}
                        onPress={() => setShowMoreModal(true)}
                    >
                        <FontAwesome 
                            name="ellipsis-h" 
                            size={20} 
                            color={(pathname.includes('clients') || pathname.includes('branding') || pathname.includes('marketing') || pathname.includes('preview')) ? '#0284c7' : '#64748b'} 
                        />
                        <Text style={[
                            styles.bottomTabLabel, 
                            (pathname.includes('clients') || pathname.includes('branding') || pathname.includes('marketing') || pathname.includes('preview')) && styles.bottomTabLabelActive
                        ]}>
                            Otros
                        </Text>
                    </Pressable>
                </View>
            )}

            {/* Modal Bottom Sheet "Otros" (Mobile) */}
            {isMobile && (
                <Modal
                    visible={showMoreModal}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setShowMoreModal(false)}
                >
                    <Pressable style={styles.sheetOverlay} onPress={() => setShowMoreModal(false)}>
                        <Pressable style={styles.sheetContent} onPress={e => e.stopPropagation()}>
                            <View style={styles.sheetHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.sheetTitle}>Más Secciones</Text>
                                    <Text style={styles.sheetSubtitle} numberOfLines={1}>
                                        {businessProfile?.name || user?.email}
                                    </Text>
                                </View>
                                <Pressable style={styles.sheetCloseBtn} onPress={() => setShowMoreModal(false)}>
                                    <FontAwesome name="times" size={18} color="#64748b" />
                                </Pressable>
                            </View>

                            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                                <Pressable
                                    style={styles.sheetItem}
                                    onPress={() => { setShowMoreModal(false); router.push('/(business)/clients'); }}
                                >
                                    <View style={[styles.sheetIconBox, { backgroundColor: '#e0f2fe' }]}>
                                        <FontAwesome name="users" size={18} color="#0284c7" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.sheetItemTitle}>Clientes</Text>
                                        <Text style={styles.sheetItemDesc}>Historial y pedidos de clientes</Text>
                                    </View>
                                    <FontAwesome name="chevron-right" size={14} color="#cbd5e1" />
                                </Pressable>

                                <Pressable
                                    style={styles.sheetItem}
                                    onPress={() => { setShowMoreModal(false); router.push('/(business)/branding'); }}
                                >
                                    <View style={[styles.sheetIconBox, { backgroundColor: '#fef3c7' }]}>
                                        <FontAwesome name="paint-brush" size={18} color="#d97706" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.sheetItemTitle}>Branding y Logo</Text>
                                        <Text style={styles.sheetItemDesc}>Personalizá colores, portada y logo</Text>
                                    </View>
                                    <FontAwesome name="chevron-right" size={14} color="#cbd5e1" />
                                </Pressable>

                                <Pressable
                                    style={styles.sheetItem}
                                    onPress={() => { setShowMoreModal(false); router.push('/(business)/marketing'); }}
                                >
                                    <View style={[styles.sheetIconBox, { backgroundColor: '#ede9fe' }]}>
                                        <FontAwesome name="bullhorn" size={18} color="#7c3aed" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.sheetItemTitle}>Marketing y Promos</Text>
                                        <Text style={styles.sheetItemDesc}>Flyers, cupones y mensajes</Text>
                                    </View>
                                    <FontAwesome name="chevron-right" size={14} color="#cbd5e1" />
                                </Pressable>

                                <Pressable
                                    style={styles.sheetItem}
                                    onPress={() => { setShowMoreModal(false); router.push('/(business)/preview'); }}
                                >
                                    <View style={[styles.sheetIconBox, { backgroundColor: '#dcfce7' }]}>
                                        <FontAwesome name="mobile" size={22} color="#16a34a" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.sheetItemTitle}>Ver App (Tienda)</Text>
                                        <Text style={styles.sheetItemDesc}>Abrir cómo la ven tus clientes</Text>
                                    </View>
                                    <FontAwesome name="chevron-right" size={14} color="#cbd5e1" />
                                </Pressable>

                                <Pressable
                                    style={styles.sheetItem}
                                    onPress={() => { setShowMoreModal(false); setForceShowTutorial(true); }}
                                >
                                    <View style={[styles.sheetIconBox, { backgroundColor: '#ecfdf5' }]}>
                                        <FontAwesome name="question-circle" size={18} color="#10b981" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.sheetItemTitle}>Tutorial de Uso</Text>
                                        <Text style={styles.sheetItemDesc}>Guía rápida paso a paso</Text>
                                    </View>
                                    <FontAwesome name="chevron-right" size={14} color="#cbd5e1" />
                                </Pressable>

                                <Pressable
                                    style={[styles.sheetItem, { borderBottomWidth: 0, marginTop: 10 }]}
                                    onPress={() => { setShowMoreModal(false); logout(); }}
                                >
                                    <View style={[styles.sheetIconBox, { backgroundColor: '#fee2e2' }]}>
                                        <FontAwesome name="sign-out" size={18} color="#ef4444" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.sheetItemTitle, { color: '#ef4444' }]}>Cerrar Sesión</Text>
                                        <Text style={styles.sheetItemDesc}>Salir de tu cuenta</Text>
                                    </View>
                                </Pressable>
                            </ScrollView>
                        </Pressable>
                    </Pressable>
                </Modal>
            )}
            {/* Floating Demo Navigator Button (Mobile & Desktop Demo) */}
            {isMobile && (
                <Pressable
                    style={styles.demoFloatingBtn}
                    onPress={() => setShowDemoToolsModal(true)}
                >
                    <View style={styles.demoFloatingInner}>
                        <FontAwesome name="flask" size={15} color="#ffffff" />
                        <Text style={styles.demoFloatingText}>Demo</Text>
                    </View>
                </Pressable>
            )}

            {/* Modal de Instancias de Demo y Acceso Rápido */}
            <Modal
                visible={showDemoToolsModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowDemoToolsModal(false)}
            >
                <Pressable style={styles.sheetOverlay} onPress={() => setShowDemoToolsModal(false)}>
                    <Pressable style={styles.sheetContent} onPress={e => e.stopPropagation()}>
                        <View style={styles.sheetHeader}>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.sheetTitle}>🧪 Centro de Pruebas Demo</Text>
                                    <View style={{ backgroundColor: '#e0e7ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#4338ca' }}>NAVEGADOR</Text>
                                    </View>
                                </View>
                                <Text style={styles.sheetSubtitle}>
                                    Negocio actual: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{businessProfile?.name || 'Demo'}</Text> ({businessProfile?.id})
                                </Text>
                            </View>
                            <Pressable style={styles.sheetCloseBtn} onPress={() => setShowDemoToolsModal(false)}>
                                <FontAwesome name="times" size={18} color="#64748b" />
                            </Pressable>
                        </View>

                        {/* PIN Banner */}
                        <View style={styles.demoPinBanner}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 11, color: '#0369a1', fontWeight: '600' }}>🔑 Clave de Acceso de esta Demo:</Text>
                                <Text style={{ fontSize: 16, fontWeight: '900', color: '#0284c7', letterSpacing: 1, marginTop: 2 }}>
                                    {currentAccessPin}
                                </Text>
                            </View>
                            <Pressable
                                style={styles.demoPinCopyBtn}
                                onPress={() => {
                                    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
                                        navigator.clipboard.writeText(currentAccessPin);
                                        alert('¡Clave copiada al portapapeles: ' + currentAccessPin + '!');
                                    } else {
                                        Alert.alert('Copiado', 'Clave copiada: ' + currentAccessPin);
                                    }
                                }}
                            >
                                <FontAwesome name="copy" size={13} color="#0284c7" />
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0284c7' }}>Copiar</Text>
                            </Pressable>
                        </View>

                        <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
                            {/* Instancia 1: Tutorial de Excel */}
                            <Pressable
                                style={styles.sheetItem}
                                onPress={() => {
                                    setShowDemoToolsModal(false);
                                    setShowExcelWizardDirect(true);
                                }}
                            >
                                <View style={[styles.sheetIconBox, { backgroundColor: '#dcfce7' }]}>
                                    <FontAwesome name="file-excel-o" size={18} color="#16a34a" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={styles.sheetItemTitle}>Ver Tutorial y Plantilla Excel</Text>
                                        <View style={{ backgroundColor: '#22c55e', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 }}>
                                            <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>NUEVO</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.sheetItemDesc}>
                                        Abrir el generador inteligente con tus categorías personalizadas y guía visual
                                    </Text>
                                </View>
                                <FontAwesome name="chevron-right" size={14} color="#cbd5e1" />
                            </Pressable>

                            {/* Instancia 2: Importar Excel Inteligente */}
                            <Pressable
                                style={styles.sheetItem}
                                onPress={() => {
                                    setShowDemoToolsModal(false);
                                    router.push('/(business)/products?openSmartImport=true' as any);
                                }}
                            >
                                <View style={[styles.sheetIconBox, { backgroundColor: '#e0f2fe' }]}>
                                    <FontAwesome name="upload" size={18} color="#0284c7" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.sheetItemTitle}>Carga Inteligente de Excel</Text>
                                    <Text style={styles.sheetItemDesc}>
                                        Subir archivo Excel con detección de unidades y unificación por volumen
                                    </Text>
                                </View>
                                <FontAwesome name="chevron-right" size={14} color="#cbd5e1" />
                            </Pressable>

                            {/* Instancia 3: Catálogo y Precios por Volumen */}
                            <Pressable
                                style={styles.sheetItem}
                                onPress={() => {
                                    setShowDemoToolsModal(false);
                                    router.push('/(business)/products');
                                }}
                            >
                                <View style={[styles.sheetIconBox, { backgroundColor: '#fef3c7' }]}>
                                    <FontAwesome name="tags" size={18} color="#d97706" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.sheetItemTitle}>Catálogo & Precios x Volumen</Text>
                                    <Text style={styles.sheetItemDesc}>
                                        Configuración de combos, categorías editables y guardado con tick
                                    </Text>
                                </View>
                                <FontAwesome name="chevron-right" size={14} color="#cbd5e1" />
                            </Pressable>

                            {/* Instancia 4: Ver Tienda como Cliente */}
                            <Pressable
                                style={styles.sheetItem}
                                onPress={() => {
                                    setShowDemoToolsModal(false);
                                    router.push('/(business)/preview');
                                }}
                            >
                                <View style={[styles.sheetIconBox, { backgroundColor: '#ede9fe' }]}>
                                    <FontAwesome name="mobile" size={20} color="#7c3aed" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.sheetItemTitle}>Ver Tienda de Clientes</Text>
                                    <Text style={styles.sheetItemDesc}>
                                        Simular la experiencia de compra en el catálogo online
                                    </Text>
                                </View>
                                <FontAwesome name="chevron-right" size={14} color="#cbd5e1" />
                            </Pressable>

                            {/* Instancia 5: Tutorial de Pasos */}
                            <Pressable
                                style={styles.sheetItem}
                                onPress={() => {
                                    setShowDemoToolsModal(false);
                                    setForceShowTutorial(true);
                                }}
                            >
                                <View style={[styles.sheetIconBox, { backgroundColor: '#f1f5f9' }]}>
                                    <FontAwesome name="question-circle" size={18} color="#475569" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.sheetItemTitle}>Ver Tour Guiado Completo</Text>
                                    <Text style={styles.sheetItemDesc}>
                                        Repetir el tutorial explicativo de las secciones del panel
                                    </Text>
                                </View>
                                <FontAwesome name="chevron-right" size={14} color="#cbd5e1" />
                            </Pressable>

                            {/* Instancia 6: Reiniciar Demo desde Cero */}
                            <Pressable
                                style={[styles.sheetItem, { borderBottomWidth: 0, marginTop: 12, backgroundColor: '#fff1f2', borderRadius: 12, paddingHorizontal: 12 }]}
                                onPress={handleResetDemo}
                            >
                                <View style={[styles.sheetIconBox, { backgroundColor: '#fecdd3' }]}>
                                    <FontAwesome name="refresh" size={18} color="#e11d48" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.sheetItemTitle, { color: '#e11d48' }]}>Empezar Demo de Nuevo</Text>
                                    <Text style={styles.sheetItemDesc}>
                                        Limpiar dispositivo y volver a la pantalla de inicio de prueba
                                    </Text>
                                </View>
                                <FontAwesome name="chevron-right" size={14} color="#f43f5e" />
                            </Pressable>
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Direct Excel Wizard Modal from Layout */}
            <ExcelTemplateWizardModal
                visible={showExcelWizardDirect}
                onClose={() => setShowExcelWizardDirect(false)}
                existingCategories={settings.categories || ['Vacuno', 'Pollo', 'Cerdo', 'Embutidos']}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#f8fafc',
    },
    containerMobile: {
        flexDirection: 'column',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
    },
    sidebar: {
        width: 100,
        backgroundColor: '#fff',
        borderRightWidth: 1,
        borderRightColor: '#e2e8f0',
        paddingVertical: 20,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    logoContainer: {
        marginBottom: 40,
    },
    navContainer: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
        gap: 15,
    },
    navItem: {
        width: '80%',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    navItemActive: {
        backgroundColor: '#f0f9ff',
    },
    navLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: '#64748b',
        textAlign: 'center',
    },
    navLabelActive: {
        color: '#0284c7',
    },
    logoutBtn: {
        marginTop: 'auto',
        alignItems: 'center',
        gap: 4,
        paddingBottom: 20,
    },
    logoutLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#ef4444',
    },
    mainContent: {
        flex: 1,
    },
    mainContentMobile: {
        width: '100%',
        maxWidth: '100%',
        paddingBottom: 72,
        overflow: 'hidden',
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        zIndex: 1000,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
    },
    bottomTab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        gap: 3,
    },
    bottomTabLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748b',
    },
    bottomTabLabelActive: {
        color: '#0284c7',
        fontWeight: '700',
    },
    sheetOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        justifyContent: 'flex-end',
    },
    sheetContent: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 36,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 20,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        marginBottom: 8,
    },
    sheetTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0f172a',
    },
    sheetSubtitle: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    sheetCloseBtn: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
    },
    sheetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f8fafc',
        gap: 14,
    },
    sheetIconBox: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sheetItemTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1e293b',
    },
    sheetItemDesc: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    demoFloatingBtn: {
        position: 'absolute',
        bottom: 74,
        left: 14,
        zIndex: 9999,
        elevation: 10,
        shadowColor: '#4f46e5',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 5,
    },
    demoFloatingInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#4f46e5',
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: 24,
        borderWidth: 1.5,
        borderColor: '#a5b4fc',
    },
    demoFloatingText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    demoPinBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f0f9ff',
        borderWidth: 1,
        borderColor: '#bae6fd',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 14,
    },
    demoPinCopyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#e0f2fe',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
});




