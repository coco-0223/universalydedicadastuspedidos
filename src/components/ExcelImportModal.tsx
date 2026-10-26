import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { Product } from '../types';
import { parseRocioExcelData, getExcelRows, parseRocioExcelRows, ParsedExcelItem, normalizeName, DEFAULT_ROCIO_ALIASES, stripQuantitiesFromName } from '../utils/excelParser';

interface ExcelImportModalProps {
    visible: boolean;
    onClose: () => void;
    existingProducts: Product[];
    onApplyImport: (importedProducts: Product[], updatedAliases: { productId: string; alias: string }[], rawRows?: any[][]) => void;
}

interface ItemResolution {
    item: ParsedExcelItem;
    action: 'create' | string; // 'create' or existing productId
    unitType: 'kg' | 'unit' | 'piece';
    minQty: number;
    approxWeight?: number;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
    visible,
    onClose,
    existingProducts,
    onApplyImport
}) => {
    const [step, setStep] = useState<'upload' | 'resolve' | 'preview'>('upload');
    const [loading, setLoading] = useState(false);
    const [treatColABAsCashOffers, setTreatColABAsCashOffers] = useState(true);
    const [parsedItems, setParsedItems] = useState<ParsedExcelItem[]>([]);
    const [resolutions, setResolutions] = useState<ItemResolution[]>([]);
    const [fileName, setFileName] = useState<string>('');
    const [rawRows, setRawRows] = useState<any[][]>([]);
    const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});

    const handleFileSelect = (event: any) => {
        const file = event.target?.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setLoading(true);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const buffer = e.target?.result as ArrayBuffer;
                const rows = getExcelRows(buffer);
                setRawRows(rows);
                const items = parseRocioExcelRows(rows, { treatColABAsCashOffers });
                setParsedItems(items);

                // Auto-resolve matches
                const initialResolutions: ItemResolution[] = items.map(item => {
                    const normRaw = normalizeName(item.rawName);
                    
                    // Match by default alias, exact name, excelMappingName or stripped quantity name
                    const strippedRaw = stripQuantitiesFromName(item.rawName);
                    const defaultAliasMatch = (DEFAULT_ROCIO_ALIASES[normRaw] || DEFAULT_ROCIO_ALIASES[strippedRaw]) 
                        ? normalizeName(DEFAULT_ROCIO_ALIASES[normRaw] || DEFAULT_ROCIO_ALIASES[strippedRaw]) 
                        : '';

                    const matched = existingProducts.find(p => {
                        const normPName = normalizeName(p.name);
                        const normMapping = p.excelMappingName ? normalizeName(p.excelMappingName) : '';
                        const strippedPName = stripQuantitiesFromName(p.name);
                        
                        return normPName === normRaw || 
                               (normMapping !== '' && normMapping === normRaw) ||
                               (defaultAliasMatch !== '' && normPName === defaultAliasMatch) ||
                               (strippedRaw !== '' && (normPName === strippedRaw || strippedPName === strippedRaw)) ||
                               (defaultAliasMatch !== '' && strippedPName === defaultAliasMatch);
                    });

                    return {
                        item,
                        action: matched ? matched.id : 'create',
                        unitType: matched?.unitType || item.unitType || 'kg',
                        minQty: item.dailyOfferMinQty || matched?.dailyOfferMinQty || 1,
                        approxWeight: matched?.approxWeight
                    };
                });

                setResolutions(initialResolutions);

                // If there are unmapped items, go to resolve step, otherwise preview
                const hasUnmapped = initialResolutions.some(r => r.action === 'create');
                if (hasUnmapped) {
                    setStep('resolve');
                } else {
                    setStep('preview');
                }
            } catch (err) {
                console.error("Error parsing Excel:", err);
                alert("Error al leer el archivo Excel. Asegúrate de que sea un archivo .xlsx válido.");
            } finally {
                setLoading(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleActionChange = (index: number, newAction: string) => {
        const updated = [...resolutions];
        updated[index].action = newAction;
        // If linked to existing product, adopt its unitType and approxWeight if present
        if (newAction !== 'create') {
            const target = existingProducts.find(p => p.id === newAction);
            if (target) {
                if (target.unitType) updated[index].unitType = target.unitType;
                if (target.approxWeight) updated[index].approxWeight = target.approxWeight;
                if (target.dailyOfferMinQty && target.dailyOfferMinQty > 1) updated[index].minQty = target.dailyOfferMinQty;
            }
        }
        setResolutions(updated);
    };

    const handleUnitTypeChange = (index: number, newUnitType: 'kg' | 'unit') => {
        const updated = [...resolutions];
        updated[index].unitType = newUnitType;
        setResolutions(updated);
    };

    const handleMinQtyChange = (index: number, newQty: number) => {
        const updated = [...resolutions];
        updated[index].minQty = Math.max(1, newQty);
        setResolutions(updated);
    };

    const handleApproxWeightChange = (index: number, weight: number) => {
        const updated = [...resolutions];
        updated[index].approxWeight = weight > 0 ? weight : undefined;
        setResolutions(updated);
    };

    const handleConfirmImport = () => {
        // Clear daily offer flags first. Items still in col AB will get them set back to true below.
        const nextProducts: Product[] = existingProducts.map(p => ({
            ...p,
            isDailyOffer: false,
            dailyOfferPrice: undefined,
            dailyOfferMinQty: undefined
        }));
        const updatedAliases: { productId: string; alias: string }[] = [];

        resolutions.forEach(({ item, action, unitType, minQty, approxWeight }) => {
            if (action === 'create') {
                // Crear nuevo producto borrador con el flag isRecentlyImported
                const newProd: Product = {
                    id: 'imp_' + Date.now().toString() + '_' + Math.random().toString(36).substring(2, 5),
                    name: item.rawName,
                    excelMappingName: item.rawName,
                    price: item.price,
                    description: 'Importado desde Excel',
                    imageUrl: '',
                    category: (item.category && item.category !== 'Ofertas del Día (Efectivo)') ? item.category : 'General',
                    available: true,
                    unitType: unitType || 'kg',
                    approxWeight: unitType === 'unit' ? approxWeight : undefined,
                    isDailyOffer: item.isDailyOffer || false,
                    dailyOfferPrice: item.dailyOfferPrice || item.price,
                    dailyOfferMinQty: minQty || item.dailyOfferMinQty || 1
                } as Product;
                (newProd as any).isRecentlyImported = true;
                nextProducts.push(newProd);
            } else {
                // Actualizar producto existente
                const targetIdx = nextProducts.findIndex(p => p.id === action);
                if (targetIdx !== -1) {
                    const current = nextProducts[targetIdx];
                    
                    // Si el nombre del Excel era diferente, recordamos el alias para siempre
                    if (current.name.toLowerCase() !== item.rawName.toLowerCase()) {
                        current.excelMappingName = item.rawName;
                        updatedAliases.push({ productId: current.id, alias: item.rawName });
                    }

                    current.unitType = unitType;
                    if (unitType === 'unit') {
                        current.approxWeight = approxWeight;
                    } else {
                        current.approxWeight = undefined;
                    }

                    if (item.isDailyOffer) {
                        current.isDailyOffer = true;
                        current.dailyOfferPrice = item.price;
                        current.dailyOfferMinQty = minQty || item.dailyOfferMinQty || 1;
                    } else {
                        current.price = item.price;
                        if (minQty > 1) {
                            current.dailyOfferMinQty = minQty;
                        }
                    }
                }
            }
        });

        onApplyImport(nextProducts, updatedAliases, rawRows);
        onClose();
    };

    const sortedExistingProducts = [...existingProducts].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>📥 Importación Inteligente de Excel</Text>
                        <Pressable onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>✕</Text>
                        </Pressable>
                    </View>

                    {step === 'upload' && (
                        <View style={styles.body}>
                            <Text style={styles.description}>
                                Sube la lista de precios en formato `.xlsx`. El sistema analizará la **Hoja 1**, excluirá ofertas de reventa y asociará automáticamente tus productos.
                            </Text>

                            <View style={styles.switchRow}>
                                <Text style={styles.switchLabel}>
                                    ¿Tratar columna AB como "Oferta del Día en Efectivo"?
                                </Text>
                                <Switch
                                    value={treatColABAsCashOffers}
                                    onValueChange={setTreatColABAsCashOffers}
                                    trackColor={{ false: '#d1d5db', true: '#22c55e' }}
                                />
                            </View>

                            <View style={styles.uploadArea}>
                                {loading ? (
                                    <ActivityIndicator size="large" color="#ef4444" />
                                ) : (
                                    <>
                                        <Text style={styles.uploadIcon}>📄</Text>
                                        <Text style={styles.uploadText}>
                                            {fileName ? `Archivo seleccionado: ${fileName}` : 'Haz clic para seleccionar el archivo Excel (.xlsx)'}
                                        </Text>
                                        <input
                                            type="file"
                                            accept=".xlsx, .xls"
                                            onChange={handleFileSelect}
                                            style={styles.fileInputHidden as any}
                                        />
                                    </>
                                )}
                            </View>
                        </View>
                    )}

                    {step === 'resolve' && (
                        <View style={styles.body}>
                            <Text style={styles.sectionSubtitle}>
                                ⚠️ Se detectaron productos en el Excel que no coinciden exactamente con tu catálogo actual.
                                ¿Deseas vincularlos a productos existentes (para memorizar la asociación) o crearlos como nuevos?
                            </Text>

                            <ScrollView style={styles.scrollList}>
                                {resolutions.map((res, idx) => (
                                    <View key={idx} style={[styles.resolveCard, res.action === 'create' && styles.resolveCardNew]}>
                                        <View style={styles.resolveItemInfo}>
                                            <Text style={styles.resolveItemName}>{res.item.rawName}</Text>
                                            <Text style={styles.resolveItemMeta}>
                                                Categoría: {res.item.category === 'Ofertas del Día (Efectivo)' ? 'General' : res.item.category} | Precio: ${res.item.price}
                                                {res.item.isDailyOffer ? ' (Oferta Efectivo)' : ''}
                                            </Text>
                                        </View>

                                        <View style={styles.resolveSelector}>
                                            <input
                                                type="text"
                                                placeholder="🔍 Buscar para vincular..."
                                                value={searchQueries[idx] || ''}
                                                onChange={(e) => {
                                                    const newQueries = { ...searchQueries };
                                                    newQueries[idx] = e.target.value;
                                                    setSearchQueries(newQueries);
                                                }}
                                                style={{ padding: 6, borderRadius: 6, borderColor: '#d1d5db', borderWidth: 1, fontSize: 13, backgroundColor: '#ffffff', marginBottom: 4, width: '100%', outline: 'none' } as any}
                                            />
                                            <select
                                                value={res.action}
                                                onChange={(e) => handleActionChange(idx, e.target.value)}
                                                style={styles.selectInput as any}
                                            >
                                                <option value="create">✨ [+] Crear como Producto Nuevo</option>
                                                <optgroup label="Vincular a producto existente:">
                                                    {sortedExistingProducts
                                                        .filter(p => !searchQueries[idx] || p.name.toLowerCase().includes(searchQueries[idx].toLowerCase()))
                                                        .map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name} ({p.category}) - ${p.price}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            </select>

                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151' }}>Venta:</Text>
                                                    <select
                                                        value={res.unitType}
                                                        onChange={(e) => handleUnitTypeChange(idx, e.target.value as 'kg' | 'unit')}
                                                        style={{ padding: 4, borderRadius: 6, borderColor: '#d1d5db', borderWidth: 1, fontSize: 12, backgroundColor: '#ffffff', cursor: 'pointer' } as any}
                                                    >
                                                        <option value="kg">⚖️ Por Kilo (Kg)</option>
                                                        <option value="unit">📦 Por Unidad (U.)</option>
                                                    </select>
                                                </View>

                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151' }}>Mínimo Oferta:</Text>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={res.minQty || 1}
                                                        onChange={(e) => handleMinQtyChange(idx, parseInt(e.target.value, 10) || 1)}
                                                        style={{ width: 50, padding: 4, borderRadius: 6, borderColor: '#d1d5db', borderWidth: 1, fontSize: 12, textAlign: 'center' } as any}
                                                    />
                                                    <Text style={{ fontSize: 12, color: '#6b7280' }}>{res.unitType === 'unit' ? 'u.' : 'kg'}</Text>
                                                </View>

                                                {res.unitType === 'unit' && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#059669' }}>Peso Aprox Pieza:</Text>
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            min="0.1"
                                                            placeholder="Ej: 10"
                                                            value={res.approxWeight || ''}
                                                            onChange={(e) => handleApproxWeightChange(idx, parseFloat(e.target.value) || 0)}
                                                            style={{ width: 65, padding: 4, borderRadius: 6, borderColor: '#059669', borderWidth: 1, fontSize: 12, textAlign: 'center' } as any}
                                                        />
                                                        <Text style={{ fontSize: 12, color: '#059669' }}>kg/u</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </ScrollView>

                            <View style={styles.footerRow}>
                                <Pressable style={styles.secondaryBtn} onPress={() => setStep('upload')}>
                                    <Text style={styles.secondaryBtnText}>Atrás</Text>
                                </Pressable>
                                <Pressable style={styles.primaryBtn} onPress={() => setStep('preview')}>
                                    <Text style={styles.primaryBtnText}>Continuar a Vista Previa ➔</Text>
                                </Pressable>
                            </View>
                        </View>
                    )}

                    {step === 'preview' && (
                        <View style={styles.body}>
                            <Text style={styles.sectionSubtitle}>
                                📊 Resumen de la Importación ({resolutions.length} ítems procesados):
                            </Text>

                            <ScrollView style={styles.scrollList}>
                                {resolutions.map((res, idx) => {
                                    const isNew = res.action === 'create';
                                    const linkedProd = existingProducts.find(p => p.id === res.action);

                                    return (
                                        <View key={idx} style={[styles.previewRow, isNew && styles.previewRowNew]}>
                                            <Text style={styles.previewBadge}>
                                                {isNew ? '✨ Nuevo' : '🔄 Actualizar'}
                                            </Text>
                                            <Text style={styles.previewName}>
                                                {isNew ? res.item.rawName : `Vincular a: ${linkedProd?.name}`}
                                            </Text>
                                            <Text style={styles.previewPrice}>
                                                ${res.item.price} {res.item.isDailyOffer ? '(Oferta Efectivo)' : ''}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </ScrollView>

                            <View style={styles.footerRow}>
                                <Pressable style={styles.secondaryBtn} onPress={() => setStep('resolve')}>
                                    <Text style={styles.secondaryBtnText}>Atrás</Text>
                                </Pressable>
                                <Pressable style={styles.primaryBtn} onPress={handleConfirmImport}>
                                    <Text style={styles.primaryBtnText}>🚀 Aplicar al Catálogo</Text>
                                </Pressable>
                            </View>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16
    },
    container: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        width: '100%',
        maxWidth: 720,
        maxHeight: '90%',
        padding: 24,
        boxShadow: '0px 10px 25px rgba(0, 0, 0, 0.2)'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        paddingBottom: 12
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827'
    },
    closeBtn: {
        padding: 6,
        borderRadius: 8,
        backgroundColor: '#f3f4f6'
    },
    closeBtnText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#4b5563'
    },
    body: {
        flex: 1
    },
    description: {
        fontSize: 14,
        color: '#4b5563',
        marginBottom: 16,
        lineHeight: 20
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f9fafb',
        padding: 12,
        borderRadius: 10,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb'
    },
    switchLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1f2937',
        flex: 1,
        marginRight: 12
    },
    uploadArea: {
        borderWidth: 2,
        borderColor: '#dc2626',
        borderStyle: 'dashed',
        borderRadius: 12,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fef2f2',
        position: 'relative',
        cursor: 'pointer'
    },
    uploadIcon: {
        fontSize: 40,
        marginBottom: 8
    },
    uploadText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#991b1b',
        textAlign: 'center'
    },
    fileInputHidden: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0,
        cursor: 'pointer',
        width: '100%',
        height: '100%'
    },
    sectionSubtitle: {
        fontSize: 14,
        color: '#374151',
        marginBottom: 12,
        fontWeight: '500'
    },
    scrollList: {
        maxHeight: 380,
        marginBottom: 16
    },
    resolveCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f9fafb',
        padding: 12,
        borderRadius: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#e5e7eb'
    },
    resolveItemInfo: {
        flex: 1,
        marginRight: 12
    },
    resolveItemName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#111827'
    },
    resolveItemMeta: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 2
    },
    resolveSelector: {
        width: 260
    },
    selectInput: {
        width: '100%',
        padding: 8,
        borderRadius: 8,
        borderColor: '#d1d5db',
        borderWidth: 1,
        fontSize: 13,
        backgroundColor: '#ffffff',
        cursor: 'pointer'
    },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6'
    },
    resolveCardNew: {
        backgroundColor: '#fff7ed',
        borderColor: '#fb923c',
        borderWidth: 1.5
    },
    previewRowNew: {
        backgroundColor: '#fff7ed',
        borderLeftWidth: 4,
        borderLeftColor: '#f97316'
    },
    previewBadge: {
        fontSize: 12,
        fontWeight: 'bold',
        marginRight: 12,
        width: 90
    },
    previewName: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
        color: '#111827'
    },
    previewPrice: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#dc2626'
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6'
    },
    primaryBtn: {
        backgroundColor: '#dc2626',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8
    },
    primaryBtnText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 14
    },
    secondaryBtn: {
        backgroundColor: '#f3f4f6',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8
    },
    secondaryBtnText: {
        color: '#4b5563',
        fontWeight: '600',
        fontSize: 14
    }
});

