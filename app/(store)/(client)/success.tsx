import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useAppContext } from '../../../src/context/AppContext';

// Componente para cada papelito de confeti (para cumplir con las reglas de hooks)
const ConfettiParticle = ({ index }: { index: number }) => {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.delay(Math.random() * 1500),
            Animated.timing(anim, {
                toValue: 1,
                duration: 2500 + Math.random() * 1000,
                useNativeDriver: true
            })
        ]).start();
    }, []);

    const left = `${Math.random() * 100}%`;
    const size = 15 + Math.random() * 15;
    const rotateGoal = `${Math.random() * 720}deg`;

    return (
        <Animated.Text
            pointerEvents="none"
            style={{
                position: 'absolute',
                top: -50,
                left: left as any,
                fontSize: size,
                zIndex: 10,
                transform: [
                    { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 900] }) },
                    { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', rotateGoal] }) },
                    { scale: anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }) },
                    { translateX: Math.sin(index) * 40 }
                ],
                opacity: anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] })
            }}
        >
            {['🎉', '✨', '🎊', '🥩', '🍖', '🥓'][Math.floor(Math.random() * 6)]}
        </Animated.Text>
    );
};

export default function SuccessScreen() {
    const { type, id, points } = useLocalSearchParams<{ type: string; id: string; points?: string }>();
    const { businessProfile, setCart, setModifyingOrder, addRafflePoints } = useAppContext();
    
    useEffect(() => {
        // Limpiamos el carrito y la edición RECIÉN ACÁ, para que el usuario no vea
        // el parpadeo de "carrito vacío" en la pantalla anterior.
        if (setCart) setCart([]);
        if (setModifyingOrder) setModifyingOrder(null);
        
        // Sumar puntos de sorteo si es un pedido nuevo
        if (type !== 'modified' && points) {
            const parsedPoints = parseInt(points, 10);
            if (parsedPoints > 0) {
                addRafflePoints(parsedPoints);
            }
        }
    }, []);

    const scaleAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.delay(300),
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 5,
                    useNativeDriver: true
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true
                })
            ])
        ]).start();
    }, []);

    const isModified = type === 'modified';

    return (
        <View style={styles.container}>
            {/* Generamos los papelitos usando el componente hijo */}
            {Array.from({ length: 30 }).map((_, i) => (
                <ConfettiParticle key={i} index={i} />
            ))}

            <Animated.View style={[styles.content, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
                <View style={[styles.iconContainer, { backgroundColor: businessProfile.primaryColor + '20' }]}>
                    <FontAwesome name="check-circle" size={80} color={businessProfile.primaryColor} />
                </View>
                
                <Text style={styles.title}>
                    {isModified ? '¡Pedido Modificado!' : '¡Pedido Confirmado!'}
                </Text>
                
                <Text style={styles.message}>
                    {isModified 
                        ? `Tu pedido #${id} ha sido actualizado correctamente.`
                        : `El pedido #${id} ya ingresó al negocio.`}
                </Text>

                <View style={styles.emojiRow}>
                    <Text style={styles.emoji}>🎉</Text>
                    <Text style={styles.emoji}>🎊</Text>
                    <Text style={styles.emoji}>🥩</Text>
                </View>

                <Pressable 
                    style={[styles.button, { backgroundColor: businessProfile.primaryColor }]} 
                    onPress={() => router.navigate('/')}
                >
                    <Text style={styles.buttonText}>Continuar</Text>
                </Pressable>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    content: {
        alignItems: 'center',
        padding: 30,
        borderRadius: 20,
        backgroundColor: '#f8f9fa',
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 5
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: '#1a1a1a',
        marginBottom: 10,
        textAlign: 'center'
    },
    message: {
        fontSize: 16,
        color: '#555',
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 24
    },
    emojiRow: {
        flexDirection: 'row',
        gap: 15,
        marginBottom: 40
    },
    emoji: {
        fontSize: 40
    },
    button: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center'
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    }
});
