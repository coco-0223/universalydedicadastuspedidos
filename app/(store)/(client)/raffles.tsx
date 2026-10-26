import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppContext } from '../../../src/context/AppContext';

export default function RafflesScreen() {
    const { settings, user, businessProfile, orders } = useAppContext();

    const raffles = settings.raffles || [];
    const activeRaffles = raffles.filter(r => r.active);

    const userOrdersCount = user ? orders.filter(o => o.clientId === user.id && o.status !== 'cancelled').length : 0;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <Text style={styles.title}>🎁 Sorteos y Premios</Text>
                <Text style={styles.subtitle}>
                    Participá por increíbles combos y premios exclusivos de {businessProfile.name}.
                </Text>
            </View>

            {user ? (
                <View style={styles.pointsCard}>
                    <Text style={styles.pointsLabel}>Tus Puntos Acumulados</Text>
                    <Text style={[styles.pointsValue, { color: businessProfile.primaryColor }]}>
                        {user.rafflePoints || 0} pts
                    </Text>
                    <Text style={styles.pointsHint}>Sumás puntos automáticamente con cada compra confirmada. Tenés un total de {userOrdersCount} compras.</Text>
                </View>
            ) : (
                <View style={styles.pointsCard}>
                    <Text style={styles.pointsLabel}>Iniciá sesión para ver tus puntos</Text>
                    <Text style={styles.pointsHint}>Registrate para empezar a sumar puntos y participar de los sorteos.</Text>
                </View>
            )}

            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Sorteos Activos</Text>
            </View>

            {activeRaffles.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>En este momento no hay sorteos activos. ¡Revisá pronto!</Text>
                </View>
            ) : (
                activeRaffles.map(raffle => {
                    const startDate = new Date(raffle.drawStartDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
                    const endDate = new Date(raffle.drawEndDate).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
                    const reqAmount = raffle.minOrderAmount || 0;
                    const canParticipate = (user?.totalSpent || 0) >= reqAmount;
                    const isDrawFinished = new Date() > new Date(raffle.drawEndDate);
                    
                    return (
                        <View key={raffle.id} style={[styles.raffleCard, isDrawFinished && { opacity: 0.8 }]}>
                            <View style={[styles.tag, { backgroundColor: isDrawFinished ? '#64748b' : businessProfile.primaryColor }]}>
                                <Text style={styles.tagText}>{isDrawFinished ? 'Sorteo Finalizado' : 'Sorteo Activo'}</Text>
                            </View>
                            <Text style={styles.raffleTitle}>{raffle.title}</Text>
                            <Text style={styles.raffleDesc}>{raffle.description}</Text>
                            
                            <View style={styles.detailsBox}>
                                <Text style={styles.detailTitle}>🚀 Periodo de Participación:</Text>
                                <Text style={styles.detailValue}>Desde el {startDate} hasta el sorteo.</Text>
                            </View>

                            <View style={styles.detailsBox}>
                                <Text style={styles.detailTitle}>🗓️ Fecha y Hora del Sorteo:</Text>
                                <Text style={styles.detailValue}>{endDate.toUpperCase()}</Text>
                            </View>

                            <View style={[styles.detailsBox, { backgroundColor: '#f0fdfa', borderLeftColor: '#14b8a6' }]}>
                                <Text style={[styles.detailTitle, { color: '#0f766e' }]}>🎁 Premios en juego:</Text>
                                {raffle.prizes.sort((a,b) => a.position - b.position).map(prize => (
                                    <Text key={prize.id} style={{ fontSize: 14, color: '#134e4a', fontWeight: 'bold', marginTop: 4 }}>
                                        {prize.position}º Puesto: {prize.description}
                                    </Text>
                                ))}
                            </View>

                            {reqAmount > 0 && !isDrawFinished && (
                                <View style={[styles.detailsBox, { borderLeftColor: canParticipate ? '#10b981' : '#f59e0b' }]}>
                                    <Text style={styles.detailTitle}>🔒 Condición de Ganador:</Text>
                                    <Text style={styles.detailValue}>Acumular al menos ${reqAmount} en compras. {canParticipate ? '¡Cumplís el requisito!' : `(Te faltan ${settings?.currency || '$'}${reqAmount - (user?.totalSpent || 0)})`}</Text>
                                </View>
                            )}

                            <View style={styles.detailsBox}>
                                <Text style={styles.detailTitle}>📋 Bases y Condiciones:</Text>
                                <Text style={styles.detailValue}>{raffle.conditions}</Text>
                            </View>
                        </View>
                    );
                })
            )}

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    content: {
        padding: 20,
        paddingTop: 60,
    },
    header: {
        marginBottom: 25,
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: '#111',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#555',
        lineHeight: 22,
    },
    pointsCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
        marginBottom: 35,
        borderWidth: 1,
        borderColor: '#f1f5f9'
    },
    pointsLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#64748b',
        marginBottom: 5,
        textTransform: 'uppercase',
    },
    pointsValue: {
        fontSize: 48,
        fontWeight: '900',
        marginBottom: 10,
    },
    pointsHint: {
        fontSize: 13,
        color: '#94a3b8',
        textAlign: 'center',
    },
    sectionHeader: {
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#334155',
    },
    emptyState: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 30,
        alignItems: 'center',
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: '#e2e8f0'
    },
    emptyText: {
        color: '#64748b',
        fontSize: 15,
        textAlign: 'center',
        fontWeight: '500'
    },
    raffleCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        position: 'relative',
        overflow: 'hidden'
    },
    tag: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
        marginBottom: 15,
    },
    tagText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
        textTransform: 'uppercase'
    },
    raffleTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#1e293b',
        marginBottom: 8,
    },
    raffleDesc: {
        fontSize: 15,
        color: '#475569',
        marginBottom: 20,
        lineHeight: 22,
    },
    detailsBox: {
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        borderLeftWidth: 4,
        borderLeftColor: '#cbd5e1'
    },
    detailTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#64748b',
        marginBottom: 4,
    },
    detailValue: {
        fontSize: 15,
        color: '#0f172a',
        fontWeight: '600'
    }
});
