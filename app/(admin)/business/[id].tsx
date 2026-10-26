import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppContext } from '../../../src/context/AppContext';

interface BranchData {
    id: string;
    name: string;
    address: string;
    phone: string;
    schedule?: any;
}

interface ProductData {
    id: string;
    name: string;
    price: number;
    category: string;
    available: boolean;
}

interface OrderData {
    id: string;
    clientName: string;
    clientPhone: string;
    totalPrice: number;
    status: string;
    deliveryMethod: string;
    createdAt: string;
}

interface ClientStat {
    name: string;
    phone: string;
    ordersCount: number;
    totalSpent: number;
}

export default function BusinessDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [businessProfile, setBusinessProfile] = useState<any>(null);
    const [businessSettings, setBusinessSettings] = useState<any>(null);
    const [ownerEmail, setOwnerEmail] = useState('Sin Email');
    const [branches, setBranches] = useState<BranchData[]>([]);
    const [products, setProducts] = useState<ProductData[]>([]);
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [clients, setClients] = useState<ClientStat[]>([]);

    const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'branches' | 'clients'>('orders');
    const { loadBusinessById, user } = useAppContext();

    const handleImpersonate = async () => {
        try {
            if (businessProfile) {
                // Also pass settings etc if needed, but AppContext will fetch it
                await AsyncStorage.setItem('businessProfile', JSON.stringify({ ...businessProfile, id }));
                await loadBusinessById(id, user);
                router.replace('/(business)/admin');
            }
        } catch (e) {
            Alert.alert("Error", "No se pudo ingresar como este negocio.");
        }
    };

    const fetchBusinessDetails = async () => {
        if (!id) return;
        setLoading(true);
        try {
            // 1. Fetch business document
            const busRef = doc(db, 'businesses', id);
            const busSnap = await getDoc(busRef);
            if (!busSnap.exists()) {
                throw new Error("El comercio no existe en la base de datos.");
            }
            const busData = busSnap.data();
            setBusinessProfile(busData.profile || { name: 'Comercio Sin Nombre' });
            setBusinessSettings(busData.settings || {});
            setBranches(busData.settings?.branches || []);

            // 2. Fetch owner email
            const userRef = doc(db, 'users', id);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                setOwnerEmail(userSnap.data().email || 'Sin Email');
            }

            // 3. Fetch orders
            const ordersSnap = await getDocs(collection(db, `businesses/${id}/orders`));
            const ordersList: OrderData[] = [];
            const clientMap = new Map<string, ClientStat>();

            ordersSnap.forEach(oDoc => {
                const o = oDoc.data();
                const ord = {
                    id: oDoc.id,
                    clientName: o.clientName || 'Desconocido',
                    clientPhone: o.clientPhone || 'Sin teléfono',
                    totalPrice: o.totalPrice || 0,
                    status: o.status || 'pending',
                    deliveryMethod: o.deliveryMethod || 'delivery',
                    createdAt: o.createdAt || new Date().toISOString()
                };
                ordersList.push(ord);

                // Populate client stats
                const cKey = o.clientId || o.clientPhone || 'Desconocido';
                if (!clientMap.has(cKey)) {
                    clientMap.set(cKey, {
                        name: o.clientName || 'Desconocido',
                        phone: o.clientPhone || 'Sin código/teléfono',
                        ordersCount: 0,
                        totalSpent: 0
                    });
                }
                const cStat = clientMap.get(cKey)!;
                cStat.ordersCount += 1;
                cStat.totalSpent += o.totalPrice || 0;
            });

            // Sort orders by date descending
            setOrders(ordersList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setClients(Array.from(clientMap.values()).sort((a, b) => b.totalSpent - a.totalSpent));

            // 4. Fetch products
            let productsList: ProductData[] = [];
            const catalogRef = doc(db, `businesses/${id}/catalog`, 'data');
            const catalogSnap = await getDoc(catalogRef);
            if (catalogSnap.exists()) {
                productsList = catalogSnap.data().products || [];
            } else {
                // Fallback
                const productsSnap = await getDocs(collection(db, `businesses/${id}/products`));
                productsList = productsSnap.docs.map(pDoc => ({
                    id: pDoc.id,
                    ...pDoc.data()
                } as any));
            }
            setProducts(productsList);

        } catch (error: any) {
            console.error("Error loading business details:", error);
            Alert.alert("Error", error.message || "No se pudieron cargar los detalles del comercio.");
            router.back();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBusinessDetails();
    }, [id]);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Cargando información del comercio...</Text>
            </View>
        );
    }

    const totalSales = orders.reduce((sum, o) => sum + o.totalPrice, 0);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            {/* Navigation back and header */}
            <View style={styles.header}>
                <Pressable style={styles.backBtn} onPress={() => router.replace('/(admin)/dashboard')}>
                    <FontAwesome name="arrow-left" size={14} color="#fff" />
                    <Text style={styles.backBtnText}>Volver al Dashboard</Text>
                </Pressable>
                
                <View style={[styles.businessHeaderCard, { borderLeftColor: businessProfile?.primaryColor || '#3b82f6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.businessName}>{businessProfile?.name}</Text>
                        <Text style={styles.businessMeta}>Slug: {id} • Email dueño: {ownerEmail}</Text>
                    </View>
                    <Pressable 
                        style={{ backgroundColor: '#10b981', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                        onPress={handleImpersonate}
                    >
                        <FontAwesome name="sign-in" size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Gestionar Negocio</Text>
                    </Pressable>
                </View>
            </View>

            {/* Quick Metrics */}
            <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>VENTAS HISTÓRICAS</Text>
                    <Text style={[styles.metricValue, { color: '#10b981' }]}>${totalSales.toLocaleString()}</Text>
                </View>
                <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>PEDIDOS</Text>
                    <Text style={styles.metricValue}>{orders.length}</Text>
                </View>
                <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>CLIENTES</Text>
                    <Text style={styles.metricValue}>{clients.length}</Text>
                </View>
                <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>PRODUCTOS</Text>
                    <Text style={styles.metricValue}>{products.length}</Text>
                </View>
                <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>SUCURSALES</Text>
                    <Text style={styles.metricValue}>{branches.length}</Text>
                </View>
            </View>

            {/* Content Tabs */}
            <View style={styles.tabsContainer}>
                <Pressable 
                    style={[styles.tab, activeTab === 'orders' && styles.tabActive]} 
                    onPress={() => setActiveTab('orders')}
                >
                    <Text style={[styles.tabText, activeTab === 'orders' && styles.tabTextActive]}>Pedidos ({orders.length})</Text>
                </Pressable>
                <Pressable 
                    style={[styles.tab, activeTab === 'products' && styles.tabActive]} 
                    onPress={() => setActiveTab('products')}
                >
                    <Text style={[styles.tabText, activeTab === 'products' && styles.tabTextActive]}>Productos ({products.length})</Text>
                </Pressable>
                <Pressable 
                    style={[styles.tab, activeTab === 'branches' && styles.tabActive]} 
                    onPress={() => setActiveTab('branches')}
                >
                    <Text style={[styles.tabText, activeTab === 'branches' && styles.tabTextActive]}>Sucursales ({branches.length})</Text>
                </Pressable>
                <Pressable 
                    style={[styles.tab, activeTab === 'clients' && styles.tabActive]} 
                    onPress={() => setActiveTab('clients')}
                >
                    <Text style={[styles.tabText, activeTab === 'clients' && styles.tabTextActive]}>Clientes ({clients.length})</Text>
                </Pressable>
            </View>

            {/* Tab Panels */}
            <View style={styles.tabPanel}>
                {activeTab === 'orders' && (
                    <View style={styles.listWrapper}>
                        <Text style={styles.panelTitle}>Historial de Pedidos</Text>
                        {orders.length === 0 ? (
                            <Text style={styles.emptyText}>Este comercio aún no recibió pedidos.</Text>
                        ) : (
                            orders.map((o) => (
                                <View key={o.id} style={styles.listItem}>
                                    <View style={{ flex: 2 }}>
                                        <Text style={styles.itemTitle}>{o.clientName}</Text>
                                        <Text style={styles.itemSubtitle}>ID: {o.id} • Tel: {o.clientPhone}</Text>
                                        <Text style={styles.itemDate}>{new Date(o.createdAt).toLocaleString()}</Text>
                                    </View>
                                    <View style={styles.itemStats}>
                                        <Text style={styles.itemPrice}>${o.totalPrice.toLocaleString()}</Text>
                                        <View style={[
                                            styles.statusBadge, 
                                            o.status === 'delivered' ? { backgroundColor: '#10b981' } : { backgroundColor: '#f59e0b' }
                                        ]}>
                                            <Text style={styles.statusBadgeText}>{o.status.toUpperCase()}</Text>
                                        </View>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                )}

                {activeTab === 'products' && (
                    <View style={styles.listWrapper}>
                        <Text style={styles.panelTitle}>Catálogo de Productos</Text>
                        {products.length === 0 ? (
                            <Text style={styles.emptyText}>Este comercio no tiene productos cargados.</Text>
                        ) : (
                            products.map((p) => (
                                <View key={p.id} style={styles.listItem}>
                                    <View style={{ flex: 2 }}>
                                        <Text style={styles.itemTitle}>{p.name}</Text>
                                        <Text style={styles.itemSubtitle}>Categoría: {p.category || 'Sin Categoría'}</Text>
                                    </View>
                                    <View style={styles.itemStats}>
                                        <Text style={styles.itemPrice}>${p.price.toLocaleString()}</Text>
                                        <Text style={[styles.availabilityText, p.available ? { color: '#10b981' } : { color: '#ef4444' }]}>
                                            {p.available ? 'Disponible' : 'Sin Stock'}
                                        </Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                )}

                {activeTab === 'branches' && (
                    <View style={styles.listWrapper}>
                        <Text style={styles.panelTitle}>Configuración de Sucursales</Text>
                        {branches.length === 0 ? (
                            <Text style={styles.emptyText}>Este comercio no tiene sucursales registradas.</Text>
                        ) : (
                            branches.map((b) => (
                                <View key={b.id} style={styles.listItem}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.itemTitle}>🏪 {b.name}</Text>
                                        <Text style={styles.itemSubtitle}>Dirección: {b.address || 'Sin Dirección'}</Text>
                                        <Text style={styles.itemSubtitle}>Teléfono: {b.phone || 'Sin Teléfono'}</Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                )}

                {activeTab === 'clients' && (
                    <View style={styles.listWrapper}>
                        <Text style={styles.panelTitle}>Ranking de Clientes</Text>
                        {clients.length === 0 ? (
                            <Text style={styles.emptyText}>Sin información de clientes.</Text>
                        ) : (
                            clients.map((c, idx) => (
                                <View key={c.phone} style={styles.listItem}>
                                    <View style={{ flex: 2 }}>
                                        <Text style={styles.itemTitle}>{idx + 1}. {c.name}</Text>
                                        <Text style={styles.itemSubtitle}>Teléfono: {c.phone}</Text>
                                        <Text style={styles.itemSubtitle}>Pedidos realizados: {c.ordersCount}</Text>
                                    </View>
                                    <View style={styles.itemStats}>
                                        <Text style={styles.itemPrice}>${c.totalSpent.toLocaleString()}</Text>
                                        <Text style={styles.itemLabelSecondary}>Total Gastado</Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    contentContainer: {
        padding: 30,
        paddingBottom: 100
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0f172a',
    },
    loadingText: {
        marginTop: 15,
        color: '#94a3b8',
        fontSize: 16,
        fontWeight: '500'
    },
    header: {
        marginBottom: 30,
        gap: 20
    },
    backBtn: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#334155',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#475569'
    },
    backBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 13,
        marginLeft: 8
    },
    businessHeaderCard: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        borderLeftWidth: 6,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155'
    },
    businessName: {
        fontSize: 22,
        fontWeight: '900',
        color: '#fff',
        marginBottom: 5
    },
    businessMeta: {
        fontSize: 13,
        color: '#94a3b8'
    },
    colorIndicator: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#fff'
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 15,
        marginBottom: 35
    },
    metricCard: {
        flex: 1,
        minWidth: 150,
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 18,
        borderWidth: 1,
        borderColor: '#334155'
    },
    metricLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: 0.5,
        marginBottom: 6
    },
    metricValue: {
        fontSize: 20,
        fontWeight: '900',
        color: '#fff'
    },
    tabsContainer: {
        flexDirection: 'row',
        borderBottomWidth: 2,
        borderBottomColor: '#334155',
        marginBottom: 25,
        gap: 10
    },
    tab: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: '#3b82f6',
    },
    tabText: {
        color: '#94a3b8',
        fontWeight: '700',
        fontSize: 14
    },
    tabTextActive: {
        color: '#3b82f6',
    },
    tabPanel: {
        backgroundColor: '#1e293b',
        borderRadius: 20,
        padding: 25,
        borderWidth: 1,
        borderColor: '#334155'
    },
    listWrapper: {
        gap: 15
    },
    panelTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 10
    },
    emptyText: {
        color: '#64748b',
        fontSize: 14,
        fontStyle: 'italic'
    },
    listItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#334155'
    },
    itemTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff'
    },
    itemSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 3
    },
    itemDate: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 5
    },
    itemStats: {
        alignItems: 'flex-end',
        gap: 6
    },
    itemPrice: {
        fontSize: 16,
        fontWeight: '800',
        color: '#10b981'
    },
    itemLabelSecondary: {
        fontSize: 11,
        color: '#64748b'
    },
    statusBadge: {
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 6,
    },
    statusBadgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: 'bold'
    },
    availabilityText: {
        fontSize: 12,
        fontWeight: '600'
    }
});
