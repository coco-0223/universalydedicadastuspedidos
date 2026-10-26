import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Platform } from 'react-native';
import { parseRocioExcelRows } from '../utils/excelParser';

interface Props {
    visible: boolean;
    onClose: () => void;
    initialRows: any[][];
    onSaveAndSync: (newRows: any[][], parsedProducts: any[]) => Promise<void>;
}

export const SuperadminRawExcelEditor: React.FC<Props> = ({ visible, onClose, initialRows, onSaveAndSync }) => {
    const [rows, setRows] = useState<any[][]>(initialRows);
    const [isSaving, setIsSaving] = useState(false);

    const handleCellChange = (rowIndex: number, colIndex: number, val: string) => {
        const newRows = [...rows];
        newRows[rowIndex] = [...(newRows[rowIndex] || [])];
        newRows[rowIndex][colIndex] = val;
        setRows(newRows);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const parsedItems = parseRocioExcelRows(rows, { treatColABAsCashOffers: true });
            await onSaveAndSync(rows, parsedItems);
            onClose();
        } catch (e) {
            console.error(e);
            alert("Error al sincronizar");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.modalBg}>
                <View style={styles.modalCard}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Editor Raw Excel (Superadmin)</Text>
                        <Pressable style={styles.closeBtn} onPress={onClose}>
                            <Text style={styles.closeBtnText}>Cerrar</Text>
                        </Pressable>
                    </View>
                    
                    <ScrollView style={{ flex: 1 }} horizontal>
                        <ScrollView style={{ flex: 1 }}>
                            <View style={{ padding: 10 }}>
                                {rows.map((row, rIdx) => (
                                    <View key={rIdx} style={styles.row}>
                                        <View style={styles.rowHeader}><Text>{rIdx + 1}</Text></View>
                                        {Array.from({ length: Math.max(row.length, 5) }).map((_, cIdx) => (
                                            <TextInput
                                                key={cIdx}
                                                style={styles.cell}
                                                value={row[cIdx] !== undefined && row[cIdx] !== null ? row[cIdx].toString() : ''}
                                                onChangeText={(val) => handleCellChange(rIdx, cIdx, val)}
                                            />
                                        ))}
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                    </ScrollView>

                    <View style={styles.footer}>
                        <Pressable style={styles.syncBtn} onPress={handleSave} disabled={isSaving}>
                            <Text style={styles.syncBtnText}>{isSaving ? 'Guardando...' : 'Guardar y Sincronizar'}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalCard: { width: '95%', height: '90%', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    title: { fontSize: 18, fontWeight: 'bold' },
    closeBtn: { padding: 5 },
    closeBtnText: { color: '#ef4444', fontWeight: 'bold', fontSize: 16 },
    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee' },
    rowHeader: { width: 40, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderRightColor: '#eee' },
    cell: { width: 120, minHeight: 40, padding: 5, borderRightWidth: 1, borderRightColor: '#eee', fontSize: 13, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) },
    footer: { padding: 15, borderTopWidth: 1, borderTopColor: '#eee', alignItems: 'flex-end' },
    syncBtn: { backgroundColor: '#10b981', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
    syncBtnText: { color: '#fff', fontWeight: 'bold' }
});
