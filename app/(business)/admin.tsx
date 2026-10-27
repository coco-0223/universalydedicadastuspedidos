import { router } from 'expo-router';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal, ActivityIndicator } from 'react-native';
import { useAppContext } from '../../src/context/AppContext';
import { Order, OrderStatus } from '../../src/types';
import { saveOrderToFirebase, createBroadcast, deleteOrderFromFirebase } from '../../src/services/businessService';
import { getItemPricing, getOrderPricing } from '../../src/utils/productUtils';
import { FontAwesome } from '@expo/vector-icons';
import { ChatbotOrdersView } from '../../src/components/ChatbotOrdersView';
import { CreateOrderModal } from '../../src/components/CreateOrderModal';
import { EditOrderModal } from '../../src/components/EditOrderModal';
import { IS_DEDICATED_APP } from '../../src/data/mockData';
import { applyDemoOnboarding } from '../../src/services/demoService';

let customAlertCallback: (title: string, message: string, onConfirm?: () => void, confirmText?: string) => void = () => {};

const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
        customAlertCallback(title, message);
    } else {
        Alert.alert(title, message);
    }
};

const showConfirmAlert = (title: string, message: string, onConfirm: () => void, confirmText: string = 'Aceptar') => {
    if (Platform.OS === 'web') {
        customAlertCallback(title, message, onConfirm, confirmText);
    } else {
        Alert.alert(title, message, [
            { text: 'Cancelar', style: 'cancel' },
            { text: confirmText, style: 'destructive', onPress: onConfirm }
        ]);
    }
};

