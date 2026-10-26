import { FontAwesome } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Platform, StyleSheet, View, Text, Pressable } from 'react-native';
import { useAppContext } from '../../src/context/AppContext';

export default function AppPreviewScreen() {
    const { businessProfile, products, settings } = useAppContext();

    const [isStarted, setIsStarted] = React.useState(false);
    const [reloadKey, setReloadKey] = React.useState(0);

    // Auto-reloads iframe when specific local data changes seamlessly 
    const dynamicKey = useMemo(() => {
        return JSON.stringify(businessProfile) + products.length + JSON.stringify(settings) + reloadKey;
    }, [businessProfile, products.length, settings, reloadKey]);

    if (Platform.OS !== 'web') {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text>El visualizador de app solo funciona en la web (escritorio).</Text>
            </View>
        );
    }

    return (
        <View style={styles.webContainer}>
            <View style={styles.sidebar}>
                 <Pressable style={styles.reloadBtn} onPress={() => setReloadKey(prev => prev + 1)}>
                    <FontAwesome name="refresh" size={16} color="#fff" />
                    <Text style={styles.reloadText}>RECARGAR</Text>
                 </Pressable>
                 <Text style={{ color: '#555', fontSize: 10, textAlign: 'center', marginTop: 15 }}>Click para actualizar precios y stock</Text>
            </View>

            <View style={styles.emulatorWrapper}>
                <View style={styles.phoneDevice}>
                    {/* Notch o Camara fake de Android */}
                    <View style={styles.phoneNotch} />

                    <View style={{ flex: 1, backgroundColor: '#fff', overflow: 'hidden', borderRadius: 25, marginTop: 15, position: 'relative' }}>
                        {!isStarted ? (
                            <View style={styles.startOverlay}>
                                <View style={[styles.startLogo, { backgroundColor: businessProfile.primaryColor }]}>
                                    <FontAwesome name="shopping-basket" size={40} color="#fff" />
                                </View>
                                <Text style={styles.startTitle}>{businessProfile.name}</Text>
                                <Pressable 
                                    style={[styles.startBtn, { backgroundColor: businessProfile.primaryColor }]} 
                                    onPress={() => setIsStarted(true)}
                                >
                                    <Text style={styles.startBtnText}>Ingresar Pedido</Text>
                                </Pressable>
                                <Text style={styles.startHint}>Simulador de Pedidos</Text>
                            </View>
                        ) : (
                            <iframe
                                key={dynamicKey}
                                src={`/?preview=1&store=${businessProfile.id}`}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    border: 'none',
                                    overflowY: 'auto',
                                }}
                                title="Emulador Mobile"
                            />
                        )}
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    webContainer: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#1e1e1e', // Fondo oscuro modo dev
    },
    sidebar: {
        width: 100,
        backgroundColor: '#111',
        padding: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: '#333'
    },
    reloadBtn: {
        backgroundColor: '#333',
        padding: 10,
        borderRadius: 8,
        alignItems: 'center',
        gap: 5,
        width: '100%'
    },
    reloadText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold'
    },
    // ESTILOS DEL EMULADOR (MOBILE)
    emulatorWrapper: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundImage: 'radial-gradient(circle at center, #2a2a2a 0%, #1a1a1a 100%)',
    },
    phoneDevice: {
        width: 351, // 10% smaller than 390
        height: 760, // 10% smaller than 844
        backgroundColor: '#000',
        borderRadius: 40,
        padding: 12,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 0 0 2px #444',
        position: 'relative',
        overflow: 'hidden'
    },
    phoneNotch: {
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 120,
        height: 25,
        backgroundColor: '#000',
        borderBottomLeftRadius: 15,
        borderBottomRightRadius: 15,
        zIndex: 10
    },
    startOverlay: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30
    },
    startLogo: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    startTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: '#111',
        marginBottom: 30,
        textAlign: 'center'
    },
    startBtn: {
        paddingHorizontal: 30,
        paddingVertical: 15,
        borderRadius: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 5
    },
    startBtnText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold'
    },
    startHint: {
        marginTop: 20,
        fontSize: 12,
        color: '#888',
        fontStyle: 'italic'
    }
});
