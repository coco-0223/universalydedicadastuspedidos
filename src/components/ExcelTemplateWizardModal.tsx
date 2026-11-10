import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable, ScrollView, TextInput, Alert, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import * as XLSX from 'xlsx';

interface ExcelTemplateWizardModalProps {
    visible: boolean;
    onClose: () => void;
    existingCategories: string[];
}

export const ExcelTemplateWizardModal: React.FC<ExcelTemplateWizardModalProps> = ({
    visible,
    onClose,
    existingCategories
}) => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [categories, setCategories] = useState<string[]>(
        existingCategories && existingCategories.length > 0 
            ? existingCategories.filter(c => !['ofertas', 'promos', 'promociones'].includes(c.toLowerCase()))
            : ['Vacuno', 'Pollo', 'Cerdo', 'Embutidos']
    );
    const [newCatInput, setNewCatInput] = useState('');
    const [promoWarning, setPromoWarning] = useState<string | null>(null);

    const handleAddCategory = () => {
        const trimmed = newCatInput.trim();
        if (!trimmed) return;
        
        const low = trimmed.toLowerCase();
        if (low.includes('promo') || low.includes('oferta')) {
            setPromoWarning('¡Ojo! Te sugerimos no crear la categoría "' + trimmed + '". En TusPedidos las promociones y combos tienen su propio sistema automatizado con contador y badges destacados 😉');
        } else {
            setPromoWarning(null);
        }

        if (!categories.some(c => c.toLowerCase() === low)) {
            setCategories([...categories, trimmed]);
        }
        setNewCatInput('');
    };

    const handleRemoveCategory = (catToRemove: string) => {
        setCategories(categories.filter(c => c !== catToRemove));
    };

    const handleDownloadExcel = () => {
        const cleanCats = categories.length > 0 ? categories : ['General'];
        const aoa: any[][] = [];

        // Fila 1: Grupos
        const h1 = ['OFERTAS DEL DÍA / EFECTIVO', ''];
        cleanCats.forEach(c => {
            h1.push('', c.toUpperCase(), '', '');
        });
        aoa.push(h1);

        // Fila 2: Subtítulos de columnas
        const h2 = ['Producto / Oferta', 'Precio Oferta ($)'];
        cleanCats.forEach(() => {
            h2.push('', 'Producto', 'Precio ($)', 'Unidad (kg/u/pieza/l)');
        });
        aoa.push(h2);

        // Fila 3 y 4: Ejemplos claros según las reglas
        const r3 = ['Carne Picada x 2kg', '8000'];
        cleanCats.forEach((c, idx) => {
            if (idx === 0) r3.push('', 'Carne Picada', '5000', 'kg');
            else if (idx === 1) r3.push('', 'Pata y Muslo', '3500', 'kg');
            else if (idx === 2) r3.push('', 'Chorizo Bombón', '4500', 'kg');
            else r3.push('', 'Ejemplo Producto', '1200', 'u');
        });
        aoa.push(r3);

        const r4 = ['Asado x 3kg', '25000'];
        cleanCats.forEach((c, idx) => {
            if (idx === 0) r4.push('', 'Asado de Tira', '9500', 'kg');
            else if (idx === 1) r4.push('', 'Suprema de Pollo', '7500', 'kg');
            else r4.push('', '', '', '');
        });
        aoa.push(r4);

        // Filas vacías listas para completar
        for (let i = 0; i < 20; i++) {
            const emptyRow = ['', ''];
            cleanCats.forEach(() => {
                emptyRow.push('', '', '', '');
            });
            aoa.push(emptyRow);
        }

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Precios');
        XLSX.writeFile(wb, 'Plantilla_TusPedidos.xlsx');
        onClose();
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.modalBg}>
                <View style={styles.modalCard}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 20 }}>📊</Text>
                            <Text style={styles.title}>Plantilla Inteligente</Text>
                        </View>
                        <Pressable onPress={onClose} style={{ padding: 4 }}>
                            <FontAwesome name="times" size={18} color="#64748b" />
                        </Pressable>
                    </View>

                    {/* Step indicator */}
                    <View style={styles.stepsBar}>
                        <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]}>
                            <Text style={[styles.stepDotText, step >= 1 && styles.stepDotTextActive]}>1</Text>
                        </View>
                        <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
                        <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]}>
                            <Text style={[styles.stepDotText, step >= 2 && styles.stepDotTextActive]}>2</Text>
                        </View>
                        <View style={[styles.stepLine, step >= 3 && styles.stepLineActive]} />
                        <View style={[styles.stepDot, step >= 3 && styles.stepDotActive]}>
                            <Text style={[styles.stepDotText, step >= 3 && styles.stepDotTextActive]}>3</Text>
                        </View>
                    </View>

                    {/* STEP 1: Bienvenida y Reglas de Oro */}
                    {step === 1 && (
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                            <Text style={styles.sectionSubtitle}>
                                Para que te sea mucho más cómodo actualizar tus precios desde el celular o la compu, te preparamos una plantilla a medida.
                            </Text>

                            <View style={styles.calloutCard}>
                                <Text style={styles.calloutTitle}>💡 3 Consejos Clave para que quede impecable:</Text>
                                
                                <View style={styles.tipItem}>
                                    <Text style={styles.tipBullet}>1.</Text>
                                    <Text style={styles.tipText}>
                                        <Text style={{ fontWeight: 'bold' }}>Nombres limpios y directos: </Text>
                                        Poné nombres claros (ej. <Text style={{ fontStyle: 'italic' }}>"Carne Picada"</Text>, <Text style={{ fontStyle: 'italic' }}>"Asado"</Text>). No pongas el peso o los kilos adentro del nombre porque el sistema lo limpia y capitaliza solo.
                                    </Text>
                                </View>

                                <View style={styles.tipItem}>
                                    <Text style={styles.tipBullet}>2.</Text>
                                    <Text style={styles.tipText}>
                                        <Text style={{ fontWeight: 'bold' }}>No dupliques productos por peso: </Text>
                                        No crees <Text style={{ textDecorationLine: 'line-through' }}>"Carne Picada 1kg $5000"</Text> y <Text style={{ textDecorationLine: 'line-through' }}>"Carne Picada 2kg $8000"</Text>. El producto base es "Carne Picada", y el descuento por 2kg o 3kg se aplica en la columna de ofertas o por volumen.
                                    </Text>
                                </View>

                                <View style={styles.tipItem}>
                                    <Text style={styles.tipBullet}>3.</Text>
                                    <Text style={styles.tipText}>
                                        <Text style={{ fontWeight: 'bold' }}>No crees la categoría "PROMOS": </Text>
                                        Nuestra app ya cuenta con un modo automático de promociones con contador y badges destacados 😉.
                                    </Text>
                                </View>
                            </View>

                            <Pressable style={styles.primaryBtn} onPress={() => setStep(2)}>
                                <Text style={styles.primaryBtnText}>Continuar: Mis Categorías →</Text>
                            </Pressable>
                        </ScrollView>
                    )}

                    {/* STEP 2: Definición de Categorías */}
                    {step === 2 && (
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                            <Text style={styles.sectionSubtitle}>
                                ¿Qué categorías querés en tu negocio? Permiten que tus clientes encuentren rápido lo que buscan.
                            </Text>

                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 8 }}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Nueva categoría (ej: Vacuno, Bebidas)..."
                                    value={newCatInput}
                                    onChangeText={setNewCatInput}
                                    onSubmitEditing={handleAddCategory}
                                />
                                <Pressable style={styles.addBtn} onPress={handleAddCategory}>
                                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>+ Agregar</Text>
                                </Pressable>
                            </View>

                            {promoWarning && (
                                <View style={styles.warningBox}>
                                    <Text style={styles.warningText}>{promoWarning}</Text>
                                </View>
                            )}

                            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 12, marginBottom: 8, fontWeight: 'bold' }}>
                                CATEGORÍAS ACTIVAS PARA EL EXCEL:
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                                {categories.map(c => (
                                    <View key={c} style={styles.catChip}>
                                        <Text style={styles.catChipText}>{c}</Text>
                                        <Pressable onPress={() => handleRemoveCategory(c)} style={{ padding: 2 }}>
                                            <FontAwesome name="times" size={12} color="#dc2626" />
                                        </Pressable>
                                    </View>
                                ))}
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                                <Pressable style={styles.secondaryBtn} onPress={() => setStep(1)}>
                                    <Text style={styles.secondaryBtnText}>← Atrás</Text>
                                </Pressable>
                                <Pressable 
                                    style={[styles.primaryBtn, { flex: 1 }]} 
                                    onPress={() => setStep(3)}
                                    disabled={categories.length === 0}
                                >
                                    <Text style={styles.primaryBtnText}>Ver Simulador de Excel →</Text>
                                </Pressable>
                            </View>
                        </ScrollView>
                    )}

                    {/* STEP 3: Simulador Visual ("Excel Codeado") & Descarga */}
                    {step === 3 && (
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 440 }}>
                            <Text style={styles.sectionSubtitle}>
                                Así quedará armada tu planilla con tus categorías personalizadas:
                            </Text>

                            {/* Simulador visual de Excel */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.excelSheetContainer}>
                                <View style={{ minWidth: 480 }}>
                                    {/* Encabezado Nivel 1 */}
                                    <View style={styles.excelHeaderRow}>
                                        <View style={[styles.excelCellHeaderGroup, { width: 170, backgroundColor: '#0284c7' }]}>
                                            <Text style={styles.excelHeaderGroupText}>OFERTAS / EFECTIVO</Text>
                                        </View>
                                        <View style={{ width: 10 }} />
                                        {categories.map((c, idx) => (
                                            <React.Fragment key={idx}>
                                                <View style={[styles.excelCellHeaderGroup, { width: 220, backgroundColor: '#059669' }]}>
                                                    <Text style={styles.excelHeaderGroupText}>{c.toUpperCase()}</Text>
                                                </View>
                                                <View style={{ width: 10 }} />
                                            </React.Fragment>
                                        ))}
                                    </View>

                                    {/* Encabezado Nivel 2 */}
                                    <View style={styles.excelHeaderRow}>
                                        <View style={[styles.excelCellHeader, { width: 100 }]}><Text style={styles.excelHeaderText}>Oferta</Text></View>
                                        <View style={[styles.excelCellHeader, { width: 70 }]}><Text style={styles.excelHeaderText}>Precio</Text></View>
                                        <View style={{ width: 10 }} />
                                        {categories.map((_, idx) => (
                                            <React.Fragment key={idx}>
                                                <View style={[styles.excelCellHeader, { width: 100 }]}><Text style={styles.excelHeaderText}>Producto</Text></View>
                                                <View style={[styles.excelCellHeader, { width: 60 }]}><Text style={styles.excelHeaderText}>Precio</Text></View>
                                                <View style={[styles.excelCellHeader, { width: 60 }]}><Text style={styles.excelHeaderText}>Unidad</Text></View>
                                                <View style={{ width: 10 }} />
                                            </React.Fragment>
                                        ))}
                                    </View>

                                    {/* Filas de ejemplo simuladas */}
                                    <View style={styles.excelRow}>
                                        <View style={[styles.excelCell, { width: 100 }]}><Text style={styles.excelCellText}>Picada x 2kg</Text></View>
                                        <View style={[styles.excelCell, { width: 70 }]}><Text style={[styles.excelCellText, { color: '#0284c7', fontWeight: 'bold' }]}>$8000</Text></View>
                                        <View style={{ width: 10 }} />
                                        {categories.map((_, idx) => (
                                            <React.Fragment key={idx}>
                                                <View style={[styles.excelCell, { width: 100 }]}><Text style={styles.excelCellText}>{idx === 0 ? 'Carne Picada' : 'Ejemplo'}</Text></View>
                                                <View style={[styles.excelCell, { width: 60 }]}><Text style={styles.excelCellText}>$5000</Text></View>
                                                <View style={[styles.excelCell, { width: 60 }]}><Text style={[styles.excelCellText, { color: '#64748b' }]}>kg</Text></View>
                                                <View style={{ width: 10 }} />
                                            </React.Fragment>
                                        ))}
                                    </View>

                                    <View style={[styles.excelRow, { backgroundColor: '#f8fafc' }]}>
                                        <View style={[styles.excelCell, { width: 100 }]}><Text style={styles.excelCellText}>Asado x 3kg</Text></View>
                                        <View style={[styles.excelCell, { width: 70 }]}><Text style={[styles.excelCellText, { color: '#0284c7', fontWeight: 'bold' }]}>$25000</Text></View>
                                        <View style={{ width: 10 }} />
                                        {categories.map((_, idx) => (
                                            <React.Fragment key={idx}>
                                                <View style={[styles.excelCell, { width: 100 }]}><Text style={styles.excelCellText}>{idx === 0 ? 'Asado de Tira' : 'Ejemplo 2'}</Text></View>
                                                <View style={[styles.excelCell, { width: 60 }]}><Text style={styles.excelCellText}>$9500</Text></View>
                                                <View style={[styles.excelCell, { width: 60 }]}><Text style={[styles.excelCellText, { color: '#64748b' }]}>kg</Text></View>
                                                <View style={{ width: 10 }} />
                                            </React.Fragment>
                                        ))}
                                    </View>
                                </View>
                            </ScrollView>

                            <View style={styles.summaryBox}>
                                <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '600' }}>
                                    ✓ Las columnas tienen tus categorías rotuladas.
                                </Text>
                                <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '600', marginTop: 4 }}>
                                    ✓ La columna 'Unidad' te permite elegir <Text style={{ fontWeight: 'bold' }}>kg, unidad, pieza o litro</Text>.
                                </Text>
                                <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '600', marginTop: 4 }}>
                                    ✓ Al subirlo, tus productos quedarán automáticamente capitalizados y prolijos.
                                </Text>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                                <Pressable style={styles.secondaryBtn} onPress={() => setStep(2)}>
                                    <Text style={styles.secondaryBtnText}>← Categorías</Text>
                                </Pressable>
                                <Pressable style={[styles.downloadBtn, { flex: 1 }]} onPress={handleDownloadExcel}>
                                    <FontAwesome name="download" size={15} color="#fff" style={{ marginRight: 6 }} />
                                    <Text style={styles.downloadBtnText}>Descargar Excel (.xlsx)</Text>
                                </Pressable>
                            </View>
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalBg: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12
    },
    modalCard: {
        width: '100%',
        maxWidth: 500,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 8
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0f172a'
    },
    stepsBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16
    },
    stepDot: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center'
    },
    stepDotActive: {
        backgroundColor: '#0284c7'
    },
    stepDotText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#64748b'
    },
    stepDotTextActive: {
        color: '#fff'
    },
    stepLine: {
        width: 40,
        height: 3,
        backgroundColor: '#e2e8f0',
        marginHorizontal: 4
    },
    stepLineActive: {
        backgroundColor: '#0284c7'
    },
    sectionSubtitle: {
        fontSize: 13,
        color: '#475569',
        lineHeight: 18,
        marginBottom: 12
    },
    calloutCard: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 16
    },
    calloutTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 10
    },
    tipItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginBottom: 8
    },
    tipBullet: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#0284c7'
    },
    tipText: {
        fontSize: 12,
        color: '#334155',
        lineHeight: 17,
        flex: 1
    },
    input: {
        flex: 1,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 15,
        color: '#0f172a'
    },
    addBtn: {
        backgroundColor: '#0284c7',
        paddingHorizontal: 14,
        justifyContent: 'center',
        borderRadius: 8
    },
    warningBox: {
        backgroundColor: '#fffbeb',
        borderWidth: 1,
        borderColor: '#fde68a',
        borderRadius: 8,
        padding: 10,
        marginTop: 6
    },
    warningText: {
        fontSize: 12,
        color: '#b45309',
        lineHeight: 16
    },
    catChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#cbd5e1'
    },
    catChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1e293b'
    },
    excelSheetContainer: {
        backgroundColor: '#fff',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        padding: 8,
        marginBottom: 14
    },
    excelHeaderRow: {
        flexDirection: 'row',
        marginBottom: 4
    },
    excelCellHeaderGroup: {
        paddingVertical: 5,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center'
    },
    excelHeaderGroupText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold'
    },
    excelCellHeader: {
        backgroundColor: '#f1f5f9',
        borderWidth: 0.5,
        borderColor: '#cbd5e1',
        paddingVertical: 4,
        paddingHorizontal: 6,
        alignItems: 'center'
    },
    excelHeaderText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#475569'
    },
    excelRow: {
        flexDirection: 'row',
        marginBottom: 2
    },
    excelCell: {
        borderWidth: 0.5,
        borderColor: '#e2e8f0',
        paddingVertical: 4,
        paddingHorizontal: 6
    },
    excelCellText: {
        fontSize: 11,
        color: '#1e293b'
    },
    summaryBox: {
        backgroundColor: '#f0fdf4',
        borderWidth: 1,
        borderColor: '#bbf7d0',
        borderRadius: 10,
        padding: 12,
        marginBottom: 14
    },
    primaryBtn: {
        backgroundColor: '#0284c7',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center'
    },
    primaryBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14
    },
    secondaryBtn: {
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center'
    },
    secondaryBtnText: {
        color: '#475569',
        fontWeight: 'bold',
        fontSize: 13
    },
    downloadBtn: {
        backgroundColor: '#10b981',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10
    },
    downloadBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14
    }
});