const OrderCard = ({ order, onClientClick, onEditClick }: { order: Order, onClientClick?: (name: string) => void, onEditClick?: (order: Order) => void }) => {
    const { orders, setOrders, settings, businessProfile, offers } = useAppContext();

    const orderPricing = useMemo(() => {
        return getOrderPricing(order, offers, settings?.isFoodBusiness);
    }, [order, offers, settings?.isFoodBusiness]);
    const [isEditing, setIsEditing] = useState(false);

    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [prices, setPrices] = useState<Record<string, string>>({});
    const [customTotalValue, setCustomTotalValue] = useState<string>('');
    const [previewSubtotal, setPreviewSubtotal] = useState(0);
    const [previewDiscount, setPreviewDiscount] = useState(0);
    const [previewDelivery, setPreviewDelivery] = useState(0);
    const [previewTotal, setPreviewTotal] = useState(0);
    const [isCustomTotalActive, setIsCustomTotalActive] = useState(false);

    useEffect(() => {
        if (!isEditing) {
            let initQs: Record<string, string> = {};
            let initPs: Record<string, string> = {};
            order.items.forEach(item => {
                initQs[item.product.id] = (item.actualQuantity ?? item.quantity).toString();
                const p = getItemPricing(item, offers, settings?.isFoodBusiness);
                initPs[item.product.id] = (item.actualPrice ?? item.unitPrice ?? p.unitPrice).toString();
            });
            setQuantities(initQs);
            setPrices(initPs);
            setCustomTotalValue(order.isCustomTotal ? order.totalPrice.toString() : '');
            setPreviewSubtotal(order.subtotal || 0);
            setPreviewDiscount(order.discountApplied || 0);
            setPreviewDelivery(order.deliveryCost || 0);
            setPreviewTotal(order.totalPrice);
            setIsCustomTotalActive(!!order.isCustomTotal);
        }
    }, [isEditing, order]);

    const handleUpdateStatus = (currentStatus: OrderStatus) => {
        const statuses = settings?.orderStatuses || [
            { id: 'pending', label: 'PENDIENTE' },
            { id: 'confirmed', label: 'CONFIRMADO' },
            { id: 'ready', label: 'LISTO' },
            { id: 'delivered', label: 'ENTREGADO' }
        ];
        
        const currentIndex = statuses.findIndex(s => s.id === currentStatus);
        let nextStatus: OrderStatus = currentStatus;
        
        if (currentIndex !== -1 && currentIndex < statuses.length - 1) {
            nextStatus = statuses[currentIndex + 1].id;
        }

        if (nextStatus !== currentStatus) {
            const updatedOrder = { ...order, status: nextStatus };
            saveOrderToFirebase(businessProfile.id, updatedOrder).catch(e => console.error("Could not update status", e));
            setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));
        }
    };

    const handleDeleteOrder = () => {
        showConfirmAlert(
            'Eliminar Pedido',
            '¿Seguro que querés enviar este pedido a la papelera? Se eliminará definitivamente en 30 días.',
            async () => {
                const updatedOrder = {
                    ...order,
                    deleted: true,
                    deletedAt: new Date().toISOString()
                };
                try {
                    await saveOrderToFirebase(businessProfile.id, updatedOrder);
                    setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));
                    showAlert('Éxito', 'Pedido enviado a eliminados.');
                } catch (e) {
                    showAlert('Error', 'No se pudo eliminar el pedido.');
                }
            },
            'Eliminar'
        );
    };

    const handleRestoreOrder = async () => {
        const updatedOrder = {
            ...order,
            deleted: false,
            deletedAt: null
        };
        try {
            await saveOrderToFirebase(businessProfile.id, updatedOrder);
            setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));
            showAlert('Éxito', 'Pedido restaurado.');
        } catch (e) {
            showAlert('Error', 'No se pudo restaurar el pedido.');
        }
    };

    const handlePermanentDelete = () => {
        showConfirmAlert(
            'Eliminar Permanente',
            '¿Seguro que querés eliminar definitivamente este pedido? Esta acción no se puede deshacer.',
            async () => {
                try {
                    await deleteOrderFromFirebase(businessProfile.id, order.id);
                    setOrders(prev => prev.filter(o => o.id !== order.id));
                    showAlert('Éxito', 'Pedido eliminado permanentemente.');
                } catch (e) {
                    showAlert('Error', 'No se pudo eliminar el pedido.');
                }
            },
            'Eliminar Permanente'
        );
    };

    const handleArchiveOrder = async () => {
        const updatedOrder = {
            ...order,
            archived: true,
            archivedAt: new Date().toISOString()
        };
        try {
            await saveOrderToFirebase(businessProfile.id, updatedOrder);
            setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));
            showAlert('Éxito', 'Pedido archivado.');
        } catch (e) {
            showAlert('Error', 'No se pudo archivar el pedido.');
        }
    };

    const handleRestoreArchivedOrder = async () => {
        const updatedOrder = {
            ...order,
            archived: false,
            archivedAt: null
        };
        try {
            await saveOrderToFirebase(businessProfile.id, updatedOrder);
            setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));
            showAlert('Éxito', 'Pedido desarchivado.');
        } catch (e) {
            showAlert('Error', 'No se pudo desarchivar el pedido.');
        }
    };

    const printTicket = () => {
        const text = `=========================
🎟️ CARNICERÍA TICKET
=========================
Pedido: #${order.id}
Cliente: ${order.clientName || 'Invitado'}${order.clientPhone ? `\nTel: ${order.clientPhone}` : ''}${order.clientAddress ? `\nDir: ${order.clientAddress}` : ''}
Metodo: ${order.deliveryMethod.toUpperCase()}
Pago: ${order.paymentMethod || 'A Confirmar'}${order.notes ? `\nNotas:\n${order.notes}` : ''}

PRODUCTOS:
${order.items.map(i => {
            const qty = i.actualQuantity ?? i.quantity;
            const p = getItemPricing(i, offers, settings?.isFoodBusiness);
            const pr = i.actualPrice ?? i.unitPrice ?? p.unitPrice;
            const cashPr = i.cashUnitPrice ?? p.cashUnitPrice;
            const hasCash = cashPr < (pr - 0.001);
            const unit = i.product.unitType === 'unit' ? 'u' : 'kg';
            return `- ${qty}${unit} x ${i.product.name} = $${(qty * pr).toFixed(2)}${hasCash ? ` (Efe: $${(qty * cashPr).toFixed(2)})` : ''}`;
        }).join('\n')}
-------------------------
Subtotal: $${order.subtotal?.toFixed(2) || '?'}
Desc: -$${order.discountApplied?.toFixed(2) || '0'}
Envío: $${order.deliveryCost?.toFixed(2) || '0'}
=========================
TOTAL: $${order.totalPrice.toFixed(2)}${orderPricing.hasCashDiscount ? `\nTOTAL EN EFECTIVO: $${orderPricing.cashTotalPrice.toFixed(2)}` : ''}`;
        if (Platform.OS === 'web') {
            window.alert(text);
        } else {
            Alert.alert('Impresora 80mm', text);
        }
    };

    const calculateAndUpdateOrder = (
        newQuantities: Record<string, string>,
        newPrices: Record<string, string>,
        isCustomTotal: boolean,
        customTotalString: string
    ) => {
        let newSubtotal = 0;
        const newItems = order.items.map(item => {
            const qStr = newQuantities[item.product.id];
            const pStr = newPrices[item.product.id];
            const actQ = qStr ? parseFloat(qStr.replace(',', '.')) : item.quantity;
            const actP = pStr ? parseFloat(pStr.replace(',', '.')) : item.product.price;

            const validQ = isNaN(actQ) ? item.quantity : actQ;
            const validP = isNaN(actP) ? item.product.price : actP;

            newSubtotal += validQ * validP;
            return {
                ...item,
                actualQuantity: validQ,
                actualPrice: validP
            };
        });

        let milestoneDiscount = 0;
        if (settings?.marketingModules?.milestonesActive && settings?.milestoneGroups) {
            let totalGroupDiscounts = 0;

            settings.milestoneGroups.forEach(g => {
                let reachedInG = g.milestones.filter(m => newSubtotal >= m.amountThreshold);
                if (reachedInG.length > 0) {
                    let highest = reachedInG.reduce((prev, curr) => (prev.amountThreshold > curr.amountThreshold) ? prev : curr);
                    let pctValue = highest.discountPercentage ? (newSubtotal * highest.discountPercentage) / 100 : 0;
                    let fixValue = highest.fixedDiscountAmount || 0;
                    totalGroupDiscounts += pctValue + fixValue;
                }
            });
            milestoneDiscount = totalGroupDiscounts;
        }

        let newDeliveryCost = order.deliveryCost || 0;
        if (order.deliveryMethod === 'delivery' && settings?.allowDelivery) {
            if (newSubtotal >= settings?.deliveryRules?.freeDeliveryThreshold) {
                newDeliveryCost = 0;
            } else {
                newDeliveryCost = settings?.deliveryRules?.standardCost;
            }
        }

        let calculatedTotal = newSubtotal - milestoneDiscount + newDeliveryCost;
        let finalTotal = calculatedTotal;

        const ct = parseFloat(customTotalString.replace(',', '.'));
        if (isCustomTotal && !isNaN(ct)) {
            finalTotal = ct;
        }

        setPreviewSubtotal(newSubtotal);
        setPreviewDiscount(milestoneDiscount);
        setPreviewDelivery(newDeliveryCost);
        setPreviewTotal(finalTotal);
        setIsCustomTotalActive(isCustomTotal);
    };

    const handleItemChange = (productId: string, type: 'quantity' | 'price', value: string) => {
        if (order.isCustomTotal) {
            Alert.alert(
                'Aviso',
                'Si modificas el pesaje, el total a pagar volverá a tomar de referencia el precio por kg del ticket actual.',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Continuar',
                        onPress: () => {
                            const nq = type === 'quantity' ? { ...quantities, [productId]: value } : quantities;
                            const np = type === 'price' ? { ...prices, [productId]: value } : prices;
                            if (type === 'quantity') setQuantities(nq);
                            if (type === 'price') setPrices(np);
                            calculateAndUpdateOrder(nq, np, false, '');
                            setCustomTotalValue('');
                        }
                    }
                ]
            );
            return;
        }

        const nq = type === 'quantity' ? { ...quantities, [productId]: value } : quantities;
        const np = type === 'price' ? { ...prices, [productId]: value } : prices;
        if (type === 'quantity') setQuantities(nq);
        if (type === 'price') setPrices(np);
        calculateAndUpdateOrder(nq, np, false, '');
    };

    const handleCustomTotalChange = (val: string) => {
        setCustomTotalValue(val);
        calculateAndUpdateOrder(quantities, prices, true, val);
    };

    const handleDoneEditing = async () => {
        setIsEditing(false);

        const newItems = order.items.map(item => {
            const qStr = quantities[item.product.id];
            const pStr = prices[item.product.id];
            const actQ = qStr ? parseFloat(qStr.replace(',', '.')) : item.quantity;
            const actP = pStr ? parseFloat(pStr.replace(',', '.')) : item.product.price;
            const validQ = isNaN(actQ) ? item.quantity : actQ;
            const validP = isNaN(actP) ? item.product.price : actP;

            const p = getItemPricing({
                ...item,
                actualQuantity: validQ,
                actualPrice: validP
            }, offers, settings?.isFoodBusiness);

            return {
                ...item,
                actualQuantity: validQ,
                actualPrice: validP,
                unitPrice: validP,
                cashUnitPrice: p.cashUnitPrice,
                hasCashDiscount: p.hasCashDiscount
            };
        });

        let sumNormal = 0;
        let sumCash = 0;
        newItems.forEach(i => {
            const q = i.actualQuantity ?? i.quantity;
            sumNormal += (i.actualPrice ?? i.unitPrice ?? i.product.price) * q;
            sumCash += (i.cashUnitPrice ?? i.actualPrice ?? i.unitPrice ?? i.product.price) * q;
        });
        const cashDiff = sumNormal - sumCash;
        const newCashTotal = cashDiff > 0.01 ? Math.max(0, previewTotal - cashDiff) : previewTotal;

        const updatedOrder = {
            ...order,
            items: newItems,
            subtotal: previewSubtotal,
            discountApplied: previewDiscount,
            deliveryCost: previewDelivery,
            totalPrice: previewTotal,
            cashTotalPrice: newCashTotal,
            isCustomTotal: isCustomTotalActive,
            lastModifiedBy: 'business' as const
        };

        try {
            await saveOrderToFirebase(businessProfile.id, updatedOrder);
            setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));

            if (Platform.OS === 'web') {
                window.alert('¡Cambios aplicados y sincronizados!');
            } else {
                Alert.alert('Éxito', 'Cambios aplicados y guardados correctamente.');
            }
        } catch (error) {
            console.error(error);
            if (Platform.OS === 'web') window.alert("Error al actualizar la orden en el servidor.");
        }
    };

    const isActuallyCancelled = settings?.orderStatuses?.find(s => s.id === order.status)?.isCancelled || order.status === 'cancelled';
    const isSuccess = settings?.orderStatuses?.find(s => s.id === order.status)?.isSuccess || order.status === 'delivered';
    const hasBeenModified = order.isCustomTotal || order.items.some(i => i.actualQuantity !== undefined || i.actualPrice !== undefined);
    const clientModifications = order.modificationHistory || [];
    const hasClientModifications = clientModifications.length > 0;
    const dateObj = new Date(order.scheduledTime);
    const dateFormatted = dateObj.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const todayLocal = new Date();
    todayLocal.setHours(0,0,0,0);
    const orderDateLocal = new Date(order.scheduledTime);
    orderDateLocal.setHours(0,0,0,0);
    const isPastDue = orderDateLocal.getTime() < todayLocal.getTime() && !isSuccess && !isActuallyCancelled;

    const currentStatusConfig = settings?.orderStatuses?.find(s => s.id === order.status);
    const statusLabel = currentStatusConfig?.label || (order.status === 'pending' ? 'Pendiente' : order.status.toUpperCase());
    const statusColor = currentStatusConfig?.color || '#64748b';

    const branchName = order.deliveryMethod === 'pickup' && order.branchId 
        ? settings?.branches?.find(b => b.id === order.branchId)?.name || 'Sucursal Desconocida' 
        : null;

    return (
        <View style={[styles.card, { backgroundColor: isSuccess ? `${statusColor}22` : '#fff', borderLeftWidth: 8, borderLeftColor: statusColor }, isActuallyCancelled && styles.cancelledCard]}>
            {hasClientModifications && !isEditing && (
                <View style={[styles.notificationBadge, { backgroundColor: '#fee2e2', borderColor: '#fca5a5', borderWidth: 1 }]}>
                    <Text style={[styles.notificationBadgeText, { color: '#dc2626' }]}>⚠️ Modificado por Cliente</Text>
                </View>
            )}
            {hasBeenModified && !isEditing && !hasClientModifications && (
                <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>✏️ Modificado por Local</Text>
                </View>
            )}
            <View style={styles.cardHeader}>
                <Text style={styles.orderId}>Pedido #{order.id}</Text>
                <Text style={[styles.badge, { backgroundColor: statusColor, color: '#fff' }]}>
                    {statusLabel}
                </Text>
            </View>

            {order.clientName ? (
                <View style={{ marginBottom: 10 }}>
                    <Pressable onPress={() => onClientClick && onClientClick(order.clientName!)}>
                        <Text style={[styles.clientInfo, onClientClick && { color: '#0284c7', textDecorationLine: 'underline' }]}>Cliente: {order.clientName}</Text>
                    </Pressable>
                    {order.clientPhone && <Text style={styles.infoText}>Tel: {order.clientPhone}</Text>}
                    {order.clientAddress && order.deliveryMethod === 'delivery' && <Text style={styles.infoText}>Dir: {order.clientAddress}</Text>}
                </View>
            ) : (
                <Text style={styles.clientInfo}>Cliente ID: {order.clientId}</Text>
            )}
            <Text style={[styles.infoText, { fontWeight: 'bold', color: order.deliveryMethod === 'pickup' ? '#ea580c' : '#0284c7' }]}>
                {order.deliveryMethod === 'pickup' ? `🏪 Retiro en: ${branchName}` : '🚚 Envío a Domicilio'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 8, flexWrap: 'wrap' }}>
                <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                    <Text style={{ color: '#0369a1', fontWeight: '900', fontSize: 16 }}>📅 {dateFormatted}</Text>
                </View>
                <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                    <Text style={{ color: '#b45309', fontWeight: '900', fontSize: 16 }}>⏰ {timeFormatted}</Text>
                </View>
                {order.status === 'cancelled' && (
                    <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                        <Text style={{ color: '#dc2626', fontWeight: '900', fontSize: 16 }}>Cancelado</Text>
                    </View>
                )}
            </View>
            {order.paymentMethod && <Text style={styles.infoText}>Medio de Pago: <Text style={{ fontWeight: 'bold' }}>{order.paymentMethod}</Text></Text>}
            {order.notes && (
                <View style={{ marginTop: 8, padding: 8, backgroundColor: '#fef3c7', borderRadius: 6, borderWidth: 1, borderColor: '#fde68a' }}>
                    <Text style={{ fontSize: 13, color: '#92400e', fontWeight: 'bold' }}>Indicaciones:</Text>
                    <Text style={{ fontSize: 13, color: '#92400e', marginTop: 2 }}>{order.notes}</Text>
                </View>
            )}

            <View style={styles.itemsList}>
                {order.items.map((cartItem: any) => {
                    const qVal = quantities[cartItem.product.id] ?? '';
                    const pVal = prices[cartItem.product.id] ?? '';
                    const pricing = getItemPricing(cartItem, offers, settings?.isFoodBusiness);
                    const unit = cartItem.product.unitType === 'unit' ? 'u' : 'kg';
                    const unitSuffix = cartItem.product.unitType === 'unit' ? ' c/u' : '/kg';
                    const normalUnitPrice = cartItem.actualPrice ?? cartItem.unitPrice ?? pricing.unitPrice;
                    const cashUnitPrice = cartItem.cashUnitPrice ?? pricing.cashUnitPrice;
                    const hasCashDiscount = cashUnitPrice < (normalUnitPrice - 0.001);

                    return (
                        <View key={cartItem.product.id} style={styles.itemRow}>
                            {isEditing ? (
                                <View style={styles.editRow}>
                                    <TextInput
                                        style={styles.weightInput}
                                        value={qVal}
                                        onChangeText={(val) => handleItemChange(cartItem.product.id, 'quantity', val)}
                                        keyboardType="numeric"
                                    />
                                    <Text style={styles.editRowText}>{unit} x </Text>
                                    <TextInput
                                        style={styles.priceInput}
                                        value={pVal}
                                        onChangeText={(val) => handleItemChange(cartItem.product.id, 'price', val)}
                                        keyboardType="numeric"
                                    />
                                    <Text style={styles.editRowText}>${unitSuffix} - {cartItem.product.name}</Text>
                                </View>
                            ) : (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Text style={styles.itemRowText}>
                                        {cartItem.actualQuantity ? `✏️ ${cartItem.actualQuantity}${unit}` : `${cartItem.quantity}${unit}`} x ${normalUnitPrice}${unitSuffix} - {cartItem.product.name}{' '}
                                    </Text>
                                    {hasCashDiscount && (
                                        <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#16a34a' }}>
                                            (💵 Efectivo: ${cashUnitPrice}${unitSuffix})
                                        </Text>
                                    )}
                                </View>
                            )}
                        </View>
                    );
                })}
            </View>

            {isEditing ? (
                <View style={styles.customTotalContainer}>
                    <Text style={styles.totalText}>Total a pagar: ${previewTotal.toFixed(2)}</Text>
                    <TextInput
                        style={styles.customTotalInput}
                        value={customTotalValue}
                        onChangeText={handleCustomTotalChange}
                        keyboardType="numeric"
                        placeholder="Sobrescribir"
                    />
                </View>
            ) : (
                <View style={{ marginTop: 8, alignItems: 'flex-end', gap: 4 }}>
                    {orderPricing.hasCashDiscount ? (
                        <>
                            <Text style={[styles.totalText, { fontSize: 15, color: '#64748b' }]}>
                                {order.isCustomTotal ? '✏️ ' : ''}Total Otros Medios: ${order.totalPrice.toFixed(2)}
                            </Text>
                            <Text style={[styles.totalText, { color: '#16a34a', fontWeight: '900', fontSize: 20 }]}>
                                Total en Efectivo: ${orderPricing.cashTotalPrice.toFixed(2)}
                            </Text>
                        </>
                    ) : (
                        <Text style={styles.totalText}>
                            {order.isCustomTotal ? `✏️ Total: $${order.totalPrice.toFixed(2)}` : `Total: $${order.totalPrice.toFixed(2)}`}
                        </Text>
                    )}
                </View>
            )}

            <View style={styles.hr} />

            <View style={styles.statusSelectors}>
                <Text style={styles.statusLabel}>Cambiar Estado:</Text>
                <View style={styles.statusBtnRow}>
                    {(settings.orderStatuses || [
                        { id: 'pending', label: 'PENDIENTE', color: '#64748b' },
                        { id: 'confirmed', label: 'CONFIRMADO', color: '#f59e0b' },
                        { id: 'ready', label: 'LISTO', color: '#3b82f6' },
                        { id: 'delivered', label: 'ENTREGADO', color: '#10b981' },
                        { id: 'cancelled', label: 'CANCELADO', color: '#ef4444' }
                    ]).map(s => (
                        <Pressable
                            key={s.id}
                            style={[styles.statusPill, order.status === s.id && { backgroundColor: s.color, borderColor: 'transparent' }]}
                            onPress={() => {
                                const updatedOrder = { ...order, status: s.id };
                                saveOrderToFirebase(businessProfile.id, updatedOrder).catch(e => console.error(e));
                                setOrders(prev => prev.map(o => o.id === order.id ? updatedOrder : o));
                            }}
                        >
                            <Text style={[styles.statusPillText, order.status === s.id && { color: '#fff' }]}>{s.label}</Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            {clientModifications.length > 0 && (
                <View style={{ marginTop: 15, padding: 12, backgroundColor: '#fef2f2', borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5' }}>
                    <Text style={{ fontSize: 13, color: '#991b1b', fontWeight: 'bold', marginBottom: 5 }}>Historial de Modificaciones (Cliente):</Text>
                    {clientModifications.map((mod: any, idx: number) => {
                        const mDate = new Date(mod.timestamp);
                        const mStr = `${mDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} ${mDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                        return (
                            <Text key={idx} style={{ fontSize: 12, color: '#7f1d1d', marginTop: 3 }}>
                                • [{mStr}] {mod.description}
                            </Text>
                        );
                    })}
                </View>
            )}

            {order.deleted ? (
                <View style={styles.actionRow}>
                    <Pressable style={[styles.editBtn, { flex: 1, backgroundColor: '#dcfce7', borderColor: '#22c55e', borderWidth: 1 }]} onPress={handleRestoreOrder}>
                        <Text style={[styles.editBtnText, { color: '#15803d' }]}>♻️ Restaurar Pedido</Text>
                    </Pressable>
                    <Pressable style={[styles.editBtn, { flex: 1, backgroundColor: '#fee2e2', borderColor: '#ef4444', borderWidth: 1 }]} onPress={handlePermanentDelete}>
                        <Text style={[styles.editBtnText, { color: '#b91c1c' }]}>💀 Eliminar Permanente</Text>
                    </Pressable>
                </View>
            ) : order.archived ? (
                <View style={styles.actionRow}>
                    <Pressable style={[styles.editBtn, { flex: 1, backgroundColor: '#e0f2fe', borderColor: '#0284c7', borderWidth: 1 }]} onPress={handleRestoreArchivedOrder}>
                        <Text style={[styles.editBtnText, { color: '#0369a1' }]}>♻️ Desarchivar</Text>
                    </Pressable>
                    <Pressable style={[styles.printBtn, { flex: 1 }]} onPress={printTicket}>
                        <Text style={styles.printBtnText}>🖨️ Ticket</Text>
                    </Pressable>
                    <Pressable style={[styles.printBtn, { backgroundColor: '#fee2e2', borderColor: '#ef4444', borderWidth: 1, flex: 1 }]} onPress={handleDeleteOrder}>
                        <Text style={[styles.printBtnText, { color: '#b91c1c' }]}>🗑️ Eliminar</Text>
                    </Pressable>
                </View>
            ) : (
                <View style={styles.actionRow}>
                    {!isActuallyCancelled && order.status !== 'delivered' && !isEditing && (
                        <Pressable 
                            style={[styles.editBtn, { flex: 2 }]} 
                            onPress={() => {
                                if (onEditClick) {
                                    onEditClick(order);
                                } else {
                                    setIsEditing(true);
                                }
                            }}
                        >
                            <Text style={styles.editBtnText}>⚖️ Editar</Text>
                        </Pressable>
                    )}
                    {isEditing && (
                        <>
                            <Pressable style={[styles.doneBtn, { flex: 2 }]} onPress={handleDoneEditing}>
                                <Text style={styles.doneBtnText}>✔ Aceptar</Text>
                            </Pressable>
                            <Pressable style={[styles.editBtn, { flex: 1, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' }]} onPress={() => setIsEditing(false)}>
                                <Text style={[styles.editBtnText, { color: '#475569' }]}>❌ Cancelar</Text>
                            </Pressable>
                        </>
                    )}
                    {!isEditing && (
                        <>
                            <Pressable style={[styles.printBtn, { flex: 1 }]} onPress={printTicket}>
                                <Text style={styles.printBtnText}>🖨️ Ticket</Text>
                            </Pressable>
                            <Pressable style={[styles.printBtn, { backgroundColor: '#f0fdf4', borderColor: '#22c55e', borderWidth: 1, flex: 1 }]} onPress={handleArchiveOrder}>
                                <Text style={[styles.printBtnText, { color: '#16a34a' }]}>📦 Archivar</Text>
                            </Pressable>
                            <Pressable style={[styles.printBtn, { backgroundColor: '#fee2e2', borderColor: '#ef4444', borderWidth: 1, flex: 1 }]} onPress={handleDeleteOrder}>
                                <Text style={[styles.printBtnText, { color: '#b91c1c' }]}>🗑️ Eliminar</Text>
                            </Pressable>
                        </>
                    )}
                </View>
            )}
        </View>
    );
};

export default function BusinessDashboardScreen() {
    const { orders, setOrders, businessProfile, settings, isLoadingOrders, isSyncingFuture, isSyncingPast, syncFutureOrders, syncPastOrders, loadBusinessById } = useAppContext();
    const [viewMode, setViewMode] = useState<'kanban' | 'trends' | 'chatbot'>('kanban');
    const [timeFilter, setTimeFilter] = useState<'all' | 'archived_pending' | 'archived_completed' | 'archived_and_deleted' | 'ready_today' | number>('all');
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [onboardingStep, setOnboardingStep] = useState(1);
    const [onboardingData, setOnboardingData] = useState<{
        businessName: string;
        rubro: string;
        ventas: string[];
        address: string;
        primaryColor: string;
        pagos: string;
        envios: string;
    }>({
        businessName: '',
        rubro: 'carniceria',
        ventas: ['kg'],
        address: '',
        primaryColor: '#0f172a',
        pagos: 'efectivo',
        envios: 'no'
    });
    const [isOnboardingSubmitting, setIsOnboardingSubmitting] = useState(false);

    useEffect(() => {
        if (businessProfile && businessProfile.status === 'trial' && !(businessProfile as any).onboardingCompleted) {
            setShowOnboarding(true);
            setOnboardingData(prev => ({
                ...prev,
                businessName: businessProfile.name || prev.businessName,
                primaryColor: businessProfile.primaryColor || prev.primaryColor,
                address: (businessProfile as any).address || prev.address
            }));
        }
    }, [businessProfile]);
    const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
    const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
    const [isBroadcastModalVisible, setIsBroadcastModalVisible] = useState(false);
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);
    const [newOrderPopup, setNewOrderPopup] = useState<{ visible: boolean, count: number }>({ visible: false, count: 0 });
    const [showWelcomeModal, setShowWelcomeModal] = useState(businessProfile?.status === 'trial');
    const [showLinkAccountModal, setShowLinkAccountModal] = useState(false);
    const [showChatbotUpsell, setShowChatbotUpsell] = useState(false);
    const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [chatbotForm, setChatbotForm] = useState({ name: '', phone: '' });
    const [isSubmittingChatbot, setIsSubmittingChatbot] = useState(false);

    const [customAlert, setCustomAlert] = useState<{ visible: boolean, title: string, message: string, onConfirm?: () => void, confirmText?: string }>({ visible: false, title: '', message: '' });

    useEffect(() => {
        customAlertCallback = (title, message, onConfirm, confirmText) => {
            setCustomAlert({ visible: true, title, message, onConfirm, confirmText });
        };
    }, []);
    
    if (!businessProfile || !businessProfile.id) {
        return (
            <View style={styles.container}>
                <Text style={{ padding: 20 }}>Cargando perfil...</Text>
            </View>
        );
    }

    const myOrders = useMemo(() => orders.filter(o => !o.businessId || o.businessId === businessProfile.id), [orders, businessProfile.id]);
    const prevOrdersCountRef = useRef(myOrders.length);
    const isInitialLoadRef = useRef(true);

    useEffect(() => {
        // En la primera carga o mientras aún se descargan pedidos iniciales, no disparar el popup molesto
        if (isInitialLoadRef.current) {
            if (!isLoadingOrders && myOrders.length > 0) {
                isInitialLoadRef.current = false;
                prevOrdersCountRef.current = myOrders.length;
            }
            return;
        }

        if (myOrders.length > prevOrdersCountRef.current) {
            const news = myOrders.length - prevOrdersCountRef.current;
            setNewOrderPopup({ visible: true, count: news });
        }
        prevOrdersCountRef.current = myOrders.length;
    }, [myOrders.length, isLoadingOrders]);

    useEffect(() => {
        if (timeFilter === 'all' || timeFilter === 0 || (typeof timeFilter === 'number' && timeFilter >= 1)) {
            syncFutureOrders();
        } else if (timeFilter === 'archived_pending' || timeFilter === 'archived_completed' || timeFilter === 'archived_and_deleted') {
            syncPastOrders();
        }
    }, [timeFilter]);

    const startOfToday = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const getDayOffset = (dateString: string) => {
        const d = new Date(dateString);
        d.setHours(0, 0, 0, 0);
        return Math.floor((d.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
    };

    const renderEmptyList = () => {
        if (isLoadingOrders || isSyncingFuture || isSyncingPast) {
            return (
                <View style={{ padding: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={businessProfile.primaryColor || '#FF3B30'} />
                    <Text style={{ marginTop: 10, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
                        Buscando pedidos...
                    </Text>
                </View>
            );
        }
        return (
            <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: '#64748b', fontStyle: 'italic', fontSize: 13, textAlign: 'center' }}>
                    No hay pedidos en esta columna
                </Text>
            </View>
        );
    };

    const pendingArchivedCount = useMemo(() => myOrders.filter(o => {
        const isTerm = settings.orderStatuses?.find(s => s.id === o.status)?.isSuccess || settings.orderStatuses?.find(s => s.id === o.status)?.isCancelled || o.status === 'delivered' || o.status === 'cancelled';
        return getDayOffset(o.scheduledTime) < 0 && !isTerm && !o.deleted && !o.archived;
    }).length, [myOrders, startOfToday, settings.orderStatuses]);

    const displayOrders = useMemo(() => {
        // Exclude deleted and manually archived orders from normal views
        let baseOrders = myOrders.filter(o => !o.deleted && !o.archived);

        let list = baseOrders;
        if (timeFilter === 'all') {
            list = baseOrders.filter(o => getDayOffset(o.scheduledTime) >= 0);
        } else if (timeFilter === 'archived_pending') {
            list = baseOrders.filter(o => {
                const isTerm = settings.orderStatuses?.find(s => s.id === o.status)?.isSuccess || settings.orderStatuses?.find(s => s.id === o.status)?.isCancelled || o.status === 'delivered' || o.status === 'cancelled';
                return getDayOffset(o.scheduledTime) < 0 && !isTerm;
            });
        } else if (timeFilter === 'archived_completed') {
            list = baseOrders.filter(o => {
                const isTerm = settings.orderStatuses?.find(s => s.id === o.status)?.isSuccess || settings.orderStatuses?.find(s => s.id === o.status)?.isCancelled || o.status === 'delivered' || o.status === 'cancelled';
                return isTerm && getDayOffset(o.scheduledTime) < 0;
            });
        } else if (timeFilter === 'ready_today') {
            list = baseOrders.filter(o => {
                const statusCfg = settings.orderStatuses?.find(s => s.id === o.status);
                if (statusCfg?.isReady) return true; // Strictly obey the toggle
                
                const lbl = statusCfg?.label?.toUpperCase() || '';
                const isReadyStatus = o.status === 'ready' || (lbl.includes('LISTO') && !statusCfg?.isSuccess);
                const isTerm = statusCfg?.isSuccess || statusCfg?.isCancelled || o.status === 'delivered' || o.status === 'cancelled';
                return isReadyStatus && !isTerm;
            });
        } else {
            list = baseOrders.filter(o => getDayOffset(o.scheduledTime) === timeFilter);
        }
        return list.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
    }, [myOrders, timeFilter, startOfToday, settings.orderStatuses]);
    
    const pickups = timeFilter === 'archived_and_deleted'
        ? myOrders.filter(o => o.archived && !o.deleted)
        : displayOrders.filter(o => o.deliveryMethod === 'pickup');

    const deliveries = timeFilter === 'archived_and_deleted'
        ? myOrders.filter(o => o.deleted)
        : displayOrders.filter(o => o.deliveryMethod === 'delivery');

    const getNextTimeStr = (arr: Order[]) => {
        const next = arr.find(o => {
            const isTerm = settings.orderStatuses?.find(s => s.id === o.status)?.isSuccess || settings.orderStatuses?.find(s => s.id === o.status)?.isCancelled || o.status === 'delivered' || o.status === 'cancelled';
            return !isTerm;
        });
        if (!next) return { text: 'No hay pendientes', id: null };
        
        const now = new Date();
        const target = new Date(next.scheduledTime);
        const diffMs = target.getTime() - now.getTime();
        const timeStr = target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        let locationInfo = '';
        if (next.deliveryMethod === 'pickup' && next.branchId) {
            const b = settings?.branches?.find(br => br.id === next.branchId);
            if (b) locationInfo = ` [${b.name}]`;
        }

        if (diffMs <= 0) return { text: `Atrasado / AHORA (${timeStr})${locationInfo}`, id: next.id };
        const diffMins = Math.floor(diffMs / 60000);
        const hrs = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        
        if (hrs > 0) return { text: `en ${hrs}h ${mins}m (${timeStr})${locationInfo}`, id: next.id };
        return { text: `en ${mins} min (${timeStr})${locationInfo}`, id: next.id };
    };

    if (viewMode === 'chatbot') {
        return (
            <View style={{ flex: 1, backgroundColor: '#f4f5f7' }}>
            {businessProfile?.status === 'trial' && (
                <Pressable onPress={() => setShowLinkAccountModal(true)} style={{ backgroundColor: '#fef3c7', padding: 15, marginHorizontal: 20, marginTop: 20, borderRadius: 10, borderWidth: 1, borderColor: '#f59e0b', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 20 }}>⚠️</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: '#b45309', fontWeight: 'bold' }}>Tu tienda está en modo Prueba (7 días)</Text>
                        <Text style={{ color: '#b45309', fontSize: 13 }}>Hacé clic acá para asociar tu email y guardar tu progreso.</Text>
                    </View>
                </Pressable>
            )}

                <View style={[styles.headerArea, { marginHorizontal: 20, marginTop: 20 }]}>
                    <Pressable style={styles.trendsBtn} onPress={() => setViewMode('kanban')}>
                        <Text style={styles.trendsBtnText}>🔙 Volver al Kanban</Text>
                    </Pressable>
                </View>
                <ChatbotOrdersView />
            </View>
        );
    }

    if (viewMode === 'trends') {
        const validOrders = myOrders.filter(o => settings.orderStatuses?.find(s => s.id === o.status)?.isSuccess || o.status === 'delivered');
        const totalRevenue = validOrders.reduce((acc, o) => acc + o.totalPrice, 0);
        const prStats: any = {};
        const clStats: any = {};
        const hrStats: any = {};
        const dayStats: any = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };

        validOrders.forEach(o => {
            const dateObj = new Date(o.scheduledTime);
            const hr = dateObj.getHours();
            const day = dateObj.getDay();
            hrStats[hr] = (hrStats[hr] || 0) + 1;
            dayStats[day]++;
            const cName = o.clientName || 'Invitado';
            if (!clStats[cName]) clStats[cName] = { count: 0, spent: 0, phone: o.clientPhone || '' };
            clStats[cName].count++;
            clStats[cName].spent += o.totalPrice;
            o.items.forEach(i => {
                const q = i.actualQuantity ?? i.quantity;
                const p = i.actualPrice ?? i.product.price;
                if (!prStats[i.product.name]) prStats[i.product.name] = { kg: 0, rev: 0 };
                prStats[i.product.name].kg += q;
                prStats[i.product.name].rev += (q * p);
            });
        });

        const topProducts = Object.entries(prStats).map(([n, v]) => ({ name: n, ...(v as any) })).sort((a,b) => b.kg - a.kg).slice(0, 5);
        const topClients = Object.entries(clStats).map(([n, v]) => ({ name: n, ...(v as any) })).sort((a,b) => b.spent - a.spent).slice(0, 5);
        const sortedHours = Object.entries(hrStats).sort((a, b) => (b[1] as any) - (a[1] as any));
        const bestHour = sortedHours.length > 0 ? `${sortedHours[0][0]}:00hs - ${Number(sortedHours[0][0])+1}:00hs` : 'N/A';

        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const sortedDays = Object.entries(dayStats).sort((a, b) => (b[1] as any) - (a[1] as any));
        const bestDay = (sortedDays[0][1] as any) > 0 ? dayNames[Number(sortedDays[0][0])] : 'N/A';
        const worstDayItem = sortedDays.find(d => (d[1] as any) === 0) || sortedDays[6];
        const worstDay = validOrders.length > 0 ? dayNames[Number(worstDayItem[0])] : 'N/A';

        return (
            <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
                <View style={[styles.headerArea, { marginHorizontal: 0, marginTop: 20 }]}>
                    <View>
                        <Text style={styles.title}>Panel de Analíticas</Text>
                        <Text style={styles.subtitle}>Información clave basada en todo el historial.</Text>
                    </View>
                    <Pressable style={styles.trendsBtn} onPress={() => setViewMode('kanban')}>
                        <Text style={styles.trendsBtnText}>🔙 Volver al Kanban</Text>
                    </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 15, marginBottom: 20, flexWrap: 'wrap' }}>
                    <View style={[styles.nextBox, { backgroundColor: '#fff', borderColor: '#e2e8f0' }]}>
                        <Text style={styles.statLabel}>Ventas Totales</Text>
                        <Text style={[styles.nextBoxValue, { color: '#047857' }]}>${totalRevenue.toFixed(2)}</Text>
                    </View>
                    <View style={[styles.nextBox, { backgroundColor: '#fff', borderColor: '#e2e8f0' }]}>
                        <Text style={styles.statLabel}>Pedidos Históricos</Text>
                        <Text style={styles.nextBoxValue}>{validOrders.length}</Text>
                    </View>
                    <View style={[styles.nextBox, { backgroundColor: '#fff', borderColor: '#e2e8f0' }]}>
                        <Text style={styles.statLabel}>Franja Pico</Text>
                        <Text style={styles.nextBoxValue}>{bestHour}</Text>
                    </View>
                    <View style={[styles.nextBox, { backgroundColor: '#fff', borderColor: '#e2e8f0' }]}>
                        <Text style={styles.statLabel}>Mejor Día</Text>
                        <Text style={[styles.nextBoxValue, { color: '#047857' }]}>{bestDay}</Text>
                    </View>
                    <View style={[styles.nextBox, { backgroundColor: '#fff', borderColor: '#e2e8f0' }]}>
                        <Text style={styles.statLabel}>Día más flojo</Text>
                        <Text style={[styles.nextBoxValue, { color: '#dc2626' }]}>{worstDay}</Text>
                    </View>
                </View>
                <View style={styles.card}>
                    <Text style={[styles.colTitle, { color: '#111', marginBottom: 15 }]}>🥩 Top Productos (Venta por Volumen)</Text>
                    {topProducts.map((p, i) => (
                        <View key={p.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                            <Text style={{ fontWeight: '600' }}>{i+1}. {p.name}</Text>
                            <Text style={{ color: '#444' }}>{p.kg}kg (Ingreso: ${p.rev.toFixed(0)})</Text>
                        </View>
                    ))}
                </View>
                <View style={styles.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                        <Text style={[styles.colTitle, { color: '#111' }]}>🥇 Mejores Clientes (Por Gasto)</Text>
                    </View>
                    {topClients.map((c, i) => (
                        <View key={c.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                            <View>
                                <Text style={{ fontWeight: '600' }}>#{i+1} {c.name}</Text>
                                {c.phone && <Text style={{ fontSize: 12, color: '#666' }}>Tel: {c.phone}</Text>}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontWeight: 'bold', color: '#16a34a' }}>Gasto: ${c.spent.toFixed(2)}</Text>
                                <Text style={{ fontSize: 13, color: '#444' }}>{c.count} {c.count===1?'pedido':'pedidos'}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
        );
    }

    return (
        <View style={styles.container}>
            {businessProfile?.status === 'trial' && (
                <View style={{ backgroundColor: '#fffbeb', borderBottomWidth: 1, borderBottomColor: '#fde68a', paddingVertical: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 260 }}>
                        <FontAwesome name="lock" size={16} color="#d97706" />
                        <Text style={{ color: '#92400e', fontSize: 13 }}>
                            <Text style={{ fontWeight: 'bold' }}>Tarifa congelada a ${(businessProfile.planPrice || 9000).toLocaleString()}/mes</Text> durante tus 7 días de prueba. ¡Asegurá tu cupo antes de que venza!
                        </Text>
                    </View>
                    <Pressable 
                        style={{ backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        onPress={() => {
                            const wspMsg = encodeURIComponent(`Hola! Quiero asegurar mi tarifa congelada de $${(businessProfile.planPrice || 9000).toLocaleString()}/mes para mi negocio ${businessProfile.name || ''} (ID: ${businessProfile.id}).`);
                            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                window.open(`https://wa.me/5493512345678?text=${wspMsg}`, '_blank');
                            }
                        }}
                    >
                        <FontAwesome name="whatsapp" size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Asegurar mi Precio</Text>
                    </Pressable>
                </View>
            )}
            <View style={styles.headerArea}>
                <View>
                    <Text style={styles.title}>Panel de Preparación</Text>
                    <Text style={styles.subtitle}>
                        <Text style={{fontWeight: 'bold', color: '#111'}}>{displayOrders.length}</Text> pedidos ({pickups.length} Retiro / {deliveries.length} Envío)
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <Pressable 
                        style={[styles.trendsBtn, { backgroundColor: '#ea580c' }]} 
                        onPress={() => setShowCreateOrderModal(true)}
                    >
                        <Text style={[styles.trendsBtnText, { color: '#fff' }]}>➕ Crear Pedido</Text>
                    </Pressable>
                    <Pressable style={[styles.trendsBtn, { backgroundColor: '#10b981' }]} onPress={() => {
                        if (!IS_DEDICATED_APP) {
                            setShowChatbotUpsell(true);
                        } else {
                            setViewMode('chatbot');
                        }
                    }}>
                        <Text style={[styles.trendsBtnText, { color: '#fff' }]}>🤖 Pedidos Chatbot</Text>
                    </Pressable>
                    <Pressable style={styles.trendsBtn} onPress={() => setViewMode('trends')}>
                        <Text style={styles.trendsBtnText}>📊 Tendencias</Text>
                    </Pressable>
                </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <Pressable 
                    style={({ pressed }) => [
                        { 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            backgroundColor: isSyncingFuture ? '#fed7aa' : '#ffedd5', 
                            paddingHorizontal: 12, 
                            paddingVertical: 8, 
                            borderRadius: 8, 
                            borderWidth: 1, 
                            borderColor: '#fdb574' 
                        },
                        pressed && { opacity: 0.7 }
                    ]}
                    onPress={syncFutureOrders}
                    disabled={isSyncingFuture}
                >
                    {isSyncingFuture ? (
                        <ActivityIndicator size="small" color="#ea580c" style={{ marginRight: 6 }} />
                    ) : (
                        <FontAwesome name="refresh" size={12} color="#ea580c" style={{ marginRight: 6 }} />
                    )}
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#ea580c' }}>
                        {isSyncingFuture ? 'Verificando cambios...' : 'Sincronizar Agenda Futura'}
                    </Text>
                </Pressable>

                {isSyncingPast && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5' }}>
                        <ActivityIndicator size="small" color="#dc2626" style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 12, color: '#dc2626', fontWeight: 'bold' }}>Buscando atrasados...</Text>
                    </View>
                )}
                
                {isLoadingOrders && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                        <ActivityIndicator size="small" color="#64748b" style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500' }}>Cargando tiempo real...</Text>
                    </View>
                )}
            </View>

            <View style={styles.nextUpRow}>
                <Pressable style={[styles.nextBox, { backgroundColor: '#fff7ed', borderColor: '#fdba74' }]} onPress={() => { const nx = getNextTimeStr(pickups); if(nx.id) setFocusedOrderId(nx.id); }}>
                    <Text style={[styles.nextBoxTitle, { color: '#c2410c' }]}>🏪 Próximo Retiro</Text>
                    <Text style={styles.nextBoxValue}>{getNextTimeStr(pickups).text}</Text>
                </Pressable>
                <Pressable style={[styles.nextBox, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]} onPress={() => { const nx = getNextTimeStr(deliveries); if(nx.id) setFocusedOrderId(nx.id); }}>
                    <Text style={[styles.nextBoxTitle, { color: '#0369a1' }]}>🚚 Próximo Envío</Text>
                    <Text style={styles.nextBoxValue}>{getNextTimeStr(deliveries).text}</Text>
                </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterScrollContent}>
                <Pressable style={[styles.filterBtn, timeFilter === 'all' && styles.filterBtnActive]} onPress={() => setTimeFilter('all')}>
                    <Text style={[styles.filterBtnText, timeFilter === 'all' && styles.filterBtnTextActive]}>Todos</Text>
                </Pressable>
                <Pressable style={[styles.filterBtn, timeFilter === 'ready_today' && styles.filterBtnActive]} onPress={() => setTimeFilter('ready_today')}>
                    <Text style={[styles.filterBtnText, timeFilter === 'ready_today' && styles.filterBtnTextActive]}>🟢 Listos</Text>
                </Pressable>
                <Pressable style={[styles.filterBtn, timeFilter === 'archived_pending' && styles.filterBtnActive]} onPress={() => setTimeFilter('archived_pending')}>
                    {pendingArchivedCount > 0 && <View style={styles.archivedBadge}><Text style={styles.archivedBadgeText}>{pendingArchivedCount}</Text></View>}
                    <Text style={[styles.filterBtnText, timeFilter === 'archived_pending' && styles.filterBtnTextActive]}>⚠️ Atrasados</Text>
                </Pressable>
                <Pressable style={[styles.filterBtn, timeFilter === 'archived_and_deleted' && styles.filterBtnActive]} onPress={() => setTimeFilter('archived_and_deleted')}>
                    <Text style={[styles.filterBtnText, timeFilter === 'archived_and_deleted' && styles.filterBtnTextActive]}>📦 Archivados y Eliminados</Text>
                </Pressable>
                {[0, 1, 2, 3, 4, 5, 6].map(offset => {
                    const d = new Date(startOfToday);
                    d.setDate(d.getDate() + offset);
                    const diaStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                    const dayList = myOrders.filter(o => getDayOffset(o.scheduledTime) === offset);
                    const p = dayList.filter(o => o.deliveryMethod === 'pickup').length;
                    const e = dayList.filter(o => o.deliveryMethod === 'delivery').length;
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
                    <View style={[styles.colHeader, { backgroundColor: timeFilter === 'archived_and_deleted' ? '#4b5563' : '#ea580c' }]}>
                        <Text style={styles.colTitle}>
                            {timeFilter === 'archived_and_deleted' ? '📦 Archivados' : '🏪 Retiros'}
                        </Text>
                    </View>
                    <FlatList data={pickups} keyExtractor={item => item.id} renderItem={({ item }) => <OrderCard order={item} onClientClick={setSelectedClientName} onEditClick={(ord) => setEditingOrder(ord)} />} ListEmptyComponent={renderEmptyList} contentContainerStyle={styles.list} />
                </View>
                <View style={styles.kanbanColumn}>
                    <View style={[styles.colHeader, { backgroundColor: timeFilter === 'archived_and_deleted' ? '#ef4444' : '#0284c7' }]}>
                        <Text style={styles.colTitle}>
                            {timeFilter === 'archived_and_deleted' ? '🗑️ Eliminados' : '🚚 Envíos'}
                        </Text>
                    </View>
                    <FlatList data={deliveries} keyExtractor={item => item.id} renderItem={({ item }) => <OrderCard order={item} onClientClick={setSelectedClientName} onEditClick={(ord) => setEditingOrder(ord)} />} ListEmptyComponent={renderEmptyList} contentContainerStyle={styles.list} />
                </View>
            </View>

            {focusedOrderId && (
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: '#f1f5f9', padding: 10, maxHeight: '90%' }]}>
                        <Pressable style={{ alignItems: 'flex-end', marginBottom: 5, padding: 5 }} onPress={() => setFocusedOrderId(null)}><Text style={{ fontSize: 18, fontWeight: 'bold' }}>Cerrar ❌</Text></Pressable>
                        <ScrollView><OrderCard order={myOrders.find(o => o.id === focusedOrderId)!} onClientClick={(name) => { setFocusedOrderId(null); setSelectedClientName(name); }} onEditClick={(ord) => { setFocusedOrderId(null); setEditingOrder(ord); }} /></ScrollView>
                    </View>
                </View>
            )}

            {selectedClientName && (() => {
                const clientOrders = myOrders.filter(o => o.clientName === selectedClientName && o.status === 'delivered');
                const totalSpent = clientOrders.reduce((acc, o) => acc + o.totalPrice, 0);
                return (
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalBox, { maxWidth: 400 }]}>
                            <Text style={styles.modalTitle}>👤 Perfil: {selectedClientName}</Text>
                            <Text style={styles.statLabel}>LTV: <Text style={{ color: '#16a34a' }}>${totalSpent.toFixed(2)}</Text></Text>
                            <Pressable style={styles.cancelBtn} onPress={() => setSelectedClientName(null)}><Text style={styles.cancelBtnText}>Cerrar</Text></Pressable>
                        </View>
                    </View>
                );
            })()}

            <Modal visible={isBroadcastModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { maxWidth: 450 }]}>
                        <Text style={styles.modalTitle}>📢 Notificación Masiva</Text>
                        <TextInput style={styles.input_broadcast} placeholder="Título" value={broadcastTitle} onChangeText={setBroadcastTitle} />
                        <TextInput style={[styles.input_broadcast, { height: 100 }]} placeholder="Mensaje" multiline value={broadcastMessage} onChangeText={setBroadcastMessage} />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Pressable style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setIsBroadcastModalVisible(false)}><Text style={styles.cancelBtnText}>Cancelar</Text></Pressable>
                            <Pressable style={[styles.actionBtn, { flex: 1, backgroundColor: '#ea580c' }]} onPress={async () => {
                                setSendingBroadcast(true);
                                try {
                                    await createBroadcast(businessProfile.id, broadcastTitle, broadcastMessage);
                                    setIsBroadcastModalVisible(false);
                                } catch (e) { Alert.alert('Error', 'Fallo al enviar.'); }
                                finally { setSendingBroadcast(false); }
                            }}><Text style={styles.actionBtnText}>🚀 Enviar</Text></Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={newOrderPopup.visible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { borderTopWidth: 10, borderTopColor: '#ea580c' }]}>
                        <Text style={styles.modalTitle}>¡NUEVO PEDIDO!</Text>
                        <Text style={{ textAlign: 'center', marginBottom: 20 }}>Tienes {newOrderPopup.count} nuevo(s) pedido(s).</Text>
                        <Pressable style={[styles.actionBtn, { backgroundColor: '#ea580c' }]} onPress={() => setNewOrderPopup({ visible: false, count: 0 })}><Text style={styles.actionBtnText}>Revisar</Text></Pressable>
                    </View>
                </View>
            </Modal>

            <CreateOrderModal
                visible={showCreateOrderModal}
                onClose={() => setShowCreateOrderModal(false)}
                businessId={businessProfile.id}
                settings={settings}
                onOrderCreated={(newOrder) => {
                    setOrders(prev => [newOrder, ...prev]);
                }}
            />

            <EditOrderModal
                visible={!!editingOrder}
                onClose={() => setEditingOrder(null)}
                order={editingOrder}
                businessId={businessProfile.id}
                settings={settings}
                onOrderUpdated={(updatedOrder) => {
                    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
                }}
            />

            <Modal visible={customAlert.visible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { maxWidth: 400, alignItems: 'center' }]}>
                        <Text style={[styles.modalTitle, { textAlign: 'center' }]}>{customAlert.title}</Text>
                        <Text style={{ textAlign: 'center', marginBottom: 20, fontSize: 16, color: '#475569' }}>{customAlert.message}</Text>
                        <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                            {customAlert.onConfirm && (
                                <Pressable style={[styles.cancelBtn, { flex: 1, backgroundColor: '#f1f5f9' }]} onPress={() => setCustomAlert({ ...customAlert, visible: false })}>
                                    <Text style={[styles.cancelBtnText, { color: '#64748b' }]}>Cancelar</Text>
                                </Pressable>
                            )}
                            <Pressable style={[styles.actionBtn, { flex: 1, backgroundColor: customAlert.onConfirm ? '#ef4444' : '#10b981' }]} onPress={() => {
                                if (customAlert.onConfirm) customAlert.onConfirm();
                                setCustomAlert({ ...customAlert, visible: false });
                            }}>
                                <Text style={styles.actionBtnText}>{customAlert.confirmText || 'Aceptar'}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>


            
            <Modal visible={showChatbotUpsell} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { width: '100%', maxWidth: 400 }]}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }}>🤖 Asistente Chatbot</Text>
                        <Text style={{ color: '#475569', marginBottom: 20, textAlign: 'center', lineHeight: 22 }}>
                            Un chatbot es un asistente automático de Whatsapp/Instagram/Facebook que toma los pedidos a través de mensajes. Si querés uno para tu negocio, tenés que solicitarlo. ¿Querés pedirlo?
                        </Text>
                        
                        <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>Tu Nombre</Text>
                        <TextInput 
                            style={{ backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' }} 
                            placeholder="Ej: Juan Pérez" 
                            value={chatbotForm.name}
                            onChangeText={t => setChatbotForm({ ...chatbotForm, name: t })}
                        />
                        
                        <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>Tu Teléfono (WhatsApp)</Text>
                        <TextInput 
                            style={{ backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' }} 
                            placeholder="Ej: +54 9 11 1234-5678" 
                            keyboardType="phone-pad"
                            value={chatbotForm.phone}
                            onChangeText={t => setChatbotForm({ ...chatbotForm, phone: t })}
                        />
                        
                        <Pressable 
                            style={{ backgroundColor: '#10b981', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10 }} 
                            disabled={isSubmittingChatbot}
                            onPress={async () => {
                                if (!chatbotForm.name || !chatbotForm.phone) {
                                    alert('Por favor completá tu nombre y teléfono.');
                                    return;
                                }
                                setIsSubmittingChatbot(true);
                                try {
                                    await addDoc(collection(db, 'admin_requests'), {
                                        businessId: businessProfile.id,
                                        businessName: businessProfile.name,
                                        ownerEmail: 'N/A',
                                        ownerName: chatbotForm.name,
                                        ownerPhone: chatbotForm.phone,
                                        requestType: 'chatbot',
                                        createdAt: new Date().toISOString(),
                                        status: 'pending'
                                    });
                                    alert('¡Solicitud enviada! Nos pondremos en contacto con vos a la brevedad.');
                                    setShowChatbotUpsell(false);
                                } catch(e) {
                                    console.error(e);
                                    alert('Hubo un error al enviar la solicitud.');
                                } finally {
                                    setIsSubmittingChatbot(false);
                                }
                            }}
                        >
                            {isSubmittingChatbot ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Sí, quiero solicitarlo</Text>}
                        </Pressable>
                        <Pressable style={{ padding: 15, alignItems: 'center' }} onPress={() => setShowChatbotUpsell(false)}>
                            <Text style={{ color: '#64748b', fontWeight: 'bold' }}>No por ahora</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* Onboarding Modal Multi-Paso */}
            <Modal visible={showOnboarding} animationType="fade" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 540, maxHeight: '92%', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 }}>
                        {/* Header de Progreso */}
                        <View style={{ backgroundColor: '#f8fafc', paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Configuración Inicial • Paso {onboardingStep} de 5
                                </Text>
                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#0284c7' }}>
                                    {Math.round((onboardingStep / 5) * 100)}%
                                </Text>
                            </View>
                            <View style={{ height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                <View style={{ width: `${(onboardingStep / 5) * 100}%`, height: '100%', backgroundColor: '#0284c7', borderRadius: 3 }} />
                            </View>
                        </View>

                        <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
                            {/* PASO 1: Nombre y Rubro */}
                            {onboardingStep === 1 && (
                                <View>
                                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 6 }}>
                                        🏪 Tu Negocio y Rubro
                                    </Text>
                                    <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
                                        Ingresá el nombre y seleccioná la categoría principal para cargar tu catálogo.
                                    </Text>

                                    <Text style={{ fontWeight: '700', color: '#334155', marginBottom: 6, fontSize: 13 }}>Nombre de tu Tienda</Text>
                                    <TextInput
                                        style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 20 }}
                                        placeholder="Ej: Carnicería Don Julio"
                                        value={onboardingData.businessName}
                                        onChangeText={t => setOnboardingData({ ...onboardingData, businessName: t })}
                                    />

                                    <Text style={{ fontWeight: '700', color: '#334155', marginBottom: 10, fontSize: 13 }}>Rubro Principal</Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                                        {[
                                            { id: 'carniceria', label: 'Carnicería', icon: '🥩' },
                                            { id: 'verduleria', label: 'Verdulería', icon: '🥬' },
                                            { id: 'fiambreria', label: 'Fiambrería', icon: '🧀' },
                                            { id: 'almacen', label: 'Almacén / Kiosco', icon: '🛒' },
                                            { id: 'ropa', label: 'Ropa / Moda', icon: '👕' },
                                            { id: 'tecnologia', label: 'Tecnología', icon: '📱' },
                                            { id: 'gastronomia', label: 'Gastronomía', icon: '🍔' },
                                            { id: 'otro', label: 'General / Otro', icon: '📦' }
                                        ].map(item => {
                                            const active = onboardingData.rubro === item.id;
                                            return (
                                                <Pressable
                                                    key={item.id}
                                                    onPress={() => setOnboardingData({ ...onboardingData, rubro: item.id })}
                                                    style={{
                                                        flexBasis: '47%',
                                                        flexGrow: 1,
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        padding: 12,
                                                        borderRadius: 12,
                                                        borderWidth: 2,
                                                        borderColor: active ? '#0284c7' : '#e2e8f0',
                                                        backgroundColor: active ? '#f0f9ff' : '#ffffff',
                                                        gap: 8
                                                    }}
                                                >
                                                    <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                                                    <Text style={{ fontWeight: active ? '700' : '500', color: active ? '#0369a1' : '#475569', fontSize: 14 }}>{item.label}</Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}

                            {/* PASO 2: Tipos de Venta (Multi-select) */}
                            {onboardingStep === 2 && (
                                <View>
                                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 6 }}>
                                        ⚖️ ¿Cómo vendes tus productos?
                                    </Text>
                                    <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
                                        Podés marcar varias opciones según el tipo de productos que manejás.
                                    </Text>

                                    <View style={{ gap: 12, marginBottom: 20 }}>
                                        {[
                                            { id: 'kg', label: 'Por KG / Gramos (Suelto)', desc: 'Fraccionado pesado en balanza (ej: 1.5 kg de Asado)', icon: '⚖️' },
                                            { id: 'unit', label: 'Por Unidades cerradas', desc: 'Venta por unidad o paquete cerrado (ej: 1 botella de vino)', icon: '📦' },
                                            { id: 'piece', label: 'Piezas Enteras (Unidad con KG)', desc: 'Se vende por pieza pero con peso en kg/gr (ej: 1 pollo entero)', icon: '🍗' }
                                        ].map(item => {
                                            const selected = (onboardingData.ventas || []).includes(item.id);
                                            const toggle = () => {
                                                const current = onboardingData.ventas || [];
                                                if (selected) {
                                                    if (current.length > 1) {
                                                        setOnboardingData({ ...onboardingData, ventas: current.filter(x => x !== item.id) });
                                                    }
                                                } else {
                                                    setOnboardingData({ ...onboardingData, ventas: [...current, item.id] });
                                                }
                                            };
                                            return (
                                                <Pressable
                                                    key={item.id}
                                                    onPress={toggle}
                                                    style={{
                                                        padding: 16,
                                                        borderRadius: 14,
                                                        borderWidth: 2,
                                                        borderColor: selected ? '#0284c7' : '#e2e8f0',
                                                        backgroundColor: selected ? '#f0f9ff' : '#fff',
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        gap: 14
                                                    }}
                                                >
                                                    <Text style={{ fontSize: 24 }}>{item.icon}</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontWeight: '700', fontSize: 15, color: selected ? '#0369a1' : '#1e293b', marginBottom: 2 }}>{item.label}</Text>
                                                        <Text style={{ fontSize: 12, color: '#64748b' }}>{item.desc}</Text>
                                                    </View>
                                                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: selected ? '#0284c7' : '#cbd5e1', backgroundColor: selected ? '#0284c7' : '#fff', justifyContent: 'center', alignItems: 'center' }}>
                                                        {selected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                                                    </View>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}

                            {/* PASO 3: Ubicación y Dirección */}
                            {onboardingStep === 3 && (
                                <View>
                                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 6 }}>
                                        📍 Ubicación del Local
                                    </Text>
                                    <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
                                        Ingresá la dirección física donde tus clientes pueden retirar sus pedidos.
                                    </Text>

                                    <Text style={{ fontWeight: '700', color: '#334155', marginBottom: 6, fontSize: 13 }}>Dirección del Comercio</Text>
                                    <TextInput
                                        style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 15 }}
                                        placeholder="Ej: Av. San Martín 1234, Córdoba"
                                        value={onboardingData.address}
                                        onChangeText={t => setOnboardingData({ ...onboardingData, address: t })}
                                    />

                                    <View style={{ backgroundColor: '#f1f5f9', padding: 16, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                                        <Text style={{ fontSize: 20 }}>🗺️</Text>
                                        <Text style={{ fontSize: 13, color: '#475569', flex: 1 }}>
                                            La dirección aparecerá en el ticket de compra y en la opción de retiro para tus clientes.
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* PASO 4: Branding y Colores */}
                            {onboardingStep === 4 && (
                                <View>
                                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 6 }}>
                                        🎨 Imagen y Color de Marca
                                    </Text>
                                    <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
                                        Elegí el color principal que resaltará los botones y banners de tu catálogo digital.
                                    </Text>

                                    <Text style={{ fontWeight: '700', color: '#334155', marginBottom: 12, fontSize: 13 }}>Color Primario</Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 24, justifyContent: 'center' }}>
                                        {[
                                            { label: 'Negro / Slate', hex: '#0f172a' },
                                            { label: 'Rojo Carmesí', hex: '#dc2626' },
                                            { label: 'Azul Real', hex: '#2563eb' },
                                            { label: 'Verde Esmeralda', hex: '#059669' },
                                            { label: 'Naranja Fuego', hex: '#ea580c' },
                                            { label: 'Violeta', hex: '#7c3aed' },
                                            { label: 'Rosa Intenso', hex: '#db2777' },
                                            { label: 'Ámbar Cálido', hex: '#d97706' }
                                        ].map(c => {
                                            const active = onboardingData.primaryColor === c.hex;
                                            return (
                                                <Pressable
                                                    key={c.hex}
                                                    onPress={() => setOnboardingData({ ...onboardingData, primaryColor: c.hex })}
                                                    style={{
                                                        alignItems: 'center',
                                                        width: 54,
                                                        height: 54,
                                                        borderRadius: 27,
                                                        backgroundColor: c.hex,
                                                        justifyContent: 'center',
                                                        borderWidth: active ? 4 : 2,
                                                        borderColor: active ? '#38bdf8' : '#fff',
                                                        shadowColor: '#000',
                                                        shadowOffset: { width: 0, height: 2 },
                                                        shadowOpacity: 0.2,
                                                        elevation: 3
                                                    }}
                                                >
                                                    {active && <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>✓</Text>}
                                                </Pressable>
                                            );
                                        })}
                                    </View>

                                    {/* Vista Previa */}
                                    <View style={{ padding: 14, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Vista Previa de Botón de Compra</Text>
                                        <View style={{ backgroundColor: onboardingData.primaryColor, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8 }}>
                                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Agregar al Carrito 🛒</Text>
                                        </View>
                                    </View>
                                </View>
                            )}

                            {/* PASO 5: Envíos y Medios de Pago */}
                            {onboardingStep === 5 && (
                                <View>
                                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 6 }}>
                                        🛵 Envíos y Medios de Pago
                                    </Text>
                                    <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
                                        Definí cómo recibirás el dinero y cómo entregarás los pedidos.
                                    </Text>

                                    <Text style={{ fontWeight: '700', color: '#334155', marginBottom: 8, fontSize: 13 }}>¿Realizás envíos a domicilio?</Text>
                                    <View style={{ gap: 8, marginBottom: 20 }}>
                                        {[
                                            { id: 'no', label: 'No, solo retiran en local 🏪' },
                                            { id: 'si', label: 'Sí, cobro costo de envío 🛵' },
                                            { id: 'gratis', label: 'Sí, envío gratis 🎉' }
                                        ].map(item => {
                                            const active = onboardingData.envios === item.id;
                                            return (
                                                <Pressable
                                                    key={item.id}
                                                    onPress={() => setOnboardingData({ ...onboardingData, envios: item.id })}
                                                    style={{
                                                        padding: 12,
                                                        borderRadius: 10,
                                                        borderWidth: 2,
                                                        borderColor: active ? '#0284c7' : '#e2e8f0',
                                                        backgroundColor: active ? '#f0f9ff' : '#fff'
                                                    }}
                                                >
                                                    <Text style={{ fontWeight: active ? '700' : '500', color: active ? '#0369a1' : '#475569', fontSize: 14 }}>{item.label}</Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>

                                    <Text style={{ fontWeight: '700', color: '#334155', marginBottom: 8, fontSize: 13 }}>¿Qué medios de pago aceptás?</Text>
                                    <View style={{ gap: 8, marginBottom: 10 }}>
                                        {[
                                            { id: 'efectivo', label: 'Solo Efectivo 💵' },
                                            { id: 'transferencia', label: 'Efectivo y Transferencias 💳' },
                                            { id: 'todas', label: 'Efectivo, Transf. y Tarjetas (MercadoPago) 📱' }
                                        ].map(item => {
                                            const active = onboardingData.pagos === item.id;
                                            return (
                                                <Pressable
                                                    key={item.id}
                                                    onPress={() => setOnboardingData({ ...onboardingData, pagos: item.id })}
                                                    style={{
                                                        padding: 12,
                                                        borderRadius: 10,
                                                        borderWidth: 2,
                                                        borderColor: active ? '#0284c7' : '#e2e8f0',
                                                        backgroundColor: active ? '#f0f9ff' : '#fff'
                                                    }}
                                                >
                                                    <Text style={{ fontWeight: active ? '700' : '500', color: active ? '#0369a1' : '#475569', fontSize: 14 }}>{item.label}</Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}
                        </ScrollView>

                        {/* Footer con Botones de Navegación */}
                        <View style={{ backgroundColor: '#f8fafc', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                            {onboardingStep > 1 ? (
                                <Pressable
                                    onPress={() => setOnboardingStep(s => s - 1)}
                                    style={{ paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' }}
                                >
                                    <Text style={{ color: '#475569', fontWeight: '700' }}>← Atrás</Text>
                                </Pressable>
                            ) : (
                                <View />
                            )}

                            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                                {(onboardingStep === 3 || onboardingStep === 4) && (
                                    <Pressable
                                        onPress={() => setOnboardingStep(s => s + 1)}
                                        style={{ paddingVertical: 12, paddingHorizontal: 14 }}
                                    >
                                        <Text style={{ color: '#64748b', fontWeight: '600', fontSize: 13 }}>Configurar más tarde</Text>
                                    </Pressable>
                                )}

                                {onboardingStep < 5 ? (
                                    <Pressable
                                        onPress={() => setOnboardingStep(s => s + 1)}
                                        style={{ backgroundColor: '#0284c7', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 }}
                                    >
                                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Siguiente →</Text>
                                    </Pressable>
                                ) : (
                                    <Pressable
                                        style={{ backgroundColor: '#10b981', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, alignItems: 'center' }}
                                        disabled={isOnboardingSubmitting}
                                        onPress={async () => {
                                            setIsOnboardingSubmitting(true);
                                            try {
                                                await applyDemoOnboarding(businessProfile.id, onboardingData);
                                                if (businessProfile) {
                                                    (businessProfile as any).onboardingCompleted = true;
                                                    businessProfile.name = onboardingData.businessName || businessProfile.name;
                                                    businessProfile.primaryColor = onboardingData.primaryColor || businessProfile.primaryColor;
                                                }
                                                await loadBusinessById(businessProfile.id);
                                                setShowOnboarding(false);
                                                Alert.alert('¡Tienda Configurada!', 'Se ha creado tu catálogo y configurado tu tienda con éxito.');
                                            } catch (e) {
                                                console.error(e);
                                                Alert.alert('Error', 'Hubo un error al configurar la tienda.');
                                            } finally {
                                                setIsOnboardingSubmitting(false);
                                            }
                                        }}
                                    >
                                        {isOnboardingSubmitting ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>¡Finalizar y Configurar! ✨</Text>
                                        )}
                                    </Pressable>
                                )}
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            <Pressable style={styles.fab} onPress={() => setIsBroadcastModalVisible(true)}><FontAwesome name="bullhorn" size={24} color="#fff" /></Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f5f7' },
    headerArea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 40 },
    title: { fontSize: 24, fontWeight: '800', color: '#111' },
    subtitle: { fontSize: 14, color: '#666' },
    trendsBtn: { backgroundColor: '#1f2937', padding: 10, borderRadius: 8 },
    trendsBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
    nextUpRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 15 },
    nextBox: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1 },
    nextBoxTitle: { fontSize: 11, fontWeight: 'bold' },
    nextBoxValue: { fontSize: 13, fontWeight: '800' },
    kanbanContainer: { flex: 1, flexDirection: 'row', paddingHorizontal: 10 },
    kanbanColumn: { flex: 1, marginHorizontal: 5, backgroundColor: '#e2e8f0', borderRadius: 12, overflow: 'hidden' },
    colHeader: { padding: 10 },
    colTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    filterScroll: { flexGrow: 0, paddingHorizontal: 20, marginBottom: 10 },
    filterScrollContent: { gap: 8 },
    filterBtn: { backgroundColor: '#e2e8f0', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    filterBtnActive: { backgroundColor: '#1f2937' },
    filterBtnText: { color: '#475569', fontWeight: 'bold', fontSize: 12 },
    filterBtnTextActive: { color: '#fff' },
    archivedBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: 'red', borderRadius: 10, paddingHorizontal: 5 },
    archivedBadgeText: { color: '#fff', fontSize: 10 },
    list: { padding: 10 },
    card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, shadowOpacity: 0.1, elevation: 2 },
    cancelledCard: { opacity: 0.5 },
    notificationBadge: { position: 'absolute', top: -5, right: 10, backgroundColor: '#fef08a', padding: 4, borderRadius: 8 },
    notificationBadgeText: { fontSize: 10, fontWeight: 'bold' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    orderId: { fontWeight: 'bold' },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, fontSize: 10, fontWeight: 'bold' },
    clientInfo: { fontSize: 13, fontWeight: '600' },
    infoText: { fontSize: 12, color: '#555' },
    itemsList: { backgroundColor: '#f8fafc', padding: 8, borderRadius: 8, marginVertical: 8 },
    itemRow: { marginBottom: 4 },
    itemRowText: { fontSize: 12 },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    weightInput: { borderWidth: 1, borderColor: '#ccc', width: 40, height: 25, fontSize: 12, textAlign: 'center' },
    priceInput: { borderWidth: 1, borderColor: '#ccc', width: 50, height: 25, fontSize: 12, textAlign: 'center' },
    editRowText: { fontSize: 11 },
    totalText: { fontSize: 16, fontWeight: 'bold', textAlign: 'right' },
    customTotalContainer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
    customTotalInput: { borderWidth: 1, borderColor: '#ccc', width: 70, height: 30, textAlign: 'right', fontWeight: 'bold' },
    hr: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
    statusSelectors: { marginBottom: 10 },
    statusLabel: { fontSize: 11, fontWeight: 'bold', color: '#666' },
    statusBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    statusPill: { padding: 5, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
    statusPillText: { fontSize: 9, fontWeight: 'bold' },
    actionRow: { flexDirection: 'row', gap: 8 },
    editBtn: { backgroundColor: '#eee', padding: 10, borderRadius: 8, flex: 1, alignItems: 'center' },
    editBtnText: { fontSize: 11, fontWeight: 'bold' },
    doneBtn: { backgroundColor: '#4ade80', padding: 10, borderRadius: 8, flex: 1, alignItems: 'center' },
    doneBtnText: { fontSize: 11, fontWeight: 'bold' },
    printBtn: { backgroundColor: '#e0f2fe', padding: 10, borderRadius: 8, alignItems: 'center' },
    printBtnText: { fontSize: 11, fontWeight: 'bold' },
    modalOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    statLabel: { fontSize: 12, color: '#666' },
    actionBtn: { padding: 12, borderRadius: 8, alignItems: 'center' },
    actionBtnText: { color: '#fff', fontWeight: 'bold' },
    cancelBtn: { padding: 12, borderRadius: 8, alignItems: 'center' },
    cancelBtnText: { fontWeight: 'bold' },
    fab: { position: 'absolute', bottom: 20, right: 20, width: 50, height: 50, borderRadius: 25, backgroundColor: '#ea580c', justifyContent: 'center', alignItems: 'center', elevation: 5 },
    input_broadcast: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 10 }
});




