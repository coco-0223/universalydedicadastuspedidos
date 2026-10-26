import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useAppContext } from '../../../src/context/AppContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';

export default function ScanQAHiddenScreen() {
    const { user, setUser, businessProfile } = useAppContext();
    const [scanned, setScanned] = useState(false);
    const [loading, setLoading] = useState(false);

    // Acá iría la lógica oficial con expo-camera para escanear
    // function handleBarCodeScanned({ type, data }) { ...

    const mockScanQR = async () => {
        if (!user || user.id === 'guest') {
            Alert.alert("Error", "Necesitas estar registrado para sumar puntos.");
            return;
        }

        setScanned(true);
        setLoading(true);

        try {
            const userRef = doc(db, 'users', user.id);
            const userSnap = await getDoc(userRef);
            
            let currentPoints = 0;
            if (userSnap.exists()) {
                currentPoints = userSnap.data().scanPoints || 0;
            }

            const newPoints = currentPoints + 1;
            
            // Update Firestore
            await updateDoc(userRef, {
                scanPoints: newPoints
            });

            // Update local Context
            setUser({ ...user, scanPoints: newPoints });

            Alert.alert(
                "¡Éxito!", 
                `Has escaneado tu código en la sucursal de ${businessProfile.name}.\n\nTienes ${newPoints} punto(s) acumulados para el sorteo mensual. ¡Suerte!`
            );
        } catch (error) {
            console.error("Error al sumar punto:", error);
            Alert.alert("Error", "No pudimos registrar tu escaneo en este momento.");
            setScanned(false);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Escanear QR Promocional</Text>
            <Text style={styles.subtitle}>
                Encontrá el código en la caja del local y presiona escanear para sumar chances en el sorteo mensual.
            </Text>

            <View style={styles.cameraBoxPlaceholder}>
                <Text style={styles.placeholderText}>
                    {scanned ? "Escaneo registrado ✅" : "[Visor de Cámara Apagado - En Desarrollo]"}
                </Text>
            </View>

            <Pressable 
                style={[styles.scanBtn, { backgroundColor: businessProfile.primaryColor }, loading && { opacity: 0.7 }]}
                onPress={mockScanQR}
                disabled={scanned || loading}
            >
                <Text style={styles.scanBtnText}>
                    {loading ? "Procesando..." : (scanned ? "Código Escaneado" : "Simular Escaneo (Prueba)")}
                </Text>
            </Pressable>

            {user && user.scanPoints !== undefined && (
                <Text style={styles.pointsStatus}>
                    Tus chances actuales para el sorteo: {user.scanPoints}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 20,
        justifyContent: 'center',
        alignItems: 'center'
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#111',
        marginBottom: 10,
        textAlign: 'center'
    },
    subtitle: {
        fontSize: 15,
        color: '#555',
        textAlign: 'center',
        marginBottom: 30,
        paddingHorizontal: 10
    },
    cameraBoxPlaceholder: {
        width: 250,
        height: 250,
        borderWidth: 2,
        borderColor: '#333',
        borderRadius: 20,
        borderStyle: 'dashed',
        backgroundColor: '#f8f9fa',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40
    },
    placeholderText: {
        color: '#888',
        fontSize: 13,
        textAlign: 'center',
        fontWeight: 'bold'
    },
    scanBtn: {
        paddingVertical: 15,
        paddingHorizontal: 40,
        borderRadius: 12,
        alignItems: 'center'
    },
    scanBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    },
    pointsStatus: {
        marginTop: 30,
        fontSize: 16,
        fontWeight: '800',
        color: '#ea580c'
    }
});
