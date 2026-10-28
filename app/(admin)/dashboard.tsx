import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../src/config/firebase';
import { useRouter } from 'expo-router';

interface BusinessRowData {
    id: string;
    name: string;
    email: string;
    branchesCount: number;
    clientsCount: number;
    ordersCount: number;
    totalSales: number;
    productsCount: number;
    categories: string[];
    isActive: boolean;
    status?: 'active' | 'trial';
    trialExpiresAt?: string;
    planPrice?: number;
}

interface BlockedAttempt {
    id: string;
    businessName: string;
    username: string;
    reason: string;
    type: 'ip' | 'device';
    ip?: string;
    previousBusinessId?: string;
    createdAt: string;
}

interface AdminRequest {
    id: string;
    businessId: string;
    businessName: string;
    ownerEmail: string;
    requestType: 'web' | 'app' | 'chatbot';
    ownerPhone?: string;
    ownerName?: string;
    createdAt: string;
    status: 'pending' | 'completed';
}

export default function AdminDashboardScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [businesses, setBusinesses] = useState<BusinessRowData[]>([]);
    const [requests, setRequests] = useState<AdminRequest[]>([]);
    const [blockedAttempts, setBlockedAttempts] = useState<BlockedAttempt[]>([]);
    const [sortBy, setSortBy] = useState<keyof BusinessRowData>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    
    const handleUpdatePlanPrice = async (bId: string, bName: string, currentPrice?: number) => {
        let inputPrice: string | null = null;
        if (Platform.OS === 'web') {
            inputPrice = prompt(`Modificar tarifa mensual para ${bName}:`, (currentPrice || 9000).toString());
        }
        if (!inputPrice) return;

        const newPrice = parseInt(inputPrice.replace(/[^0-9]/g, ''), 10);
        if (isNaN(newPrice) || newPrice <= 0) {
            if (Platform.OS === 'web') alert('Por favor ingresá un monto numérico válido.');
            return;
        }

        try {
            setLoading(true);
            const busRef = doc(db, 'businesses', bId);
            await updateDoc(busRef, {
                'profile.planPrice': newPrice
            });
            setBusinesses(prev => prev.map(b => b.id === bId ? { ...b, planPrice: newPrice } : b));
            const msg = `Tarifa de ${bName} actualizada a $${newPrice.toLocaleString()}/mes.`;
            if (Platform.OS === 'web') alert(msg);
        } catch (e) {
            console.error("Error updating plan price:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleExtendTrial = async (bId: string, days: number, bName: string) => {
        try {
            setLoading(true);
            const busRef = doc(db, 'businesses', bId);
            const busSnap = await getDoc(busRef);
            if (!busSnap.exists()) return;

            const currentData = busSnap.data();
            const currentExpires = currentData.profile?.trialExpiresAt ? new Date(currentData.profile.trialExpiresAt) : new Date();
            const baseDate = currentExpires.getTime() > Date.now() ? currentExpires : new Date();
            baseDate.setDate(baseDate.getDate() + days);

            await updateDoc(busRef, {
                'profile.status': 'trial',
                'profile.trialExpiresAt': baseDate.toISOString(),
                isActive: true
            });

            setBusinesses(prev => prev.map(b => b.id === bId ? {
                ...b,
                status: 'trial',
                trialExpiresAt: baseDate.toISOString(),
                isActive: true
            } : b));

            const msg = `Se extendió la prueba de ${bName} por ${days} días (Vence: ${baseDate.toLocaleDateString()}).`;
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Éxito', msg);
        } catch (e) {
            console.error("Error extending trial:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleActivatePermanent = async (bId: string, bName: string) => {
        if (Platform.OS === 'web') {
            if (!confirm(`¿Activar a ${bName} de forma permanente como cliente activo?`)) return;
        }
        try {
            setLoading(true);
            const busRef = doc(db, 'businesses', bId);
            await updateDoc(busRef, {
                'profile.status': 'active',
                isActive: true
            });
            setBusinesses(prev => prev.map(b => b.id === bId ? { ...b, status: 'active', isActive: true } : b));
            const msg = `${bName} ahora está ACTIVO PERMANENTE.`;
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Éxito', msg);
        } catch (e) {
            console.error("Error activating permanent:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteBlockedAttempt = async (attemptId: string) => {
        try {
            await deleteDoc(doc(db, 'blocked_attempts', attemptId));
            setBlockedAttempts(prev => prev.filter(a => a.id !== attemptId));
        } catch (e) {}
    };

    const handleUnblockIp = async (ip: string, attemptId: string) => {
        try {
            const ipDocId = ip.replace(/[^a-zA-Z0-9_-]/g, '_');
            await deleteDoc(doc(db, 'trial_ips', ipDocId));
            await deleteDoc(doc(db, 'blocked_attempts', attemptId));
            setBlockedAttempts(prev => prev.filter(a => a.id !== attemptId));
            const msg = `Se desbloqueó la IP ${ip}. Ya puede solicitar una nueva prueba.`;
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Éxito', msg);
        } catch (e) {}
    };

    const handleResetOnboarding = async (bId: string, bName: string) => {
        if (Platform.OS === 'web') {
            if (!confirm(`¿Estás seguro de reiniciar el Onboarding para ${bName}? Esto borrará su catálogo actual.`)) return;
        } else {
            // No Alert natively here for brevity, just assuming web for Superadmin
        }
        
        try {
            setLoading(true);
            await updateDoc(doc(db, 'businesses', bId), { onboardingCompleted: false });
            await setDoc(doc(db, `businesses/${bId}/catalog`, 'data'), { products: [], offers: [] }, { merge: true });
            await fetchAllData();
            if (Platform.OS === 'web') alert('Onboarding reiniciado con éxito. Al iniciar sesión se mostrarán las preguntas nuevamente.');
        } catch (e) {
            console.error(e);
            if (Platform.OS === 'web') alert('Error al reiniciar onboarding');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Users to map owner emails
            const usersSnap = await getDocs(collection(db, 'users'));
            const usersMap: Record<string, any> = {};
            usersSnap.forEach(doc => {
                usersMap[doc.id] = doc.data();
            });

            // 2. Fetch Businesses
            const businessSnap = await getDocs(collection(db, 'businesses'));
            const businessList: BusinessRowData[] = [];

            // Fetch metrics for each business in parallel
            await Promise.all(businessSnap.docs.map(async (bDoc) => {
                const bId = bDoc.id;
                const bData = bDoc.data();
                const profile = bData.profile || {};
                const settings = bData.settings || {};
                const name = profile.name || 'Sin Nombre';
                const email = usersMap[bId]?.email || 'Sin Email';

                // Count branches
                const branchesCount = settings.branches?.length || 0;

                // Fetch orders to compute sales, clients, and orders count
                let ordersCount = 0;
                let totalSales = 0;
                let clientsCount = 0;
                try {
                    const ordersSnap = await getDocs(collection(db, `businesses/${bId}/orders`));
                    ordersCount = ordersSnap.size;
                    
                    const uniqueClients = new Set<string>();
                    ordersSnap.forEach(oDoc => {
                        const o = oDoc.data();
                        totalSales += o.totalPrice || 0;
                        uniqueClients.add(o.clientId || o.clientPhone || 'Desconocido');
                    });
                    clientsCount = uniqueClients.size;
                } catch (err) {
                    console.warn(`Error loading orders for business ${bId}:`, err);
                }

                // Fetch catalog
                let productsCount = 0;
                let categories: string[] = [];
                try {
                    const catalogRef = doc(db, `businesses/${bId}/catalog`, 'data');
                    const catalogSnap = await getDoc(catalogRef);
                    if (catalogSnap.exists()) {
                        const catalogData = catalogSnap.data();
                        const products = catalogData.products || [];
                        productsCount = products.length;
                        categories = Array.from(new Set(products.map((p: any) => p.category).filter(Boolean))) as string[];
                    } else {
                        // Fallback
                        const productsSnap = await getDocs(collection(db, `businesses/${bId}/products`));
                        productsCount = productsSnap.size;
                        const uniqueCats = new Set<string>();
                        productsSnap.forEach(pDoc => {
                            const p = pDoc.data();
                            if (p.category) uniqueCats.add(p.category);
                        });
                        categories = Array.from(uniqueCats);
                    }
                } catch (err) {
                    console.warn(`Error loading catalog for business ${bId}:`, err);
                }

                businessList.push({
                    id: bId,
                    name,
                    email,
                    branchesCount,
                    clientsCount,
                    ordersCount,
                    totalSales,
                    productsCount,
                    categories,
                    isActive: bData.isActive !== false,
                    status: bData.profile?.status || 'active',
                    trialExpiresAt: bData.profile?.trialExpiresAt,
                    planPrice: bData.profile?.planPrice || 9000
                });
            }));

            setBusinesses(businessList);

            // 3. Fetch Web/App requests
            const reqSnap = await getDocs(collection(db, 'admin_requests'));
            const reqList: AdminRequest[] = reqSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as AdminRequest)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            setRequests(reqList);

            // 4. Fetch Blocked Attempts
            try {
                const blockedSnap = await getDocs(collection(db, 'blocked_attempts'));
                const blockedList: BlockedAttempt[] = blockedSnap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as BlockedAttempt)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setBlockedAttempts(blockedList);
            } catch (err) {
                console.warn("Error fetching blocked attempts:", err);
            }

        } catch (error) {
            console.error("Error fetching admin dashboard data:", error);
            if (Platform.OS === 'web') alert('Error al cargar datos del panel.');
            else Alert.alert('Error', 'Error al cargar datos del panel.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const handleSort = (field: keyof BusinessRowData) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc'); // Default to desc for numbers, asc for strings
        }
    };

    const sortedBusinesses = useMemo(() => {
        return [...businesses].sort((a, b) => {
            let valA = a[sortBy];
            let valB = b[sortBy];

            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortOrder === 'asc' 
                    ? valA.localeCompare(valB) 
                    : valB.localeCompare(valA);
            }

            if (Array.isArray(valA) && Array.isArray(valB)) {
                return sortOrder === 'asc' 
                    ? valA.length - valB.length 
                    : valB.length - valA.length;
            }

            // Number comparison
            const numA = (valA as number) || 0;
            const numB = (valB as number) || 0;
            return sortOrder === 'asc' ? numA - numB : numB - numA;
        });
    }, [businesses, sortBy, sortOrder]);

    const handleUpdateRequestStatus = async (reqId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';
        try {
            await updateDoc(doc(db, 'admin_requests', reqId), { status: newStatus });
            setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: newStatus as any } : r));
        } catch (error) {
            console.error("Error updating request:", error);
            Alert.alert("Error", "No se pudo actualizar la solicitud.");
        }
    };

    const handleToggleBusinessStatus = async (businessId: string, currentStatus: boolean, businessName: string) => {
        const action = currentStatus ? "suspender" : "reactivar";
        const confirmToggle = Platform.OS === 'web'
            ? window.confirm(`¿Seguro que querés ${action} la tienda "${businessName}"?`)
            : true;

        if (!confirmToggle && Platform.OS === 'web') return;
        
        const executeToggle = async () => {
            try {
                await updateDoc(doc(db, 'businesses', businessId), { isActive: !currentStatus });
                setBusinesses(prev => prev.map(b => b.id === businessId ? { ...b, isActive: !currentStatus } : b));
            } catch (error) {
                console.error("Error toggling business status:", error);
                Alert.alert("Error", `No se pudo ${action} la tienda.`);
            }
        };

        if (Platform.OS !== 'web') {
            Alert.alert(
                `${currentStatus ? 'Suspender' : 'Reactivar'} Tienda`,
                `¿Seguro que querés ${action} la tienda "${businessName}"?`,
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Sí", onPress: executeToggle }
                ]
            );
        } else {
            executeToggle();
        }
    };

    const handleDeleteRequest = async (reqId: string) => {
        const confirmDelete = Platform.OS === 'web' 
            ? window.confirm("¿Seguro que querés eliminar esta solicitud?") 
            : true;
        
        if (!confirmDelete) return;

        try {
            await deleteDoc(doc(db, 'admin_requests', reqId));
            setRequests(prev => prev.filter(r => r.id !== reqId));
        } catch (error) {
            console.error("Error deleting request:", error);
            Alert.alert("Error", "No se pudo eliminar la solicitud.");
        }
    };

    // Card totals
    const totalSalesSum = businesses.reduce((s, b) => s + b.totalSales, 0);
    const totalOrdersSum = businesses.reduce((s, b) => s + b.ordersCount, 0);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Cargando información del sistema...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Panel de Control Principal</Text>
                    <Text style={styles.subtitle}>Resumen global de todos los comercios registrados en TusPedidos.</Text>
                </View>
                <Pressable style={styles.refreshBtn} onPress={fetchAllData}>
                    <FontAwesome name="refresh" size={16} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.refreshBtnText}>Actualizar</Text>
                </Pressable>
            </View>

            {/* Stat Cards */}
            <View style={styles.statsGrid}>
                <View style={[styles.statCard, { borderLeftColor: '#3b82f6' }]}>
                    <View style={styles.statInfo}>
                        <Text style={styles.statLabel}>NEGOCIOS REGISTRADOS</Text>
                        <Text style={styles.statValue}>{businesses.length}</Text>
                    </View>
                    <View style={[styles.statIconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                        <FontAwesome name="shopping-bag" size={24} color="#3b82f6" />
                    </View>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#10b981' }]}>
                    <View style={styles.statInfo}>
                        <Text style={styles.statLabel}>VENTAS TOTALES ACUMULADAS</Text>
                        <Text style={styles.statValue}>${totalSalesSum.toLocaleString()}</Text>
                    </View>
                    <View style={[styles.statIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                        <FontAwesome name="money" size={24} color="#10b981" />
                    </View>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#eab308' }]}>
                    <View style={styles.statInfo}>
                        <Text style={styles.statLabel}>PEDIDOS TOTALES</Text>
                        <Text style={styles.statValue}>{totalOrdersSum}</Text>
                    </View>
                    <View style={[styles.statIconContainer, { backgroundColor: 'rgba(234, 179, 8, 0.1)' }]}>
                        <FontAwesome name="shopping-cart" size={24} color="#eab308" />
                    </View>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#ec4899' }]}>
                    <View style={styles.statInfo}>
                        <Text style={styles.statLabel}>SOLICITUDES APP/WEB</Text>
                        <Text style={styles.statValue}>{requests.filter(r => r.status === 'pending').length} pendientes</Text>
                    </View>
                    <View style={[styles.statIconContainer, { backgroundColor: 'rgba(236, 72, 153, 0.1)' }]}>
                        <FontAwesome name="bell" size={24} color="#ec4899" />
                    </View>
                </View>
            </View>

            {/* Requests Section */}
            {requests.length > 0 && (
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>🔔 Solicitudes de App o Web Recientes</Text>
                    <View style={styles.requestsList}>
                        {requests.map((req) => (
                            <View key={req.id} style={[styles.requestRow, req.status === 'completed' && styles.requestRowCompleted]}>
                                <View style={styles.reqBadgeContainer}>
                                    <View style={[
                                        styles.reqBadge, 
                                        req.requestType === 'web' ? { backgroundColor: '#0284c7' } : { backgroundColor: '#10b981' }
                                    ]}>
                                        <FontAwesome name={req.requestType === 'web' ? 'globe' : (req.requestType === 'app' ? 'android' : 'whatsapp')} size={14} color="#fff" />
                                        <Text style={styles.reqBadgeText}>{req.requestType.toUpperCase()}</Text>
                                    </View>
                                </View>

                                <View style={styles.reqDetails}>
                                    <Text style={styles.reqBusinessName}>{req.businessName}</Text>
                                    <Text style={styles.reqBusinessInfo}>Dueño: {req.ownerEmail} • ID: {req.businessId}</Text>
                                    {req.ownerPhone && <Text style={styles.reqBusinessInfo}>Tel/Wsp: {req.ownerPhone}</Text>}
                                    {req.ownerName && <Text style={styles.reqBusinessInfo}>Nombre: {req.ownerName}</Text>}
                                    <Text style={styles.reqDate}>{new Date(req.createdAt).toLocaleString()}</Text>
                                </View>

                                <View style={styles.reqActions}>
                                    <Pressable 
                                        style={[
                                            styles.reqActionBtn, 
                                            req.status === 'completed' ? { backgroundColor: '#475569' } : { backgroundColor: '#10b981' }
                                        ]}
                                        onPress={() => handleUpdateRequestStatus(req.id, req.status)}
                                    >
                                        <FontAwesome name={req.status === 'completed' ? 'undo' : 'check'} size={14} color="#fff" />
                                        <Text style={styles.reqActionBtnText}>
                                            {req.status === 'completed' ? 'Reabrir' : 'Completar'}
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {/* Blocked Attempts Section */}
            {blockedAttempts.length > 0 && (
                <View style={[styles.sectionCard, { borderColor: '#ef4444', borderWidth: 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                        <FontAwesome name="shield" size={20} color="#ef4444" style={{ marginRight: 10 }} />
                        <Text style={[styles.sectionTitle, { color: '#f87171', marginBottom: 0 }]}>
                            Intentos de Registro Bloqueados ({blockedAttempts.length})
                        </Text>
                    </View>
                    <View style={styles.requestsList}>
                        {blockedAttempts.map((att) => (
                            <View key={att.id} style={[styles.requestRow, { backgroundColor: '#1e1b4b', borderLeftColor: '#ef4444', borderLeftWidth: 4 }]}>
                                <View style={styles.reqDetails}>
                                    <Text style={[styles.reqBusinessName, { color: '#fff' }]}>{att.businessName} (usuario: {att.username})</Text>
                                    <Text style={[styles.reqBusinessInfo, { color: '#fca5a5', fontWeight: 'bold' }]}>
                                        Motivo: {att.reason}
                                    </Text>
                                    {att.ip && <Text style={styles.reqBusinessInfo}>IP: {att.ip}</Text>}
                                    <Text style={styles.reqDate}>{new Date(att.createdAt).toLocaleString()}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                    {att.ip && (
                                        <Pressable 
                                            style={{ backgroundColor: '#10b981', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                                            onPress={() => handleUnblockIp(att.ip!, att.id)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>DESBLOQUEAR IP</Text>
                                        </Pressable>
                                    )}
                                    <Pressable 
                                        style={{ backgroundColor: '#475569', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }}
                                        onPress={() => handleDeleteBlockedAttempt(att.id)}
                                    >
                                        <FontAwesome name="trash" size={14} color="#fff" />
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {/* Businesses Table */}
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>🏢 Comercios Registrados</Text>
                <Text style={styles.sectionSubtitle}>Hacé clic en cualquier fila para ver el desglose completo del comercio.</Text>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.horizontalScroll}>
                    <View style={styles.tableContainer}>
                        {/* Header */}
                        <View style={styles.tableHeader}>
                            <Pressable style={[styles.th, { flex: 2, minWidth: 160 }]} onPress={() => handleSort('name')}>
                                <Text style={styles.thText}>Negocio</Text>
                                {sortBy === 'name' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 2, minWidth: 160 }]} onPress={() => handleSort('email')}>
                                <Text style={styles.thText}>Email dueño</Text>
                                {sortBy === 'email' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 1, minWidth: 80, justifyContent: 'center' }]} onPress={() => handleSort('branchesCount')}>
                                <Text style={[styles.thText, { textAlign: 'center' }]}>Sucursales</Text>
                                {sortBy === 'branchesCount' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 1, minWidth: 80, justifyContent: 'center' }]} onPress={() => handleSort('clientsCount')}>
                                <Text style={[styles.thText, { textAlign: 'center' }]}>Clientes</Text>
                                {sortBy === 'clientsCount' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 1, minWidth: 80, justifyContent: 'center' }]} onPress={() => handleSort('ordersCount')}>
                                <Text style={[styles.thText, { textAlign: 'center' }]}>Pedidos</Text>
                                {sortBy === 'ordersCount' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 1.2, minWidth: 90, justifyContent: 'flex-end' }]} onPress={() => handleSort('totalSales')}>
                                <Text style={[styles.thText, { textAlign: 'right' }]}>Ventas</Text>
                                {sortBy === 'totalSales' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 1, minWidth: 80, justifyContent: 'center' }]} onPress={() => handleSort('productsCount')}>
                                <Text style={[styles.thText, { textAlign: 'center' }]}>Productos</Text>
                                {sortBy === 'productsCount' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <View style={[styles.th, { flex: 1, minWidth: 80, justifyContent: 'center' }]}>
                                <Text style={[styles.thText, { textAlign: 'center' }]}>Estado</Text>
                            </View>
                        </View>

                        {/* Rows */}
                        {sortedBusinesses.length === 0 ? (
                            <View style={styles.emptyTable}>
                                <Text style={styles.emptyTableText}>No hay negocios registrados.</Text>
                            </View>
                        ) : (
                            sortedBusinesses.map((b, index) => (
                                <View 
                                    key={b.id} 
                                    style={[
                                        styles.tableRow, 
                                        index % 2 === 1 && { backgroundColor: '#1e293b' }
                                    ]}
                                >
                                    <View style={{ flex: 2, minWidth: 160 }}>
                                        <Text style={styles.tdBusinessName}>{b.name}</Text>
                                        <Text style={styles.tdBusinessId}>slug: {b.id}</Text>
                                        {b.status === 'trial' ? (
                                            <View style={{ marginTop: 4 }}>
                                                {b.trialExpiresAt && new Date(b.trialExpiresAt).getTime() > Date.now() ? (
                                                    <Text style={{ fontSize: 10, color: '#f59e0b', fontWeight: 'bold' }}>
                                                        ⏳ Prueba (vence: {new Date(b.trialExpiresAt).toLocaleDateString()})
                                                    </Text>
                                                ) : (
                                                    <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: 'bold' }}>
                                                        ⚠️ Prueba Vencida
                                                    </Text>
                                                )}
                                            </View>
                                        ) : (
                                            <Text style={{ fontSize: 10, color: '#10b981', fontWeight: 'bold', marginTop: 4 }}>
                                                ⭐ Activo Permanente
                                            </Text>
                                        )}
                                        <Pressable 
                                            style={{ marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                            onPress={() => handleUpdatePlanPrice(b.id, b.name, b.planPrice)}
                                        >
                                            <FontAwesome name="tag" size={10} color="#38bdf8" />
                                            <Text style={{ fontSize: 11, color: '#38bdf8', fontWeight: 'bold', textDecorationLine: 'underline' }}>
                                                Tarifa: ${(b.planPrice || 9000).toLocaleString()}/mes (editar)
                                            </Text>
                                        </Pressable>
                                    </View>
                                    <Text style={[styles.tdText, { flex: 2, minWidth: 160, color: '#94a3b8' }]}>{b.email}</Text>
                                    <Text style={[styles.tdText, { flex: 1, minWidth: 80, textAlign: 'center' }]}>{b.branchesCount}</Text>
                                    <Text style={[styles.tdText, { flex: 1, minWidth: 80, textAlign: 'center' }]}>{b.clientsCount}</Text>
                                    <Text style={[styles.tdText, { flex: 1, minWidth: 80, textAlign: 'center' }]}>{b.ordersCount}</Text>
                                    <Text style={[styles.tdText, { flex: 1.2, minWidth: 90, textAlign: 'right', fontWeight: 'bold', color: '#10b981' }]}>
                                        ${b.totalSales.toLocaleString()}
                                    </Text>
                                    <Text style={[styles.tdText, { flex: 1, minWidth: 80, textAlign: 'center' }]}>{b.productsCount}</Text>
                                    
                                    <View style={{ flex: 2, minWidth: 260, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 5 }}>
                                        <Pressable 
                                            style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, backgroundColor: '#f59e0b' }}
                                            onPress={() => handleExtendTrial(b.id, 7, b.name)}
                                        >
                                            <Text style={{ color: '#000', fontSize: 10, fontWeight: 'bold' }}>+7 DÍAS</Text>
                                        </Pressable>
                                        <Pressable 
                                            style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, backgroundColor: '#0284c7' }}
                                            onPress={() => handleExtendTrial(b.id, 30, b.name)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>+30 DÍAS</Text>
                                        </Pressable>
                                        <Pressable 
                                            style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, backgroundColor: '#10b981' }}
                                            onPress={() => handleActivatePermanent(b.id, b.name)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>PERMANENTE</Text>
                                        </Pressable>
                                        <Pressable 
                                            style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, backgroundColor: '#8b5cf6' }}
                                            onPress={() => router.push({ pathname: '/(admin)/business/[id]', params: { id: b.id } } as any)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>VER</Text>
                                        </Pressable>
                                        <Pressable 
                                            style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, backgroundColor: b.isActive ? '#ef4444' : '#64748b' }}
                                            onPress={() => handleToggleBusinessStatus(b.id, b.isActive, b.name)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{b.isActive ? 'SUSPENDER' : 'HABILITAR'}</Text>
                                        </Pressable>
                                    </View>

                                </View>
                            ))
                        )}
                    </View>
                </ScrollView>
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
        padding: 16,
        paddingBottom: 80,
    },
    horizontalScroll: {
        width: '100%',
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
        flexWrap: 'wrap',
        gap: 15
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: '#fff',
    },
    subtitle: {
        fontSize: 15,
        color: '#94a3b8',
        marginTop: 4
    },
    refreshBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2563eb',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 10,
        shadowColor: '#2563eb',
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 3
    },
    refreshBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 20,
        marginBottom: 35
    },
    statCard: {
        flex: 1,
        minWidth: 220,
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderLeftWidth: 5,
        borderWidth: 1,
        borderColor: '#334155',
    },
    statInfo: {
        flex: 1
    },
    statLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: 0.5,
        marginBottom: 8
    },
    statValue: {
        fontSize: 24,
        fontWeight: '900',
        color: '#fff'
    },
    statIconContainer: {
        width: 46,
        height: 46,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center'
    },
    sectionCard: {
        backgroundColor: '#1e293b',
        borderRadius: 20,
        padding: 25,
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 35
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 8
    },
    sectionSubtitle: {
        fontSize: 13,
        color: '#94a3b8',
        marginBottom: 20
    },
    requestsList: {
        gap: 15
    },
    requestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        padding: 15,
        flexWrap: 'wrap',
        gap: 15
    },
    requestRowCompleted: {
        opacity: 0.6,
        borderColor: '#1e293b'
    },
    reqBadgeContainer: {
        minWidth: 100
    },
    reqBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    reqBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold'
    },
    reqDetails: {
        flex: 3,
        minWidth: 200
    },
    reqBusinessName: {
        fontSize: 16,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 2
    },
    reqBusinessInfo: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 4
    },
    reqDate: {
        fontSize: 11,
        color: '#64748b'
    },
    reqActions: {
        flexDirection: 'row',
        gap: 10,
        minWidth: 140,
        justifyContent: 'flex-end'
    },
    reqActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 8,
    },
    reqActionBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold'
    },
    tableContainer: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#0f172a'
    },
    tableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        paddingVertical: 14,
        paddingHorizontal: 15,
        borderBottomWidth: 1.5,
        borderBottomColor: '#334155'
    },
    th: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    thText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: 0.5
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#334155'
    },
    tdBusinessName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff'
    },
    tdBusinessId: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2
    },
    tdText: {
        fontSize: 14,
        color: '#cbd5e1'
    },
    emptyTable: {
        paddingVertical: 40,
        alignItems: 'center'
    },
    emptyTableText: {
        color: '#64748b',
        fontSize: 15,
        fontWeight: '500'
    }
});
