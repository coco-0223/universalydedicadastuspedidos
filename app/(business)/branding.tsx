import React, { useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppContext } from '../../src/context/AppContext';

import { saveBusinessProfile } from '../../src/services/businessService';
import { ImagePickerPortal } from '../../src/components/ImagePickerPortal';

export default function BrandingScreen() {
    const { businessProfile, setBusinessProfile } = useAppContext();

    const [name, setName] = useState(businessProfile.name || '');
    const [description, setDescription] = useState(businessProfile.description || '');
    const [logoUrl, setLogoUrl] = useState(businessProfile.logoUrl || '');
    const [bannerUrl, setBannerUrl] = useState(businessProfile.bannerUrl || '');
    const [primaryColor, setPrimaryColor] = useState(businessProfile.primaryColor || '#10b981');

    const [showSuccess, setShowSuccess] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    
    const [pickerState, setPickerState] = useState<{ visible: boolean, target: 'logo' | 'banner' | null }>({ visible: false, target: null });

    const isDirty = useMemo(() => {
        return (
            name !== businessProfile.name ||
            description !== (businessProfile.description || '') ||
            logoUrl !== (businessProfile.logoUrl || '') ||
            bannerUrl !== (businessProfile.bannerUrl || '') ||
            primaryColor !== businessProfile.primaryColor
        );
    }, [name, description, logoUrl, bannerUrl, primaryColor, businessProfile]);

    const handleSave = async () => {
        if (!isDirty) return;

        const newProfile = {
            ...businessProfile,
            name,
            description,
            logoUrl,
            bannerUrl,
            primaryColor
        };

        try {
            await saveBusinessProfile(businessProfile.id, newProfile);
            setBusinessProfile(newProfile);

            setShowSuccess(true);
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.delay(2000),
                Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true })
            ]).start(() => {
                setShowSuccess(false);
            });
        } catch (error) {
            console.error("No se pudo guardar la configuración de diseño", error);
            if (Platform.OS === 'web') alert('Error guardando en la nube.');
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#f4f5f7' }}>
            <ScrollView style={[styles.container, { paddingBottom: 100 }]} contentContainerStyle={styles.content}>
                <Text style={styles.title}>Personalización & Branding</Text>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Identidad Básica</Text>
                    <Text style={styles.hint}>Información principal que verán los clientes cuando entren a tu tienda.</Text>
                    
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Nombre del Negocio:</Text>
                        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ej: Carnes Don Juan" />
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Descripción Corta:</Text>
                        <TextInput style={[styles.input, { height: 60 }]} value={description} onChangeText={setDescription} placeholder="Ej: La mejor carne de la ciudad" multiline numberOfLines={2} />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Imágenes y Logos</Text>
                    <Text style={styles.hint}>Para un aspecto más profesional, asegúrate de que tu logo sea cuadrado y el banner rectangular (horizontal).</Text>
                    
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>URL del Logo:</Text>
                        <View style={{ flexDirection: 'row', width: '100%', gap: 10, alignItems: 'center' }}>
                            <TextInput style={[styles.input, { flex: 1, width: 'auto' }]} value={logoUrl} onChangeText={setLogoUrl} placeholder="https://..." />
                            <Pressable 
                                style={{ padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8, borderWidth: 1, borderColor: '#ddd' }} 
                                onPress={() => setPickerState({ visible: true, target: 'logo' })}
                            >
                                <Text style={{ fontSize: 16 }}>📷 Subir</Text>
                            </Pressable>
                        </View>
                    </View>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>URL del Banner:</Text>
                        <View style={{ flexDirection: 'row', width: '100%', gap: 10, alignItems: 'center' }}>
                            <TextInput style={[styles.input, { flex: 1, width: 'auto' }]} value={bannerUrl} onChangeText={setBannerUrl} placeholder="https://..." />
                            <Pressable 
                                style={{ padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8, borderWidth: 1, borderColor: '#ddd' }} 
                                onPress={() => setPickerState({ visible: true, target: 'banner' })}
                            >
                                <Text style={{ fontSize: 16 }}>📷 Subir</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Colores de la Marca</Text>
                    <Text style={styles.hint}>Usa códigos Hexadecimales (ej: #FF0000 para rojo). Puedes usar colores que combinen con tu logo.</Text>
                    
                    <ColorPickerUI label="Color Principal" color={primaryColor} onChange={setPrimaryColor} required />
                </View>

                <View style={{ height: 120 }} />
            </ScrollView>

            <View style={styles.fixedFooter}>
                <Pressable
                    style={[styles.saveBtnFixed, !isDirty && styles.saveBtnFixedDisabled]}
                    onPress={handleSave}
                    disabled={!isDirty && !showSuccess}
                >
                    <Text style={[styles.saveBtnTextFixed, !isDirty && styles.saveBtnTextDisabled]}>Guardar Personalización</Text>
                </Pressable>

                {showSuccess && (
                    <Animated.View style={[styles.successToast, { opacity: fadeAnim }]}>
                        <Text style={styles.successToastText}>✅ Estilo guardado</Text>
                    </Animated.View>
                )}
            </View>

            {/* IMAGE PICKER PORTAL */}
            {pickerState.visible && (
                <ImagePickerPortal
                    visible={pickerState.visible}
                    businessId={businessProfile.id}
                    initialImageUrl={pickerState.target === 'logo' ? logoUrl : bannerUrl}
                    onUploadComplete={(url: string) => {
                        if (pickerState.target === 'logo') setLogoUrl(url);
                        if (pickerState.target === 'banner') setBannerUrl(url);
                        setPickerState({ visible: false, target: null });
                    }}
                    onCancel={() => setPickerState({ visible: false, target: null })}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f5f7' },
    content: { padding: 20 },
    title: { fontSize: 26, fontWeight: '800', marginBottom: 20, color: '#111' },
    section: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 5, color: '#333' },
    hint: { fontSize: 13, color: '#888', marginBottom: 15, fontStyle: 'italic' },
    inputRow: { flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', marginBottom: 15 },
    label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 5 },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, width: '100%', backgroundColor: '#fafafa' },
    inputShort: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, width: 120, backgroundColor: '#fafafa', textAlign: 'center', marginTop: 5 },
    
    colorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15, padding: 10, backgroundColor: '#f9f9f9', borderRadius: 8 },
    colorInputContainer: { flex: 1 },
    colorBox: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },

    fixedFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingVertical: 15, backgroundColor: 'rgba(255,255,255,0.9)', borderTopWidth: 1, borderTopColor: '#eaeaea', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 15 },
    saveBtnFixed: { backgroundColor: '#10b981', paddingVertical: 16, paddingHorizontal: 30, borderRadius: 12, width: '100%', maxWidth: 400, alignItems: 'center', shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6 },
    saveBtnFixedDisabled: { backgroundColor: '#1f2937', shadowColor: '#000', shadowOpacity: 0.1 },
    saveBtnTextFixed: { color: '#fff', fontSize: 16, fontWeight: '900' },
    saveBtnTextDisabled: { color: '#9ca3af' },

    successToast: { position: 'absolute', bottom: 80, backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, borderWidth: 1, borderColor: '#d1fae5' },
    successToastText: { color: '#059669', fontWeight: 'bold', fontSize: 14 }
});

