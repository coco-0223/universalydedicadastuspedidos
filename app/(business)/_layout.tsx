import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Slot, useRouter, usePathname, Redirect } from 'expo-router';
import { useState } from 'react';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';
import { auth } from '../../src/config/firebase';
import { useAppContext } from '../../src/context/AppContext';
import { TutorialOverlay } from '../../src/components/TutorialOverlay';

export default function BusinessLayout() {
    const { user, setUser, isLoading, businessProfile } = useAppContext();
    const router = useRouter();
    const [forceShowTutorial, setForceShowTutorial] = useState(false);
    const pathname = usePathname();

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
        return <Redirect href="/(store)" />;
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
    const isTusPedidosDomain = currentHost.includes('tuspedidos-mu.vercel.app') || currentHost.includes('tuspedidos') || currentHost === 'localhost' || currentHost === '127.0.0.1';
    const isSuperAdminImpersonating = isTusPedidosDomain && user?.email === 'cocobustos.93@gmail.com' && businessProfile?.id !== user.id;

    const handleStopImpersonating = async () => {
        await AsyncStorage.removeItem('businessProfile');
        router.replace('/(admin)/dashboard');
        if (typeof window !== 'undefined') window.location.href = '/dashboard';
    };

    return (
        <View style={styles.container}>
            {isSuperAdminImpersonating && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, backgroundColor: '#ef4444', padding: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: 'white', fontWeight: 'bold', marginRight: 15 }}>Modo SuperAdmin: Gestionando {businessProfile?.name}</Text>
                    <Pressable style={{ backgroundColor: 'white', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5 }} onPress={handleStopImpersonating}>
                        <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12 }}>VOLVER AL SUPERADMIN</Text>
                    </Pressable>
                </View>
            )}
            {/* Sidebar */}
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

            {/* Main Content */}
            <View style={styles.mainContent}>
                <Slot />
                {/* Tutorial desactivado temporalmente */}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#f8fafc',
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
});



