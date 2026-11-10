import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable, ScrollView, Switch, ActivityIndicator, Alert, Platform } from 'react-native';
import { Product } from '../types';
import { 
    parseRocioExcelData, 
    getExcelRows, 
    parseRocioExcelRows, 
    ParsedExcelItem, 
    normalizeName, 
    DEFAULT_ROCIO_ALIASES, 
    stripQuantitiesFromName,
    cleanAndCapitalizeName 
} from '../utils/excelParser';

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
    cleanedName?: string;
}

interface DuplicateGroup {
    cleanName: string;
    category: string;
    items: {
        rawName: string;
        price: number;
        qty: number;
        unitType: string;
    }[];
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
    visible,
    onClose,
    existingProducts,
    onApplyImport
}) => {
    const [step, setStep] = useState<'upload' | 'unify_prompt' | 'resolve' | 'preview'>('upload');
    const [loading, setLoading] = useState(false);
    const [treatColABAsCashOffers, setTreatColABAsCashOffers] = useState(true);
    const [parsedItems, setParsedItems] = useState<ParsedExcelItem[]>([]);
    const [resolutions, setResolutions] = useState<ItemResolution[]>([]);
    const [fileName, setFileName] = useState<string>('');
    const [rawRows, setRawRows] = useState<any[][]>([]);
    const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
    
    // Unificación de duplicados por peso/cantidad
    const [detectedDuplicates, setDetectedDuplicates] = useState<DuplicateGroup[]>([]);
    const [shouldUnifyDuplicates, setShouldUnifyDuplicates] = useState<boolean>(true);

    const resetModal = () => {
        setStep('upload');
        setLoading(false);
        setParsedItems([]);
        setResolutions([]);
        setFileName('');
        setRawRows([]);
        setSearchQueries({});
        setDetectedDuplicates([]);
        setShouldUnifyDuplicates(true);
    };

    React.useEffect(() => {
        if (!visible) {
            resetModal();
        }
    }, [visible]);

    const handleClose = () => {
        resetModal();
        onClose();
    };

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
                console.log("📄 [Excel Import] Archivo cargado:", file.name, "| Total filas:", rows.length);
                const items = parseRocioExcelRows(rows, { treatColABAsCashOffers });
                console.log("🥩 [Excel Import] Ítems extraídos del Excel:", items.length, items);
                setParsedItems(items);

                // Detectar posibles duplicados por peso (ej: Picada 1kg y Picada 2kg)
                const dupMap = new Map<string, DuplicateGroup>();
                items.forEach(it => {
                    const cName = cleanAndCapitalizeName(it.rawName);
                    const key = cName.toLowerCase() + '__' + (it.category || '').toLowerCase();
                    if (!dupMap.has(key)) {
                        dupMap.set(key, { cleanName: cName, category: it.category, items: [] });
                    }
                    dupMap.get(key)!.items.push({
                        rawName: it.rawName,
                        price: it.price,
                        qty: it.dailyOfferMinQty || 0,
                        unitType: it.unitType || 'kg'
                    });
                });

                const foundDups = Array.from(dupMap.values()).filter(g => g.items.length > 1);
                setDetectedDuplicates(foundDups);

                // Preparar resoluciones iniciales
                buildResolutions(items);

                if (foundDups.length > 0) {
                    setStep('unify_prompt');
                } else {
                    const hasUnmapped = items.some(it => {
                        const norm = normalizeName(it.rawName);
                        return !existingProducts.some(p => normalizeName(p.name) === norm);
                    });
                    setStep(hasUnmapped ? 'resolve' : 'preview');
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

    const buildResolutions = (items: ParsedExcelItem[]) => {
        const initialResolutions: ItemResolution[] = items.map(item => {
            const normRaw = normalizeName(item.rawName);
            const cleaned = cleanAndCapitalizeName(item.rawName);
            const normCleaned = normalizeName(cleaned);
            
            const strippedRaw = stripQuantitiesFromName(item.rawName);
            const defaultAliasMatch = (DEFAULT_ROCIO_ALIASES[normRaw] || DEFAULT_ROCIO_ALIASES[strippedRaw]) 
                ? normalizeName(DEFAULT_ROCIO_ALIASES[normRaw] || DEFAULT_ROCIO_ALIASES[strippedRaw]) 
                : '';

            const checkMatch = (p: Product, matchCategoryStrict: boolean) => {
                const normPName = normalizeName(p.name);
                const normMapping = p.excelMappingName ? normalizeName(p.excelMappingName) : '';
                const strippedPName = stripQuantitiesFromName(p.name);
                const iCat = normalizeName(item.category || '');
                const pCat = normalizeName(p.category || '');
                
                let nameMatches = normPName === normRaw || 
                       normPName === normCleaned ||
                       (normMapping !== '' && normMapping === normRaw) ||
                       (defaultAliasMatch !== '' && normPName === defaultAliasMatch) ||
                       (strippedRaw !== '' && (normPName === strippedRaw || strippedPName === strippedRaw)) ||
                       (defaultAliasMatch !== '' && strippedPName === defaultAliasMatch);

                if (!nameMatches && iCat.includes('cerdo') && pCat.includes('cerdo')) {
                    const withoutCerdo = normPName.replace(/\b(de\s+)?cerdo\b/g, '').trim();
                    if (withoutCerdo === normRaw || withoutCerdo === strippedRaw) {
                        nameMatches = true;
                    }
                }
                
                if (!nameMatches) return false;
                if (!matchCategoryStrict) return true;

                if (iCat && pCat) {
                    if (iCat.includes('cerdo') && pCat.includes('cerdo')) return true;
                    if (iCat.includes('vacun') && pCat.includes('vacun')) return true;
                    if (iCat.includes('pollo') && pCat.includes('pollo')) return true;
                    if (iCat.includes('embutid') && pCat.includes('embutid')) return true;
                    if (iCat.includes('achura') && pCat.includes('achura')) return true;
                }
                return false;
            };

            const matched = existingProducts.find(p => checkMatch(p, true)) || existingProducts.find(p => checkMatch(p, false));

            const initialMinQty = matched?.dailyOfferMinQty !== undefined 
                ? matched.dailyOfferMinQty 
                : (item.dailyOfferMinQty !== undefined ? item.dailyOfferMinQty : 0);

            return {
                item,
                action: matched ? matched.id : 'create',
                unitType: matched?.unitType || item.unitType || 'kg',
                minQty: initialMinQty,
                approxWeight: matched?.approxWeight,
                cleanedName: cleaned
            };
        });

        setResolutions(initialResolutions);
    };

    const handleActionChange = (index: number, newAction: string) => {
        const updated = [...resolutions];
        updated[index].action = newAction;
        if (newAction !== 'create') {
            const target = existingProducts.find(p => p.id === newAction);
            if (target) {
                if (target.unitType) updated[index].unitType = target.unitType;
                if (target.approxWeight) updated[index].approxWeight = target.approxWeight;
                if (target.dailyOfferMinQty !== undefined) updated[index].minQty = target.dailyOfferMinQty;
            }
        }
        setResolutions(updated);
    };

    const handleUnitTypeChange = (index: number, newUnitType: 'kg' | 'unit' | 'piece') => {
        const updated = [...resolutions];
        updated[index].unitType = newUnitType;
        setResolutions(updated);
    };

    const handleMinQtyChange = (index: number, newQty: number) => {
        const updated = [...resolutions];
        updated[index].minQty = Math.max(0, newQty);
        setResolutions(updated);
    };

    const handleApproxWeightChange = (index: number, weight: number) => {
        const updated = [...resolutions];
        updated[index].approxWeight = weight > 0 ? weight : undefined;
        setResolutions(updated);
    };

    const handleConfirmImport = () => {
        const nextProducts: Product[] = existingProducts.map(p => ({
            ...p,
            isDailyOffer: false,
            dailyOfferPrice: undefined,
            dailyOfferMinQty: undefined
        }));
        const updatedAliases: { productId: string; alias: string }[] = [];

        // Si se eligió unificar duplicados por cantidad
        if (shouldUnifyDuplicates && detectedDuplicates.length > 0) {
            const processedDuplicateCleanNames = new Set<string>();

            detectedDuplicates.forEach(group => {
                const cleanKey = group.cleanName.toLowerCase();
                processedDuplicateCleanNames.add(cleanKey);

                // Ordenar por cantidad ascendente: el de menor cantidad o cantidad 0/1 es el base
                const sortedItems = [...group.items].sort((a, b) => a.qty - b.qty);
                const baseItem = sortedItems[0];
                const higherTiers = sortedItems.slice(1);

                // Buscar si ya existe en catálogo
                const existing = nextProducts.find(p => 
                    normalizeName(p.name) === normalizeName(group.cleanName)
                );

                const bulkPricing = higherTiers.map(t => ({
                    quantity: t.qty > 0 ? t.qty : 2,
                    price: t.price
                }));

                if (existing) {
                    existing.price = baseItem.price;
                    existing.unitType = (baseItem.unitType as any) || 'kg';
                    existing.bulkPricing = bulkPricing.length > 0 ? bulkPricing : existing.bulkPricing;
                } else {
                    const newProd: Product = {
                        id: 'imp_' + Date.now().toString() + '_' + Math.random().toString(36).substring(2, 5),
                        name: group.cleanName,
                        excelMappingName: baseItem.rawName,
                        price: baseItem.price,
                        description: 'Importado y unificado desde Excel',
                        imageUrl: '',
                        category: (group.category && group.category !== 'Ofertas del Día (Efectivo)') ? group.category : 'General',
                        available: true,
                        unitType: (baseItem.unitType as any) || 'kg',
                        bulkPricing: bulkPricing.length > 0 ? bulkPricing : undefined
                    } as Product;
                    (newProd as any).isRecentlyImported = true;
                    nextProducts.push(newProd);
                }
            });

            // Procesar los demás que no formaron parte de duplicados unificados
            resolutions.forEach(({ item, action, unitType, minQty, approxWeight, cleanedName }) => {
                const cKey = (cleanedName || cleanAndCapitalizeName(item.rawName)).toLowerCase();
                if (processedDuplicateCleanNames.has(cKey)) {
                    return; // Ya se unificó arriba
                }

                const finalName = cleanedName || cleanAndCapitalizeName(item.rawName);

                if (action === 'create') {
                    const newProd: Product = {
                        id: 'imp_' + Date.now().toString() + '_' + Math.random().toString(36).substring(2, 5),
                        name: finalName,
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
                        dailyOfferMinQty: minQty !== undefined ? minQty : 0
                    } as Product;
                    (newProd as any).isRecentlyImported = true;
                    nextProducts.push(newProd);
                } else {
                    const targetIdx = nextProducts.findIndex(p => p.id === action);
                    if (targetIdx !== -1) {
                        const current = nextProducts[targetIdx];
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
                            current.dailyOfferMinQty = minQty !== undefined ? minQty : 0;
                        } else {
                            current.price = item.price;
                            if (minQty > 0) {
                                current.dailyOfferMinQty = minQty;
                            }
                        }
                    }
                }
            });
        } else {
            // Importación estándar sin unificar
            resolutions.forEach(({ item, action, unitType, minQty, approxWeight, cleanedName }) => {
                const finalName = cleanedName || cleanAndCapitalizeName(item.rawName);

                if (action === 'create') {
                    const newProd: Product = {
                        id: 'imp_' + Date.now().toString() + '_' + Math.random().toString(36).substring(2, 5),
                        name: finalName,
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
                        dailyOfferMinQty: minQty !== undefined ? minQty : 0
                    } as Product;
                    (newProd as any).isRecentlyImported = true;
                    nextProducts.push(newProd);
                } else {
                    const targetIdx = nextProducts.findIndex(p => p.id === action);
                    if (targetIdx !== -1) {
                        const current = nextProducts[targetIdx];
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
                            current.dailyOfferMinQty = minQty !== undefined ? minQty : 0;
                        } else {
                            current.price = item.price;
                            if (minQty > 0) {
                                current.dailyOfferMinQty = minQty;
                            }
                        }
                    }
                }
            });
        }

        onApplyImport(nextProducts, updatedAliases, rawRows);
        handleClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.modalBg}>
                <View style={styles.modalCard}>
                    <View style={styles.headerRow}>
                        <Text style={styles.modalTitle}>📊 Importar Catálogo desde Excel</Text>
                        <Pressable onPress={handleClose} style={{ padding: 4 }}>
                            <Text style={{ fontSize: 18, color: '#6b7280', fontWeight: 'bold' }}>✕</Text>
                        </Pressable>
                    </View>

                    {/* PASO 1: SUBIR ARCHIVO */}
                    {step === 'upload' && (
                        <View style={styles.body}>
                            <Text style={styles.sectionSubtitle}>
                                Subí tu archivo .xlsx para sincronizar precios y productos en segundos.
                            </Text>

                            <View style={styles.optionsBox}>
                                <View style={styles.switchRow}>
                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                        <Text style={styles.switchLabel}>Columnas A y B son 'Ofertas en Efectivo'</Text>
                                        <Text style={styles.switchSub}>
                                            Si tu Excel tiene ofertas especiales en las primeras columnas, activá esto.
                                        </Text>
                                    </View>
                                    <Switch
                                        value={treatColABAsCashOffers}
                                        onValueChange={setTreatColABAsCashOffers}
                                        trackColor={{ false: '#d1d5db', true: '#10b981' }}
                                    />
                                </View>
                            </View>

                            <View style={styles.dropZone}>
                                {loading ? (
                                    <View style={{ alignItems: 'center', gap: 10 }}>
                                        <ActivityIndicator size="large" color="#0284c7" />
                                        <Text style={{ color: '#4b5563', fontSize: 14 }}>Analizando planilla Excel...</Text>
                                    </View>
                                ) : (
                                    <View style={{ alignItems: 'center', gap: 12 }}>
                                        <Text style={{ fontSize: 40 }}>📁</Text>
                                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1f2937' }}>
                                            Seleccionar archivo Excel (.xlsx)
                                        </Text>
                                        <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                                            Capitalizamos y limpiamos nombres automáticamente.
                                        </Text>
                                        
                                        <label style={styles.uploadBtnLabel as any}>
                                            Elegir Archivo
                                            <input
                                                type="file"
                                                accept=".xlsx, .xls"
                                                style={{ display: 'none' }}
                                                onChange={handleFileSelect}
                                            />
                                        </label>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {/* PASO 1.5: MODAL VISUAL PREGUNTANDO POR DUPLICADOS POR PESO */}
                    {step === 'unify_prompt' && (
                        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                            <View style={styles.unifyAlertCard}>
                                <Text style={{ fontSize: 24, textAlign: 'center', marginBottom: 4 }}>💡</Text>
                                <Text style={styles.unifyAlertTitle}>
                                    Detectamos productos duplicados por peso
                                </Text>
                                <Text style={styles.unifyAlertDesc}>
                                    Encontramos productos con el mismo nombre y diferentes kilos/unidades. 
                                    ¿Querés que los unifiquemos automáticamente para que se muestren como <Text style={{ fontWeight: 'bold' }}>Descuentos por Cantidad</Text>?
                                </Text>
                            </View>

                            {/* Mini Mockup Visual de cómo queda la tarjeta */}
                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#475569', marginTop: 10, marginBottom: 6 }}>
                                📱 ASÍ SE VERÁ LA TARJETA EN TU TIENDA:
                            </Text>
                            <View style={styles.mockupCard}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#0f172a' }}>
                                        {detectedDuplicates[0]?.cleanName || 'Carne Picada'}
                                    </Text>
                                    <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                                        <Text style={{ fontSize: 10, color: '#0369a1', fontWeight: 'bold' }}>
                                            {detectedDuplicates[0]?.category || 'Vacuno'}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: '#16a34a', marginTop: 4 }}>
                                    ${detectedDuplicates[0]?.items[0]?.price || 5000} <Text style={{ fontSize: 12, color: '#64748b' }}>/ Kilo</Text>
                                </Text>
                                <View style={styles.mockupTierBadge}>
                                    <Text style={{ fontSize: 11, color: '#0369a1', fontWeight: 'bold' }}>
                                        📦 Llevando {detectedDuplicates[0]?.items[1]?.qty || 2}kg+ a ${(detectedDuplicates[0]?.items[1]?.price || 8000)} total
                                    </Text>
                                </View>
                            </View>

                            {/* Lista de duplicados detectados */}
                            <View style={{ marginTop: 14 }}>
                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#475569', marginBottom: 6 }}>
                                    PRODUCTOS A UNIFICAR ({detectedDuplicates.length}):
                                </Text>
                                {detectedDuplicates.map((grp, gIdx) => (
                                    <View key={gIdx} style={styles.duplicateItemBox}>
                                        <Text style={{ fontWeight: 'bold', color: '#0f172a', fontSize: 13 }}>
                                            ➔ {grp.cleanName} ({grp.category})
                                        </Text>
                                        <View style={{ marginTop: 4, paddingLeft: 8 }}>
                                            {grp.items.map((it, iIdx) => (
                                                <Text key={iIdx} style={{ fontSize: 12, color: '#475569' }}>
                                                    • {it.rawName} : ${it.price}
                                                </Text>
                                            ))}
                                        </View>
                                    </View>
                                ))}
                            </View>

                            <View style={styles.footerRow}>
                                <Pressable 
                                    style={[styles.secondaryBtn, { flex: 1 }]} 
                                    onPress={() => {
                                        setShouldUnifyDuplicates(false);
                                        const hasUnmapped = resolutions.some(r => r.action === 'create');
                                        setStep(hasUnmapped ? 'resolve' : 'preview');
                                    }}
                                >
                                    <Text style={styles.secondaryBtnText}>No, dejarlos separados</Text>
                                </Pressable>
                                <Pressable 
                                    style={[styles.primaryBtn, { flex: 1.2 }]} 
                                    onPress={() => {
                                        setShouldUnifyDuplicates(true);
                                        const hasUnmapped = resolutions.some(r => r.action === 'create');
                                        setStep(hasUnmapped ? 'resolve' : 'preview');
                                    }}
                                >
                                    <Text style={styles.primaryBtnText}>✓ Sí, Unificar en Descuentos</Text>
                                </Pressable>
                            </View>
                        </ScrollView>
                    )}

                    {/* PASO 2: RESOLVER VINCULACIONES */}
                    {step === 'resolve' && (
                        <View style={styles.body}>
                            <Text style={styles.sectionSubtitle}>
                                Revisá los productos que no se asociaron automáticamente.
                            </Text>

                            <ScrollView style={styles.scrollList}>
                                {resolutions.map((res, idx) => (
                                    <View key={idx} style={styles.resolveItem}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.resolveRawName}>
                                                {res.cleanedName || res.item.rawName}
                                            </Text>
                                            <Text style={styles.resolveMeta}>
                                                Original: {res.item.rawName} | Precio: ${res.item.price} | Cat: {res.item.category}
                                            </Text>

                                            <select
                                                value={res.action}
                                                onChange={(e) => handleActionChange(idx, e.target.value)}
                                                style={styles.selectNative as any}
                                            >
                                                <option value="create">✨ Crear como nuevo producto</option>
                                                <optgroup label="Vincular a producto existente:">
                                                    {existingProducts.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name} (${p.price})</option>
                                                    ))}
                                                </optgroup>
                                            </select>

                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151' }}>Venta:</Text>
                                                    <select
                                                        value={res.unitType}
                                                        onChange={(e) => handleUnitTypeChange(idx, e.target.value as any)}
                                                        style={{ padding: 4, borderRadius: 6, borderColor: '#d1d5db', borderWidth: 1, fontSize: 12, backgroundColor: '#ffffff', cursor: 'pointer' } as any}
                                                    >
                                                        <option value="kg">⚖️ Por Kilo (Kg)</option>
                                                        <option value="unit">📦 Por Unidad (U.)</option>
                                                        <option value="piece">🥩 Por Pieza Entera</option>
                                                    </select>
                                                </View>

                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151' }}>Mínimo Oferta:</Text>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={res.minQty !== undefined ? res.minQty : 0}
                                                        onChange={(e) => handleMinQtyChange(idx, e.target.value === '' ? 0 : (parseInt(e.target.value, 10) || 0))}
                                                        style={{ width: 50, padding: 4, borderRadius: 6, borderColor: '#d1d5db', borderWidth: 1, fontSize: 12, textAlign: 'center' } as any}
                                                    />
                                                    <Text style={{ fontSize: 12, color: '#6b7280' }}>{res.unitType === 'unit' ? 'u.' : 'kg'}</Text>
                                                </View>
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

                    {/* PASO 3: VISTA PREVIA Y APLICAR */}
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
                                                {isNew ? (res.cleanedName || res.item.rawName) : `Vincular a: ${linkedProd?.name}`}
                                            </Text>
                                            <Text style={styles.previewPrice}>
                                                ${res.item.price} {res.item.isDailyOffer ? '(Oferta Efectivo)' : ''}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </ScrollView>

                            <View style={styles.footerRow}>
                                <Pressable 
                                    style={styles.secondaryBtn} 
                                    onPress={() => setStep(detectedDuplicates.length > 0 ? 'unify_prompt' : 'upload')}
                                >
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
    modalBg: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12
    },
    modalCard: {
        width: '100%',
        maxWidth: 580,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 20,
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 8
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        paddingBottom: 8
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: 'bold',
        color: '#0f172a'
    },
    body: {
        flex: 1
    },
    sectionSubtitle: {
        fontSize: 13,
        color: '#475569',
        marginBottom: 12,
        lineHeight: 18
    },
    optionsBox: {
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 14
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    switchLabel: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#1e293b'
    },
    switchSub: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2
    },
    dropZone: {
        backgroundColor: '#f0fdf4',
        borderWidth: 2,
        borderColor: '#86efac',
        borderStyle: 'dashed',
        borderRadius: 12,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 10
    },
    uploadBtnLabel: {
        backgroundColor: '#10b981',
        color: '#ffffff',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        fontWeight: 'bold',
        fontSize: 14,
        cursor: 'pointer',
        marginTop: 6
    },
    unifyAlertCard: {
        backgroundColor: '#eff6ff',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#bfdbfe',
        alignItems: 'center',
        marginBottom: 10
    },
    unifyAlertTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#1e40af',
        textAlign: 'center',
        marginBottom: 4
    },
    unifyAlertDesc: {
        fontSize: 12,
        color: '#334155',
        textAlign: 'center',
        lineHeight: 17
    },
    mockupCard: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1.5,
        borderColor: '#38bdf8',
        shadowColor: '#0284c7',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
        marginBottom: 8
    },
    mockupTierBadge: {
        backgroundColor: '#f0f9ff',
        borderWidth: 1,
        borderColor: '#bae6fd',
        borderRadius: 6,
        paddingVertical: 4,
        paddingHorizontal: 8,
        marginTop: 6,
        alignSelf: 'flex-start'
    },
    duplicateItemBox: {
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 8
    },
    scrollList: {
        maxHeight: 340,
        marginVertical: 8
    },
    resolveItem: {
        backgroundColor: '#ffffff',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 10
    },
    resolveRawName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0f172a'
    },
    resolveMeta: {
        fontSize: 11,
        color: '#64748b',
        marginVertical: 4
    },
    selectNative: {
        width: '100%',
        padding: 8,
        borderRadius: 6,
        borderColor: '#cbd5e1',
        borderWidth: 1,
        fontSize: 13,
        backgroundColor: '#f8fafc',
        marginTop: 4
    },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9'
    },
    previewRowNew: {
        backgroundColor: '#f0fdf4'
    },
    previewBadge: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#059669',
        width: 70
    },
    previewName: {
        fontSize: 13,
        color: '#1e293b',
        flex: 1,
        paddingHorizontal: 6
    },
    previewPrice: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#0f172a'
    },
    footerRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 14,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9'
    },
    primaryBtn: {
        backgroundColor: '#0284c7',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center'
    },
    primaryBtnText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 13
    },
    secondaryBtn: {
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center'
    },
    secondaryBtnText: {
        color: '#475569',
        fontWeight: 'bold',
        fontSize: 13
    }
});
