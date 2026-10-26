import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Slot, useRouter, usePathname, Redirect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';
import { auth } from '../../src/config/firebase';
import { useAppContext } from '../../src/context/AppContext';

export default function AdminLayout() {
    const { user, setUser, isLoading } = useAppContext();
    const router = useRouter();
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
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={{ marginTop: 10, color: '#94a3b8', fontWeight: '600' }}>Cargando Panel de Control...</Text>
            </View>
        );
    }

    // Verify it is the super admin email AND accessed from TusPedidos domain
    const currentHost = typeof window !== 'undefined' ? (window.location.hostname || '').toLowerCase() : '';
    const isTusPedidosDomain = currentHost.includes('tuspedidos-mu.vercel.app') || currentHost.includes('tuspedidos') || currentHost === 'localhost' || currentHost === '127.0.0.1';
    const isSuperAdmin = user?.email?.toLowerCase().trim() === 'cocobustos.93@gmail.com' && isTusPedidosDomain;

    if (!user || !isSuperAdmin) {
        return <Redirect href="/(business)/admin" />;
    }

    const navItems = [
        { name: 'dashboard', label: 'Dashboard', icon: 'dashboard' }
    ];

    return (
        <View style={styles.container}>
            {/* Sidebar */}
            <View style={styles.sidebar}>
                <View style={styles.logoContainer}>
                    <FontAwesome name="shield" size={32} color="#3b82f6" />
                    <Text style={styles.logoText}>SUPER</Text>
                </View>

                <View style={styles.navContainer}>
                    {navItems.map((item) => {
                        const isActive = pathname.includes(item.name);
                        return (
                            <Pressable
                                key={item.name}
                                style={[styles.navItem, isActive && styles.navItemActive]}
                                onPress={() => router.push(`/(admin)/${item.name}` as any)}
                            >
                                <FontAwesome 
                                    name={item.icon as any} 
                                    size={20} 
                                    color={isActive ? '#3b82f6' : '#94a3b8'} 
                                />
                                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                                    {item.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                <Pressable style={styles.logoutBtn} onPress={logout}>
                    <FontAwesome name="sign-out" size={20} color="#f43f5e" />
                    <Text style={styles.logoutLabel}>Salir</Text>
                </Pressable>
            </View>

            {/* Main Content */}
            <View style={styles.mainContent}>
                <Slot />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#0f172a', // Sleek dark mode background
    },
    sidebar: {
        width: 100,
        backgroundColor: '#1e293b',
        borderRightWidth: 1,
        borderRightColor: '#334155',
        paddingVertical: 20,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 40,
        gap: 4
    },
    logoText: {
        fontSize: 10,
        fontWeight: '900',
        color: '#3b82f6',
        letterSpacing: 1
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
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155'
    },
    navLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: '#94a3b8',
        textAlign: 'center',
    },
    navLabelActive: {
        color: '#3b82f6',
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
        color: '#f43f5e',
    },
    mainContent: {
        flex: 1,
    },
});
