import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Order, OrderItem } from '../../src/types';
import { saveOrderToFirebase } from '../../src/services/businessService';

interface CreateOrderModalProps {
    visible: boolean;
    onClose: () => void;
    businessId: string;
    settings: any;
    onOrderCreated: (newOrder: Order) => void;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
    visible,
    onClose,
    businessId,
    settings,
    onOrderCreated
}) => {
    // Tomar los métodos de pago configurados en settings (o fallback a Efectivo)
    const configuredPaymentMethods: string[] = (settings?.paymentMethods && settings.paymentMethods.length > 0)
        ? settings.paymentMethods
        : ['Efectivo'];

    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
    const [clientAddress, setClientAddress] = useState('');
    const [branchId, setBranchId] = useState<string>('');
    const [deliveryCost, setDeliveryCost] = useState('0');
    const [totalPrice, setTotalPrice] = useState('');
    const [cashTotalPrice, setCashTotalPrice] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    
    const [selectedDateObj, setSelectedDateObj] = useState<Date>(() => new Date());
    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [calendarViewMonth, setCalendarViewMonth] = useState<Date>(() => new Date());

    const [scheduledTimeSlot, setScheduledTimeSlot] = useState('');
    const [notes, setNotes] = useState('');
    
    // Lista de ítems (inicialmente vacía hasta que se toca "Añadir Ítem")
    const [items, setItems] = useState<{ id: string; name: string; quantity: string }[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

    // Refs para scroll/focus en campos faltantes
    const scrollViewRef = useRef<ScrollView>(null);
    const clientNameInputRef = useRef<TextInput>(null);
    const clientAddressInputRef = useRef<TextInput>(null);
    const totalPriceInputRef = useRef<TextInput>(null);

    const resetForm = () => {
        setClientName('');
        setClientPhone('');
        setDeliveryMethod('pickup');
        setClientAddress('');
        setBranchId(settings?.branches?.[0]?.id || '');
        setDeliveryCost('0');
        setTotalPrice('');
        setCashTotalPrice('');
        setPaymentMethod(configuredPaymentMethods[0] || 'Efectivo');
        const now = new Date();
        setSelectedDateObj(now);
        setCalendarViewMonth(now);
        setScheduledTimeSlot('');
        setNotes('');
        setItems([]);
        setFieldErrors({});
        setSubmitting(false);
        setShowCalendarModal(false);
    };

    // Cuando el modal se abre, resetear el formulario a su estado vacío inicial
    useEffect(() => {
        if (visible) {
            resetForm();
        }
    }, [visible, settings?.paymentMethods]);

    const handleAddItem = () => {
        setItems(prev => [...prev, { id: Date.now().toString(), name: '', quantity: '1' }]);
        setFieldErrors(prev => ({ ...prev, items: false }));
    };

    const handleRemoveItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    const handleUpdateItem = (id: string, field: 'name' | 'quantity', val: string) => {
        let cleanVal = val;
        if (field === 'quantity') {
            cleanVal = val.replace(/[^0-9.,]/g, '');
        }
        setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: cleanVal } : i));
        setFieldErrors(prev => ({ ...prev, [`item_${id}_name`]: false }));
    };

    const handleSubmit = async () => {
        if (submitting) return; // Evita doble submit si se presiona varias veces

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

        if (!totalPrice.trim() || isNaN(parseFloat(totalPrice))) {
            errors.totalPrice = true;
        }

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);

            // Redirigir/focalizar el primer campo faltante
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

        const parsedTotal = parseFloat(totalPrice);
        const parsedCashTotal = cashTotalPrice.trim() ? parseFloat(cashTotalPrice) : undefined;
        const parsedDeliveryCost = parseFloat(deliveryCost) || 0;

        const orderItems: OrderItem[] = items.map(i => ({
            product: {
                id: 'custom-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
                name: i.name.trim(),
                price: 0,
                description: '',
                imageUrl: '',
                category: 'Varios',
                available: true,
                unitType: 'kg'
            },
            quantity: parseFloat(i.quantity.replace(',', '.')) || 1,
            actualQuantity: parseFloat(i.quantity.replace(',', '.')) || 1,
        }));

        // Fecha programada
        const scheduledTime = new Date(
            selectedDateObj.getFullYear(),
            selectedDateObj.getMonth(),
            selectedDateObj.getDate(),
            12, 0, 0
        ).toISOString();

        // Creamos ID optimista
        const optimisticId = Date.now().toString();
        const newOrder: Order = {
            id: optimisticId,
            businessId,
            clientId: 'manual-admin',
            clientName: clientName.trim(),
            clientPhone: clientPhone.trim(),
            clientAddress: deliveryMethod === 'delivery' ? clientAddress.trim() : undefined,
            branchId: deliveryMethod === 'pickup' ? branchId : undefined,
            items: orderItems,
            subtotal: parsedTotal,
            cashSubtotal: parsedCashTotal,
            totalPrice: parsedTotal,
            cashTotalPrice: parsedCashTotal,
            deliveryCost: parsedDeliveryCost,
            status: 'pending',
            deliveryMethod,
            paymentMethod: paymentMethod || configuredPaymentMethods[0] || 'Efectivo',
            scheduledTime,
            createdAt: new Date().toISOString(),
            notes: (notes ? notes.trim() + ' ' : '') + (scheduledTimeSlot ? `[Horario: ${scheduledTimeSlot}]` : '')
        };

        // Cerramos el modal de inmediato y actualizamos la vista
        onOrderCreated(newOrder);
        onClose();
        resetForm();

        // Guardamos en Firebase en background
        saveOrderToFirebase(businessId, newOrder).catch(err => {
            console.error('Error saving manual order to Firebase:', err);
        });
    };

    // Calendario: Días del mes actual
    const year = calendarViewMonth.getFullYear();
    const month = calendarViewMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 Dom, 1 Lun ...
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Meses y Días
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const weekDays = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

    const formattedSelectedDate = `${selectedDateObj.getFullYear()}-${String(selectedDateObj.getMonth() + 1).padStart(2, '0')}-${String(selectedDateObj.getDate()).padStart(2, '0')}`;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={modalStyles.overlay}>
                <View style={modalStyles.container}>
                    <View style={modalStyles.header}>
                        <Text style={modalStyles.headerTitle}>➕ Crear Pedido</Text>
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
                                        onChangeText={(val) => setDeliveryCost(val.replace(/[^0-9.,]/g, ''))}
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

                        {/* Fecha y Horario */}
                        <View style={modalStyles.fieldRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={modalStyles.label}>Día de entrega / retiro</Text>
                                <Pressable
                                    style={[modalStyles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                                    onPress={() => {
                                        setCalendarViewMonth(new Date(selectedDateObj));
                                        setShowCalendarModal(true);
                                    }}
                                >
                                    <Text style={{ fontSize: 14, color: '#1e293b', fontWeight: '600' }}>
                                        📅 {formattedSelectedDate}
                                    </Text>
                                    <FontAwesome name="calendar" size={14} color="#0284c7" />
                                </Pressable>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={modalStyles.label}>Horario o Franja</Text>
                                <TextInput
                                    style={modalStyles.input}
                                    placeholder="Ej: 11:00hs o Tarde"
                                    value={scheduledTimeSlot}
                                    onChangeText={setScheduledTimeSlot}
                                />
                            </View>
                        </View>

                        {/* Modal Calendario Interactivo */}
                        {showCalendarModal && (
                            <View style={modalStyles.calendarCard}>
                                <View style={modalStyles.calendarHeader}>
                                    <Pressable
                                        onPress={() => setCalendarViewMonth(new Date(year, month - 1, 1))}
                                        style={modalStyles.calNavBtn}
                                    >
                                        <FontAwesome name="chevron-left" size={12} color="#475569" />
                                    </Pressable>
                                    <Text style={modalStyles.calendarMonthTitle}>
                                        {monthNames[month]} {year}
                                    </Text>
                                    <Pressable
                                        onPress={() => setCalendarViewMonth(new Date(year, month + 1, 1))}
                                        style={modalStyles.calNavBtn}
                                    >
                                        <FontAwesome name="chevron-right" size={12} color="#475569" />
                                    </Pressable>
                                </View>

                                {/* Días de la semana */}
                                <View style={modalStyles.calendarGrid}>
                                    {weekDays.map(wd => (
                                        <View key={wd} style={modalStyles.calendarDayCell}>
                                            <Text style={modalStyles.calendarWeekDay}>{wd}</Text>
                                        </View>
                                    ))}
                                    {/* Celdas vacías previas */}
                                    {Array.from({ length: firstDayIndex }).map((_, i) => (
                                        <View key={'empty-' + i} style={modalStyles.calendarDayCell} />
                                    ))}
                                    {/* Días del mes */}
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

                        {/* Sección Productos / Ítems */}
                        <View style={{ marginTop: 15, marginBottom: 8 }}>
                            <Text style={modalStyles.sectionHeader}>🥩 Productos / Ítems *</Text>
                        </View>

                        {/* Listado dinámico de ítems añadidos */}
                        {items.map((item, idx) => {
                            const isItemError = fieldErrors[`item_${item.id}_name`];
                            return (
                                <View key={item.id} style={modalStyles.itemRow}>
                                    <TextInput
                                        style={[modalStyles.input, { flex: 2, marginRight: 8 }, isItemError && modalStyles.inputError]}
                                        placeholder="Nombre del producto (ej: Asado, Nalga...)"
                                        value={item.name}
                                        onChangeText={(val) => handleUpdateItem(item.id, 'name', val)}
                                    />
                                    <TextInput
                                        style={[modalStyles.input, { width: 85, marginRight: 8, textAlign: 'center' }]}
                                        placeholder="Peso/Cant"
                                        keyboardType="numeric"
                                        value={item.quantity}
                                        onChangeText={(val) => handleUpdateItem(item.id, 'quantity', val)}
                                    />
                                    <Pressable style={modalStyles.deleteBtn} onPress={() => handleRemoveItem(item.id)}>
                                        <FontAwesome name="trash" size={14} color="#dc2626" />
                                    </Pressable>
                                </View>
                            );
                        })}

                        {/* Botón largo: Añadir Ítem */}
                        <Pressable 
                            style={[modalStyles.longAddBtn, fieldErrors.items && items.length === 0 && modalStyles.longAddBtnError]} 
                            onPress={handleAddItem}
                        >
                            <FontAwesome name="plus-circle" size={16} color="#0284c7" />
                            <Text style={modalStyles.longAddBtnText}>Añadir Ítem</Text>
                        </Pressable>

                        {fieldErrors.items && items.length === 0 && (
                            <Text style={{ color: '#ef4444', fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                                Debes añadir al menos un producto al pedido.
                            </Text>
                        )}

                        {/* Medio de Pago y Montos */}
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
                                    onChangeText={(val) => setCashTotalPrice(val.replace(/[^0-9.,]/g, ''))}
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
                            {submitting ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={modalStyles.saveBtnText}>Crear Pedido</Text>
                            )}
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
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15
    },
    container: {
        backgroundColor: '#fff',
        borderRadius: 16,
        width: '100%',
        maxWidth: 580,
        maxHeight: '90%',
        display: 'flex',
        flexDirection: 'column',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 15,
        elevation: 10
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0'
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b'
    },
    closeBtn: {
        padding: 5
    },
    body: {
        padding: 20
    },
    sectionHeader: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#475569',
        textTransform: 'uppercase',
        marginBottom: 8,
        letterSpacing: 0.5
    },
    fieldRow: {
        flexDirection: 'row',
        marginBottom: 12
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b',
        marginBottom: 4
    },
    input: {
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        color: '#1e293b'
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
        alignItems: 'center',
        backgroundColor: '#f8fafc'
    },
    tabBtnActive: {
        borderColor: '#0284c7',
        backgroundColor: '#e0f2fe'
    },
    tabBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b'
    },
    tabBtnTextActive: {
        color: '#0284c7',
        fontWeight: 'bold'
    },
    branchChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        marginBottom: 4
    },
    branchChipActive: {
        backgroundColor: '#0f172a',
        borderColor: '#0f172a'
    },
    branchChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#475569'
    },
    branchChipTextActive: {
        color: '#fff'
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8
    },
    deleteBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#fee2e2',
        justifyContent: 'center',
        alignItems: 'center'
    },
    longAddBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#f0f9ff',
        borderColor: '#bae6fd',
        borderWidth: 1,
        borderStyle: 'dashed',
        paddingVertical: 12,
        borderRadius: 8,
        marginBottom: 10
    },
    longAddBtnError: {
        borderColor: '#ef4444',
        backgroundColor: '#fef2f2'
    },
    longAddBtnText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0284c7'
    },
    calendarCard: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 12,
        padding: 12,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOpacity: 0.1,
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
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 130
    },
    saveBtnText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#fff'
    }
});