const ColorPickerUI = ({ label, color, onChange, required }: { label: string, color: string, onChange: (c: string) => void, required?: boolean }) => {
    return (
        <View style={styles.colorRow}>
            <View style={styles.colorInputContainer}>
                <Text style={styles.label}>{label} {required ? '(Obligatorio)' : '(Opcional)'}:</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                    {Platform.OS === 'web' ? (
                        React.createElement('input', {
                            type: 'color',
                            value: color || '#10b981',
                            onChange: (e: any) => onChange(e.target.value),
                            style: { width: 44, height: 44, border: 'none', borderRadius: 22, cursor: 'pointer', padding: 0, backgroundColor: 'transparent' }
                        })
                    ) : (
                        <View style={[styles.colorBox, { backgroundColor: color || '#f1f1f1' }]} />
                    )}
                    <TextInput style={[styles.inputShort, { marginTop: 0 }]} value={color} onChangeText={onChange} placeholder="#000000" />
                </View>
            </View>
            {Platform.OS !== 'web' && (
                <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', maxWidth: 100 }}>
                    {['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#1f2937'].map(preset => (
                        <Pressable key={preset} onPress={() => onChange(preset)} style={[styles.colorBox, { width: 28, height: 28, borderRadius: 14, backgroundColor: preset }]} />
                    ))}
                </View>
            )}
        </View>
    );
};
