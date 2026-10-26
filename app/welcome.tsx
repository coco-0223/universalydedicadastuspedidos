import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as SplashScreen from 'expo-splash-screen';
import { useAppContext } from '../src/context/AppContext';
import { businesses, IS_DEDICATED_APP, DEDICATED_OWNER_EMAILS } from '../src/data/mockData';
import { fetchBusinessByOwnerEmail } from '../src/services/businessService';

export default function Index() {
    const { isLoading, loadBusinessById, user } = useAppContext();
    const params = useLocalSearchParams();
    const storeCodeParam = params.store as string | undefined;

    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [splashFinished, setSplashFinished] = useState(false);
    const [isInitializingApp, setIsInitializingApp] = useState(true);

    // Initial check for Web links (e.g. ?store=pepito)
    useEffect(() => {
        const initializeWebStore = async () => {
            if (Platform.OS === 'web' && storeCodeParam) {
                try {
                    await loadBusinessById(storeCodeParam.toLowerCase().trim());
                    router.replace('/');
                } catch (e) {
                    setError('No se pudo encontrar el comercio asociado a este enlace.');
                    setIsInitializingApp(false);
                }
            } else {
                setIsInitializingApp(false);
            }
        };

        initializeWebStore();
    }, [storeCodeParam]);

    // Splash fail-safe for Dedicated App
    useEffect(() => {
        if (IS_DEDICATED_APP) {
            const timer = setTimeout(() => {
                setSplashFinished(true);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [IS_DEDICATED_APP]);

    // Hide static splash if it's universal app (since it won't render the video)
    useEffect(() => {
        if (!IS_DEDICATED_APP && Platform.OS !== 'web') {
             SplashScreen.hideAsync().catch(() => {});
        }
    }, [IS_DEDICATED_APP]);

    if (isInitializingApp) {
        return (
            <View style={[styles.container, { backgroundColor: '#fff', justifyContent: 'center' }]}>
                <Text style={{ textAlign: 'center', color: '#666' }}>Cargando catálogo...</Text>
            </View>
        );
    }

    // ========== REGLAS PARA WEBAPP ========== //
    if (Platform.OS === 'web') {
        if (isLoading) {
            return (
                <View style={[styles.container, { backgroundColor: '#fff', justifyContent: 'center' }]}>
                    <Text style={{ textAlign: 'center', color: '#666' }}>Cargando...</Text>
                </View>
            );
        }

        // If already logged in as business, redirect to admin directly
        if (user?.role === 'business') {
            return <Redirect href="/(business)/admin" />;
        }

        // Si es APP DEDICADA, en la web siempre va al catálogo (shop), no al panel de negocios
        if (IS_DEDICATED_APP) {
            return <Redirect href="/" />;
        }

        // If there's an error loading the store from the link, show the universal box so they can fix it, or just show error.
        // But if no store code in URL, allow them to enter it.
        
        // If there was an error with the link, we fallback to showing an error below
        if (error) {
            return (
                <View style={styles.container}>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Enlace Inválido</Text>
                        <Text style={styles.errorText}>{error}</Text>
                        <Pressable style={styles.button} onPress={() => router.replace('/business-auth')}>
                            <Text style={styles.buttonText}>Ir al Panel de Negocio</Text>
                        </Pressable>
                    </View>
                </View>
            );
        } // closes if (error)
    } // closes if (Platform.OS === 'web')

    // ========== REGLAS PARA APP MOVIL ========== //
    
    // Si es APP DEDICADA, vemos splash y entramos al local
    if (IS_DEDICATED_APP) {
        if (!splashFinished || isLoading) {
            return (
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    <Video
                        source={require('../assets/images/rocio-splash.gif.mp4')} 
                        style={{ flex: 1 }}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay
                        isLooping={false}
                        onReadyForDisplay={() => {
                            // Cuando el video empieza a pintar su primer frame, quitamos la pantalla estática
                            SplashScreen.hideAsync().catch(() => {});
                        }}
                        onPlaybackStatusUpdate={async (status) => {
                            if (status.isLoaded && status.didJustFinish) {
                                setSplashFinished(true);
                            }
                        }}
                    />
                </View>
            );
        }
        return <Redirect href="/" />;
    }



    // Si es APP UNIVERSAL (MeatMarket Native App), pedimos el código del local
    const handleEnterStore = async () => {
        if (!code.trim()) return;
        const lowerCode = code.toLowerCase().trim();
        try {
            await loadBusinessById(lowerCode);
            router.replace('/');
        } catch (e) {
            setError('No se pudo encontrar el comercio. Probá con "pepe" o "juan".');
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.logoText}>TusPedidos</Text>
                <Text style={styles.subtitle}>¡Tu catálogo digital en un click!</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Bienvenido a TusPedidos!</Text>
                <Text style={styles.cardDesc}>Escanea el código QR de tu local o entrá al link que te facilitaron!</Text>

                <TextInput
                    style={styles.input}
                    placeholder="O ingresá el código manual"
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="none"
                />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <Pressable style={styles.button} onPress={handleEnterStore}>
                    <Text style={styles.buttonText}>Entrar al local</Text>
                </Pressable>
            </View>
        </View>
    );
}


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f4f4f5',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    header: {
        alignItems: 'center',
        marginBottom: 40
    },
    logoText: {
        fontSize: 36,
        fontWeight: '900',
        color: '#18181b'
    },
    subtitle: {
        fontSize: 16,
        color: '#52525b',
        marginTop: 5,
        textAlign: 'center'
    },
    card: {
        backgroundColor: '#fff',
        width: '100%',
        maxWidth: 400,
        padding: 30,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5
    },
    cardTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#18181b',
        marginBottom: 10,
        textAlign: 'center'
    },
    cardDesc: {
        fontSize: 14,
        color: '#71717a',
        textAlign: 'center',
        marginBottom: 25
    },
    input: {
        backgroundColor: '#f4f4f5',
        padding: 15,
        borderRadius: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#e4e4e7',
        marginBottom: 15,
        textAlign: 'center',
        fontWeight: 'bold'
    },
    errorText: {
        color: '#ef4444',
        textAlign: 'center',
        marginBottom: 15,
        fontSize: 13,
        fontWeight: '600'
    },
    button: {
        backgroundColor: '#18181b',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center'
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    }
});
