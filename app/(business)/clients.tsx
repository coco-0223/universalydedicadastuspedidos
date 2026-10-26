import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, TextInput, Modal, Platform, Alert } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useAppContext } from '../../src/context/AppContext';
import { AppNotification, TesterActivity } from '../../src/types';
import { saveNotificationToFirebase, saveBusinessSettings } from '../../src/services/businessService';
import { useRouter } from 'expo-router';
import { db } from '../../src/config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';


interface ClientProfile {
    id: string;
    name: string;
    phone: string;
    totalSpent: number;
    orderCount: number;
    firstPurchase: string;
    lastPurchase: string;
    points: number; // Sistema de puntos oculto (preparado para futuro)
}

export default function ClientsCRM() {
    const { orders, businessProfile, setNotifications, settings } = useAppContext();
    const router = useRouter();
    const primaryColor = businessProfile?.primaryColor || '#14b8a6';

    const [filterText, setFilterText] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'dormant' | 'vip' | 'new' | 'testers'>('all');
    const [testers, setTesters] = useState<TesterActivity[]>([]);
    const [selectedTester, setSelectedTester] = useState<TesterActivity | null>(null);
    const [testerSortOrder, setTesterSortOrder] = useState<'desc' | 'asc'>('desc');

    React.useEffect(() => {
        if (!businessProfile?.id || businessProfile.id === 'default') return;
        const testersRef = collection(db, 'businesses', businessProfile.id, 'testers');
        const unsubscribe = onSnapshot(testersRef, (snapshot) => {
            const data = snapshot.docs.map(doc => doc.data() as TesterActivity);
            setTesters(data);
        });
        return () => unsubscribe();
    }, [businessProfile?.id]);

    
    // Configuración para el mensajero en masa
    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    const [showMessager, setShowMessager] = useState(false);
    const [messageTitle, setMessageTitle] = useState('');
    const [messageBody, setMessageBody] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [showCouponWarning, setShowCouponWarning] = useState(false);

    // --- AGREGACIÓN DE DATOS (Mapeo Órdenes -> Clientes) --- //
    const clients = useMemo(() => {
        const clientMap = new Map<string, ClientProfile>();

        orders.forEach(o => {
            const key = o.clientId || o.clientPhone || 'Desconocido';
            if (!clientMap.has(key)) {
                clientMap.set(key, { 
                    id: key, 
                    name: o.clientName || 'Desconocido', 
                    phone: o.clientPhone || 'Sin código/teléfono',
                    totalSpent: 0,
                    orderCount: 0,
                    firstPurchase: o.createdAt,
                    lastPurchase: o.createdAt,
                    points: 0 // Base para futuro
                });
            }
            const c = clientMap.get(key)!;
            c.totalSpent += o.totalPrice || 0;
            c.orderCount += 1;
            c.points += Math.floor((o.totalPrice || 0) / 100); // Lógica temporal oculta

            if (new Date(o.createdAt) < new Date(c.firstPurchase)) c.firstPurchase = o.createdAt;
            if (new Date(o.createdAt) > new Date(c.lastPurchase)) c.lastPurchase = o.createdAt;
        });

        return Array.from(clientMap.values());
    }, [orders]);

    // --- FILTRADO INTELIGENTE --- //
    const filteredClients = useMemo(() => {
        const now = new Date();
        let result = clients;

        if (activeTab === 'dormant') {
            // Dormidos: Más de 15 días sin comprar
            result = result.filter(c => {
                const diffTime = Math.abs(now.getTime() - new Date(c.lastPurchase).getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                return diffDays > 15;
            });
        } else if (activeTab === 'vip') {
            // VIP: Más de 3 compras o gasto alto
            result = result.filter(c => c.orderCount >= 3 || c.totalSpent > 30000);
        } else if (activeTab === 'new') {
            // Nuevos: Primera compra (y única) en los últimos 7 días
            result = result.filter(c => {
                const diffTime = Math.abs(now.getTime() - new Date(c.firstPurchase).getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                return diffDays <= 7 && c.orderCount === 1;
            });
        }

        if (filterText) {
            const lowerFilter = filterText.toLowerCase();
            result = result.filter(c => c.name.toLowerCase().includes(lowerFilter) || c.phone.includes(lowerFilter));
        }

        // Ordenar por última compra por defecto
        return result.sort((a, b) => new Date(b.lastPurchase).getTime() - new Date(a.lastPurchase).getTime());
    }, [clients, filterText, activeTab]);

    const sortedTesters = useMemo(() => {
        let list = [...testers];
        if (filterText) {
            const lowerFilter = filterText.toLowerCase();
            list = list.filter(t => (t.name || '').toLowerCase().includes(lowerFilter) || t.id.toLowerCase().includes(lowerFilter));
        }
        return list.sort((a, b) => {
            const diff = (b.consecutiveDays || 0) - (a.consecutiveDays || 0);
            return testerSortOrder === 'desc' ? diff : -diff;
        });
    }, [testers, filterText, testerSortOrder]);

    const toggleSelection = (id: string) => {
        setSelectedClients(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedClients.length === filteredClients.length) {
            setSelectedClients([]);
        } else {
            setSelectedClients(filteredClients.map(c => c.id));
        }
    };

    const handleSendNotifications = async (forceModuleOn = false) => {
        if (!messageTitle || !messageBody) {
            if (Platform.OS === 'web') alert("Completá el título y el mensaje");
            else Alert.alert("Error", "Completá el título y el mensaje");
            return;
        }

        // Check if we need to warn about disabled coupons
        const isPromoMessage = promoCode.trim().length > 0;
        if (isPromoMessage && !settings.marketingModules?.couponsActive && !forceModuleOn && !showCouponWarning) {
            setShowCouponWarning(true);
            return;
        }

        if (forceModuleOn === true) { // User chose "Activar Siempre"
           const updatedSettings = {
               ...settings,
               marketingModules: { ...settings.marketingModules, couponsActive: true }
           };
           await saveBusinessSettings(businessProfile.id, updatedSettings);
           // Update context locally too
           // setSettings(updatedSettings) -> if setSettings is in context
        }
        
        let finalMessageBody = messageBody;
        if (isPromoMessage) {
            const usedCoupon = settings.coupons?.find(c => c.code.toUpperCase() === promoCode.trim().toUpperCase());
            if (usedCoupon) {
                const discText = usedCoupon.discountPercentage ? `${usedCoupon.discountPercentage}% de Descuento` : `$${usedCoupon.fixedDiscountAmount} de Descuento`;
                finalMessageBody += `\n\n🎁 Beneficio Incluido: Usá el código ${usedCoupon.code} para obtener ${discText} en tu próxima compra!`;
            }
        }

        const actionUrl = isPromoMessage ? `/?promo=${promoCode.trim().toUpperCase()}` : undefined;

        const newNotifs: AppNotification[] = selectedClients.map(clientId => ({
            id: Date.now().toString() + Math.random().toString(),
            businessId: businessProfile?.id || 'default',
            userId: clientId,
            title: messageTitle,
            message: finalMessageBody,
            type: isPromoMessage ? 'coupon' : 'custom',
            read: false,
            createdAt: new Date().toISOString(),
            actionUrl: actionUrl
        }));

        // Guardamos en Firebase para cada cliente
        for (const notif of newNotifs) {
            await saveNotificationToFirebase(notif.businessId, notif);
        }

        setNotifications(prev => {
            const map = new Map();
            prev.forEach(x => map.set(x.id, x));
            newNotifs.forEach(x => map.set(x.id, x));
            return Array.from(map.values()).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        });

        console.log("Enviando Notificación a", selectedClients.length, "clientes");
        
        if (Platform.OS === 'web') alert(`¡Notificación enviada a ${selectedClients.length} clientes con éxito!`);
        else Alert.alert("Éxito", `Notificación enviada a ${selectedClients.length} clientes con éxito!`);
        
        setShowMessager(false);
        setShowCouponWarning(false);
        setMessageTitle('');
        setMessageBody('');
        setPromoCode('');
        setSelectedClients([]);
    };

    const handleExportCSV = () => {
        // Lógica sencilla de exportación (Mock para WebApp)
        if (Platform.OS === 'web') {
            const headers = ['Nombre,Teléfono,GastoTotal,TotalÓrdenes,ÚltimaCompra'];
            const rows = filteredClients.map(c => `${c.name},${c.phone},${c.totalSpent},${c.orderCount},${new Date(c.lastPurchase).toLocaleDateString()}`);
            const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "mis_clientes.csv");
            document.body.appendChild(link); 
            link.click();
        } else {
            Alert.alert("Aviso", "La descarga masiva (CSV) está optimizada para el administrador web desde tu computadora.");
        }
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#f4f5f7' }}>
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.title}>CRM y Fidelización</Text>
                        <Text style={styles.subtitle}>Conocé quiénes te compran y enviales beneficios.</Text>
                    </View>
                    <Pressable style={styles.exportBtn} onPress={handleExportCSV}>
                        <FontAwesome name="download" size={16} color="#666" style={{marginRight: 6}} />
                        <Text style={styles.exportBtnText}>Excel / CSV WhatsApp</Text>
                    </Pressable>
                </View>

                {/* Filtros e Inteligencia */}
                <View style={styles.intelligenceBar}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, alignItems: 'center' }}>
                        <Pressable style={[styles.filterChip, activeTab === 'all' && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setActiveTab('all')}>
                            <FontAwesome name="users" size={14} color={activeTab === 'all' ? '#fff' : '#666'} />
                            <Text style={[styles.filterChipText, activeTab === 'all' && { color: '#fff' }]}> Todos ({clients.length})</Text>
                        </Pressable>
                        <Pressable style={[styles.filterChip, activeTab === 'vip' && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setActiveTab('vip')}>
                            <FontAwesome name="star" size={14} color={activeTab === 'vip' ? '#fff' : '#eab308'} />
                            <Text style={[styles.filterChipText, activeTab === 'vip' && { color: '#fff' }]}> Frecuentes / VIP</Text>
                        </Pressable>
                        <Pressable style={[styles.filterChip, activeTab === 'dormant' && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setActiveTab('dormant')}>
                            <FontAwesome name="bed" size={14} color={activeTab === 'dormant' ? '#fff' : '#ef4444'} />
                            <Text style={[styles.filterChipText, activeTab === 'dormant' && { color: '#fff' }]}> Dormidos (+15 Días)</Text>
                        </Pressable>
                        <Pressable style={[styles.filterChip, activeTab === 'new' && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setActiveTab('new')}>
                            <FontAwesome name="leaf" size={14} color={activeTab === 'new' ? '#fff' : '#10b981'} />
                            <Text style={[styles.filterChipText, activeTab === 'new' && { color: '#fff' }]}> Nuevos de esta semana</Text>
                        </Pressable>
                        <Pressable style={[styles.filterChip, activeTab === 'testers' && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setActiveTab('testers')}>
                            <FontAwesome name="mobile" size={14} color={activeTab === 'testers' ? '#fff' : '#3b82f6'} />
                            <Text style={[styles.filterChipText, activeTab === 'testers' && { color: '#fff' }]}> Seguimiento Testers</Text>
                        </Pressable>
                    </ScrollView>
                </View>

                {/* Buscador y Tabla */}
                <View style={styles.tableCard}>
                    <View style={styles.tableHeaderSection}>
                        <View style={styles.searchBox}>
                            <FontAwesome name="search" size={16} color="#999" />
                            <TextInput 
                                style={styles.searchInput} 
                                placeholder="Buscar cliente por nombre o teléfono..." 
                                value={filterText}
                                onChangeText={setFilterText}
                            />
                        </View>
                        
                        {selectedClients.length > 0 && (
                            <Pressable style={[styles.actionBtn, { backgroundColor: primaryColor }]} onPress={() => setShowMessager(true)}>
                                <FontAwesome name="paper-plane" size={14} color="#fff" style={{marginRight: 8}}/>
                                <Text style={styles.actionBtnText}>Enviar Beneficio ({selectedClients.length})</Text>
                            </Pressable>
                        )}
                    </View>

                    {filteredClients.length === 0 ? (
                        <View style={styles.emptyState}>
                            <FontAwesome name="inbox" size={40} color="#cbd5e1" />
                            <Text style={styles.emptyStateText}>No hay clientes que coincidan con estos filtros.</Text>
                        </View>
                    ) : (
                        <View style={styles.tableWrapper}>
                            {activeTab === 'testers' ? (
                                <>
                                    <View style={styles.tableHeader}>
                                        <Text style={[styles.colText, { flex: 2.2, fontWeight: 'bold' }]}>Tester / Teléfono</Text>
                                        <Text style={[styles.colText, { flex: 1, fontWeight: 'bold', textAlign: 'center' }]}>Interacciones Hoy</Text>
                                        <Text style={[styles.colText, { flex: 1, fontWeight: 'bold', textAlign: 'center' }]}>Estado (24hs)</Text>
                                        <Pressable 
                                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                                            onPress={() => setTesterSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                                        >
                                            <Text style={[styles.colText, { fontWeight: 'bold', color: primaryColor }]}>Racha</Text>
                                            <FontAwesome name={testerSortOrder === 'desc' ? "sort-amount-desc" : "sort-amount-asc"} size={12} color={primaryColor} />
                                        </Pressable>
                                        <Text style={[styles.colText, { flex: 1.5, fontWeight: 'bold', textAlign: 'right' }]}>Última Vez</Text>
                                    </View>
                                    {sortedTesters.map((tester, index) => {
                                        const todayStr = new Date().toLocaleDateString('en-CA');
                                        const isToday = tester.lastActiveDate === todayStr;
                                        const interactions = isToday ? tester.interactionsToday : 0;
                                        const isOk = interactions >= 5;
                                        
                                        // Timer for 24h
                                        const now = new Date();
                                        const midnight = new Date();
                                        midnight.setHours(24, 0, 0, 0);
                                        const msLeft = midnight.getTime() - now.getTime();
                                        const hrsLeft = Math.floor(msLeft / (1000 * 60 * 60));
                                        const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
                                        
                                        return (
                                            <Pressable 
                                                key={tester.id} 
                                                style={[styles.tableRow, index % 2 === 0 && { backgroundColor: '#fcfcfc' }]}
                                                onPress={() => setSelectedTester(tester)}
                                            >
                                                <View style={{ flex: 2.2 }}>
                                                    <Text style={styles.clientName}>{tester.name}</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                        {tester.phone ? (
                                                            <Text style={{ fontSize: 12, color: '#0284c7', fontWeight: '600' }}>📞 {tester.phone}</Text>
                                                        ) : (
                                                            <Text style={{ fontSize: 11, color: '#94a3b8' }}>Sin tel</Text>
                                                        )}
                                                        <Text style={{ fontSize: 10, backgroundColor: tester.platform === 'app' ? '#dcfce7' : '#f1f5f9', color: tester.platform === 'app' ? '#15803d' : '#64748b', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, fontWeight: 'bold' }}>
                                                            {tester.platform === 'app' ? '📱 App' : '🌐 Web'}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <Text style={[styles.colText, { flex: 1, textAlign: 'center' }]}>{interactions} / 5</Text>
                                                <Text style={[styles.colText, { flex: 1, textAlign: 'center', fontWeight: 'bold', color: isOk ? '#10b981' : '#f59e0b' }]}>
                                                    {isOk ? 'OK' : `${hrsLeft}h ${minsLeft}m left`}
                                                </Text>
                                                <Text style={[styles.colText, { flex: 1, textAlign: 'center', color: primaryColor, fontWeight: 'bold' }]}>{tester.consecutiveDays} Días</Text>
                                                <Text style={[styles.colText, { flex: 1.5, textAlign: 'right', color: '#64748b' }]}>{new Date(tester.updatedAt).toLocaleString()}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </>
                            ) : (
                                <>
                                    <View style={styles.tableHeader}>
                                        <Pressable style={styles.checkboxContainer} onPress={toggleSelectAll}>
                                            <View style={[styles.checkbox, selectedClients.length === filteredClients.length && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                                                {selectedClients.length === filteredClients.length && <FontAwesome name="check" size={10} color="#fff" />}
                                            </View>
                                        </Pressable>
                                        <Text style={[styles.colText, { flex: 2, fontWeight: 'bold' }]}>Cliente</Text>
                                        <Text style={[styles.colText, { flex: 1, fontWeight: 'bold' }]}>Teléfono</Text>
                                        <Text style={[styles.colText, { flex: 1, fontWeight: 'bold', textAlign: 'center' }]}>Órdenes</Text>
                                        <Text style={[styles.colText, { flex: 1, fontWeight: 'bold', textAlign: 'right' }]}>Gasto</Text>
                                        <Text style={[styles.colText, { flex: 1.5, fontWeight: 'bold', textAlign: 'right' }]}>Última Vez</Text>
                                    </View>
        
                                    {filteredClients.map((client, index) => (
                                        <Pressable 
                                            key={client.id} 
                                            style={[styles.tableRow, index % 2 === 0 && { backgroundColor: '#fcfcfc' }]}
                                            onPress={() => toggleSelection(client.id)}
                                        >
                                            <View style={styles.checkboxContainer}>
                                                <View style={[styles.checkbox, selectedClients.includes(client.id) && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                                                    {selectedClients.includes(client.id) && <FontAwesome name="check" size={10} color="#fff" />}
                                                </View>
                                            </View>
                                            <View style={{ flex: 2 }}>
                                                <Text style={styles.clientName}>{client.name}</Text>
                                                {client.orderCount > 3 && <Text style={styles.badgeVip}>Frecuente</Text>}
                                            </View>
                                            <Text style={[styles.colText, { flex: 1 }]}>{client.phone}</Text>
                                            <Text style={[styles.colText, { flex: 1, textAlign: 'center' }]}>{client.orderCount}</Text>
                                            <Text style={[styles.colText, { flex: 1, textAlign: 'right', fontWeight: '600', color: '#16a34a' }]}>${client.totalSpent.toLocaleString()}</Text>
                                            <Text style={[styles.colText, { flex: 1.5, textAlign: 'right', color: '#64748b' }]}>{new Date(client.lastPurchase).toLocaleDateString()}</Text>
                                        </Pressable>
                                    ))}
                                </>
                            )}
                        </View>
                    )}
                </View>

                {/* Modal Notificaciones IN-APP */}
                    <Modal visible={showMessager} animationType="slide" transparent>
                    <View style={styles.modalOverlay}>
                        <View style={styles.messagerModal}>
                            <View style={styles.modalTop}>
                                <Text style={styles.modalTitle}>📧 Creador de Campañas</Text>
                                <Pressable onPress={() => setShowMessager(false)}>
                                    <FontAwesome name="times" size={24} color="#666" />
                                </Pressable>
                            </View>
                            
                            <Text style={styles.modalDesc}>Vas a enviar una notificación en la app a {selectedClients.length} cliente(s). Ideal para promociones, reactivaciones o avisos de stock.</Text>

                            <Text style={styles.label}>Título del mensaje corto</Text>
                            <TextInput 
                                style={styles.inputModal} 
                                placeholder="Ej: ¡Volvé, te extrañamos! / Llegó Asado Premium" 
                                value={messageTitle}
                                onChangeText={setMessageTitle}
                            />

                            <Text style={styles.label}>Cuerpo (Detalle)</Text>
                            <TextInput 
                                style={[styles.inputModal, { height: 100, textAlignVertical: 'top' }]} 
                                placeholder="Escribí tu mensaje acá..." 
                                multiline
                                value={messageBody}
                                onChangeText={setMessageBody}
                            />

                            <Text style={styles.label}>Adjuntar un Cupón (Opcional)</Text>
                            {settings.coupons && settings.coupons.length > 0 ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                                    <Pressable 
                                        style={[styles.filterChip, promoCode === '' && { backgroundColor: primaryColor, borderColor: primaryColor }]} 
                                        onPress={() => setPromoCode('')}
                                    >
                                        <Text style={[styles.filterChipText, promoCode === '' && { color: '#fff' }]}>Ninguno</Text>
                                    </Pressable>
                                    {settings.coupons.map(c => (
                                        <Pressable 
                                            key={c.code}
                                            style={[styles.filterChip, { marginLeft: 10 }, promoCode === c.code && { backgroundColor: primaryColor, borderColor: primaryColor }]} 
                                            onPress={() => setPromoCode(c.code)}
                                        >
                                            <Text style={[styles.filterChipText, promoCode === c.code && { color: '#fff' }]}>{c.code} (-{c.discountPercentage || c.fixedDiscountAmount})</Text>
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            ) : (
                                <Text style={{ color: '#64748b', marginBottom: 10, fontStyle: 'italic', fontSize: 13 }}>No hay cupones creados aún.</Text>
                            )}

                            <Pressable style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }} onPress={() => { setShowMessager(false); router.push('/(business)/marketing'); }}>
                                <FontAwesome name="plus-circle" size={16} color={primaryColor} style={{ marginRight: 5 }} />
                                <Text style={{ color: primaryColor, fontWeight: 'bold' }}>Crear nuevo cupón en Marketing</Text>
                            </Pressable>

                            <Pressable style={[styles.mainBtn, { backgroundColor: primaryColor }]} onPress={() => handleSendNotifications()}>
                                <Text style={styles.mainBtnText}>🚀 Enviar Ahora</Text>
                            </Pressable>

                            <Pressable style={styles.cancelBtn} onPress={() => setShowMessager(false)}>
                                <Text style={styles.cancelBtnText}>Cancelar</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>

                {/* Warning Modal for Coupons */}
                <Modal visible={showCouponWarning} animationType="fade" transparent>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.messagerModal, { maxWidth: 400 }]}>
                            <FontAwesome name="exclamation-triangle" size={40} color="#f59e0b" style={{ alignSelf: 'center', marginBottom: 20 }} />
                            <Text style={[styles.modalTitle, { textAlign: 'center' }]}>Módulo Desactivado</Text>
                            <Text style={[styles.modalDesc, { textAlign: 'center' }]}>
                                Estás enviando un cupón pero el módulo general de cupones está apagado. {"\n\n"}
                                ¿Qué deseás hacer?
                            </Text>

                            <Pressable style={[styles.mainBtn, { backgroundColor: primaryColor }]} onPress={() => handleSendNotifications(true)}>
                                <Text style={styles.mainBtnText}>Activar Siempre (+ Enviar)</Text>
                            </Pressable>

                            <Pressable style={[styles.mainBtn, { backgroundColor: '#334155' }]} onPress={() => handleSendNotifications(false)}>
                                <Text style={styles.mainBtnText}>Activar Solo para estos clientes</Text>
                            </Pressable>

                            <Pressable style={styles.cancelBtn} onPress={() => setShowCouponWarning(false)}>
                                <Text style={styles.cancelBtnText}>Cancelar envío</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>

                {/* Tester Details Modal */}
                <Modal visible={!!selectedTester} animationType="slide" transparent>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Detalle del Tester</Text>
                                <Pressable onPress={() => setSelectedTester(null)}>
                                    <FontAwesome name="times" size={24} color="#666" />
                                </Pressable>
                            </View>
                            
                            {selectedTester && (
                                <ScrollView style={{ marginTop: 10 }}>
                                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0f172a' }}>{selectedTester.name}</Text>
                                    {selectedTester.phone ? (
                                        <Text style={{ fontSize: 14, color: '#0284c7', fontWeight: '600', marginTop: 2 }}>📞 Teléfono: {selectedTester.phone}</Text>
                                    ) : (
                                        <Text style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>Sin teléfono registrado aún</Text>
                                    )}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 10 }}>
                                        <Text style={{ color: '#64748b', fontSize: 12 }}>ID: {selectedTester.id}</Text>
                                        <Text style={{ fontSize: 11, backgroundColor: selectedTester.platform === 'app' ? '#dcfce7' : '#f1f5f9', color: selectedTester.platform === 'app' ? '#15803d' : '#64748b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontWeight: 'bold' }}>
                                            {selectedTester.platform === 'app' ? '📱 App Nativa' : '🌐 Navegador Web'}
                                        </Text>
                                    </View>
                                    
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 }}>
                                        <View style={{ alignItems: 'center', backgroundColor: '#f1f5f9', padding: 15, borderRadius: 10, flex: 1, marginRight: 5 }}>
                                            <Text style={{ fontSize: 24, fontWeight: 'bold', color: primaryColor }}>{selectedTester.consecutiveDays}</Text>
                                            <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'center' }}>Días Seguidos</Text>
                                        </View>
                                        <View style={{ alignItems: 'center', backgroundColor: '#f1f5f9', padding: 15, borderRadius: 10, flex: 1, marginLeft: 5 }}>
                                            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#10b981' }}>{selectedTester.completedDates.length}</Text>
                                            <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'center' }}>Días Totales</Text>
                                        </View>
                                    </View>

                                    <Text style={{ fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 5 }}>Historial de Días Cumplidos</Text>
                                    {selectedTester.completedDates.length === 0 ? (
                                        <Text style={{ color: '#94a3b8' }}>Aún no completó ningún día.</Text>
                                    ) : (
                                        selectedTester.completedDates.sort().reverse().map((date, idx) => (
                                            <View key={date} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                                                <FontAwesome name="check-circle" size={16} color="#10b981" style={{ marginRight: 10 }} />
                                                <Text style={{ fontSize: 15 }}>{date}</Text>
                                            </View>
                                        ))
                                    )}
                                </ScrollView>
                            )}
                            
                            <View style={styles.modalFooter}>
                                <Pressable style={[styles.primaryBtn, { backgroundColor: primaryColor, width: '100%' }]} onPress={() => setSelectedTester(null)}>
                                    <Text style={styles.primaryBtnText}>Cerrar</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </Modal>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f5f7' },
    content: { padding: 25, paddingBottom: 100 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, flexWrap: 'wrap', gap: 15 },
    title: { fontSize: 28, fontWeight: '900', color: '#111' },
    subtitle: { fontSize: 16, color: '#64748b', marginTop: 5 },
    
    exportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e2e8f0', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10 },
    exportBtnText: { color: '#334155', fontWeight: 'bold', fontSize: 14 },

    intelligenceBar: { marginBottom: 20 },
    filterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20 },
    filterChipText: { fontSize: 14, fontWeight: '600', color: '#475569' },

    tableCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
    tableHeaderSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 15, marginBottom: 20, minHeight: 45 },
    searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 15 },
    searchInput: { flex: 1, paddingVertical: 12, marginLeft: 10, fontSize: 15, outlineStyle: 'none' } as any,
    
    actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.2, shadowRadius: 3 },
    actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

    tableWrapper: { width: '100%', overflow: 'hidden' },
    tableHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: '#f1f5f9', paddingHorizontal: 10 },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingHorizontal: 10 },
    colText: { fontSize: 14, color: '#334155' },
    clientName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
    badgeVip: { fontSize: 10, backgroundColor: '#fef08a', color: '#a16207', fontWeight: '900', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginTop: 4, overflow: 'hidden' },

    checkboxContainer: { width: 35, justifyContent: 'center', alignItems: 'flex-start' },
    checkbox: { width: 18, height: 18, borderWidth: 2, borderColor: '#cbd5e1', borderRadius: 4, justifyContent: 'center', alignItems: 'center' },

    emptyState: { alignItems: 'center', paddingVertical: 50 },
    emptyStateText: { marginTop: 15, color: '#94a3b8', fontSize: 16, fontWeight: '500' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    messagerModal: { backgroundColor: '#fff', width: '100%', maxWidth: 500, borderRadius: 20, padding: 30, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, elevation: 15 },
    modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
    modalDesc: { fontSize: 14, color: '#64748b', marginBottom: 25, lineHeight: 22 },
    
    label: { fontSize: 13, fontWeight: 'bold', color: '#334155', marginBottom: 8 },
    inputModal: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 15, fontSize: 15, marginBottom: 20, color: '#334155' },
    hintModal: { fontSize: 12, color: '#f59e0b', marginTop: -15, marginBottom: 20, fontStyle: 'italic' },

    mainBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
    mainBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    cancelBtn: { paddingVertical: 16, alignItems: 'center', marginTop: 5 },
    cancelBtnText: { color: '#64748b', fontSize: 15, fontWeight: '600' },

    modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: 500, borderRadius: 20, padding: 30, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, elevation: 15 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalFooter: { marginTop: 20 },
    primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
