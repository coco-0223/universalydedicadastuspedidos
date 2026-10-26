import { router, useFocusEffect } from 'expo-router';
import React, { useState, useCallback } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppContext } from '../../../src/context/AppContext';
import { saveOrderToFirebase } from '../../../src/services/businessService';
import { getItemPricing, getOrderPricing } from '../../../src/utils/productUtils';
import { CURRENT_BUSINESS_ID } from '../../../src/data/mockData';

export default function ClientOrdersScreen() {
    const { user, settings, orders, setOrders, setCart, businessProfile, setModifyingOrder, setUnreadOrderUpdates, guestOrderIds, offers } = useAppContext();
    const [showPastOrders, setShowPastOrders] = useState(false);

    useFocusEffect(
        useCallback(() => {
            setUnreadOrderUpdates(0);
        }, [])
    );

    // Ordenar pedidos para mostrar los más recientes arriba
    // Separar pedidos actuales de pasados
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const filteredOrders = orders.filter(o => 
        (user?.id && o.clientId === user.id) || 
        (!user?.id && guestOrderIds.includes(o.id))
    );
    
    const currentOrders = filteredOrders
        .filter(o => new Date(o.scheduledTime).getTime() >= todayStart)
        .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const pastOrders = filteredOrders
        .filter(o => new Date(o.scheduledTime).getTime() < todayStart)
        .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const currentOrdersMapped = currentOrders.map(o => ({ ...o, isPast: false }));
    const pastOrdersMapped = pastOrders.map(o => ({ ...o, isPast: true }));

    let displayOrders: any[] = [];
    if (!showPastOrders) {
        displayOrders = [...currentOrdersMapped];
        if (pastOrdersMapped.length > 0) {
            displayOrders.push({ id: 'past-orders-separator', isSeparator: true });
            displayOrders.push(...pastOrdersMapped);
        }
    } else {
        displayOrders = pastOrdersMapped;
    }

    // Custom Dialog State
    const [dialog, setDialog] = useState<{ visible: boolean; title: string; message: string; buttons?: any[] }>({ visible: false, title: '', message: '' });
    const closeDialog = () => setDialog(prev => ({ ...prev, visible: false }));
    const showCustomAlert = (title: string, message: string, buttons?: any[]) => {
        setDialog({ visible: true, title, message, buttons: buttons || [{ text: 'OK', onPress: closeDialog }] });
    };

    // Modal para editar datos info
    const [editInfoModal, setEditInfoModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editAddress, setEditAddress] = useState('');

    const handleEditClick = (order: any) => {
        const scheduledTime = new Date(order.scheduledTime).getTime();
        const now = new Date().getTime();
        const hoursDiff = (scheduledTime - now) / (1000 * 60 * 60);

        if (hoursDiff < 2) {
            showCustomAlert(
                'No se puede editar',
                'Faltan menos de 2 horas para tu pedido. Comunicate directamente con la carnicería.'
            );
        } else {
                            showCustomAlert(
                                'Modificar Pedido',
                                '¿Vas a modificar tu pedido. Está bien? El total se recalculará y se mantendrá el mismo número de ticket.',
                                [
                                    { text: 'Cancelar', style: 'cancel', onPress: closeDialog },
                                    {
                                        text: 'Sí, Modificar',
                                        onPress: () => {
                                            closeDialog();
                                            // Llenamos el carrito con las cantidades "reales" o actuales del pedido
                                            setCart(order.items.map((i: any) => ({ product: i.product, quantity: i.actualQuantity || i.quantity })));
                                            setModifyingOrder(order);
                                            setTimeout(() => router.push('/cart'), 100);
                                        }
                                    }
                                ]
                            );
        }
    };

    const handleSaveInfo = async () => {
        if (!selectedOrder) return;
        if (!editName.trim() || !editPhone.trim()) {
            return;
        }

        const updatedOrder = {
            ...selectedOrder,
            clientName: editName.trim(),
            clientPhone: editPhone.trim(),
            clientAddress: editAddress.trim() || undefined
        };

        try {
            await saveOrderToFirebase(businessProfile.id, updatedOrder);
            setOrders((prev: any) => prev.map((o: any) => o.id === updatedOrder.id ? updatedOrder : o));
            setEditInfoModal(false);
        } catch(e) {
            showCustomAlert('Error', 'No se pudo asegurar la modificación en la base de datos.');
        }
    };

    const handleRepeatClick = (order: any) => {
        setCart(order.items.map((i: any) => ({ product: i.product, quantity: i.actualQuantity || i.quantity })));
        router.push('/cart');
    };

    const renderOrder = ({ item }: { item: any }) => {
        if (item.isSeparator) {
            return (
                <View style={styles.separatorContainer}>
                    <View style={styles.separatorLine} />
                    <Text style={styles.separatorText}>PEDIDOS ANTERIORES</Text>
                    <View style={styles.separatorLine} />
                </View>
            );
        }

        const isActuallyCancelled = settings.orderStatuses?.find(s => s.id === item.status)?.isCancelled || item.status === 'cancelled';
        const isActuallySuccess = settings.orderStatuses?.find(s => s.id === item.status)?.isSuccess || item.status === 'delivered';

        const currentStatusConfig = settings.orderStatuses?.find(s => s.id === item.status);
        const statusText = currentStatusConfig?.label || (item.status === 'pending' ? 'Pendiente' : (item.status === 'ready' ? (item.deliveryMethod === 'delivery' ? 'Listo / En Camino' : 'Listo para Retiro') : item.status));
        const statusColor = currentStatusConfig?.color || '#64748b';


        const dateStr = new Date(item.scheduledTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });


        const orderPricing = getOrderPricing(item, offers, settings?.isFoodBusiness);

        return (
            <View style={[styles.orderCard, isActuallyCancelled && styles.cancelledCard]}>
                <View style={styles.orderHeader}>
                    <Text style={styles.orderId}>Pedido #{item.id}</Text>
                    {!item.isPast && (!settings.displaySettings || settings.displaySettings.showOrderStatusToClients !== false || isActuallyCancelled) && (
                        <Text style={[styles.statusBadge, { backgroundColor: statusColor, color: '#fff' }]}>
                            {statusText.toUpperCase()}
                        </Text>
                    )}
                </View>

                {item.status !== 'pending' && item.status !== 'cancelled' && (
                    <Text style={styles.modifiedNotice}>🔔 Este pedido fue procesado o modificado por la tienda, el precio/cantidad final pudo haber cambiado.</Text>
                )}

                <Text style={styles.infoText}>Para: {dateStr}</Text>
                <Text style={styles.infoText}>Método: {item.deliveryMethod === 'pickup' ? 'Retiro' : 'Envío a Domicilio'}</Text>
                {item.deliveryMethod === 'delivery' && item.clientAddress && (
                    <Text style={styles.infoText}>Dirección: {item.clientAddress}</Text>
                )}
                <Text style={styles.infoText}>Nombre: {item.clientName} | Tel: {item.clientPhone}</Text>
                
                {orderPricing.hasCashDiscount ? (
                    <View style={{ marginVertical: 3 }}>
                        <Text style={styles.infoText}>
                            Total Otros Medios: ${Number.isInteger(item.totalPrice) ? item.totalPrice : item.totalPrice.toFixed(2).replace(/\.00$/, '')} {item.isCustomTotal ? '(Modificado)' : ''}
                        </Text>
                        <Text style={[styles.infoText, { color: '#16a34a', fontWeight: 'bold' }]}>
                            Total en Efectivo: ${Number.isInteger(orderPricing.cashTotalPrice) ? orderPricing.cashTotalPrice : orderPricing.cashTotalPrice.toFixed(2).replace(/\.00$/, '')}
                        </Text>
                    </View>
                ) : (
                    <Text style={styles.infoText}>Total: ${Number.isInteger(item.totalPrice) ? item.totalPrice : item.totalPrice.toFixed(2).replace(/\.00$/, '')} {item.isCustomTotal ? '(Modificado)' : ''}</Text>
                )}

                <View style={styles.divider} />

                <Text style={styles.itemsTitle}>Artículos:</Text>
                {item.items.map((cartItem: any) => {
                    const pricing = getItemPricing(cartItem, offers, settings?.isFoodBusiness);
                    const qty = cartItem.actualQuantity || cartItem.quantity;
                    const unit = cartItem.product.unitType === 'unit' ? 'u.' : 'kg';
                    const unitSuffix = cartItem.product.unitType === 'unit' ? ' c/u' : '/kg';
                    const normalUnitPrice = cartItem.actualPrice ?? cartItem.unitPrice ?? pricing.unitPrice;
                    const cashUnitPrice = cartItem.cashUnitPrice ?? pricing.cashUnitPrice;
                    const hasCashDiscount = cashUnitPrice < (normalUnitPrice - 0.001);

                    return (
                        <View key={cartItem.product.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                            <Text style={styles.itemText}>
                                {qty}{unit} x ${normalUnitPrice}${unitSuffix} - {cartItem.product.name}{' '}
                            </Text>
                            {hasCashDiscount && (
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#16a34a' }}>
                                    (💵 Efectivo: ${cashUnitPrice}${unitSuffix})
                                </Text>
                            )}
                        </View>
                    );
                })}

                {(!isActuallyCancelled && !isActuallySuccess && !item.isPast) ? (
                    <Pressable style={styles.editBtn} onPress={() => handleEditClick(item)}>
                        <Text style={styles.editBtnText}>Modificar Pedido</Text>
                    </Pressable>
                ) : (
                    <Pressable style={[styles.repeatBtn, { backgroundColor: businessProfile.primaryColor }]} onPress={() => handleRepeatClick(item)}>
                        <Text style={styles.repeatBtnText}> Repetir Pedido</Text>
                    </Pressable>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Mis Pedidos</Text>

            {/* Selector de tipo de pedido */}
            <View style={styles.tabSelector}>
                <Pressable 
                    onPress={() => setShowPastOrders(false)} 
                    style={[styles.tabBtn, !showPastOrders && { borderBottomColor: businessProfile.primaryColor, borderBottomWidth: 3 }]}
                >
                    <Text style={[styles.tabText, !showPastOrders && { color: businessProfile.primaryColor, fontWeight: '800' }]}>Actuales</Text>
                </Pressable>
                <Pressable 
                    onPress={() => setShowPastOrders(true)} 
                    style={[styles.tabBtn, showPastOrders && { borderBottomColor: businessProfile.primaryColor, borderBottomWidth: 3 }]}
                >
                    <Text style={[styles.tabText, showPastOrders && { color: businessProfile.primaryColor, fontWeight: '800' }]}>Pasados</Text>
                </Pressable>
            </View>

            {displayOrders.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No tenés {showPastOrders ? 'pedidos antiguos' : 'pedidos activos'}</Text>
                </View>
            ) : (
                <FlatList
                    data={displayOrders}
                    keyExtractor={item => item.id}
                    renderItem={renderOrder}
                    contentContainerStyle={styles.list}
                />
            )}

            {/* CUSTOM DIALOG MODAL */}
            <Modal visible={dialog.visible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Text style={styles.modalTitle}>{dialog.title}</Text>
                        <Text style={styles.modalMessage}>{dialog.message}</Text>
                        <View style={styles.modalActions}>
                            {dialog.buttons?.map((btn, idx) => (
                                <Pressable
                                    key={idx}
                                    style={[styles.modalBtn, btn.style === 'cancel' ? styles.modalBtnCancel : { backgroundColor: businessProfile.primaryColor }]}
                                    onPress={btn.onPress}
                                >
                                    <Text style={[styles.modalBtnText, btn.style === 'cancel' && { color: '#333' }]}>{btn.text}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* EDIT INFO MODAL */}
            <Modal visible={editInfoModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Text style={styles.modalTitle}>Editar Datos Personales</Text>
                        <Text style={styles.modalMessage}>Actualiza los detalles de entrega/contacto solo para este pedido.</Text>
                        
                        <Text style={styles.label}>Nombre</Text>
                        <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Nombre compador" />
                        
                        <Text style={styles.label}>Teléfono Contacto</Text>
                        <TextInput style={styles.input} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />

                        {selectedOrder?.deliveryMethod === 'delivery' && (
                            <>
                                <Text style={styles.label}>Dirección de Envío</Text>
                                <TextInput style={styles.input} value={editAddress} onChangeText={setEditAddress} />
                            </>
                        )}

                        <View style={[styles.modalActions, { marginTop: 15 }]}>
                            <Pressable style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setEditInfoModal(false)}>
                                <Text style={[styles.modalBtnText, { color: '#333' }]}>Cancelar</Text>
                            </Pressable>
                            <Pressable style={[styles.modalBtn, { backgroundColor: businessProfile.primaryColor }]} onPress={handleSaveInfo}>
                                <Text style={styles.modalBtnText}>Guardar</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    separatorContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 25, paddingHorizontal: 5 },
    separatorLine: { flex: 1, height: 1.5, backgroundColor: '#cbd5e1' },
    separatorText: { marginHorizontal: 15, fontSize: 13, fontWeight: '800', color: '#64748b', letterSpacing: 1.2 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { fontSize: 18, color: '#666' },
    title: { fontSize: 24, fontWeight: '800', margin: 20, marginBottom: 10, color: '#1a1a1a' },
    list: { padding: 20, paddingBottom: 100 },
    orderCard: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    cancelledCard: { opacity: 0.6 },
    orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    orderId: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontWeight: 'bold', overflow: 'hidden' },
    statusPending: { backgroundColor: '#FFF3CD', color: '#856404' },
    statusCancelled: { backgroundColor: '#F8D7DA', color: '#721C24' },
    modifiedNotice: { fontSize: 12, color: '#0369a1', backgroundColor: '#e0f2fe', padding: 8, borderRadius: 8, marginBottom: 10, fontWeight: '600' },
    infoText: { fontSize: 14, color: '#444', marginBottom: 4 },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
    itemsTitle: { fontWeight: '600', marginBottom: 8, color: '#333' },
    itemText: { fontSize: 14, color: '#666', marginBottom: 4 },
    editBtn: { marginTop: 15, backgroundColor: '#f1f1f1', padding: 12, borderRadius: 8, alignItems: 'center' },
    editBtnText: { color: '#1a1a1a', fontWeight: '600' },
    repeatBtn: { marginTop: 15, padding: 12, borderRadius: 8, alignItems: 'center' },
    repeatBtnText: { color: '#ffffff', fontWeight: 'bold' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 350, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 10, textAlign: 'center' },
    modalMessage: { fontSize: 14, color: '#444', marginBottom: 20, textAlign: 'center', lineHeight: 22 },
    modalActions: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
    modalBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, minWidth: 100, alignItems: 'center', flex: 1 },
    modalBtnCancel: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
    modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

    label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 5 },
    input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#e0e0e0', padding: 12, borderRadius: 10, fontSize: 15, color: '#111', marginBottom: 15 },

    tabSelector: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    tabBtn: { flex: 1, paddingVertical: 15, alignItems: 'center' },
    tabText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
});
