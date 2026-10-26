import { router, useFocusEffect } from 'expo-router';
import React, { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, Alert, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useAppContext } from '../../../src/context/AppContext';
import { AppNotification } from '../../../src/types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';

export default function NotificationsScreen() {
    const { user, setUser, notifications, setNotifications, businessProfile, setActiveCouponCode, settings } = useAppContext();

    // Reset unread visually (this typically updates backend too)
    useFocusEffect(
        useCallback(() => {
            const markAllRead = () => {
                const updated = notifications.map(n => 
                    (n.userId === user?.id || n.userId === 'all') ? { ...n, read: true } : n
                );
                // Call context update
                // In a real app we would call an API here
                if (updated.some(n => n.read !== notifications.find(o => o.id === n.id)?.read)) {
                    setNotifications(updated);
                }
            };
            markAllRead();
        }, [notifications])
    );

    const handleDelete = async (notifId: string) => {
        if (!user || user.id === 'guest') return;
        const currentDeleted = user.deletedNotifications || [];
        if (!currentDeleted.includes(notifId)) {
            const newDeleted = [...currentDeleted, notifId];
            setUser({ ...user, deletedNotifications: newDeleted });
            try {
                await updateDoc(doc(db, 'users', user.id), { deletedNotifications: newDeleted });
            } catch (e) {
                console.error("Error deleting notification:", e);
            }
        }
    };

    const isCouponExhaustedOrExpired = (n: AppNotification) => {
        if (n.type !== 'coupon' || !n.actionUrl || !n.actionUrl.includes('promo=')) return false;
        const code = n.actionUrl.split('promo=')[1]?.toUpperCase();
        if (!code) return false;
        const couponInfo = settings?.coupons?.find((c: any) => c.code.toUpperCase() === code);
        if (!couponInfo) return true; // If coupon doesn't exist anymore, treat as exhausted
        
        // Check limits
        const uses = user?.usedCoupons?.[couponInfo.code] || 0;
        if (couponInfo.maxUsesPerClient && uses >= couponInfo.maxUsesPerClient) return true;
        
        // Check expiration
        if (couponInfo.expirationDate) {
            const expDate = new Date(couponInfo.expirationDate);
            if (new Date() > expDate) return true;
        }
        
        return false;
    };

    const myNotes = notifications
        .filter(n => (n.userId === user?.id || n.userId === 'all') && !(user?.deletedNotifications || []).includes(n.id) && !isCouponExhaustedOrExpired(n))
        .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const getIconDetails = (type: AppNotification['type']): { name: any, bgColor: string, color: string } => {
        switch(type) {
            case 'coupon': return { name: 'ticket', bgColor: '#fef08a', color: '#a16207' };
            case 'offer': return { name: 'tag', bgColor: '#fce7f3', color: '#be185d' };
            case 'order_update': return { name: 'box', bgColor: '#e0f2fe', color: '#0369a1' };
            case 'price_update': return { name: 'line-chart', bgColor: '#ffedd5', color: '#c2410c' };
            default: return { name: 'bell', bgColor: '#f1f5f9', color: '#475569' };
        }
    };

    const handleActionClick = (n: AppNotification) => {
        if (n.type === 'coupon') {
            let code = '';
            if (n.actionUrl && n.actionUrl.includes('promo=')) {
                code = n.actionUrl.split('promo=')[1];
            }
            if (code) {
                setActiveCouponCode(code);
                if (Platform.OS === 'web') alert(`¡Beneficio activado! El cupón ${code} se aplicará en tu carrito.`);
                else Alert.alert('Beneficio Activado', `El cupón ${code} se aplicará automáticamente en tu carrito.`);
            }
            return;
        }
        
        if (n.actionUrl) {
            let url = n.actionUrl;
            if (url.includes('/(client)/shop')) {
                url = url.replace('/[store]/(client)/shop', '/').replace('/(client)/shop', '/');
            }
            router.push(url as any);
        } else if (n.type === 'offer') {
            router.push('/');
        } else if (n.type === 'order_update') {
            router.push('/orders');
        }
    };

    const renderNotif = ({ item }: { item: AppNotification }) => {
        const iconInfo = getIconDetails(item.type);
        const dateStr = new Date(item.createdAt).toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        // Calculate countdown if it's a timer coupon
        let countdownStr = '';
        if (item.type === 'coupon' && item.actionUrl && item.actionUrl.includes('promo=')) {
            const code = item.actionUrl.split('promo=')[1]?.toUpperCase();
            const couponInfo = settings?.coupons?.find((c: any) => c.code.toUpperCase() === code);
            if (couponInfo && couponInfo.showTimer && couponInfo.expirationDate) {
                const diffMs = new Date(couponInfo.expirationDate).getTime() - new Date().getTime();
                if (diffMs > 0) {
                    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    countdownStr = ` Expira en ${diffHrs}h ${diffMins}m`;
                }
            }
        }

        return (
            <View style={[styles.card, !item.read && styles.unreadCard]}>
                <View style={styles.cardHeader}>
                    <View style={[styles.iconBox, { backgroundColor: iconInfo.bgColor }]}>
                        <FontAwesome name={iconInfo.name} size={16} color={iconInfo.color} />
                    </View>
                    <View style={styles.titleInfo}>
                        <Text style={styles.title}>{item.title}</Text>
                        <Text style={styles.date}>
                            {dateStr}
                            {countdownStr ? <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>{countdownStr}</Text> : null}
                        </Text>
                    </View>
                    {!item.read && <View style={styles.unreadDot} />}
                    <Pressable style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
                        <FontAwesome name="trash" size={16} color="#cbd5e1" />
                    </Pressable>
                </View>

                <Text style={styles.body}>{item.message}</Text>

                {(item.type === 'coupon' || item.type === 'offer' || item.actionUrl) && (
                    <Pressable 
                        style={[styles.actionBtn, { backgroundColor: businessProfile?.primaryColor || '#14b8a6' }]}
                        onPress={() => handleActionClick(item)}
                    >
                        <FontAwesome name="shopping-cart" size={14} color="#fff" style={{marginRight: 6}} />
                        <Text style={styles.actionBtnText}>
                            {item.type === 'coupon' ? '¡Usá tu beneficio ahora!' : 'Ver en el catálogo'}
                        </Text>
                    </Pressable>
                )}
            </View>
        );
    };

    if (myNotes.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <View style={styles.emptyCircle}>
                    <FontAwesome name="bell-slash" size={40} color="#cbd5e1" />
                </View>
                <Text style={styles.emptyTitle}>Nada por aquí</Text>
                <Text style={styles.emptyDesc}>Cuando la carnicería te envíe promociones o avisos de tu pedido, aparecerán en este buzón.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.headerTitle}>Tus Avisos</Text>
            <FlatList
                data={myNotes}
                keyExtractor={item => item.id}
                renderItem={renderNotif}
                contentContainerStyle={styles.list}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f5f7' },
    headerTitle: { fontSize: 26, fontWeight: '900', color: '#0f172a', padding: 20, paddingBottom: 10 },
    list: { padding: 20, paddingBottom: 100 },
    
    card: { backgroundColor: '#fff', padding: 18, borderRadius: 16, marginBottom: 15, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
    unreadCard: { backgroundColor: '#f8fafc', borderLeftWidth: 4, borderLeftColor: '#3b82f6' },
    
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    titleInfo: { flex: 1 },
    title: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
    date: { fontSize: 12, color: '#94a3b8' },
    unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3b82f6', marginLeft: 10, alignSelf: 'center' },
    deleteBtn: { padding: 8, marginLeft: 5 },

    body: { fontSize: 14, color: '#475569', lineHeight: 22, paddingLeft: 48, marginBottom: 15 },

    actionBtn: { alignSelf: 'flex-start', marginLeft: 48, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
    actionBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },

    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f5f7', padding: 30 },
    emptyCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 2, borderColor: '#e2e8f0' },
    emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#1e293b', marginBottom: 10 },
    emptyDesc: { fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 24 }
});
