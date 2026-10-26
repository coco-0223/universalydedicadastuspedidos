import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Platform, ScrollView } from 'react-native';
import { ChatbotOrder } from '../types';
import { parseCSV } from '../utils/csvParser';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1pheEhaDiG-dbuvO8Fc48LMrxUmU_FJH7J7C-qSLMB50/export?format=csv&gid=0';
const STATUS_STORAGE_KEY = '@chatbot_order_statuses_v1';

export const ChatbotOrdersView = () => {
    const [orders, setOrders] = useState<ChatbotOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [timeFilter, setTimeFilter] = useState<'past' | number>(0);
    const [statuses, setStatuses] = useState<Record<string, 'recibido' | 'listo'>>({});

    // Load persisted local statuses
    useEffect(() => {
        const loadLocalStatuses = async () => {
            try {
                const json = await AsyncStorage.getItem(STATUS_STORAGE_KEY);
                if (json) {
                    setStatuses(JSON.parse(json));
                }
            } catch (e) {
                console.error('Error loading chatbot local statuses', e);
            }
        };
        loadLocalStatuses();
    }, []);

    const updateOrderStatus = async (orderId: string, newStatus: 'recibido' | 'listo') => {
        const updated = { ...statuses, [orderId]: newStatus };
        setStatuses(updated);
        try {
            await AsyncStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
            console.error('Error saving chatbot local status', e);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(SHEET_URL);
            const text = await response.text();
            const rows = parseCSV(text);
            
            if (rows.length < 2) {
                setOrders([]);
                setLoading(false);
                return;
            }
            
            const parsedOrders: ChatbotOrder[] = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0] && !row[1] && !row[6]) continue;
                parsedOrders.push({
                    clientName: row[0] || 'Desconocido',
                    clientPhone: row[1] || '',
                    createdAt: row[2] || '',
                    scheduledDate: row[3] || '',
                    timeSlot: row[4] || '',
                    branch: row[5] || '',
                    id: row[6] || `temp-${i}`,
                    orderText: row[7] || '',
                    notes: row[8] || '',
                    address: row[9] || '',
                    paymentMethod: row[10] || '',
                    isPrinted: (row[11] || '').toLowerCase() === 'si' || (row[11] || '').toLowerCase() === 'sí',
                });
            }
            setOrders(parsedOrders.reverse());
        } catch (e: any) {
            setError(e.message || 'Error al cargar los pedidos del chatbot');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const startOfToday = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const getDayOffset = (dateStr: string) => {
        if (!dateStr) return -999;
        const [y, m, d] = dateStr.split('-');
        if (!y || !m || !d) return -999;
        const targetDate = new Date(Number(y), Number(m) - 1, Number(d));
        targetDate.setHours(0,0,0,0);
        const diffTime = targetDate.getTime() - startOfToday.getTime();
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    const displayOrders = useMemo(() => {
        if (timeFilter === 'past') {
            return orders.filter(o => {
                const off = getDayOffset(o.scheduledDate);
                return off >= -7 && off < 0;
            });
        }
        return orders.filter(o => getDayOffset(o.scheduledDate) === timeFilter);
    }, [orders, timeFilter]);

    const pickups = displayOrders.filter(o => !o.address && o.branch);
    const deliveries = displayOrders.filter(o => !!o.address);

    const pendingPastCount = useMemo(() => {
        return orders.filter(o => {
            const off = getDayOffset(o.scheduledDate);
            const isListo = statuses[o.id] === 'listo';
            return off >= -7 && off < 0 && !isListo;
        }).length;
    }, [orders, statuses]);

    const renderOrderCard = (order: ChatbotOrder, isDelivery: boolean) => {
        const currentStatus = statuses[order.id] || 'recibido';
        const isListo = currentStatus === 'listo';

        const statusColor = isListo ? '#10b981' : '#f59e0b';
        const statusBg = isListo ? '#dcfce7' : '#fef3c7';
        const statusText = isListo ? 'LISTO' : 'RECIBIDO';
        const methodColor = isDelivery ? '#0284c7' : '#ea580c';
        
        return (
            <View key={order.id} style={[styles.card, { borderLeftColor: statusColor }, isListo && { backgroundColor: '#f0fdf4' }]}>
                <View style={styles.cardHeader}>
                    <Text style={styles.orderId}>#{order.id}</Text>
                    <View style={[styles.badge, { backgroundColor: statusBg, borderWidth: 1, borderColor: statusColor }]}>
                        <Text style={[styles.badgeText, { color: statusColor }]}>{statusText}</Text>
                    </View>
                </View>
                
                <View style={{ marginBottom: 10 }}>
                    <Text style={styles.clientInfo}>{order.clientName}</Text>
                    {order.clientPhone ? <Text style={styles.infoText}>Tel: {order.clientPhone}</Text> : null}
                </View>

                <Text style={[styles.infoText, { fontWeight: 'bold', color: methodColor, marginBottom: 10 }]}>
                    {isDelivery ? `🚚 Envío: ${order.address}` : `🏪 Retiro: ${order.branch}`}
                </Text>
                
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <View style={styles.pillDate}>
                        <Text style={styles.pillDateText}>{order.scheduledDate || 'Sin Fecha'}</Text>
                    </View>
                    {order.timeSlot ? (
                        <View style={styles.pillTime}>
                            <Text style={styles.pillTimeText}>{order.timeSlot}</Text>
                        </View>
                    ) : null}
                    {order.paymentMethod ? (
                        <View style={styles.pillPayment}>
                            <Text style={styles.pillPaymentText}>💳 {order.paymentMethod}</Text>
                        </View>
                    ) : null}
                </View>

                <View style={styles.itemsList}>
                    <Text style={{ fontWeight: '600', color: '#334155', marginBottom: 5 }}>Detalle del pedido:</Text>
                    <Text style={styles.freeTextOrder}>{order.orderText}</Text>
                    {order.notes ? (
                        <View style={styles.notesBox}>
                            <Text style={styles.notesText}><Text style={{ fontWeight: 'bold' }}>Obs:</Text> {order.notes}</Text>
                        </View>
                    ) : null}
                </View>

                {/* BOTONES DE ESTADO (Solo local, sin tocar Google Sheets ni estadísticas) */}
                <View style={styles.statusButtonsRow}>
                    <Pressable
                        style={[
                            styles.statusBtn,
                            currentStatus === 'recibido' ? styles.statusBtnRecibidoActive : styles.statusBtnInactive
                        ]}
                        onPress={() => updateOrderStatus(order.id, 'recibido')}
                    >
                        <Text style={[styles.statusBtnText, currentStatus === 'recibido' && { color: '#b45309' }]}>
                            📥 Recibido
                        </Text>
                    </Pressable>

                    <Pressable
                        style={[
                            styles.statusBtn,
                            currentStatus === 'listo' ? styles.statusBtnListoActive : styles.statusBtnInactive
                        ]}
                        onPress={() => updateOrderStatus(order.id, 'listo')}
                    >
                        <Text style={[styles.statusBtnText, currentStatus === 'listo' && { color: '#15803d' }]}>
                            ✅ Listo
                        </Text>
                    </Pressable>
                </View>
            </View>
        );
    };

    if (loading && orders.length === 0) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={{ marginTop: 10, color: '#666' }}>Cargando desde Google Sheets...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 15, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#64748b' }}>Conectado a Google Sheets (Solo Lectura - Sin Estadísticas)</Text>
                <Pressable onPress={fetchOrders} style={{ padding: 8, backgroundColor: '#e2e8f0', borderRadius: 8 }}>
                    <FontAwesome name="refresh" size={16} color="#334155" />
                </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterScrollContent}>
                <Pressable 
                    style={[styles.filterBtn, timeFilter === 'past' && styles.filterBtnActive, pendingPastCount > 0 && { borderColor: '#ef4444', borderWidth: 1 }]} 
                    onPress={() => setTimeFilter('past')}
                >
                    {pendingPastCount > 0 && <View style={styles.archivedBadge}><Text style={styles.archivedBadgeText}>!</Text></View>}
                    <Text style={[styles.filterBtnText, timeFilter === 'past' && styles.filterBtnTextActive, pendingPastCount > 0 && { color: '#ef4444', fontWeight: 'bold' }]}>
                        Atrasados
                    </Text>
                </Pressable>

                {[0, 1, 2, 3, 4, 5, 6, 7].map(offset => {
                    const d = new Date(startOfToday);
                    d.setDate(d.getDate() + offset);
                    const diaStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                    
                    const dayList = orders.filter(o => getDayOffset(o.scheduledDate) === offset);
                    const p = dayList.filter(o => !o.address && o.branch).length;
                    const e = dayList.filter(o => !!o.address).length;
                    const countStr = `(${e}/${p})`;
                    
                    let label = offset === 0 ? `Hoy ${countStr}` : (offset === 1 ? `Mañana ${countStr}` : `${diaStr} ${countStr}`);
                    return (
                        <Pressable key={offset} style={[styles.filterBtn, timeFilter === offset && styles.filterBtnActive]} onPress={() => setTimeFilter(offset)}>
                            <Text style={[styles.filterBtnText, timeFilter === offset && styles.filterBtnTextActive]}>{label}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            <View style={styles.kanbanContainer}>
                <View style={styles.kanbanColumn}>
                    <View style={[styles.colHeader, { backgroundColor: '#ea580c' }]}>
                        <Text style={styles.colTitle}>🏪 Retiros</Text>
                    </View>
                    <FlatList 
                        data={pickups} 
                        keyExtractor={item => item.id} 
                        renderItem={({ item }) => renderOrderCard(item, false)} 
                        contentContainerStyle={styles.list}
                        ListEmptyComponent={<Text style={styles.emptyText}>No hay retiros para esta fecha.</Text>} 
                    />
                </View>
                <View style={styles.kanbanColumn}>
                    <View style={[styles.colHeader, { backgroundColor: '#0284c7' }]}>
                        <Text style={styles.colTitle}>🚚 Envíos</Text>
                    </View>
                    <FlatList 
                        data={deliveries} 
                        keyExtractor={item => item.id} 
                        renderItem={({ item }) => renderOrderCard(item, true)} 
                        contentContainerStyle={styles.list}
                        ListEmptyComponent={<Text style={styles.emptyText}>No hay envíos para esta fecha.</Text>}
                    />
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f5f7' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    filterScroll: { flexGrow: 0, paddingHorizontal: 20, marginBottom: 15 },
    filterScrollContent: { gap: 10, paddingRight: 40 },
    filterBtn: { backgroundColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, justifyContent: 'center', position: 'relative' },
    filterBtnActive: { backgroundColor: '#1f2937' },
    filterBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
    filterBtnTextActive: { color: '#fff' },
    archivedBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    archivedBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

    kanbanContainer: { flex: 1, flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 20, paddingHorizontal: 20 },
    kanbanColumn: { flex: 1, minWidth: 300 },
    colHeader: { paddingVertical: 12, paddingHorizontal: 15, borderTopLeftRadius: 10, borderTopRightRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
    colTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    
    list: { paddingVertical: 15, paddingHorizontal: 2 },
    emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 30, fontSize: 15 },

    card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, borderLeftWidth: 8 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    orderId: { fontSize: 13, color: '#64748b', fontWeight: 'bold' },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
    
    clientInfo: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
    infoText: { fontSize: 14, color: '#475569', marginTop: 2 },

    pillDate: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
    pillDateText: { color: '#0369a1', fontSize: 12, fontWeight: 'bold' },
    pillTime: { backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
    pillTimeText: { color: '#b45309', fontSize: 12, fontWeight: 'bold' },
    pillPayment: { backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
    pillPaymentText: { color: '#16a34a', fontSize: 12, fontWeight: 'bold' },

    itemsList: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 5 },
    freeTextOrder: { fontSize: 14, color: '#334155', lineHeight: 22 },
    notesBox: { marginTop: 10, backgroundColor: '#fef9c3', padding: 8, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#eab308' },
    notesText: { fontSize: 13, color: '#854d0e', fontStyle: 'italic' },

    statusButtonsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
    },
    statusBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
    },
    statusBtnInactive: {
        backgroundColor: '#f8fafc',
        borderColor: '#cbd5e1',
    },
    statusBtnRecibidoActive: {
        backgroundColor: '#fef3c7',
        borderColor: '#f59e0b',
    },
    statusBtnListoActive: {
        backgroundColor: '#dcfce7',
        borderColor: '#10b981',
    },
    statusBtnText: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#64748b',
    },
});
