
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Dimensions, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppContext } from '../context/AppContext';

interface TutorialProps {
    forceShow?: boolean;
    onClose?: () => void;
    pathname?: string;
}

export const TutorialOverlay: React.FC<TutorialProps> = ({ forceShow, onClose, pathname = '/admin' }) => {
    const { businessProfile } = useAppContext();
    const [step, setStep] = useState(0);
    const [show, setShow] = useState(false);

    useEffect(() => {
        const checkTutorial = async () => {
            if (forceShow) {
                setStep(0);
                setShow(true);
                return;
            }

            if (businessProfile?.status === 'trial') {
                const hasSeen = await AsyncStorage.getItem('hasSeenTutorial');
                if (!hasSeen) {
                    setShow(true);
                }
            }
        };
        checkTutorial();
    }, [businessProfile?.status, forceShow]);

    if (!show) return null;

    const tutorialData: Record<string, any[]> = {
        'admin': [
            {
                title: "¡Bienvenido a tu Tienda de Prueba! 🎉",
                desc: "Vamos a darte un recorrido rápido para que conozcas las herramientas principales.",
                align: 'center'
            },
            {
                title: "👈 1. El Menú Principal",
                desc: "En la barra lateral a tu izquierda tenés todo tu control. Podés ver tus pedidos, editar tu catálogo de productos y cambiar ajustes.",
                align: 'left'
            },
            {
                title: "📱 2. Visualizar App",
                desc: "Siempre que quieras ver cómo compran tus clientes, podés tocar el botón 'Ver App' en el menú izquierdo para previsualizar tu tienda en vivo.",
                align: 'left'
            },
            {
                title: "🤖 3. Pedidos del Chatbot",
                desc: "En la parte superior tenés el botón verde de 'Pedidos Chatbot' para solicitar y configurar nuestro Asistente Automático de WhatsApp.",
                align: 'top'
            },
            {
                title: "¡Todo listo! 🚀",
                desc: "Animate a explorar. ¡Disfrutá tu experiencia!",
                align: 'center'
            }
        ],
        'products': [
            {
                title: "Catálogo de Productos 🛒",
                desc: "Aquí es donde administrás qué vendés y a qué precio.",
                align: 'center'
            },
            {
                title: "🔍 1. Filtros y Búsqueda",
                desc: "Usá los botones de colores de arriba para filtrar por categoría, productos sin stock o en oferta.",
                align: 'top'
            },
            {
                title: "✏️ 2. Edición Rápida",
                desc: "Podés cambiar los precios, stock y visibilidad tocando directamente en las celdas de la tabla, igual que en Excel.",
                align: 'center'
            },
            {
                title: "📦 3. Importación y Combos",
                desc: "Con los botones superiores derechos podés importar todo desde Excel con un click, o armar tus propios Combos.",
                align: 'top-right'
            }
        ],
        'settings': [
            {
                title: "Ajustes de tu Negocio ⚙️",
                desc: "Aquí configurás las reglas de tu tienda, horarios y formas de pago.",
                align: 'center'
            },
            {
                title: "⏰ 1. Horarios de Atención",
                desc: "Definí los días y horas exactas en las que tu comercio está abierto para recibir pedidos.",
                align: 'center'
            },
            {
                title: "🛵 2. Métodos de Envío",
                desc: "Activá delivery o retiro por sucursal. Podés cobrar un monto fijo o por zonas de tu ciudad.",
                align: 'center'
            },
            {
                title: "💳 3. Cobros",
                desc: "Permití que te paguen en Efectivo y Transferencia al recibir, y configurá los recargos.",
                align: 'center'
            }
        ]
    };

    let activeModule = 'admin';
    if (pathname.includes('products')) activeModule = 'products';
    else if (pathname.includes('settings')) activeModule = 'settings';
    
    const steps = tutorialData[activeModule] || [
        {
            title: "Módulo Activo",
            desc: "Explora las funciones de esta sección desde el panel central. Si tenés dudas, tocá de nuevo el botón de tutorial.",
            align: 'center'
        }
    ];

    const current = steps[step];

    const next = async () => {
        if (step < steps.length - 1) {
            setStep(step + 1);
        } else {
            setShow(false);
            if (onClose) onClose();
            if (businessProfile?.status === 'trial') {
                await AsyncStorage.setItem('hasSeenTutorial', 'true');
            }
        }
    };

    const skip = async () => {
        setShow(false);
        if (onClose) onClose();
        if (businessProfile?.status === 'trial') {
            await AsyncStorage.setItem('hasSeenTutorial', 'true');
        }
    }

    const getAlignmentStyles = (align: string) => {
        switch (align) {
            case 'left': return { justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 120 };
            case 'top': return { justifyContent: 'flex-start', alignItems: 'center', paddingTop: 100 };
            case 'top-right': return { justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 100, paddingRight: 40 };
            case 'center': default: return { justifyContent: 'center', alignItems: 'center' };
        }
    };

    return (
        <Modal transparent visible={show} animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                <View style={[{ flex: 1, padding: 20 }, getAlignmentStyles(current.align) as any]}>
                    <View style={styles.card}>
                        <Text style={styles.title}>{current.title}</Text>
                        <Text style={styles.desc}>{current.desc}</Text>
                        
                        <View style={styles.footer}>
                            <Text style={styles.dots}>{step + 1} de {steps.length}</Text>
                            <View style={styles.actions}>
                                <Pressable onPress={skip} style={styles.skipBtn}>
                                    <Text style={styles.skipText}>Saltar</Text>
                                </Pressable>
                                <Pressable onPress={next} style={styles.nextBtn}>
                                    <Text style={styles.nextText}>{step === steps.length - 1 ? '¡Empezar!' : 'Siguiente'}</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        padding: 24,
        borderRadius: 16,
        width: 320,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: 10,
    },
    desc: {
        fontSize: 14,
        color: '#475569',
        lineHeight: 22,
        marginBottom: 20,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
    },
    dots: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
    },
    actions: {
        flexDirection: 'row',
        gap: 15,
        alignItems: 'center',
    },
    skipBtn: {
        padding: 5,
    },
    skipText: {
        color: '#64748b',
        fontWeight: '600',
    },
    nextBtn: {
        backgroundColor: '#0284c7',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    nextText: {
        color: '#fff',
        fontWeight: 'bold',
    }
});
