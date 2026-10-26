import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
const CropperModule = require('react-easy-crop/index.js');
const Cropper = CropperModule.default || CropperModule.Cropper || CropperModule;
import { uploadProductImage, uriToBlob, deleteProductImage, getCroppedImg } from '../services/storageService';

interface ImagePickerPortalProps {
  businessId: string;
  initialImageUrl?: string;
  onUploadComplete: (url: string) => void;
  onCancel: () => void;
  visible: boolean;
}

export const ImagePickerPortal: React.FC<ImagePickerPortalProps> = ({ businessId, initialImageUrl, onUploadComplete, onCancel, visible }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [editingMode, setEditingMode] = useState(false);
  
  // States for custom cropper
  const [cropURL, setCropURL] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPx: any) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  const handlePickNewImage = async (replaceExistent: boolean) => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        alert("¡Necesitamos permiso para acceder a tus fotos!");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false, // We use our custom cropper now
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const { uri } = result.assets[0];
        setCropURL(uri);
        setEditingMode(true);
      }
    } catch (error) {
      console.error("Picker error:", error);
      alert("Error al seleccionar la imagen.");
    }
  };

  const handleEditExisting = () => {
      if (initialImageUrl) {
          setCropURL(initialImageUrl);
          setEditingMode(true);
      }
  };

  const handleSaveCrop = async () => {
    if (!cropURL || !croppedAreaPixels) return;
    try {
        setIsUploading(true);
        // Generar blob del crop del canvas JS
        const blob = await getCroppedImg(cropURL, croppedAreaPixels);
        if (!blob) throw new Error("No se pudo procesar la imagen");

        // Subir nueva (recortada)
        const fileName = `prod_${Date.now()}_cropped.jpg`;
        const downloadUrl = await uploadProductImage(businessId, blob, fileName);

        // Si es una imagen que ya estaba en Firebase, la borramos para no acumular basura
        if (initialImageUrl) {
            await deleteProductImage(initialImageUrl);
        }

        onUploadComplete(downloadUrl);
    } catch(err) {
        console.error(err);
        alert("Ocurrió un error al recortar y guardar.");
    } finally {
        setIsUploading(false);
    }
  };

  const handleDeleteImage = async () => {
      if (!initialImageUrl) return;
      try {
          setIsUploading(true);
          await deleteProductImage(initialImageUrl);
          onUploadComplete(''); 
      } catch (err) {
          console.error(err);
          alert("Error al eliminar la imagen.");
      } finally {
          setIsUploading(false);
      }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>
              {editingMode ? "Recortar Imagen Existente" : (initialImageUrl ? "Gestión de Imagen" : "Subir Nueva Imagen (1:1)")}
          </Text>
          
          <View style={styles.container}>
            {isUploading ? (
              <View style={{ alignItems: 'center', padding: 40 }}>
                <ActivityIndicator color="#007AFF" size="large" />
                <Text style={{ marginTop: 15, color: '#555', fontWeight: 'bold' }}>Procesando en la nube...</Text>
              </View>
            ) : editingMode ? (
               // MODO: EDICION RECORTE 1:1 CON REACT-EASY-CROP
               <>
                    <View style={styles.cropperContainer}>
                        <Cropper
                            image={cropURL!}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            onCropChange={setCrop}
                            onCropComplete={onCropComplete}
                            onZoomChange={setZoom}
                        />
                    </View>
                    <View style={styles.controls}>
                        <Text style={styles.zoomLabel}>Zoom: {zoom.toFixed(1)}x</Text>
                        <input 
                            type="range" 
                            value={zoom} 
                            min={1} 
                            max={3} 
                            step={0.1} 
                            onChange={(e) => setZoom(Number(e.target.value))} 
                            style={{ width: '100%', cursor: 'pointer' }}
                        />
                    </View>

                    <View style={styles.footer}>
                        <Pressable style={styles.cancelBtn} onPress={() => setEditingMode(false)}>
                            <Text style={styles.cancelBtnText}>Volver</Text>
                        </Pressable>
                        <Pressable style={styles.confirmBtn} onPress={handleSaveCrop}>
                            <Text style={styles.confirmBtnText}>Guardar Recorte</Text>
                        </Pressable>
                    </View>
               </>
            ) : initialImageUrl ? (
               // MODO: MENU PARA IMAGEN EXISTENTE
               <View style={{ gap: 15, width: '100%' }}>
                  <Text style={{ textAlign: 'center', color: '#666', marginBottom: 10 }}>¿Qué querés hacer con esta imagen?</Text>
                  
                  <Pressable style={[styles.menuBtn, { backgroundColor: '#F0F0FF', borderColor: '#007AFF' }]} onPress={handleEditExisting}>
                      <Text style={[styles.menuBtnText, { color: '#007AFF' }]}>✂️ Editar imagen (Zoom y encuadre)</Text>
                  </Pressable>
                  
                  <Pressable style={[styles.menuBtn, { backgroundColor: '#F0FFF0', borderColor: '#34C759' }]} onPress={() => handlePickNewImage(true)}>
                      <Text style={[styles.menuBtnText, { color: '#34C759' }]}>🔄 Reemplazar imagen</Text>
                  </Pressable>

                  <Pressable style={[styles.menuBtn, { backgroundColor: '#FFF0F0', borderColor: '#FF3B30' }]} onPress={handleDeleteImage}>
                      <Text style={[styles.menuBtnText, { color: '#FF3B30' }]}>🗑️ Eliminar imagen</Text>
                  </Pressable>

                  <Pressable style={[styles.menuBtn, { backgroundColor: '#fff', borderColor: '#ccc', marginTop: 15 }]} onPress={onCancel}>
                      <Text style={styles.menuBtnText}>⬅️ Volver / Cancelar</Text>
                  </Pressable>
               </View>
            ) : (
               // MODO: SUBIR NUEVA IMAGEN
               <View style={{ alignItems: 'center', gap: 20 }}>
                  <Text style={styles.info}>
                    Seleccioná una imagen. Se abrirá el editor nativo para que puedas encuadrarla (formato cuadrado 1:1) y la app se encargará de comprimirla automáticamente.
                  </Text>
                  <View style={styles.footer}>
                     <Pressable style={styles.cancelBtn} onPress={onCancel}>
                        <Text style={styles.cancelBtnText}>Cancelar</Text>
                     </Pressable>
                     <Pressable style={styles.confirmBtn} onPress={() => handlePickNewImage(false)}>
                        <Text style={styles.confirmBtnText}>📸 Seleccionar y Recortar</Text>
                     </Pressable>
                  </View>
               </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: 450, maxWidth: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 25 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  container: { alignItems: 'center', paddingVertical: 10 },
  info: { textAlign: 'center', color: '#666', marginBottom: 10, fontSize: 14, paddingHorizontal: 10, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 10, width: '100%', marginTop: 20 },
  cancelBtn: { padding: 15, backgroundColor: '#eee', borderRadius: 12, flex: 1, alignItems: 'center' },
  cancelBtnText: { color: '#555', fontWeight: 'bold' },
  confirmBtn: { padding: 15, backgroundColor: '#007AFF', borderRadius: 12, flex: 2, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: 'bold' },
  
  menuBtn: { paddingVertical: 18, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center', width: '100%' },
  menuBtnText: { fontWeight: 'bold', fontSize: 16, color: '#444' },

  cropperContainer: { height: 350, width: '100%', position: 'relative', backgroundColor: '#333', borderRadius: 12, overflow: 'hidden' },
  controls: { paddingVertical: 15, width: '100%' },
  zoomLabel: { fontSize: 13, color: '#666', marginBottom: 5, fontWeight: 'bold' }
});
