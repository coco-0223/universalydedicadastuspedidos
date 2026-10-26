import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Order, OrderItem } from '../types';
import { saveOrderToFirebase } from '../services/businessService';
import { getItemPricing } from '../utils/productUtils';

interface EditOrderModalProps {
    visible: boolean;
    onClose: () => void;
    order: Order | null;
    businessId: string;
    settings: any;
    offers?: any[];
    onOrderUpdated: (updatedOrder: Order) => void;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({
    visible,
    onClose,
    order,
    businessId,
    settings,
    offers = [],
    onOrderUpdated
}) => {
    if (!order) return null;

    const configuredPaymentMethods: string[] = (settings?.paymentMethods && settings.paymentMethods.length > 0)
        ? settings.paymentMethods
        : ['Efectivo'];

    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
    const [clientAddress, setClientAddress] = useState('');
    const [branchId, setBranchId] = useState<string>('');
    const [deliveryCost, setDeliveryCost] = useState('0');
    
    // Totales
    const [totalPrice, setTotalPrice] = useState('');
    const [cashTotalPrice, setCashTotalPrice] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    
    // Fecha y calendario
    const [selectedDateObj, setSelectedDateObj] = useState<Date>(() => new Date());
    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [calendarViewMonth, setCalendarViewMonth] = useState<Date>(() => new Date());

    const [notes, setNotes] = useState('');
    
    // Ítems editables
    // Cada item tiene: id, name, quantity, unitPrice, cashUnitPrice, unitType, originalItem
    interface EditableItem {
        id: string;
        name: string;
        quantity: string;
        unitPrice: string;
        cashUnitPrice: string;
        unitType: 'kg' | 'unit';
        originalItem?: OrderItem;
    }
    const [items, setItems] = useState<EditableItem[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

    const scrollViewRef = useRef<ScrollView>(null);
    const clientNameInputRef = useRef<TextInput>(null);
    const clientAddressInputRef = useRef<TextInput>(null);
    const totalPriceInputRef = useRef<TextInput>(null);

    // Bandera para saber si el usuario escribió un total custom a mano
    const [isCustomTotal, setIsCustomTotal] = useState(false);

    // Cargar los datos del pedido al abrirse
    useEffect(() => {
        if (visible && order) {
            setClientName(order.clientName || '');
            setClientPhone(order.clientPhone || '');
            setDeliveryMethod(order.deliveryMethod || 'pickup');
            setClientAddress(order.clientAddress || '');
            setBranchId(order.branchId || settings?.branches?.[0]?.id || '');
            setDeliveryCost((order.deliveryCost !== undefined ? order.deliveryCost : 0).toString());
            setTotalPrice((order.totalPrice || 0).toString());
            setCashTotalPrice(order.cashTotalPrice !== undefined ? order.cashTotalPrice.toString() : '');
            setPaymentMethod(order.paymentMethod || configuredPaymentMethods[0] || 'Efectivo');
            
            const d = order.scheduledTime ? new Date(order.scheduledTime) : new Date();
            const validDate = isNaN(d.getTime()) ? new Date() : d;
            setSelectedDateObj(validDate);
            setCalendarViewMonth(validDate);
            setShowCalendarModal(false);

            setNotes(order.notes || '');
            setIsCustomTotal(!!order.isCustomTotal);

            // Mapear items
            const mappedItems: EditableItem[] = (order.items || []).map((it, idx) => {
                const pricing = getItemPricing(it, offers, settings?.isFoodBusiness);
                const q = (it.actualQuantity ?? it.quantity ?? 1).toString();
                const uPrice = (it.actualPrice ?? it.unitPrice ?? pricing.unitPrice ?? it.product?.price ?? 0).toString();
                const cPrice = (it.cashUnitPrice ?? pricing.cashUnitPrice ?? it.product?.price ?? 0).toString();
                return {
                    id: it.product?.id || `item-${idx}-${Date.now()}`,
                    name: it.product?.name || `Producto #${idx + 1}`,
                    quantity: q,
                    unitPrice: uPrice,
                    cashUnitPrice: cPrice,
                    unitType: it.product?.unitType === 'unit' ? 'unit' : 'kg',
                    originalItem: it
                };
            });
            setItems(mappedItems);
            setFieldErrors({});
            setSubmitting(false);
        }
    }, [visible, order]);

    // Recalcular automáticamente si cambian los items o el costo de envío (cuando no es total personalizado manual)
    const recalculateTotals = (currentItems: EditableItem[], currentDeliveryCost: string) => {
        let sumNormal = 0;
        let sumCash = 0;
        let anyItemHasCashDiscount = false;

        currentItems.forEach(it => {
            const q = parseFloat(it.quantity.replace(',', '.')) || 0;
            const up = parseFloat(it.unitPrice.replace(',', '.')) || 0;
            const cp = parseFloat(it.cashUnitPrice.replace(',', '.')) || up;

            sumNormal += q * up;
            sumCash += q * cp;
            if (cp < up - 0.001) {
                anyItemHasCashDiscount = true;
            }
        });

        const dCost = parseFloat(currentDeliveryCost.replace(',', '.')) || 0;
        const finalNormal = sumNormal + dCost;
        const diff = sumNormal - sumCash;
        const finalCash = (anyItemHasCashDiscount && diff > 0.01) ? Math.max(0, finalNormal - diff) : finalNormal;

        setTotalPrice(finalNormal > 0 ? finalNormal.toFixed(2).replace(/\.00$/, '') : '0');
        if (anyItemHasCashDiscount && diff > 0.01) {
            setCashTotalPrice(finalCash.toFixed(2).replace(/\.00$/, ''));
        } else {
            setCashTotalPrice('');
        }
    };

    const handleAddItem = () => {
        const newItem: EditableItem = {
            id: 'item-' + Date.now(),
            name: '',
            quantity: '1',
            unitPrice: '0',
            cashUnitPrice: '0',
            unitType: 'kg'
        };
        const updated = [...items, newItem];
        setItems(updated);
        setFieldErrors(prev => ({ ...prev, items: false }));
        if (!isCustomTotal) {
            recalculateTotals(updated, deliveryCost);
        }
    };

    const handleRemoveItem = (id: string) => {
        const updated = items.filter(i => i.id !== id);
        setItems(updated);
        if (!isCustomTotal) {
            recalculateTotals(updated, deliveryCost);
        }
    };

    const handleUpdateItem = (id: string, field: 'name' | 'quantity' | 'unitPrice' | 'cashUnitPrice', val: string) => {
        let cleanVal = val;
        // Solo permitir números y una coma/punto para campos numéricos
        if (field === 'quantity' || field === 'unitPrice' || field === 'cashUnitPrice') {
            cleanVal = val.replace(/[^0-9.,]/g, '');
        }

        const updated = items.map(i => {
            if (i.id === id) {
                const updatedItem = { ...i, [field]: cleanVal };
                // Si cambia el precio normal y el de efectivo estaba igual o no definido, mantenerlo alineado si no tenía descuento
                if (field === 'unitPrice' && (!i.cashUnitPrice || i.cashUnitPrice === i.unitPrice || i.cashUnitPrice === '0')) {
                    updatedItem.cashUnitPrice = cleanVal;
                }
                return updatedItem;
            }
            return i;
        });

        setItems(updated);
        if (field === 'name') {
            setFieldErrors(prev => ({ ...prev, [`item_${id}_name`]: false }));
        }

        // Si se cambia la cantidad o el precio unitario, ¡se actualiza automáticamente el cálculo de totales!
        if (field === 'quantity' || field === 'unitPrice' || field === 'cashUnitPrice') {
            setIsCustomTotal(false);
            recalculateTotals(updated, deliveryCost);
        }
    };

    const handleDeliveryCostChange = (val: string) => {
        const cleanVal = val.replace(/[^0-9.,]/g, '');
        setDeliveryCost(cleanVal);
        if (!isCustomTotal) {
            recalculateTotals(items, cleanVal);
        }
    };

    const handleSubmit = async () => {
        if (submitting) return;

        const errors: Record<string, boolean> = {};

        if (!clientName.trim()) {
            errors.clientName = true;
        }

        if (deliveryMethod === 'delivery' && !clientAddress.trim()) {
            errors.clientAddress = true;
        }

        if (items.length === 0) {
            errors.items = true;
        } else {
            let hasEmptyItem = false;
            items.forEach(i => {
                if (!i.name.trim()) {
                    errors[`item_${i.id}_name`] = true;
                    hasEmptyItem = true;
                }
            });
            if (hasEmptyItem) {
                errors.items = true;
            }
        }

        const cleanTotal = totalPrice.replace(',', '.');
        if (!cleanTotal.trim() || isNaN(parseFloat(cleanTotal))) {
            errors.totalPrice = true;
        }

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            if (errors.clientName) {
                clientNameInputRef.current?.focus();
                scrollViewRef.current?.scrollTo({ y: 0, animated: true });
            } else if (errors.clientAddress) {
                clientAddressInputRef.current?.focus();
                scrollViewRef.current?.scrollTo({ y: 120, animated: true });
            } else if (errors.items) {
                scrollViewRef.current?.scrollTo({ y: 260, animated: true });
            } else if (errors.totalPrice) {
                totalPriceInputRef.current?.focus();
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }
            return;
        }

        setSubmitting(true);

        const parsedTotal = parseFloat(cleanTotal);
        const cleanCashTotal = cashTotalPrice.replace(',', '.');
        const parsedCashTotal = cleanCashTotal.trim() && !isNaN(parseFloat(cleanCashTotal)) ? parseFloat(cleanCashTotal) : undefined;
        const parsedDeliveryCost = parseFloat(deliveryCost.replace(',', '.')) || 0;

        const updatedOrderItems: OrderItem[] = items.map((it, idx) => {
            const validQ = parseFloat(it.quantity.replace(',', '.')) || 1;
            const validP = parseFloat(it.unitPrice.replace(',', '.')) || 0;
            const validCP = parseFloat(it.cashUnitPrice.replace(',', '.')) || validP;

            if (it.originalItem) {
                return {
                    ...it.originalItem,
                    product: {
                        ...it.originalItem.product,
                        name: it.name.trim(),
                    },
                    actualQuantity: validQ,
                    quantity: validQ,
                    actualPrice: validP,
                    unitPrice: validP,
                    cashUnitPrice: validCP,
                    hasCashDiscount: validCP < (validP - 0.001)
                };
            }

            return {
                product: {
                    id: 'custom-' + Date.now() + '-' + idx,
                    name: it.name.trim(),
                    price: validP,
                    description: '',
                    imageUrl: '',
                    category: 'Varios',
                    available: true,
                    unitType: it.unitType
                },
                quantity: validQ,
                actualQuantity: validQ,
                actualPrice: validP,
                unitPrice: validP,
                cashUnitPrice: validCP,
                hasCashDiscount: validCP < (validP - 0.001)
            };
        });

        // Horario programado
        const scheduledTime = new Date(
            selectedDateObj.getFullYear(),
            selectedDateObj.getMonth(),
            selectedDateObj.getDate(),
            12, 0, 0
        ).toISOString();

        const updatedOrder: Order = {
            ...order,
            clientName: clientName.trim(),
            clientPhone: clientPhone.trim(),
            clientAddress: deliveryMethod === 'delivery' ? clientAddress.trim() : undefined,
            branchId: deliveryMethod === 'pickup' ? branchId : undefined,
            deliveryMethod,
            deliveryCost: parsedDeliveryCost,
            items: updatedOrderItems,
            subtotal: parsedTotal - parsedDeliveryCost,
            totalPrice: parsedTotal,
            cashTotalPrice: parsedCashTotal,
            isCustomTotal,
            paymentMethod: paymentMethod || configuredPaymentMethods[0] || 'Efectivo',
            scheduledTime,
            notes: notes ? notes.trim() : undefined,
            lastModifiedBy: 'business'
        };

        // Cerrar modal y actualizar inmediatamente la UI
        onOrderUpdated(updatedOrder);
        onClose();

        // Persistir en Firebase
        saveOrderToFirebase(businessId, updatedOrder).catch(err => {
            console.error('Error saving updated order to Firebase:', err);
        });
    };

    // Calendario
    const year = calendarViewMonth.getFullYear();
    const month = calendarViewMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const weekDays = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
    const formattedSelectedDate = `${selectedDateObj.getFullYear()}-${String(selectedDateObj.getMonth() + 1).padStart(2, '0')}-${String(selectedDateObj.getDate()).padStart(2, '0')}`;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.overlay}>
                <View style={modalStyles.container}>
                    {/* Header */}
                    <View style={modalStyles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <FontAwesome name="edit" size={20} color="#ea580c" />
                            <Text style={modalStyles.headerTitle}>Editar Pedido #{order.id}</Text>
                        </View>
                        <Pressable onPress={onClose} style={modalStyles.closeBtn}>
                            <FontAwesome name="times" size={18} color="#64748b" />
                        </Pressable>
                    </View>

                    <ScrollView ref={scrollViewRef} style={modalStyles.body} showsVerticalScrollIndicator={false}>
                        {/* Datos del Cliente */}
                        <Text style={modalStyles.sectionHeader}>👤 Datos del Cliente</Text>
                        <View style={modalStyles.fieldRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={modalStyles.label}>Nombre completo *</Text>
                                <TextInput
                                    ref={clientNameInputRef}
                                    style={[modalStyles.input, fieldErrors.clientName && modalStyles.inputError]}
                                    placeholder="Ej: Juan Pérez"
                                    value={clientName}
                                    onChangeText={(val) => {
                                        setClientName(val);
                                        setFieldErrors(prev => ({ ...prev, clientName: false }));
                                    }}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={modalStyles.label}>Teléfono / WhatsApp (solo números)</Text>
                                <TextInput
                                    style={modalStyles.input}
                                    placeholder="Ej: 1123456789"
                                    keyboardType="phone-pad"
                                    value={clientPhone}
                                    onChangeText={(val) => setClientPhone(val.replace(/[^0-9]/g, ''))}
                                />
                            </View>
                        </View>

                        {/* Método de Entrega */}
                        <Text style={modalStyles.sectionHeader}>🚚 Método de Entrega</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                            <Pressable
                                style={[modalStyles.tabBtn, deliveryMethod === 'pickup' && modalStyles.tabBtnActive]}
                                onPress={() => setDeliveryMethod('pickup')}
                            >
                                <Text style={[modalStyles.tabBtnText, deliveryMethod === 'pickup' && modalStyles.tabBtnTextActive]}>
                                    🏪 Retiro en Local
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[modalStyles.tabBtn, deliveryMethod === 'delivery' && modalStyles.tabBtnActive]}
                                onPress={() => setDeliveryMethod('delivery')}
                            >
                                <Text style={[modalStyles.tabBtnText, deliveryMethod === 'delivery' && modalStyles.tabBtnTextActive]}>
                                    🛵 Envío a Domicilio
                                </Text>
                            </Pressable>
                        </View>

                        {deliveryMethod === 'delivery' ? (
                            <View style={{ marginBottom: 12 }}>
                                <Text style={modalStyles.label}>Dirección de entrega *</Text>
                                <TextInput
                                    ref={clientAddressInputRef}
                                    style={[modalStyles.input, fieldErrors.clientAddress && modalStyles.inputError]}
                                    placeholder="Ej: Av. San Martín 1234, Timbre 2B"
                                    value={clientAddress}
                                    onChangeText={(val) => {
                                        setClientAddress(val);
                                        setFieldErrors(prev => ({ ...prev, clientAddress: false }));
                                    }}
                                />
                                <View style={{ marginTop: 8 }}>
                                    <Text style={modalStyles.label}>Costo de envío ($ - solo números)</Text>
                                    <TextInput
                                        style={modalStyles.input}
                                        placeholder="0"
                                        keyboardType="numeric"
                                        value={deliveryCost}
                                        onChangeText={handleDeliveryCostChange}
                                    />
                                </View>
                            </View>
                        ) : (
                            settings?.branches?.length > 0 && (
                                <View style={{ marginBottom: 12 }}>
                                    <Text style={modalStyles.label}>Sucursal de retiro</Text>
                                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                                        {settings.branches.map((b: any) => (
                                            <Pressable
                                                key={b.id}
                                                style={[modalStyles.branchChip, branchId === b.id && modalStyles.branchChipActive]}
                                                onPress={() => setBranchId(b.id)}
                                            >
                                                <Text style={[modalStyles.branchChipText, branchId === b.id && modalStyles.branchChipTextActive]}>
                                                    {b.name}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </View>
                            )
                        )}

                        {/* Fecha */}
                        <Text style={modalStyles.sectionHeader}>📅 Fecha de Entrega / Retiro</Text>
                        <View style={{ marginBottom: 12 }}>
                            <Text style={modalStyles.label}>Día seleccionado</Text>
                            <Pressable 
                                style={modalStyles.dateSelectorBtn} 
                                onPress={() => setShowCalendarModal(!showCalendarModal)}
                            >
                                <FontAwesome name="calendar" size={16} color="#0284c7" style={{ marginRight: 8 }} />
                                <Text style={modalStyles.dateSelectorText}>{formattedSelectedDate}</Text>
                                <Text style={modalStyles.dateSelectorSubText}>
                                    {showCalendarModal ? '(Tocar para cerrar)' : '(Tocar para cambiar día)'}
                                </Text>
                            </Pressable>
                        </View>

                        {showCalendarModal && (
                            <View style={modalStyles.calendarContainer}>
                                <View style={modalStyles.calendarHeader}>
                                    <Pressable
                                        style={modalStyles.calNavBtn}
                                        onPress={() => setCalendarViewMonth(new Date(year, month - 1, 1))}
                                    >
                                        <FontAwesome name="chevron-left" size={14} color="#334155" />
                                    </Pressable>
                                    <Text style={modalStyles.calendarMonthTitle}>
                                        {monthNames[month]} {year}
                                    </Text>
                                    <Pressable
                                        style={modalStyles.calNavBtn}
                                        onPress={() => setCalendarViewMonth(new Date(year, month + 1, 1))}
                                    >
                                        <FontAwesome name="chevron-right" size={14} color="#334155" />
                                    </Pressable>
                                </View>

                                <View style={modalStyles.calendarGrid}>
                                    {weekDays.map(wd => (
                                        <View key={wd} style={modalStyles.calendarDayCell}>
                                            <Text style={modalStyles.calendarWeekDay}>{wd}</Text>
                                        </View>
                                    ))}
                                    {Array.from({ length: firstDayIndex }).map((_, i) => (
                                        <View key={'empty-' + i} style={modalStyles.calendarDayCell} />
                                    ))}
                                    {Array.from({ length: daysInMonth }).map((_, i) => {
                                        const dayNum = i + 1;
                                        const isSelected =
                                            selectedDateObj.getFullYear() === year &&
                                            selectedDateObj.getMonth() === month &&
                                            selectedDateObj.getDate() === dayNum;
                                        return (
                                            <Pressable
                                                key={'day-' + dayNum}
                                                style={[modalStyles.calendarDayCell, isSelected && modalStyles.calendarDayCellActive]}
                                                onPress={() => {
                                                    setSelectedDateObj(new Date(year, month, dayNum));
                                                    setShowCalendarModal(false);
                                                }}
                                            >
                                                <Text style={[modalStyles.calendarDayText, isSelected && modalStyles.calendarDayTextActive]}>
                                                    {dayNum}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* Sección Productos / Ítems con autocalculo de peso y precio */}
                        <View style={{ marginTop: 15, marginBottom: 8 }}>
                            <Text style={modalStyles.sectionHeader}>🥩 Productos / Ítems *</Text>
                            <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                                Modificá el peso o el precio unitario y el total se calculará automáticamente.
                            </Text>
                        </View>

                        {/* Encabezados de columnas de items */}
                        {items.length > 0 && (
                            <View style={{ flexDirection: 'row', marginBottom: 4, paddingHorizontal: 2 }}>
                                <Text style={{ flex: 2, fontSize: 11, fontWeight: 'bold', color: '#64748b' }}>Producto</Text>
                                <Text style={{ width: 68, fontSize: 11, fontWeight: 'bold', color: '#64748b', textAlign: 'center' }}>Peso/Cant</Text>
                                <Text style={{ width: 72, fontSize: 11, fontWeight: 'bold', color: '#64748b', textAlign: 'center' }}>$ x Kg</Text>
                                <View style={{ width: 34 }} />
                            </View>
                        )}

                        {items.map((item) => {
                            const isItemError = fieldErrors[`item_${item.id}_name`];
                            return (
                                <View key={item.id} style={modalStyles.itemRow}>
                                    <TextInput
                                        style={[modalStyles.input, { flex: 2, marginRight: 6 }, isItemError && modalStyles.inputError]}
                                        placeholder="Nombre del producto"
                                        value={item.name}
                                        onChangeText={(val) => handleUpdateItem(item.id, 'name', val)}
                                    />
                                    <TextInput
                                        style={[modalStyles.input, { width: 68, marginRight: 6, textAlign: 'center' }]}
                                        placeholder="Peso"
                                        keyboardType="numeric"
                                        value={item.quantity}
                                        onChangeText={(val) => handleUpdateItem(item.id, 'quantity', val)}
                                    />
                                    <TextInput
                                        style={[modalStyles.input, { width: 72, marginRight: 6, textAlign: 'center' }]}
                                        placeholder="$ / kg"
                                        keyboardType="numeric"
                                        value={item.unitPrice}
                                        onChangeText={(val) => handleUpdateItem(item.id, 'unitPrice', val)}
                                    />
                                    <Pressable style={modalStyles.deleteBtn} onPress={() => handleRemoveItem(item.id)}>
                                        <FontAwesome name="trash" size={14} color="#dc2626" />
                                    </Pressable>
                                </View>
                            );
                        })}

                        {/* Botón Añadir Ítem */}
                        <Pressable 
                            style={[modalStyles.longAddBtn, fieldErrors.items && items.length === 0 && modalStyles.longAddBtnError]} 
                            onPress={handleAddItem}
                        >
                            <FontAwesome name="plus-circle" size={16} color="#0284c7" />
                            <Text style={modalStyles.longAddBtnText}>Añadir Ítem</Text>
                        </Pressable>

                        {fieldErrors.items && items.length === 0 && (
                            <Text style={{ color: '#ef4444', fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                                Debes tener al menos un producto en el pedido.
                            </Text>
                        )}

                        {/* Medio de Pago */}
                        <Text style={[modalStyles.sectionHeader, { marginTop: 18 }]}>💳 Métodos de Pago</Text>
                        <View style={{ marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                                {configuredPaymentMethods.map(m => (
                                    <Pressable
                                        key={m}
                                        style={[modalStyles.branchChip, paymentMethod === m && modalStyles.branchChipActive]}
                                        onPress={() => setPaymentMethod(m)}
                                    >
                                        <Text style={[modalStyles.branchChipText, paymentMethod === m && modalStyles.branchChipTextActive]}>
                                            {m}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>

                        {/* Totales */}
                        <View style={modalStyles.fieldRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={modalStyles.label}>Total general ($ - solo números) *</Text>
                                <TextInput
                                    ref={totalPriceInputRef}
                                    style={[modalStyles.input, { fontWeight: 'bold', fontSize: 16 }, fieldErrors.totalPrice && modalStyles.inputError]}
                                    placeholder="0"
                                    keyboardType="numeric"
                                    value={totalPrice}
                                    onChangeText={(val) => {
                                        const cleanVal = val.replace(/[^0-9.,]/g, '');
                                        setTotalPrice(cleanVal);
                                        setIsCustomTotal(true);
                                        setFieldErrors(prev => ({ ...prev, totalPrice: false }));
                                    }}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={modalStyles.label}>Total en efectivo ($ - solo números)</Text>
                                <TextInput
                                    style={[modalStyles.input, { fontWeight: 'bold', fontSize: 16, color: '#16a34a' }]}
                                    placeholder="Opcional"
                                    keyboardType="numeric"
                                    value={cashTotalPrice}
                                    onChangeText={(val) => {
                                        const cleanVal = val.replace(/[^0-9.,]/g, '');
                                        setCashTotalPrice(cleanVal);
                                        setIsCustomTotal(true);
                                    }}
                                />
                            </View>
                        </View>

                        {/* Observaciones */}
                        <View style={{ marginTop: 8, marginBottom: 20 }}>
                            <Text style={modalStyles.label}>Observaciones / Notas del pedido</Text>
                            <TextInput
                                style={[modalStyles.input, { height: 60, textAlignVertical: 'top' }]}
                                placeholder="Ej: Cortar fino, tocar timbre fuerte, etc."
                                multiline
                                value={notes}
                                onChangeText={setNotes}
                            />
                        </View>
                    </ScrollView>

                    {/* Footer */}
                    <View style={modalStyles.footer}>
                        <Pressable style={modalStyles.cancelBtn} onPress={onClose} disabled={submitting}>
                            <Text style={modalStyles.cancelBtnText}>Cancelar</Text>
                        </Pressable>
                        <Pressable
                            style={[modalStyles.saveBtn, submitting && { opacity: 0.6 }]}
                            onPress={handleSubmit}
                            disabled={submitting}
                        >
                            <Text style={modalStyles.saveBtnText}>
                                {submitting ? 'Guardando...' : '💾 Guardar Cambios'}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const modalStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16
    },
    container: {
        width: '100%',
        maxWidth: 580,
        backgroundColor: '#fff',
        borderRadius: 16,
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 6
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9'
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0f172a'
    },
    closeBtn: {
        padding: 6
    },
    body: {
        paddingHorizontal: 20,
        paddingTop: 14
    },
    sectionHeader: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 8
    },
    fieldRow: {
        flexDirection: 'row',
        marginBottom: 12
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 4
    },
    input: {
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 14,
        color: '#0f172a'
    },
    inputError: {
        borderColor: '#ef4444',
        backgroundColor: '#fef2f2'
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        backgroundColor: '#f8fafc',
        alignItems: 'center'
    },
    tabBtnActive: {
        backgroundColor: '#0284c7',
        borderColor: '#0284c7'
    },
    tabBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#475569'
    },
    tabBtnTextActive: {
        color: '#fff'
    },
    branchChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        backgroundColor: '#f8fafc'
    },
    branchChipActive: {
        backgroundColor: '#0f172a',
        borderColor: '#0f172a'
    },
    branchChipText: {
        fontSize: 13,
        color: '#475569',
        fontWeight: '500'
    },
    branchChipTextActive: {
        color: '#fff',
        fontWeight: 'bold'
    },
    dateSelectorBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#f0f9ff',
        borderWidth: 1,
        borderColor: '#bae6fd',
        borderRadius: 8
    },
    dateSelectorText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0369a1'
    },
    dateSelectorSubText: {
        fontSize: 12,
        color: '#64748b',
        marginLeft: 8
    },
    calendarContainer: {
        marginTop: 6,
        marginBottom: 12,
        padding: 12,
        backgroundColor: '#ffffff',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 4
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10
    },
    calendarMonthTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1e293b'
    },
    calNavBtn: {
        padding: 6,
        borderRadius: 6,
        backgroundColor: '#f1f5f9'
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap'
    },
    calendarDayCell: {
        width: '14.28%',
        height: 34,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 6
    },
    calendarDayCellActive: {
        backgroundColor: '#0284c7'
    },
    calendarWeekDay: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#94a3b8'
    },
    calendarDayText: {
        fontSize: 13,
        color: '#334155'
    },
    calendarDayTextActive: {
        color: '#fff',
        fontWeight: 'bold'
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8
    },
    deleteBtn: {
        width: 34,
        height: 38,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fee2e2',
        borderRadius: 8
    },
    longAddBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f9ff',
        borderWidth: 1.5,
        borderColor: '#bae6fd',
        borderStyle: 'dashed',
        paddingVertical: 10,
        borderRadius: 8,
        marginTop: 4,
        marginBottom: 10
    },
    longAddBtnError: {
        borderColor: '#fca5a5',
        backgroundColor: '#fef2f2'
    },
    longAddBtnText: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#0284c7',
        marginLeft: 8
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        backgroundColor: '#f8fafc',
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16
    },
    cancelBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#cbd5e1'
    },
    cancelBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#475569'
    },
    saveBtn: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        backgroundColor: '#ea580c',
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 140
    },
    saveBtnText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#fff'
    }
});
