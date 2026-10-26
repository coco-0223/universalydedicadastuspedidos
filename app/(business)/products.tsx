import * as XLSX from 'xlsx';
import { IS_DEDICATED_APP } from '../../src/data/mockData';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { ImagePickerPortal } from '../../src/components/ImagePickerPortal';
import { ExcelImportModal } from '../../src/components/ExcelImportModal';
import { SuperadminRawExcelEditor } from '../../src/components/SuperadminRawExcelEditor';
import { normalizeName, DEFAULT_ROCIO_ALIASES } from '../../src/utils/excelParser';
import { useAppContext } from '../../src/context/AppContext';
import { saveBusinessSettings, saveCatalogToFirebase } from '../../src/services/businessService';
import { CrossSellRule, MixAndMatchRule, Offer, Product } from '../../src/types';

export default function BusinessProductsScreen() {
    const { products, setProducts, settings, setSettings, offers, setOffers, businessProfile, user } = useAppContext();
    const myProducts = useMemo(() => products.filter(p => !p.businessId || p.businessId === businessProfile.id), [products, businessProfile.id]);
    const myOffers = useMemo(() => offers.filter(o => !o.businessId || o.businessId === businessProfile.id), [offers, businessProfile.id]);
    const [drafts, setDrafts] = useState<Partial<Product>[]>([{ id: Date.now().toString(), name: '', category: settings.categories?.[0] || 'Varios', price: 0, imageUrl: '', available: true, description: '' }]);

    const originalProductsRef = React.useRef<Product[]>([]);
    const originalOffersRef = React.useRef<Offer[]>([]);

    useEffect(() => {
        if (products.length > 0 && originalProductsRef.current.length === 0) {
            originalProductsRef.current = JSON.parse(JSON.stringify(products));
        }
    }, [products]);

    useEffect(() => {
        if (offers.length > 0 && originalOffersRef.current.length === 0) {
            originalOffersRef.current = JSON.parse(JSON.stringify(offers));
        }
    }, [offers]);

    const [filterQuery, setFilterQuery] = useState('');
    const [filterStockMode, setFilterStockMode] = useState(false);
    const [filterOffersMode, setFilterOffersMode] = useState(false);
    const [filterRecentlyImported, setFilterRecentlyImported] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todas');
    const [statusFilter, setStatusFilter] = useState<'Todos' | 'Activos' | 'Agotados' | 'Destacados' | 'En Oferta'>('Todos');
    
    const exportPriceListToExcel = () => {
        const dailyOffers = products.filter(p => p.isDailyOffer);
        const colGroups = [];
        
        if (dailyOffers.length > 0) {
            colGroups.push({
                name: 'Ofertas del día',
                items: dailyOffers.map(p => ({ name: p.name, price: p.dailyOfferPrice }))
            });
        }
        
        for (const cat of categories) {
            const catProds = products.filter(p => p.category === cat && !p.isDailyOffer);
            if (catProds.length > 0) {
                colGroups.push({
                    name: cat,
                    items: catProds.map(p => ({ name: p.name, price: p.price }))
                });
            }
        }
        
        const maxItems = Math.max(...colGroups.map(g => g.items.length), 0);
        if (maxItems === 0) {
            Alert.alert('Catálogo vacío', 'No hay productos para exportar.');
            return;
        }
        
        const aoa = [];
        const headerRow = [];
        for (let i = 0; i < colGroups.length; i++) {
            headerRow.push(colGroups[i].name);
            headerRow.push('Precio');
            if (i < colGroups.length - 1) {
                headerRow.push(''); 
            }
        }
        aoa.push(headerRow);
        
        for (let r = 0; r < maxItems; r++) {
            const row = [];
            for (let i = 0; i < colGroups.length; i++) {
                const item = colGroups[i].items[r];
                if (item) {
                    row.push(item.name);
                    row.push(item.price);
                } else {
                    row.push('');
                    row.push('');
                }
                if (i < colGroups.length - 1) {
                    row.push(''); 
                }
            }
            aoa.push(row);
        }
        
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Precios");
        
        XLSX.writeFile(workbook, "Plantilla_Precios.xlsx");
    };

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isSmartExcelModalOpen, setIsSmartExcelModalOpen] = useState(false);
    const [isSuperadminRawExcelOpen, setIsSuperadminRawExcelOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

    const [activePromos, setActivePromos] = useState<Record<string, string>>({});
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [catalogHistory, setCatalogHistory] = useState<{ id: string; timestamp: string; action: string; products: Product[] }[]>([]);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [pickerState, setPickerState] = useState<{ visible: boolean, type: 'product' | 'draft', id: string } | null>(null);

    const recordCatalogChange = (actionName: string, currentSnapshot: Product[]) => {
        const now = new Date();
        const datePart = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const timePart = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const record = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 5),
            timestamp: `${datePart} ${timePart}`,
            action: actionName,
            products: JSON.parse(JSON.stringify(currentSnapshot))
        };
        setCatalogHistory(prev => [record, ...prev].slice(0, 30));
    };

    // Persistence for Tiers (Auto-merge memory)
    const [mergeMemory, setMergeMemory] = useState<Record<string, string>>({});

    useEffect(() => {
        const loadMemory = async () => {
            const saved = await AsyncStorage.getItem(`merge_memory_${businessProfile.id}`);
            if (saved) setMergeMemory(JSON.parse(saved));
        };
        loadMemory();
    }, [businessProfile.id]);

    const saveMemory = async (newMemory: Record<string, string>) => {
        setMergeMemory(newMemory);
        await AsyncStorage.setItem(`merge_memory_${businessProfile.id}`, JSON.stringify(newMemory));
    };

    const extractScaleInfo = (name: string) => {
        const regex = /(\d+(?:[.,]\d+)?)\s*(kg|kg\.|kilos|kilo|gr|gr\.|gramos|unidades|u)/i;
        const match = name.match(regex);
        if (!match) return { baseName: name.trim(), quantity: 1 };

        let qty = parseFloat(match[1].replace(',', '.'));
        const unit = match[2].toLowerCase();
        if (unit.startsWith('g')) qty = qty / 1000;

        const baseName = name.replace(match[0], '').trim().replace(/\s\s+/g, ' ');
        return { baseName, quantity: qty };
    };

    const handleSaveCatalog = async () => {
        console.log("🟢 Iniciando guardado de catálogo...");
        console.log("ID de Negocio:", businessProfile.id);
        console.log("Cantidad de productos a guardar:", products.length);
        console.log("Cantidad de ofertas a guardar:", offers.length);

        try {
            setIsSaving(true);

            const newSettings = {
                ...settings,
                categories,
                categoryColors,
                categorySortOrder,
                checkoutRules,
                displaySettings: {
                    offersView,
                    productsView,
                    showOfferDiscountPercentage,
                    showOffersOnTop
                },
                mixAndMatchRules,
                crossSellRules
            };

            console.log("Guardando ajustes de negocio...");
            await saveBusinessSettings(businessProfile.id, newSettings);
            setSettings(newSettings);

            console.log("Guardando productos y ofertas en Firebase (incremental)...");
            await saveCatalogToFirebase(businessProfile.id, products, offers, originalProductsRef.current, originalOffersRef.current);

            // Actualizar la referencia de los productos originales para subsiguientes diffs
            originalProductsRef.current = JSON.parse(JSON.stringify(products));
            originalOffersRef.current = JSON.parse(JSON.stringify(offers));

            console.log("✅ Guardado completado con éxito");
            Alert.alert('Éxito', 'Catálogo, categorías y ajustes guardados online correctamente.');
        } catch (e) {
            console.error("❌ Error al guardar catálogo:", e);
            Alert.alert('Error', 'No se pudieron guardar los cambios en Firebase. Verifica tu conexión.');
        } finally {
            setIsSaving(false);
        }
    };

    const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isOfferOriginModalOpen, setIsOfferOriginModalOpen] = useState(false);
    const [isExcelEditorOpen, setIsExcelEditorOpen] = useState(false);
    const [isVolumePricingModalOpen, setIsVolumePricingModalOpen] = useState(false);
    const [isSpecialsModalOpen, setIsSpecialsModalOpen] = useState(false);
    const [isComboModalOpen, setIsComboModalOpen] = useState(false);
    const [comboView, setComboView] = useState<'list' | 'create'>('list');
    const [activeCatalogTab, setActiveCatalogTab] = useState<'all' | 'volume' | 'specials' | 'daily' | 'combos'>('all');
    const [excelFocusId, setExcelFocusId] = useState<string | null>(null);

    // Excel Grid States
    const [draftExcelProducts, setDraftExcelProducts] = useState<Product[]>([]);
    const [excelHistory, setExcelHistory] = useState<Product[][]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [excelSelectionStart, setExcelSelectionStart] = useState<{ row: number, col: number } | null>(null);
    const [excelSelectionEnd, setExcelSelectionEnd] = useState<{ row: number, col: number } | null>(null);
    const [isExcelSelecting, setIsExcelSelecting] = useState(false);
    const [excelEditingCell, setExcelEditingCell] = useState<{ row: number, col: number } | null>(null);
    const [isMassCategoryOpen, setIsMassCategoryOpen] = useState(false);
    const [rowSelectionMode, setRowSelectionMode] = useState<'add' | 'remove' | null>(null);
    const [isPasteCategoryModalOpen, setIsPasteCategoryModalOpen] = useState(false);
    const [pendingDrafts, setPendingDrafts] = useState<Partial<Product>[]>([]);
    const [pasteCategory, setPasteCategory] = useState<string>('');
    const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [pasteUnitType, setPasteUnitType] = useState<'kg' | 'unit' | 'piece'>('kg');
    const [lastPasteBackup, setLastPasteBackup] = useState<Partial<Product>[] | null>(null);
    const [showMappingCol, setShowMappingCol] = useState(false);
    const [showSortOrderCol, setShowSortOrderCol] = useState(false);
    const [sortByCustomOrder, setSortByCustomOrder] = useState(false);
    const [excelOrderIds, setExcelOrderIds] = useState<string[]>([]);

    // Volume Pricing Modal States
    type VolumePricingView = 'list' | 'create' | 'confirm';
    const [volumeView, setVolumeView] = useState<VolumePricingView>('list');
    const [volumeParentId, setVolumeParentId] = useState<string | null>(null);
    const [volumeLevels, setVolumeLevels] = useState<{ id: string, productId: string, price: string, quantity: string }[]>([]);

    // Specials Modal States
    type SpecialsView = 'list' | 'create';
    const [specialsView, setSpecialsView] = useState<SpecialsView>('list');
    const [specialFocusId, setSpecialFocusId] = useState<string | null>(null);
    const [specialDraft, setSpecialDraft] = useState<any>({});

    // Daily Offers Modal States
    type DailyOffersView = 'list' | 'create';
    const [dailyOffersView, setDailyOffersView] = useState<DailyOffersView>('list');
    const [isDailyOffersModalOpen, setIsDailyOffersModalOpen] = useState(false);
    const [dailyOfferDraft, setDailyOfferDraft] = useState<{ id: string, price: string, minQty: string } | null>(null);

    const [customConfirm, setCustomConfirm] = useState<{
        visible: boolean;
        title: string;
        message: string;
        isWarning?: boolean;
        cancelText: string;
        confirmText: string;
        onCancel: () => void;
        onConfirm: () => void;
    } | null>(null);

    const [newCatName, setNewCatName] = useState('');
    const [newCatColor, setNewCatColor] = useState('#007AFF');

    // Restock Modal States
    const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
    const [restockModalMode, setRestockModalMode] = useState<'deactivate' | 'reactivate' | null>(null);
    const [restockProductId, setRestockProductId] = useState<string | null>(null);
    const [wantsRestock, setWantsRestock] = useState<boolean | null>(null);
    const [restockDate, setRestockDate] = useState('');
    const [restockHour, setRestockHour] = useState('00');
    const [restockMinute, setRestockMinute] = useState('01');
    const [isHourDropdownOpen, setIsHourDropdownOpen] = useState(false);
    const [isMinuteDropdownOpen, setIsMinuteDropdownOpen] = useState(false);

    const next10Days = useMemo(() => {
        const days = [];
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' };
        for (let i = 1; i <= 10; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const label = d.toLocaleDateString('es-ES', options);
            days.push({ value: dateStr, label: label.charAt(0).toUpperCase() + label.slice(1) });
        }
        return days;
    }, []);

    const openRestockModalForProduct = (productId: string, mode: 'deactivate' | 'reactivate') => {
        setRestockProductId(productId);
        setRestockModalMode(mode);

        const target = products.find(p => p.id === productId);
        if (target && target.autoRestock && target.restockDate && target.restockTime) {
            setWantsRestock(true);
            setRestockDate(target.restockDate);
            const parts = target.restockTime.split(':');
            setRestockHour(parts[0] || '00');
            setRestockMinute(parts[1] || '01');
        } else {
            setWantsRestock(null);

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const yyyy = tomorrow.getFullYear();
            const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
            const dd = String(tomorrow.getDate()).padStart(2, '0');

            setRestockDate(`${yyyy}-${mm}-${dd}`);
            setRestockHour('00');
            setRestockMinute('01');
        }

        setIsHourDropdownOpen(false);
        setIsMinuteDropdownOpen(false);
        setIsRestockModalOpen(true);
    };

    // Combo States
    const [editingComboId, setEditingComboId] = useState<string | null>(null);
    const [comboName, setComboName] = useState('');
    const [comboDesc, setComboDesc] = useState('');
    const [comboPrice, setComboPrice] = useState('');
    const [comboSearch, setComboSearch] = useState('');
    const [comboQuantities, setComboQuantities] = useState<Record<string, string>>({});
    const [comboCategories, setComboCategories] = useState<string[]>([]);

    const updateOfferField = (id: string, field: string, value: any) => {
        setOffers(prevOffers => prevOffers.map(o => o.id === id ? { ...o, [field]: value } : o));
    };

    const handleOpenComboModalEmpty = () => {
        setComboQuantities({});
        setComboName('');
        setComboDesc('');
        setComboPrice('');
        setComboSearch('');
        setComboCategories([]);
        setEditingComboId(null);
        setIsOfferOriginModalOpen(false);
        setComboView('create');
        setIsComboModalOpen(true);
    };

    const handleEditCombo = (offer: any) => {
        const defaultQs: Record<string, string> = {};
        offer.requirements?.forEach((req: any) => {
            defaultQs[req.productId] = req.quantity.toString();
        });
        setComboQuantities(defaultQs);
        setComboName(offer.name);
        setComboDesc(offer.description || '');
        setComboPrice(offer.bundlePrice.toString());
        setComboSearch('');
        setComboCategories(offer.categories || []);
        setEditingComboId(offer.id);
        setIsComboModalOpen(true);
    };

    const handleOpenComboModalWithSelected = () => {
        if (selectedIds.size === 0) {
            Alert.alert('Error', 'No has seleccionado ningún producto.');
            return;
        }
        let defaultQs: Record<string, string> = {};
        Array.from(selectedIds).forEach(id => defaultQs[id] = '1');
        setComboQuantities(defaultQs);
        setComboName('');
        setComboDesc('');
        setComboPrice('');
        setComboSearch('');
        setComboCategories([]);
        setEditingComboId(null);
        setIsOfferOriginModalOpen(false);
        setComboView('create');
        setIsComboModalOpen(true);
    };

    const handleSaveCombo = () => {
        if (!comboName) {
            Alert.alert('Error', 'Debe indicar un título para el combo.');
            return;
        }

        const reqs = Object.keys(comboQuantities).map(id => {
            const q = parseFloat(comboQuantities[id]?.replace(',', '.') || '0');
            return { productId: id, quantity: isNaN(q) ? 1 : q };
        }).filter(r => r.quantity > 0);

        if (editingComboId) {
            setOffers(offers.map(o => o.id === editingComboId ? {
                ...o,
                name: comboName,
                description: comboDesc,
                requirements: reqs,
                bundlePrice: parseFloat(comboPrice.replace(',', '.')) || 0,
                categories: comboCategories
            } : o));
            Alert.alert('Éxito', '¡Combo actualizado!');
        } else {
            const newOffer = {
                id: Date.now().toString(),
                name: comboName,
                description: comboDesc,
                requirements: reqs,
                bundlePrice: parseFloat(comboPrice.replace(',', '.')) || 0,
                active: true,
                categories: comboCategories,
                businessId: businessProfile.id
            };
            setOffers([newOffer, ...offers]);
            Alert.alert('Éxito', '¡Combo promocional creado!');
        }

        setSelectedIds(new Set());
        setComboView('list');
    };



    const widestHours = useMemo(() => {
        let minStart = '23:59';
        let maxEnd = '00:00';
        settings.branches.forEach(b => {
            Object.values(b.schedule).forEach((slots: any) => {
                slots.forEach((s: any) => {
                    if (s.openTime < minStart) minStart = s.openTime;
                    if (s.closeTime > maxEnd) maxEnd = s.closeTime;
                });
            });
        });
        if (minStart === '23:59') return { start: '08:00', end: '20:00' };
        return { start: minStart, end: maxEnd };
    }, [settings.branches]);

    const openSpecialsPricing = () => {
        const hasExisting = products.some(p => p.specialOffer?.active);
        if (hasExisting) {
            setSpecialsView('list');
        } else {
            setSpecialFocusId(null);
            setSpecialDraft({
                active: true,
                price: '',
                limitByStock: false,
                initialStock: '',
                stockVisibility: 'exact',
                limitByTime: false,
                dateConfigs: [], // Array of { date: 'YYYY-MM-DD', slots: [{start, end}] }
                highlightMode: 'banner'
            });
            setSpecialsView('create');
        }
        setIsSpecialsModalOpen(true);
    };

    const handleEditSpecial = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        setSpecialFocusId(productId);

        // Group timeWindows by date
        const dateMap: Record<string, { start: string, end: string }[]> = {};
        (product.specialOffer?.timeWindows || []).forEach(w => {
            const d = new Date(w.startTime).toISOString().split('T')[0];
            const s = new Date(w.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            const e = new Date(w.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            if (!dateMap[d]) dateMap[d] = [];
            dateMap[d].push({ start: s, end: e });
        });

        const dateConfigs = Object.keys(dateMap).map(d => ({
            date: d,
            slots: dateMap[d]
        }));

        setSpecialDraft({
            ...product.specialOffer,
            price: product.specialOffer?.price?.toString() || '',
            initialStock: product.specialOffer?.initialStock?.toString() || '',
            dateConfigs: dateConfigs.length > 0 ? dateConfigs : [],
            limitByTime: !!product.specialOffer?.limitByTime
        });
        setSpecialsView('create');
        setIsSpecialsModalOpen(true);
    };

    const handleDeleteSpecial = (productId: string) => {
        setProducts(products.map(p => p.id === productId ? { ...p, specialOffer: undefined } : p));
    };

    const handleSaveSpecialConfirm = () => {
        if (!specialFocusId) {
            Alert.alert('Error', 'Selecciona un producto para la oferta especial.');
            return;
        }
        const priceNum = parseFloat(specialDraft.price?.replace(',', '.'));
        if (isNaN(priceNum) || priceNum <= 0) {
            Alert.alert('Error', 'El precio especial es inválido.');
            return;
        }

        const finalWindows: any[] = [];
        (specialDraft.dateConfigs || []).forEach((dc: any) => {
            dc.slots.forEach((s: any) => {
                finalWindows.push({
                    startTime: `${dc.date}T${s.start}:00`,
                    endTime: `${dc.date}T${s.end}:00`
                });
            });
        });

        const newConfig = {
            active: specialDraft.active,
            price: priceNum,
            limitByStock: specialDraft.limitByStock,
            initialStock: specialDraft.limitByStock ? parseFloat(specialDraft.initialStock?.replace(',', '.')) || 0 : undefined,
            stockRemaining: specialDraft.limitByStock ? parseFloat(specialDraft.initialStock?.replace(',', '.')) || 0 : undefined,
            stockVisibility: specialDraft.stockVisibility || 'exact',
            limitByTime: specialDraft.limitByTime,
            timeWindows: specialDraft.limitByTime ? finalWindows : [],
            highlightMode: specialDraft.highlightMode || 'banner'
        };

        setProducts(products.map(p => p.id === specialFocusId ? { ...p, specialOffer: newConfig } : p));
        Alert.alert('Éxito', 'Oferta especial guardada.');
        setIsSpecialsModalOpen(false);
    };

    const openDailyOffers = () => {
        const hasExisting = products.some(p => p.isDailyOffer);
        if (hasExisting) {
            setDailyOffersView('list');
        } else {
            setDailyOfferDraft({ id: '', price: '', minQty: '' });
            setDailyOffersView('create');
        }
        setIsDailyOffersModalOpen(true);
    };

    const handleEditDailyOffer = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        setDailyOfferDraft({
            id: product.id,
            price: product.dailyOfferPrice?.toString() || '',
            minQty: product.dailyOfferMinQty?.toString() || ''
        });
        setDailyOffersView('create');
        setIsDailyOffersModalOpen(true);
    };

    const handleSaveDailyOffer = () => {
        if (!dailyOfferDraft || !dailyOfferDraft.id) {
            Alert.alert('Error', 'Seleccioná un producto.');
            return;
        }
        const price = parseFloat(dailyOfferDraft.price.replace(',', '.'));
        const qty = parseInt(dailyOfferDraft.minQty);
        
        if (isNaN(price) || price <= 0 || isNaN(qty) || qty <= 0) {
            Alert.alert('Error', 'Precio y cantidad deben ser válidos y mayores a 0.');
            return;
        }

        const prod = products.find(p => p.id === dailyOfferDraft.id);
        if (prod && price > prod.price) {
            Alert.alert('Aviso', 'El precio de la oferta es mayor al precio de lista. ¿Seguro que querés guardarlo?', [
                { text: 'Revisar', style: 'cancel' },
                { text: 'Guardar', onPress: () => confirmSaveDailyOffer(price, qty) }
            ]);
            return;
        }
        confirmSaveDailyOffer(price, qty);
    };
    
    const confirmSaveDailyOffer = (price: number, qty: number) => {
        setProducts(products.map(p => p.id === dailyOfferDraft!.id ? {
            ...p,
            isDailyOffer: true,
            dailyOfferPrice: price,
            dailyOfferMinQty: qty
        } : p));
        Alert.alert('Éxito', 'Oferta del día guardada.');
        setDailyOffersView('list');
    };

    const handleDeleteDailyOffer = (productId: string) => {
        setProducts(products.map(p => p.id === productId ? {
            ...p,
            isDailyOffer: false,
            dailyOfferPrice: undefined,
            dailyOfferMinQty: undefined
        } : p));
    };

    // Settings State
    const [categories, setCategories] = useState<string[]>(settings.categories || ['Varios']);
    const [categoryColors, setCategoryColors] = useState<Record<string, string>>(settings.categoryColors || {});
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryColor, setNewCategoryColor] = useState('#007AFF');
    const [offersView, setOffersView] = useState<'cards' | 'list'>(settings.displaySettings?.offersView || 'cards');
    const [productsView, setProductsView] = useState<'cards' | 'list'>(settings.displaySettings?.productsView || 'list');
    const [showOfferDiscountPercentage, setShowOfferDiscountPercentage] = useState<boolean>(settings.displaySettings?.showOfferDiscountPercentage ?? true);
    const [showOffersOnTop, setShowOffersOnTop] = useState<boolean>(settings.displaySettings?.showOffersOnTop ?? false);
    const [showOrderStatusToClients, setShowOrderStatusToClients] = useState<boolean>(settings.displaySettings?.showOrderStatusToClients ?? true);

    const [checkoutRules, setCheckoutRules] = useState<{
        minWeightPerItem?: number;
        weightStep?: number;
        minOrderValueDelivery?: number;
        minOrderValuePickup?: number;
    }>(settings.checkoutRules || { minWeightPerItem: 1, weightStep: 1, minOrderValueDelivery: 0, minOrderValuePickup: 0 });

    const [deliverySchedulingActive, setDeliverySchedulingActive] = useState<boolean>(settings.deliveryScheduling?.active ?? true);
    const [pickupSchedulingActive, setPickupSchedulingActive] = useState<boolean>(settings.pickupScheduling?.active ?? true);
    const [disabledBranchesForScheduling, setDisabledBranchesForScheduling] = useState<string[]>(settings.pickupScheduling?.disabledBranches || []);
    const [categorySortOrder, setCategorySortOrder] = useState<Record<string, number>>(settings.categorySortOrder || {});

    // Mix & Match Form States
    const [mixAndMatchRules, setMixAndMatchRules] = useState<MixAndMatchRule[]>(settings.mixAndMatchRules || []);
    const [newMmName, setNewMmName] = useState('');
    const [newMmType, setNewMmType] = useState<'category' | 'products'>('category');
    const [newMmCategoryId, setNewMmCategoryId] = useState('');
    const [newMmProductIds, setNewMmProductIds] = useState<string[]>([]);
    const [newMmMinQty, setNewMmMinQty] = useState('');
    const [newMmPrice, setNewMmPrice] = useState('');

    // Cross-selling Form States
    const [crossSellRules, setCrossSellRules] = useState<CrossSellRule[]>(settings.crossSellRules || []);
    const [newCsTriggerType, setNewCsTriggerType] = useState<'category' | 'product'>('category');
    const [newCsTriggerCategoryId, setNewCsTriggerCategoryId] = useState('');
    const [newCsTriggerProductId, setNewCsTriggerProductId] = useState('');
    const [newCsTriggerQty, setNewCsTriggerQty] = useState('');
    const [newCsRewardProductId, setNewCsRewardProductId] = useState('');
    const [newCsRewardPrice, setNewCsRewardPrice] = useState('');
    const [newCsMessage, setNewCsMessage] = useState('');

    useEffect(() => {
        setCategories(settings.categories || ['Varios']);
        setCategoryColors(settings.categoryColors || {});
        setOffersView(settings.displaySettings?.offersView || 'cards');
        setProductsView(settings.displaySettings?.productsView || 'list');
        setShowOfferDiscountPercentage(settings.displaySettings?.showOfferDiscountPercentage ?? true);
        setShowOffersOnTop(settings.displaySettings?.showOffersOnTop ?? false);
        setShowOrderStatusToClients(settings.displaySettings?.showOrderStatusToClients ?? true);
        setCheckoutRules(settings.checkoutRules || { minWeightPerItem: 1, weightStep: 1, minOrderValueDelivery: 0, minOrderValuePickup: 0 });
        setDeliverySchedulingActive(settings.deliveryScheduling?.active ?? true);
        setPickupSchedulingActive(settings.pickupScheduling?.active ?? true);
        setDisabledBranchesForScheduling(settings.pickupScheduling?.disabledBranches || []);
        setMixAndMatchRules(settings.mixAndMatchRules || []);
        setCrossSellRules(settings.crossSellRules || []);
        if (settings.categorySortOrder) {
            setCategorySortOrder(settings.categorySortOrder);
        }
    }, [settings.categories, settings.categoryColors, settings.displaySettings, settings.checkoutRules, settings.deliveryScheduling, settings.pickupScheduling, settings.categorySortOrder, settings.mixAndMatchRules, settings.crossSellRules]);

    const handleSaveSettings = async () => {
        setIsSaving(true);
        const newSettings = {
            ...settings,
            categories,
            categoryColors,
            categorySortOrder,
            checkoutRules: {
                ...checkoutRules,
                minWeightPerItem: parseFloat(checkoutRules.minWeightPerItem as any) || 0,
                weightStep: parseFloat(checkoutRules.weightStep as any) || 0,
                minOrderValueDelivery: parseFloat(checkoutRules.minOrderValueDelivery as any) || 0,
                minOrderValuePickup: parseFloat(checkoutRules.minOrderValuePickup as any) || 0,
            },
            displaySettings: {
                offersView,
                productsView,
                showOfferDiscountPercentage,
                showOffersOnTop,
                showOrderStatusToClients
            },
            deliveryScheduling: {
                active: deliverySchedulingActive
            },
            pickupScheduling: {
                active: pickupSchedulingActive,
                disabledBranches: disabledBranchesForScheduling
            },
            mixAndMatchRules,
            crossSellRules
        };

        try {
            console.log("Guardando ajustes y sincronizando catálogo (incremental)...");
            await saveBusinessSettings(businessProfile.id, newSettings);
            await saveCatalogToFirebase(businessProfile.id, products, offers, originalProductsRef.current, originalOffersRef.current);

            // Actualizar la referencia de los productos originales para subsiguientes diffs
            originalProductsRef.current = JSON.parse(JSON.stringify(products));
            originalOffersRef.current = JSON.parse(JSON.stringify(offers));

            setSettings(newSettings);
            Alert.alert('Éxito', 'Configuración y productos actualizados correctamente en la nube.');
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo guardar la configuración en Firebase.');
        } finally {
            setIsSaving(false);
        }
    };

    const addCategory = () => {
        if (newCategoryName.trim()) {
            if (!categories.includes(newCategoryName.trim())) {
                setCategories([...categories, newCategoryName.trim()]);
                setCategoryColors({ ...categoryColors, [newCategoryName.trim()]: newCategoryColor });
            }
            setNewCategoryName('');
            setNewCategoryColor('#007AFF');
        }
    };
    const removeCategory = (idx: number) => {
        const catToRemove = categories[idx];
        const newCats = categories.filter((_, i) => i !== idx);
        setCategories(newCats);

        const newColors = { ...categoryColors };
        delete newColors[catToRemove];
        setCategoryColors(newColors);

        // CASCADE: Move products in this category to the first available category
        const fallbackCat = newCats[0] || 'Varios';
        setProducts(products.map(p =>
            p.category === catToRemove ? { ...p, category: fallbackCat } : p
        ));

        // CASCADE: Update offers
        setOffers(offers.map(o =>
            o.categories?.includes(catToRemove)
                ? { ...o, categories: (o.categories || []).map(c => c === catToRemove ? fallbackCat : c) }
                : o
        ));
    };

    const updateCategory = (idx: number, newName: string) => {
        const oldName = categories[idx];
        if (oldName === newName) return;

        const newCats = [...categories];
        newCats[idx] = newName;
        setCategories(newCats);

        const newColors = { ...categoryColors };
        // Si no tenía color, le asignamos uno por defecto antes de moverlo
        const currentColor = newColors[oldName] || '#007AFF';
        newColors[newName] = currentColor;

        // Solo borramos el viejo si el nombre realmente cambió
        if (oldName !== newName) {
            delete newColors[oldName];
        }
        setCategoryColors(newColors);

        // CASCADE: Update products using this category
        setProducts(products.map(p =>
            p.category === oldName ? { ...p, category: newName } : p
        ));

        // CASCADE: Update offers using this category
        setOffers(offers.map(o =>
            o.categories?.includes(oldName)
                ? { ...o, categories: (o.categories || []).map(c => c === oldName ? newName : c) }
                : o
        ));
    };

    const renderOfferCalc = (price: number, promo?: number) => {
        if (!promo || price <= 0) return '-';
        const diff = price - promo;
        if (diff <= 0) return '-';
        const pct = Math.round((diff / price) * 100);
        return `-$${diff} (-${pct}%)`;
    };

    const filteredProducts = useMemo(() => {
        let list = myProducts;

        if (activeCatalogTab === 'volume') {
            list = list.filter(p => p.parentId || (p.bulkPricing && p.bulkPricing.length > 0));
        } else if (activeCatalogTab === 'specials') {
            list = list.filter(p => !!p.specialOffer);
        } else if (activeCatalogTab === 'daily') {
            list = list.filter(p => !!p.isDailyOffer);
        } else if (activeCatalogTab === 'combos') {
            return []; // No products, only offers in this tab
        }

        if (filterQuery) {
            const low = filterQuery.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(low) || p.category.toLowerCase().includes(low));
        }
        if (filterStockMode) {
            list = list.filter(p => !p.available);
        }
        if (filterOffersMode) {
            list = list.filter(p => p.isOfferActive);
        }
        if (filterRecentlyImported) {
            list = list.filter(p => (p as any).isRecentlyImported);
        }

        if (sortByCustomOrder) {
            return list.sort((a, b) => {
                const catOrderA = categorySortOrder[a.category] ?? 999;
                const catOrderB = categorySortOrder[b.category] ?? 999;
                if (catOrderA !== catOrderB) return catOrderA - catOrderB;

                const prodOrderA = a.sortOrder ?? 999;
                const prodOrderB = b.sortOrder ?? 999;
                if (prodOrderA !== prodOrderB) return prodOrderA - prodOrderB;

                return a.name.localeCompare(b.name);
            });
        }

        return list.sort((a, b) => a.name.localeCompare(b.name));
    }, [myProducts, filterQuery, filterStockMode, filterOffersMode, activeCatalogTab, categorySortOrder, sortByCustomOrder]);

    const visibleOffers = useMemo(() => {
        if (activeCatalogTab !== 'all' && activeCatalogTab !== 'combos') return [];

        let list = myOffers;
        if (filterQuery) {
            const low = filterQuery.toLowerCase();
            list = list.filter(o => o.name.toLowerCase().includes(low));
        }
        if (activeCatalogTab === 'combos') return list;
        return list.filter(o => o.active);
    }, [myOffers, filterQuery, activeCatalogTab]);

    const draftMyProducts = useMemo(() => draftExcelProducts.filter(p => !p.businessId || p.businessId === businessProfile.id), [draftExcelProducts, businessProfile.id]);

    const draftFilteredProducts = useMemo(() => {
        let result = draftMyProducts;
        if (filterStockMode) result = result.filter(p => !p.available);
        if (filterOffersMode) result = result.filter(p => offers.some(o => o.active && o.requirements?.some(r => r.productId === p.id)));
        if (filterQuery) {
            const lower = filterQuery.toLowerCase();
            result = result.filter(p => p.name.toLowerCase().includes(lower) || p.category.toLowerCase().includes(lower));
        }

        if (sortByCustomOrder) {
            return result.sort((a, b) => {
                const catOrderA = categorySortOrder[a.category] ?? 999;
                const catOrderB = categorySortOrder[b.category] ?? 999;
                if (catOrderA !== catOrderB) return catOrderA - catOrderB;

                const prodOrderA = a.sortOrder ?? 999;
                const prodOrderB = b.sortOrder ?? 999;
                if (prodOrderA !== prodOrderB) return prodOrderA - prodOrderB;

                return a.name.localeCompare(b.name);
            });
        }

        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [draftMyProducts, filterQuery, filterStockMode, filterOffersMode, offers, sortByCustomOrder, categorySortOrder]);

    const sortedExcelProducts = useMemo(() => {
        return excelOrderIds.map(id => draftExcelProducts.find(p => p.id === id)).filter(Boolean) as Product[];
    }, [draftExcelProducts, excelOrderIds]);

    // Open Excel Editor
    useEffect(() => {
        if (isExcelEditorOpen) {
            setDraftExcelProducts(products);
            setExcelHistory([products]);
            setHistoryIndex(0);
        }
    }, [isExcelEditorOpen]);

    const pushExcelState = (newProducts: Product[]) => {
        const newHistory = excelHistory.slice(0, historyIndex + 1);
        newHistory.push(newProducts);
        setExcelHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setDraftExcelProducts(newProducts);
    };

    const updateDraftProduct = (id: string, field: keyof Product, value: any) => {
        pushExcelState(draftExcelProducts.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleCloseExcel = () => {
        if (historyIndex > 0) {
            setCustomConfirm({
                visible: true,
                title: 'Cambios sin guardar',
                message: 'Has realizado modificaciones. ¿Seguro que quieres salir y perder los cambios realizados?',
                isWarning: true,
                cancelText: 'Cancelar',
                confirmText: 'Salir sin guardar',
                onCancel: () => setCustomConfirm(null),
                onConfirm: () => {
                    setCustomConfirm(null);
                    setIsExcelEditorOpen(false);
                }
            });
        } else {
            setIsExcelEditorOpen(false);
        }
    };

    const handleSaveExcel = () => {
        const changedNames: { old: string, new: string }[] = [];
        draftExcelProducts.forEach(draftP => {
            const originalP = products.find(p => p.id === draftP.id);
            if (originalP && originalP.name !== draftP.name) {
                changedNames.push({ old: originalP.name, new: draftP.name });
            }
        });

        if (changedNames.length > 0) {
            const listStr = changedNames.slice(0, 10).map(c => `${c.old} -> ${c.new}`).join('\n') + (changedNames.length > 10 ? '\n...y más' : '');
            setCustomConfirm({
                visible: true,
                title: '¿Reemplazar los siguientes nombres?',
                message: `${listStr}\n\nSi estás de acuerdo, asegurate luego de no tener nombres de productos repetidos o similares.`,
                isWarning: true,
                cancelText: 'NO',
                confirmText: 'SI',
                onCancel: () => setCustomConfirm(null),
                onConfirm: () => {
                    setProducts(draftExcelProducts);
                    setCustomConfirm(null);
                    setIsExcelEditorOpen(false);
                }
            });
        } else {
            setProducts(draftExcelProducts);
            setIsExcelEditorOpen(false);
        }
    };

    // Excel Keyboard Handlers
    useEffect(() => {
        if (!isExcelEditorOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (historyIndex > 0) {
                    const newIndex = historyIndex - 1;
                    setHistoryIndex(newIndex);
                    setDraftExcelProducts(excelHistory[newIndex]);
                }
                return;
            }
            if (!excelEditingCell && excelSelectionStart && excelSelectionEnd && !isMassCategoryOpen && !customConfirm) {
                if (excelSelectionStart.row === excelSelectionEnd.row && excelSelectionStart.col === excelSelectionEnd.col) {
                    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        setExcelEditingCell({ row: excelSelectionStart.row, col: excelSelectionStart.col });
                    } else if (e.key === 'Enter' || e.key === 'F2') {
                        e.preventDefault();
                        setExcelEditingCell({ row: excelSelectionStart.row, col: excelSelectionStart.col });
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isExcelEditorOpen, historyIndex, excelHistory, excelEditingCell, excelSelectionStart, excelSelectionEnd, isMassCategoryOpen, customConfirm]);

    // Excel Paste Handler
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const handlePaste = (e: any) => {
            if (!isExcelEditorOpen || excelEditingCell || !excelSelectionStart || !excelSelectionEnd || isMassCategoryOpen) return;

            const text = e.clipboardData?.getData('text');
            if (!text) return;
            e.preventDefault();

            const lines = text.split(/\r?\n/).map((line: string) => line.split('\t'));
            const minRow = Math.min(excelSelectionStart.row, excelSelectionEnd.row);
            const maxRow = Math.max(excelSelectionStart.row, excelSelectionEnd.row);
            const minCol = Math.min(excelSelectionStart.col, excelSelectionEnd.col);
            const maxCol = Math.max(excelSelectionStart.col, excelSelectionEnd.col);

            const columnsArr = ['name', 'category', 'price', 'promotionalPrice'];

            let nextProds = [...draftExcelProducts];
            let lineIdx = 0;
            for (let r = minRow; r <= maxRow; r++) {
                if (lineIdx >= lines.length) {
                    if (lines.length === 1 && lines[0].length === 1) {
                        // Repeat single value
                    } else {
                        break;
                    }
                }
                const pasteRow = lines.length === 1 ? lines[0] : lines[lineIdx];
                if (pasteRow.length === 1 && pasteRow[0] === '' && lines.length > 1) {
                    lineIdx++;
                    continue;
                }

                const prodId = sortedExcelProducts[r]?.id;
                if (!prodId) continue;

                const pIndex = nextProds.findIndex(p => p.id === prodId);
                if (pIndex === -1) continue;

                const newProd = { ...nextProds[pIndex] };
                let colIdx = 0;
                for (let c = minCol; c <= maxCol; c++) {
                    const val = pasteRow.length === 1 ? pasteRow[0] : pasteRow[colIdx];
                    if (val === undefined) break;

                    const field = columnsArr[c];
                    if (field === 'price') {
                        const clean = val.replace(/[^0-9,.]/g, '');
                        let formatted = clean;
                        const commaIndex = formatted.lastIndexOf(',');
                        const dotIndex = formatted.lastIndexOf('.');
                        if (commaIndex > dotIndex) formatted = formatted.replace(/\./g, '').replace(',', '.');
                        else if (dotIndex > commaIndex && commaIndex !== -1) formatted = formatted.replace(/,/g, '');
                        else if (formatted.includes('.') && formatted.split('.')[1].length === 3 && formatted.indexOf('.') === formatted.lastIndexOf('.')) formatted = formatted.replace(/\./g, '');
                        else if (formatted.includes(',')) formatted = formatted.replace(/,/g, '.');
                        newProd.price = parseFloat(formatted) || 0;
                    } else if (field === 'promotionalPrice') {
                        if (val.trim() === '') newProd.promotionalPrice = undefined;
                        else {
                            const clean = val.replace(/[^0-9,.]/g, '');
                            let formatted = clean;
                            const commaIndex = formatted.lastIndexOf(',');
                            const dotIndex = formatted.lastIndexOf('.');
                            if (commaIndex > dotIndex) formatted = formatted.replace(/\./g, '').replace(',', '.');
                            else if (dotIndex > commaIndex && commaIndex !== -1) formatted = formatted.replace(/,/g, '');
                            else if (formatted.includes('.') && formatted.split('.')[1].length === 3 && formatted.indexOf('.') === formatted.lastIndexOf('.')) formatted = formatted.replace(/\./g, '');
                            else if (formatted.includes(',')) formatted = formatted.replace(/,/g, '.');
                            newProd.promotionalPrice = parseFloat(formatted) || undefined;
                        }
                    } else if (field === 'name') {
                        newProd.name = val.trim();
                    } else if (field === 'category') {
                        newProd.category = val.trim();
                    }
                    colIdx++;
                }
                nextProds[pIndex] = newProd;
                lineIdx++;
            }
            pushExcelState(nextProds);
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [isExcelEditorOpen, excelSelectionStart, excelSelectionEnd, excelEditingCell, sortedExcelProducts, draftExcelProducts, historyIndex, excelHistory, isMassCategoryOpen]);




    // -- DRAFTS --
    const addDraftRow = () => {
        setDrafts([...drafts, { id: Date.now().toString() + Math.random(), name: '', category: categories[0] || 'Varios', price: 0, imageUrl: '', available: true, description: '' }]);
    };

    const updateDraft = (id: string, field: keyof Product, value: any) => {
        setDrafts(drafts.map(d => d.id === id ? { ...d, [field]: value } : d));
    };

    const removeDraft = (id: string) => {
        setDrafts(drafts.filter(d => d.id !== id));
    };

    const saveDrafts = () => {
        if (businessProfile?.status === 'trial') {
            const currentCount = myProducts.length;
            const validCount = drafts.filter(d => d.name && d.price !== undefined && d.price > 0).length;
            if (currentCount + validCount > 20) {
                Alert.alert('Límite de Prueba', 'Alcanzaste el límite de 20 productos de la versión de prueba. ¡Contactanos para desbloquear la versión completa!');
                return;
            }
        }
        const validDrafts = drafts.filter(d => d.name && d.price !== undefined && d.price > 0);
        if (validDrafts.length === 0) {
            Alert.alert('Error', 'No hay productos válidos para guardar. Asegúrese de completar el nombre y el precio.');
            return;
        }

        const newProducts: Product[] = validDrafts.map(d => {
            let promo = d.promotionalPrice;
            if (promo !== undefined && promo > (d.price || 0)) {
                Alert.alert('Error', `El precio de oferta de "${d.name}" no puede ser mayor al precio regular.`);
                throw new Error('Invalid Promo');
            }
            return {
                id: d.id || Date.now().toString() + Math.random(),
                name: d.name || '',
                excelMappingName: d.excelMappingName,
                description: d.description || '',
                price: Number(d.price) || 0,
                promotionalPrice: promo,
                isOfferActive: d.isOfferActive || false,
                imageUrl: d.imageUrl || '',
                category: d.category || categories[0] || 'Varios',
                available: d.available ?? true,
                bulkPricing: d.bulkPricing,
                businessId: businessProfile.id
            };
        });

        setProducts([...products, ...newProducts]);
        setDrafts([{ id: Date.now().toString(), name: '', category: categories[0] || 'Varios', price: 0, imageUrl: '', available: true, description: '' }]);
        setLastPasteBackup(null);
        Alert.alert('Éxito', `${validDrafts.length} productos agregados.`);
    };

    // -- PASTE EXCEL --
    const parsePriceStr = (str: string): number => {
        let s = str.replace(/[^0-9,.-]/g, '');
        if (!s) return 0;

        const match = s.match(/([.,])(\d{1,2})$/);
        if (match) {
            const integerPart = s.slice(0, match.index).replace(/[.,]/g, '');
            const decimalPart = match[2];
            s = integerPart + '.' + decimalPart;
        } else {
            s = s.replace(/[.,]/g, '');
        }
        return Math.ceil(parseFloat(s) || 0);
    };

    const handleEditVolumePricing = (parentId: string) => {
        setVolumeParentId(parentId);
        const parent = products.find(p => p.id === parentId);

        const children = products.filter(p => p.parentId === parentId);
        const childLevels = children.map(c => ({
            id: Math.random().toString(),
            productId: c.id,
            price: c.price.toString(),
            quantity: (c.volumeLevelQuantity || 0).toString()
        }));

        const tierLevels = (parent?.bulkPricing || []).map(bp => ({
            id: Math.random().toString(),
            productId: 'tier', // Special ID for simple tiers
            price: bp.price.toString(),
            quantity: bp.quantity.toString()
        }));

        setVolumeLevels([...childLevels, ...tierLevels].sort((a, b) => parseFloat(a.quantity) - parseFloat(b.quantity)));
        setVolumeView('create');
    };

    const handleSaveVolumePricingConfirm = () => {
        const tiers = volumeLevels.filter(v => v.productId === 'tier').map(v => ({
            quantity: parseFloat(v.quantity) || 0,
            price: parseFloat(v.price) || 0
        }));

        const nextProductIds = new Set(volumeLevels.filter(v => v.productId !== 'tier').map(v => v.productId));

        const nextProducts = products.map(p => {
            if (p.id === volumeParentId) {
                return { ...p, bulkPricing: tiers.length > 0 ? tiers : undefined };
            }
            if (p.parentId === volumeParentId && !nextProductIds.has(p.id)) {
                return { ...p, parentId: undefined, volumeLevelQuantity: undefined };
            }
            const levelConfig = volumeLevels.find(v => v.productId === p.id);
            if (levelConfig) {
                return {
                    ...p,
                    parentId: volumeParentId || undefined,
                    volumeLevelQuantity: parseFloat(levelConfig.quantity) || 0,
                    price: parseFloat(levelConfig.price) || 0
                };
            }
            return p;
        });

        setProducts(nextProducts);
        setVolumeView('list');
    };

    const handleDeleteVolumePricing = (parentId: string) => {
        setProducts(products.map(p => {
            if (p.id === parentId) return { ...p, bulkPricing: undefined };
            if (p.parentId === parentId) return { ...p, parentId: undefined, volumeLevelQuantity: undefined };
            return p;
        }));
    };

    const openVolumePricing = () => {
        const hasExisting = products.some(p => p.parentId);
        if (hasExisting) {
            setVolumeView('list');
        } else {
            setVolumeParentId(null);
            setVolumeLevels([{ id: Math.random().toString(), productId: '', price: '', quantity: '' }]);
            setVolumeView('create');
        }
        setIsVolumePricingModalOpen(true);
    };

    const handlePaste = () => {
        if (!pasteText.trim()) return;
        setPasteCategory(categories[0] || 'Varios');
        setIsPasteCategoryModalOpen(true);
    };

    const performActualImport = (selectedCategory: string, selectedUnitType: 'kg' | 'unit' | 'piece' = 'kg') => {
        const lines = pasteText.split('\n');
        const newDrafts: Partial<Product>[] = [];
        const toUpdate: { id: string, price: number, promo?: number }[] = [];

        lines.forEach((line) => {
            const cols = line.split('\t');
            if (cols.length >= 2 && cols[0].trim()) {
                const name = cols[0].trim();
                const price = parsePriceStr(cols[1]);

                let promo: number | undefined = undefined;
                if (cols.length >= 3 && cols[2].trim()) {
                    promo = parsePriceStr(cols[2]) || undefined;
                }

                let imageUrl = '';
                if (cols.length >= 4 && cols[3].trim()) {
                    imageUrl = cols[3].trim();
                }

                // BUSQUEDA POR NOMBRE + CATEGORIA
                const existingMatch = myProducts.find(p =>
                    (p.name.trim().toLowerCase() === name.toLowerCase() ||
                        (p.excelMappingName && p.excelMappingName.trim().toLowerCase() === name.toLowerCase()))
                    && p.category === selectedCategory
                );

                if (existingMatch) {
                    toUpdate.push({ id: existingMatch.id, price, promo });
                } else {
                    newDrafts.push({
                        id: Date.now().toString() + Math.random(),
                        name,
                        excelMappingName: name,
                        price,
                        promotionalPrice: promo,
                        isOfferActive: promo ? true : false,
                        imageUrl,
                        category: selectedCategory,
                        available: true,
                        unitType: businessProfile.id === 'VfxrjO1hPyeq71vQrLc3JUAgxq93' ? 'kg' : selectedUnitType
                    });
                }
            }
        });

        let updatedProducts = [...products];
        if (toUpdate.length > 0) {
            updatedProducts = updatedProducts.map(p => {
                const up = toUpdate.find(u => u.id === p.id);
                if (up) {
                    return { ...p, price: up.price, promotionalPrice: up.promo, isOfferActive: up.promo ? true : p.isOfferActive };
                }
                return p;
            });
            setProducts(updatedProducts);
        }

        const handleFinalizeNew = () => {
            const currentDrafts = [...drafts.filter(d => Boolean(d.name))];
            const toAdd: Partial<Product>[] = [];

            newDrafts.forEach(nd => {
                const info = extractScaleInfo(nd.name!);
                const targetBaseName = mergeMemory[nd.name!] || (info.baseName !== nd.name ? info.baseName : null);

                if (targetBaseName) {
                    const existingDraft = currentDrafts.find(d => d.name === targetBaseName) || toAdd.find(d => d.name === targetBaseName);
                    if (existingDraft) {
                        const newTier = { quantity: info.quantity, price: nd.price || 0 };
                        const existingBp = existingDraft.bulkPricing || [];
                        const filteredBp = existingBp.filter(bp => bp.quantity !== info.quantity);
                        existingDraft.bulkPricing = [...filteredBp, newTier].sort((a, b) => a.quantity - b.quantity);
                        return;
                    }
                }
                toAdd.push(nd);
            });

            setLastPasteBackup(drafts);
            setDrafts([...currentDrafts, ...toAdd]);
            setIsPasteModalOpen(false);
            setIsDraftsModalOpen(true);
            setPasteText('');
        };

        if (newDrafts.length > 0) {
            const warningText = `Se encontraron ${newDrafts.length} ítems en "${selectedCategory}" que no coinciden con el catálogo actual. ¿Querés añadirlos como nuevos?`;

            setCustomConfirm({
                visible: true,
                title: 'Nuevos productos encontrados',
                message: warningText,
                isWarning: true,
                cancelText: 'No, descartar',
                confirmText: 'Sí, añadirlos',
                onCancel: () => {
                    setCustomConfirm(null);
                    setIsPasteModalOpen(false);
                    setPasteText('');
                    if (toUpdate.length > 0) Alert.alert('Éxito', `Se actualizaron ${toUpdate.length} productos en "${selectedCategory}".`);
                },
                onConfirm: () => {
                    setCustomConfirm(null);
                    handleFinalizeNew();
                }
            });
        } else {
            setIsPasteModalOpen(false);
            setPasteText('');
            if (toUpdate.length > 0) Alert.alert('Éxito', `Se actualizaron los precios de ${toUpdate.length} productos en "${selectedCategory}".`);
        }
    };

    const undoPaste = () => {
        if (lastPasteBackup) {
            setDrafts(lastPasteBackup);
            setLastPasteBackup(null);
            Alert.alert('Deshecho', 'Borradores restaurados al estado anterior.');
        }
    };

    const handleCloseDrafts = () => {
        const hasData = drafts.some(d => d.name?.trim() || (d.price && d.price > 0));
        if (hasData) {
            setCustomConfirm({
                visible: true,
                title: 'Borradores pendientes',
                message: 'Si cerrás, vas a tener que volver a introducir los productos. ¿Cerrar?',
                isWarning: false,
                cancelText: 'No',
                confirmText: 'Sí',
                onCancel: () => setCustomConfirm(null),
                onConfirm: () => {
                    setCustomConfirm(null);
                    setDrafts([{ id: Date.now().toString(), name: '', category: categories[0] || 'Varios', price: 0, imageUrl: '', available: true, description: '' }]);
                    setIsDraftsModalOpen(false);
                }
            });
        } else {
            setIsDraftsModalOpen(false);
        }
    };

    // -- CATALOG --
    const updateProduct = (id: string, field: keyof Product, value: any) => {
        setProducts(prevProducts => prevProducts.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const parsePromoStr = (text: string, basePrice: number): number | undefined => {
        if (!text || text.trim() === '') return undefined;
        if (text.includes('%')) {
            const percent = parseFloat(text.replace('%', ''));
            if (!isNaN(percent) && percent > 0 && percent <= 100) {
                return Math.round(basePrice * (1 - (percent / 100)));
            }
        } else {
            const val = parseFloat(text);
            if (!isNaN(val)) return val;
        }
        return undefined;
    };

    const handlePromoCommit = (id: string, text: string, basePrice: number, isDraft: boolean) => {
        const calc = parsePromoStr(text, basePrice);
        if (calc !== undefined && calc > basePrice) {
            Alert.alert('Cuidado', 'El precio de oferta no puede ser mayor al precio regular.');
            if (isDraft) updateDraft(id, 'promotionalPrice', undefined);
            else updateProduct(id, 'promotionalPrice', undefined);
        } else {
            if (isDraft) updateDraft(id, 'promotionalPrice', calc);
            else updateProduct(id, 'promotionalPrice', calc);
        }
        setActivePromos(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const deleteSelected = () => {
        if (selectedIds.size === 0) return;
        recordCatalogChange(`Eliminación de ${selectedIds.size} productos seleccionados`, products);
        setProducts(products.filter(p => !selectedIds.has(p.id)));
        setSelectedIds(new Set());
    };

    const renderHeaderRow = (isDrafts: boolean) => {
        const isFood = settings.isFoodBusiness;
        return (
            <View style={[styles.row, styles.headerRow, { minWidth: isFood ? 2035 : 1535 }]}>
                {!isDrafts && <Text style={[styles.headerText, { width: 40, textAlign: 'center' }]}>Sel.</Text>}
                <Text style={[styles.cell, styles.headerText, { flex: 2 }]}>Nombre ⓘ</Text>
                {isFood && <Text style={[styles.cell, styles.headerText, { flex: 2 }]}>Descripción ⓘ</Text>}
                {isFood && <Text style={[styles.cell, styles.headerText, { flex: 2 }]}>Ingredientes ⓘ</Text>}
                <Text style={[styles.cell, styles.headerText, { flex: 1.5 }]}>Categoría ⓘ</Text>
                <Text style={[styles.cell, styles.headerText, { flex: 1 }]}>Precio ($)</Text>
                                        <Text style={[styles.cell, styles.headerText, { width: 95, textAlign: 'center' }]}>Tipo Venta</Text>
                                        <Text style={[styles.cell, styles.headerText, { width: 90, textAlign: 'center' }]}>Peso Apx(kg)</Text>
                {isFood && <Text style={[styles.cell, styles.headerText, { flex: 1 }]}>P. Anticipado ($)</Text>}
                {isFood && <Text style={[styles.cell, styles.headerText, { width: 80, textAlign: 'center' }]}>Cant. Stock</Text>}
                <Text style={[styles.cell, styles.headerText, { flex: 1 }]}>P. Oferta ⓘ</Text>
                <Text style={[styles.cell, styles.headerText, { width: 90, textAlign: 'center' }]}>Clc. Oferta</Text>
                {!isDrafts && !isFood && <Text style={[styles.cell, styles.headerText, { width: 170, textAlign: 'center' }]}>Precios x Volumen</Text>}
                <Text style={[styles.cell, styles.headerText, { width: 60, textAlign: 'center' }]}>Oferta? ⓘ</Text>
                <Text style={[styles.cell, styles.headerText, { width: 60, textAlign: 'center' }]}>Stock? ⓘ</Text>
                <Text style={[styles.cell, styles.headerText, { flex: 2, maxWidth: 200 }]}>Imagen (URL) ⓘ</Text>
                <Text style={[styles.cell, styles.headerText, { width: 40, textAlign: 'center' }]}></Text>
            </View>
        );
    };

    const SelectCategory = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
        const catColor = categoryColors[value] || '#888888';
        const bgColor = catColor + '15';
        const isMismatched = !categories.includes(value) && !!value;

        if (Platform.OS === 'web') {
            return (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bgColor, borderWidth: 1, borderColor: catColor, borderRadius: 4, paddingHorizontal: 8, height: 36 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: catColor, marginRight: 8 }} />
                    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, border: 'none', backgroundColor: 'transparent', outline: 'none', fontSize: 14, color: isMismatched ? 'red' : 'inherit' }}>
                        {isMismatched ? <option key="mismatched" value={value}>{value} (Inválida)</option> : null}
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </View>
            );
        }
        return (
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bgColor, borderWidth: 1, borderColor: catColor, borderRadius: 4, paddingHorizontal: 8, height: 36 }} onPress={() => Alert.alert('Dropdown', 'Se enviará la función de picker en app nativa.')}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: catColor, marginRight: 8 }} />
                <Text style={{ fontSize: 14 }}>{value || 'Seleccionar'}</Text>
            </Pressable>
        );
    };

    const SearchableDropdown = ({ value, onSelect, placeholder, options, style }: { value: string, onSelect: (val: string) => void, placeholder: string, options: any[], style?: any }) => {
        const [search, setSearch] = useState("");
        const [isOpen, setIsOpen] = useState(false);
        const selectedOption = options.find(o => o.id === value);

        const filtered = useMemo(() => {
            if (!search) return options;
            const low = search.toLowerCase();
            return options.filter(o => o.name.toLowerCase().includes(low));
        }, [search, options]);

        return (
            <View style={[{ zIndex: isOpen ? 9999 : 1, position: "relative" }, style]}>
                <Pressable
                    style={[styles.modalInput, { marginBottom: 0, backgroundColor: "#fff", flexDirection: "row", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }]}
                    onPress={() => {
                        setIsOpen(!isOpen);
                        setSearch("");
                    }}
                >
                    <Text style={{ color: selectedOption ? "#1e293b" : "#94a3b8", fontSize: 14, fontWeight: selectedOption ? "bold" : "normal" }}>
                        {selectedOption ? selectedOption.name : placeholder}
                    </Text>
                    <FontAwesome name={isOpen ? "chevron-up" : "chevron-down"} size={12} color="#64748b" />
                </Pressable>

                {isOpen && (
                    <View style={{ position: "absolute", top: 45, left: 0, right: 0, backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, maxHeight: 220, zIndex: 10000, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 }}>
                        <View style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", backgroundColor: "#f8fafc" }}>
                            <TextInput
                                style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: "#1e293b" }}
                                placeholder="🔍 Buscar producto..."
                                value={search}
                                onChangeText={setSearch}
                                autoFocus
                            />
                        </View>
                        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 160 }}>
                            {filtered.map(opt => (
                                <Pressable
                                    key={opt.id}
                                    style={({ pressed }) => ({
                                        padding: 10,
                                        backgroundColor: pressed ? "#f1f5f9" : (opt.id === value ? "#eff6ff" : "#fff"),
                                        borderBottomWidth: 1,
                                        borderBottomColor: "#f1f5f9",
                                        flexDirection: "row",
                                        justifyContent: "space-between",
                                        alignItems: "center"
                                    })}
                                    onPress={() => {
                                        onSelect(opt.id);
                                        setIsOpen(false);
                                        setSearch("");
                                    }}
                                >
                                    <Text style={{ fontWeight: opt.id === value ? "bold" : "normal", color: opt.id === value ? "#2563eb" : "#1e293b", fontSize: 13 }}>
                                        {opt.name} {opt.price !== undefined ? `($${opt.price})` : ""}
                                    </Text>
                                    {opt.id === value && <FontAwesome name="check" size={12} color="#2563eb" />}
                                </Pressable>
                            ))}
                            {filtered.length === 0 && (
                                <Text style={{ padding: 12, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                                    No se encontraron productos
                                </Text>
                            )}
                        </ScrollView>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={{ flex: 1 }}>
            <ScrollView style={styles.container}>
                <View style={styles.content}>
                    <Text style={styles.pageTitle}>Panel de Control: Inventario Web</Text>
                    <Text style={styles.subtitle}>Añade y edita múltiples productos en simultáneo.</Text>

                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
                            <Pressable style={[styles.addBtn, { backgroundColor: '#007AFF', marginRight: 10 }]} onPress={() => setIsDraftsModalOpen(true)}>
                                <Text style={styles.btnText}>+ Añadir Nuevo Producto</Text>
                            </Pressable>
                            <Pressable style={[styles.addBtn, { backgroundColor: '#eab308', marginRight: 10 }]} onPress={openSpecialsPricing}>
                                <Text style={styles.btnText}>⚡ Especiales</Text>
                            </Pressable>
                            <Pressable style={[styles.addBtn, { backgroundColor: '#d97706', marginRight: 10 }]} onPress={openDailyOffers}>
                                <Text style={styles.btnText}>🔥 Ofertas del Día</Text>
                            </Pressable>
                            
                            {!IS_DEDICATED_APP && (
                                <Pressable style={[styles.addBtn, { backgroundColor: '#10b981', marginRight: 10 }]} onPress={exportPriceListToExcel}>
                                    <Text style={styles.btnText}>⬇️ Exportar Plantilla Excel</Text>
                                </Pressable>
                            )}
                            <Pressable style={[styles.addBtn, { backgroundColor: '#dc2626', marginRight: 10 }]} onPress={() => setIsSmartExcelModalOpen(true)}>

                                <Text style={styles.btnText}>📥 Subir Excel Inteligente</Text>
                            </Pressable>
                            {user?.email === 'cocobustos.93@gmail.com' && settings.rawExcelGrid && (
                                <Pressable style={[styles.addBtn, { backgroundColor: '#3b82f6', marginRight: 10 }]} onPress={() => setIsSuperadminRawExcelOpen(true)}>
                                    <Text style={styles.btnText}>Ver Excel Original</Text>
                                </Pressable>
                            )}
                            <Pressable style={[styles.addBtn, { backgroundColor: '#4b5563', marginRight: 10 }]} onPress={() => setIsHistoryModalOpen(true)}>
                                <Text style={styles.btnText}>📜 Historial de Cambios {catalogHistory.length > 0 ? `(${catalogHistory.length})` : ''}</Text>
                            </Pressable>
                            <Pressable style={[styles.addBtn, { backgroundColor: '#FF9500', marginRight: 10 }]} onPress={() => setIsPasteModalOpen(true)}>
                                <Text style={styles.btnText}>📋 Pegar desde Excel</Text>
                            </Pressable>
                            <Pressable style={[styles.addBtn, { backgroundColor: '#8a2be2' }]} onPress={() => { setComboView('list'); setIsComboModalOpen(true); }}>
                                <Text style={styles.btnText}>🎁 Gestionar Combos</Text>
                            </Pressable>
                            <Pressable style={[styles.addBtn, { backgroundColor: '#10b981', marginLeft: 10 }]} onPress={() => {
                                setExcelOrderIds(filteredProducts.map(p => p.id));
                                setIsExcelEditorOpen(true);
                            }}>
                                <Text style={styles.btnText}>✏️ Editar Múltiples</Text>
                            </Pressable>
                            <Pressable style={[styles.addBtn, { backgroundColor: '#f59e0b', marginLeft: 10 }]} onPress={openVolumePricing}>
                                <Text style={styles.btnText}>📦 Precio por volumen</Text>
                            </Pressable>
                            <Pressable style={[styles.addBtn, { backgroundColor: '#E5E5EA', marginLeft: 'auto' }]} onPress={() => setIsHelpOpen(true)}>
                                <Text style={[styles.btnText, { color: '#333' }]}>❔ Ayuda</Text>
                            </Pressable>
                        </View>
                    </View>

                    <View style={[styles.section, { marginTop: 40 }]}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Catálogo Actual</Text>
                            <TextInput style={styles.searchInput} placeholder="Buscar por Nombre o Categoría..." value={filterQuery} onChangeText={setFilterQuery} />
                            {selectedIds.size > 0 && (
                                <Pressable style={[styles.addBtn, { backgroundColor: '#FF3B30', marginLeft: 15 }]} onPress={deleteSelected}>
                                    <Text style={styles.btnText}>Eliminar {selectedIds.size} seleccionados</Text>
                                </Pressable>
                            )}
                        </View>

                        {/* TABS DE VISTA */}
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 }}>
                            {[
                                { id: 'all', label: 'Todos los Productos', color: '#007AFF', icon: '📋' },
                                { id: 'volume', label: 'Por Volumen', color: '#10b981', icon: '📦' },
                                { id: 'specials', label: 'Especiales / Flash', color: '#eab308', icon: '⚡' },
                                { id: 'daily', label: 'Ofertas del Día', color: '#d97706', icon: '🔥' },
                                { id: 'combos', label: 'Combos / Bundles', color: '#8a2be2', icon: '🎁' }
                            ].map(tab => {
                                const isActive = activeCatalogTab === tab.id;
                                return (
                                    <Pressable
                                        key={tab.id}
                                        onPress={() => setActiveCatalogTab(tab.id as any)}
                                        style={{
                                            paddingVertical: 10,
                                            paddingHorizontal: 20,
                                            borderRadius: 8,
                                            backgroundColor: isActive ? tab.color : '#f3f4f6',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 8,
                                            borderWidth: 1,
                                            borderColor: isActive ? tab.color : '#e5e7eb'
                                        }}
                                    >
                                        <Text style={{ fontSize: 16 }}>{tab.icon}</Text>
                                        <Text style={{ fontWeight: 'bold', color: isActive ? '#fff' : '#4b5563' }}>{tab.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View style={styles.sectionHeader}>
                            <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {categories.map(c => {
                                    const catColor = categoryColors[c] || '#007AFF';
                                    return (
                                        <Pressable key={c} onPress={() => setFilterQuery(filterQuery === c ? '' : c)} style={[styles.filterChip, filterQuery === c && { backgroundColor: catColor, borderColor: catColor }]}>
                                            <Text style={[styles.filterChipText, filterQuery === c && styles.filterChipTextActive]}>{c}</Text>
                                        </Pressable>
                                    );
                                })}
                                <Pressable onPress={() => setFilterStockMode(!filterStockMode)} style={[styles.filterChip, filterStockMode && { backgroundColor: '#FF3B30', borderColor: '#FF3B30' }]}>
                                    <Text style={[styles.filterChipText, filterStockMode && styles.filterChipTextActive]}>Sin Stock</Text>
                                </Pressable>
                                <Pressable onPress={() => setFilterOffersMode(!filterOffersMode)} style={[styles.filterChip, filterOffersMode && { backgroundColor: '#FF9500', borderColor: '#FF9500' }]}>
                                    <Text style={[styles.filterChipText, filterOffersMode && styles.filterChipTextActive]}>Ofertas</Text>
                                </Pressable>
                                <Pressable onPress={() => setFilterRecentlyImported(!filterRecentlyImported)} style={[styles.filterChip, filterRecentlyImported && { backgroundColor: '#10b981', borderColor: '#10b981' }]}>
                                    <Text style={[styles.filterChipText, filterRecentlyImported && styles.filterChipTextActive]}>✨ Nuevos</Text>
                                </Pressable>
                                <Pressable onPress={() => alert('Muestra únicamente los productos creados recientemente durante la última importación de Excel.')} style={{ paddingHorizontal: 4, justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: 'bold' }}>❓</Text>
                                </Pressable>

                                <View style={{ borderLeftWidth: 1, borderLeftColor: '#ddd', height: 25, marginHorizontal: 5 }} />

                                <Pressable
                                    onPress={() => setSortByCustomOrder(!sortByCustomOrder)}
                                    style={[styles.filterChip, { borderColor: '#8b5cf6' }, sortByCustomOrder && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }]}
                                >
                                    <Text style={[styles.filterChipText, sortByCustomOrder && styles.filterChipTextActive, { color: sortByCustomOrder ? '#fff' : '#8b5cf6' }]}>
                                        {sortByCustomOrder ? '✓ Orden de Cliente' : 'Ordenar por mi Órden'}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                        
                        {/* OFERTAS Y COMBOS DESTACADOS */}
                        {(offers.length > 0 || products.some(p => p.specialOffer || p.isDailyOffer)) && (
                            <View style={{ marginBottom: 20, backgroundColor: '#f8fafc', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 10 }}>Ofertas y Combos Activos</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                    {offers.map(o => (
                                        <Pressable key={o.id} onPress={() => { handleEditCombo(o); setComboView('create'); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#faf5ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#d8b4fe' }}>
                                            <View>
                                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#7e22ce' }}>Combo: {o.name}</Text>
                                                <Text style={{ fontSize: 11, color: '#9333ea' }}>{settings.currency || '$'}{o.bundlePrice}</Text>
                                            </View>
                                        </Pressable>
                                    ))}
                                    {products.filter(p => p.specialOffer).map(p => (
                                        <Pressable key={p.id} onPress={() => handleEditSpecial(p.id)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fefce8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#fde047' }}>
                                            <View>
                                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#a16207' }}>Especial: {p.name}</Text>
                                                <Text style={{ fontSize: 11, color: '#ca8a04' }}>{settings.currency || '$'}{p.specialOffer?.price}</Text>
                                            </View>
                                        </Pressable>
                                    ))}
                                    {products.filter(p => p.isDailyOffer).map(p => (
                                        <Pressable key={p.id} onPress={() => handleEditDailyOffer(p.id)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#fcd34d' }}>
                                            <View>
                                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#b45309' }}>Día: {p.name}</Text>
                                                <Text style={{ fontSize: 11, color: '#d97706' }}>{settings.currency || '$'}{p.dailyOfferPrice}</Text>
                                            </View>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        )}
\n<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
                            <View style={{ minWidth: 1350, paddingBottom: 20 }}>
                                {renderHeaderRow(false)}
                                {visibleOffers.map(offer => {
                                    let originalPrice = (offer.requirements || []).reduce((sum: number, req: any) => {
                                        const p = myProducts.find(prod => prod.id === req.productId);
                                        return sum + (p ? p.price * req.quantity : 0);
                                    }, 0);
                                    const liveRaw = activePromos[offer.id] ?? (offer.bundlePrice || 0).toString();
                                    const liveCalc = activePromos[offer.id] !== undefined ? parseFloat(liveRaw) || 0 : (offer.bundlePrice || 0);
                                    return (
                                        <View key={`offer-${offer.id}`} style={[styles.row, { backgroundColor: '#FFF5E5' }]}>
                                            <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
                                                <Text style={{ fontSize: 18, color: '#FF9500' }}>🎁</Text>
                                            </View>
                                            <View style={[styles.cell, { flex: 2 }]}>
                                                <TextInput style={styles.input} value={offer.name} onChangeText={(val) => updateOfferField(offer.id, 'name', val)} />
                                            </View>
                                            {(settings.isFoodBusiness && businessProfile?.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93') && (
                                                <>
                                                    <View style={[styles.cell, { flex: 2 }]} />
                                                    <View style={[styles.cell, { flex: 2 }]} />
                                                    <View style={[styles.cell, { flex: 1 }]} />
                                                    <View style={[styles.cell, { width: 80 }]} />
                                                </>
                                            )}
                                            <View style={[styles.cell, { flex: 1.5 }]}>
                                                <Text style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>Combo Especial</Text>
                                            </View>
                                            <View style={[styles.cell, { flex: 1 }]}>
                                                <Text style={{ fontSize: 14, color: '#333' }}>Orig: ${originalPrice.toFixed(0)}</Text>
                                            </View>
                                            <View style={[styles.cell, { flex: 1 }]}>
                                                <TextInput
                                                    style={styles.input}
                                                    value={liveRaw}
                                                    onChangeText={(val) => setActivePromos({ ...activePromos, [offer.id]: val })}
                                                    onEndEditing={() => {
                                                        updateOfferField(offer.id, 'bundlePrice', parseFloat(liveRaw) || (offer.bundlePrice || 0));
                                                        setActivePromos(prev => { const copy = { ...prev }; delete copy[offer.id]; return copy; });
                                                    }}
                                                    placeholder="$$$"
                                                    keyboardType="numeric"
                                                />
                                            </View>
                                            <View style={[styles.cell, { width: 90, alignItems: 'center', justifyContent: 'center' }]}>
                                                <Text style={{ fontSize: 12, color: '#FF3B30', fontWeight: 'bold' }}>{renderOfferCalc(originalPrice, liveCalc)}</Text>
                                            </View>
                                            {!settings.isFoodBusiness && <View style={[styles.cell, { width: 170, alignItems: 'center' }]}></View>}
                                            <View style={[styles.cell, { width: 60, alignItems: 'center' }]}></View>
                                            <View style={[styles.cell, { width: 60, alignItems: 'center' }]}>
                                                <Switch style={{ transform: Platform.OS === 'web' ? 'scale(0.8)' : [{ scaleX: 0.8 }, { scaleY: 0.8 }] } as any} value={offer.active} onValueChange={(val) => updateOfferField(offer.id, 'active', val)} trackColor={{ false: '#ccc', true: '#007AFF' }} thumbColor={'#fff'} {...({ activeThumbColor: '#fff' } as any)} />
                                            </View>
                                            <View style={[styles.cell, { flex: 2, maxWidth: 200 }]}>
                                                <Pressable style={{ backgroundColor: '#007AFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, alignSelf: 'center' }} onPress={() => handleEditCombo(offer)}>
                                                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Editar Combo</Text>
                                                </Pressable>
                                            </View>
                                            <Pressable style={{ width: 40, alignItems: 'center', justifyContent: 'center' }} onPress={() => setOffers(offers.filter(o => o.id !== offer.id))}>
                                                <Text style={{ color: 'red', fontWeight: 'bold', fontSize: 16 }}>X</Text>
                                            </Pressable>
                                        </View>
                                    );
                                })}
                                {filteredProducts.map((product) => {
                                    const liveRaw = activePromos[product.id] ?? product.promotionalPrice?.toString() ?? '';
                                    const liveCalc = activePromos[product.id] !== undefined ? parsePromoStr(liveRaw, product.price) : product.promotionalPrice;

                                    const isProductInCombo = offers.some(o => o.active && o.requirements?.some((r: any) => r.productId === product.id) && o.bundlePrice !== undefined);
                                    const isProductSpecial = product.specialOffer?.active;
                                    const isProductDaily = product.isDailyOffer;
                                    const hasPromo = isProductInCombo || isProductSpecial || isProductDaily;

                                    return (
                                        <View key={product.id} style={[
                                            styles.row,
                                            selectedIds.has(product.id) && { backgroundColor: '#FFF5F5' },
                                            !product.available && { backgroundColor: '#FEF2F2', borderLeftWidth: 4, borderLeftColor: '#EF4444' },
                                            (hasPromo && product.available && !selectedIds.has(product.id)) && { backgroundColor: '#FEF9C3' }
                                        ]}>
                                            <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
                                                <Pressable onPress={() => toggleSelection(product.id)} style={{ padding: 10 }}>
                                                    {selectedIds.has(product.id) ? <Text style={{ fontSize: 18, color: '#FF3B30' }}>☑</Text> : <Text style={{ fontSize: 18, color: '#ccc' }}>☐</Text>}
                                                </Pressable>
                                            </View>
                                            <View style={[styles.cell, { flex: 2 }]}>
                                                <TextInput style={styles.input} value={product.name} onChangeText={(val) => updateProduct(product.id, 'name', val)} />
                                            </View>
                                            {settings.isFoodBusiness && (
                                                <>
                                                    <View style={[styles.cell, { flex: 2 }]}>
                                                        <TextInput style={styles.input} value={product.description || ''} onChangeText={(val) => updateProduct(product.id, 'description', val)} placeholder="Ej: Hamburguesa doble..." />
                                                    </View>
                                                    <View style={[styles.cell, { flex: 2 }]}>
                                                        <TextInput style={styles.input} value={product.ingredients || ''} onChangeText={(val) => updateProduct(product.id, 'ingredients', val)} placeholder="Ej: Pan, Carne, Queso..." />
                                                    </View>
                                                </>
                                            )}
                                            <View style={[styles.cell, { flex: 1.5 }]}>
                                                <SelectCategory value={product.category} onChange={(val) => updateProduct(product.id, 'category', val)} />
                                            </View>
                                            <View style={[styles.cell, { flex: 1 }]}>
                                                <TextInput style={styles.input} value={product.price.toString()} onChangeText={(val) => updateProduct(product.id, 'price', parseFloat(val) || 0)} keyboardType="numeric" />
                                                {isProductSpecial && (
                                                    <Pressable onPress={() => handleEditSpecial(product.id)} style={{marginTop: 4, backgroundColor: '#fefce8', padding: 2, borderRadius: 4, borderWidth: 1, borderColor: '#fde047'}}>
                                                        <Text style={{fontSize: 9, color: '#ca8a04', fontWeight: 'bold', textAlign: 'center'}}>Especial: ${product.specialOffer?.price}</Text>
                                                    </Pressable>
                                                )}
                                                {isProductDaily && (
                                                    <Pressable onPress={() => handleEditDailyOffer(product.id)} style={{marginTop: 4, backgroundColor: '#fffbeb', padding: 2, borderRadius: 4, borderWidth: 1, borderColor: '#fcd34d'}}>
                                                        <Text style={{fontSize: 9, color: '#d97706', fontWeight: 'bold', textAlign: 'center'}}>Día: ${product.dailyOfferPrice}</Text>
                                                    </Pressable>
                                                )}
                                                {offers.filter(o => o.active && o.requirements?.some((r: any) => r.productId === product.id)).map(o => (
                                                    <Pressable key={o.id} onPress={() => handleEditCombo(o)} style={{marginTop: 4, backgroundColor: '#faf5ff', padding: 2, borderRadius: 4, borderWidth: 1, borderColor: '#e9d5ff'}}>
                                                        <Text style={{fontSize: 9, color: '#9333ea', fontWeight: 'bold', textAlign: 'center'}}>Combo: ${o.bundlePrice}</Text>
                                                    </Pressable>
                                                ))}
                                            </View>
                                            <View style={[styles.cell, { width: 95 }]}>
                                                {Platform.OS === 'web' ? (
                                                    <select
                                                        style={{ width: '100%', padding: 5, borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                                                        value={product.unitType || 'kg'}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            updateProduct(product.id, 'unitType', val);
                                                            if (val !== 'piece') updateProduct(product.id, 'approxWeight', undefined);
                                                        }}
                                                    >
                                                        <option value="kg">Kilo</option>
                                                        <option value="unit">Unidad</option>
                                                        <option value="piece">Pieza</option>
                                                    </select>
                                                ) : (
                                                    <Text style={{ fontSize: 12 }}>{product.unitType || 'kg'}</Text>
                                                )}
                                            </View>
                                            <View style={[styles.cell, { width: 90 }]}>
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: product.unitType === 'piece' ? '#fff' : '#f1f5f9' }]}
                                                    value={product.approxWeight ? product.approxWeight.toString() : ''}
                                                    editable={product.unitType === 'piece'}
                                                    placeholder={product.unitType === 'piece' ? 'Ej: 20' : '-'}
                                                    keyboardType="numeric"
                                                    onChangeText={(val) => {
                                                        const num = parseFloat(val.replace(',', '.'));
                                                        updateProduct(product.id, 'approxWeight', isNaN(num) ? undefined : num);
                                                    }}
                                                />
                                            </View>

                                            {settings.isFoodBusiness && (
                                                <>
                                                    <View style={[styles.cell, { flex: 1 }]}>
                                                        <TextInput
                                                            style={styles.input}
                                                            keyboardType="numeric"
                                                            value={product.advancePrice !== undefined && product.advancePrice !== null ? product.advancePrice.toString() : ''}
                                                            onChangeText={(val) => {
                                                                const num = parseFloat(val.replace(',', '.'));
                                                                updateProduct(product.id, 'advancePrice', isNaN(num) ? undefined : num);
                                                            }}
                                                            placeholder="Mismo precio"
                                                        />
                                                    </View>
                                                    <View style={[styles.cell, { width: 80 }]}>
                                                        <TextInput
                                                            style={[styles.input, { textAlign: 'center' }]}
                                                            keyboardType="numeric"
                                                            value={product.stock !== undefined && product.stock !== null ? product.stock.toString() : ''}
                                                            onChangeText={(val) => {
                                                                const num = parseInt(val);
                                                                updateProduct(product.id, 'stock', isNaN(num) ? null : num);
                                                            }}
                                                            placeholder="∞"
                                                        />
                                                    </View>
                                                </>
                                            )}
                                            {!product.available ? (
                                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 10 }}>
                                                    <Pressable
                                                        style={{
                                                            flex: 1,
                                                            backgroundColor: product.autoRestock ? '#2563eb' : '#EF4444',
                                                            paddingVertical: 8,
                                                            paddingHorizontal: 12,
                                                            borderRadius: 6,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            flexDirection: 'row',
                                                            gap: 6,
                                                            borderWidth: 1,
                                                            borderColor: product.autoRestock ? '#1d4ed8' : '#DC2626'
                                                        }}
                                                        onPress={() => openRestockModalForProduct(product.id, 'reactivate')}
                                                    >
                                                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                                                            🔄 Reactivar Stock {product.autoRestock ? `(Auto: ${product.restockDate} ${product.restockTime})` : ''}
                                                        </Text>
                                                    </Pressable>
                                                </View>
                                            ) : (
                                                <>
                                                    <View style={[styles.cell, { flex: 1 }]}>
                                                        <TextInput
                                                            style={styles.input}
                                                            value={liveRaw}
                                                            onChangeText={(val) => setActivePromos({ ...activePromos, [product.id]: val })}
                                                            onEndEditing={() => handlePromoCommit(product.id, liveRaw, product.price, false)}
                                                            placeholder="$$$ o %"
                                                        />
                                                    </View>
                                                    <View style={[styles.cell, { width: 90, alignItems: 'center', justifyContent: 'center' }]}>
                                                        <Text style={{ fontSize: 12, color: '#FF3B30', fontWeight: 'bold' }}>{renderOfferCalc(product.price, liveCalc)}</Text>
                                                    </View>
                                                    {!settings.isFoodBusiness && (
                                                        <View style={[styles.cell, { width: 170, justifyContent: 'center' }]}>
                                                            {(() => {
                                                                const combinedLevels: { quantity: number, price: number, type: 'tier' | 'product', id?: string }[] = [];

                                                                (product.bulkPricing || []).forEach((bp, i) => {
                                                                    combinedLevels.push({ quantity: bp.quantity, price: bp.price / bp.quantity, type: 'tier' });
                                                                });

                                                                products.filter(p => p.parentId === product.id).forEach(child => {
                                                                    const pricePerUnit = child.price / (child.volumeLevelQuantity || 1);
                                                                    const existing = combinedLevels.find(l => l.quantity === child.volumeLevelQuantity && Math.abs(l.price - pricePerUnit) < 1);
                                                                    if (existing) {
                                                                        existing.type = 'product';
                                                                        existing.id = child.id;
                                                                    } else {
                                                                        combinedLevels.push({ quantity: child.volumeLevelQuantity || 1, price: pricePerUnit, type: 'product', id: child.id });
                                                                    }
                                                                });

                                                                return combinedLevels.sort((a, b) => a.quantity - b.quantity).map((l, i) => (
                                                                    <Pressable
                                                                        key={`${l.type}-${i}`}
                                                                        style={{
                                                                            backgroundColor: l.type === 'product' ? '#e0f2fe' : '#fef9c3',
                                                                            padding: 4,
                                                                            borderRadius: 4,
                                                                            marginBottom: 4,
                                                                            borderWidth: 1,
                                                                            borderColor: l.type === 'product' ? '#bae6fd' : '#fef08a'
                                                                        }}
                                                                        onPress={() => {
                                                                            if (l.type === 'product') {
                                                                                setExcelOrderIds(filteredProducts.map(p => p.id));
                                                                                setExcelFocusId(l.id!);
                                                                                setIsExcelEditorOpen(true);
                                                                            } else {
                                                                                setExcelOrderIds(filteredProducts.map(p => p.id));
                                                                                setExcelFocusId(product.id);
                                                                                setIsExcelEditorOpen(true);
                                                                            }
                                                                        }}
                                                                    >
                                                                        <Text style={{ fontSize: 11, textAlign: 'center' }}>
                                                                            {l.type === 'product' ? '📦' : '🔥'} {l.quantity} a ${l.price.toFixed(0)} c/u
                                                                        </Text>
                                                                    </Pressable>
                                                                ));
                                                            })()}
                                                            {(!product.bulkPricing?.length && !products.some(p => p.parentId === product.id)) && (
                                                                <Pressable onPress={() => { setVolumeParentId(product.id); setVolumeView('create'); setIsVolumePricingModalOpen(true); }}>
                                                                    <Text style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>+ Añadir volumen</Text>
                                                                </Pressable>
                                                            )}
                                                        </View>
                                                    )}
                                                    <View style={[styles.cell, { width: 60, alignItems: 'center' }]}>
                                                        <Switch
                                                            style={{ transform: Platform.OS === 'web' ? 'scale(0.8)' : [{ scaleX: 0.8 }, { scaleY: 0.8 }] } as any}
                                                            value={product.isOfferActive || false}
                                                            onValueChange={(val) => {
                                                                if (val) {
                                                                    setCustomConfirm({
                                                                        visible: true,
                                                                        title: 'Mostrar como Tarjeta',
                                                                        message: '¿Querés que esta oferta se muestre como una tarjeta destacada en la sección superior de ofertas?',
                                                                        cancelText: 'No, solo en lista',
                                                                        confirmText: 'Sí, mostrar',
                                                                        isWarning: false,
                                                                        onCancel: () => {
                                                                            setCustomConfirm(null);
                                                                            updateProduct(product.id, 'isOfferActive', true);
                                                                            updateProduct(product.id, 'isOfferCard', false);
                                                                        },
                                                                        onConfirm: () => {
                                                                            setCustomConfirm(null);
                                                                            updateProduct(product.id, 'isOfferActive', true);
                                                                            updateProduct(product.id, 'isOfferCard', true);
                                                                        }
                                                                    });
                                                                } else {
                                                                    updateProduct(product.id, 'isOfferActive', false);
                                                                    updateProduct(product.id, 'isOfferCard', false);
                                                                }
                                                            }}
                                                            trackColor={{ false: '#ccc', true: '#FF9500' }}
                                                            thumbColor={'#fff'} {...({ activeThumbColor: '#fff' } as any)}
                                                        />
                                                    </View>
                                                    <View style={[styles.cell, { width: 60, alignItems: 'center' }]}>
                                                        <Switch
                                                            style={{ transform: Platform.OS === 'web' ? 'scale(0.8)' : [{ scaleX: 0.8 }, { scaleY: 0.8 }] } as any}
                                                            value={product.available}
                                                            onValueChange={(val) => {
                                                                if (!val) {
                                                                    openRestockModalForProduct(product.id, 'deactivate');
                                                                } else {
                                                                    updateProduct(product.id, 'available', true);
                                                                    updateProduct(product.id, 'autoRestock', false);
                                                                    updateProduct(product.id, 'restockDate', undefined);
                                                                    updateProduct(product.id, 'restockTime', undefined);
                                                                }
                                                            }}
                                                            trackColor={{ false: '#ccc', true: '#007AFF' }}
                                                            thumbColor={'#fff'}
                                                            {...({ activeThumbColor: '#fff' } as any)}
                                                        />
                                                    </View>
                                                </>
                                            )}
                                            <View style={[styles.cell, { flex: 2, maxWidth: 200 }]}>
                                                <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                                                    {product.imageUrl ? (
                                                        <Image source={{ uri: product.imageUrl }} style={{ width: 30, height: 30, borderRadius: 4 }} />
                                                    ) : null}
                                                    <Pressable
                                                        style={{ padding: 8, backgroundColor: '#f0f0f0', borderRadius: 4, borderWidth: 1, borderColor: '#ddd', flex: 1, alignItems: 'center' }}
                                                        onPress={() => setPickerState({ visible: true, type: 'product', id: product.id })}
                                                    >
                                                        <Text style={{ fontSize: 13, fontWeight: '500' }}>📷 {product.imageUrl ? 'Cambiar' : 'Subir'}</Text>
                                                    </Pressable>
                                                    <Pressable
                                                        style={{ padding: 8, backgroundColor: '#f0f9ff', borderRadius: 4, borderWidth: 1, borderColor: '#bae6fd', alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}
                                                        onPress={() => {
                                                            setEditingProduct(product);
                                                            setIsDetailModalOpen(true);
                                                        }}
                                                    >
                                                        <FontAwesome name="pencil" size={14} color="#0284c7" />
                                                    </Pressable>
                                                </View>
                                            </View>
                                            <View style={{ width: 40 }} />
                                        </View>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>

                    {/* SETTINGS (Categories and preferences) */}
                    <View style={[styles.section, { marginTop: 40 }]}>
                        <Text style={styles.sectionTitle}>Ajustes de Catálogo y Preferencias Visuales</Text>

                        {/* CATEGORÍAS */}
                        <Text style={[styles.subtitle, { marginTop: 20, color: '#333', fontWeight: 'bold' }]}>Administrar Categorías</Text>
                        <View style={{ flexDirection: 'column', gap: 10, marginBottom: 15 }}>
                            {categories.map((cat, idx) => {
                                const catColor = categoryColors[cat] || '#888888';
                                const bgColor = catColor + '1A';
                                return (
                                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <View style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden', position: 'relative', backgroundColor: catColor }}>
                                            {Platform.OS === 'web' && (
                                                <input
                                                    type="color"
                                                    value={catColor}
                                                    onChange={(e) => setCategoryColors({ ...categoryColors, [cat]: e.target.value })}
                                                    style={{ position: 'absolute', top: -10, left: -6, width: 50, height: 50, cursor: 'pointer' }}
                                                />
                                            )}
                                        </View>
                                        <TextInput
                                            style={[styles.input, { flex: 1, backgroundColor: bgColor, borderColor: catColor, textAlign: 'left', fontWeight: 'bold' }]}
                                            value={cat}
                                            onChangeText={(val) => updateCategory(idx, val)}
                                        />
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                            <Text style={{ fontSize: 12, fontWeight: 'bold' }}>Orden:</Text>
                                            <TextInput
                                                style={[styles.input, { width: 50, textAlign: 'center' }]}
                                                value={(categorySortOrder[cat] ?? 0).toString()}
                                                onChangeText={(val) => setCategorySortOrder({ ...categorySortOrder, [cat]: parseFloat(val.replace(',', '.')) || 0 })}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                        <Pressable disabled={categories.length <= 1} onPress={() => removeCategory(idx)} style={{ padding: 10 }}>
                                            <Text style={[{ color: 'red', fontWeight: 'bold', fontSize: 13 }, categories.length <= 1 && { opacity: 0.3 }]}>ELIMINAR</Text>
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: 600, flexWrap: 'wrap', gap: 10 }}>
                            <TextInput style={[styles.input, { flex: 1, minWidth: 200, backgroundColor: '#f9f9f9' }]} value={newCategoryName} onChangeText={setNewCategoryName} placeholder="Escribe aquí para nueva Categoría" />
                            <View style={{ flexDirection: 'row', gap: 5 }}>
                                {['#FF3B30', '#FF9500', '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55', '#8E8E93'].map(c => (
                                    <Pressable key={c} onPress={() => setNewCategoryColor(c)} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c, borderWidth: 2, borderColor: newCategoryColor === c ? '#000' : 'transparent' }} />
                                ))}
                            </View>
                            <Pressable style={[styles.addBtn, { backgroundColor: '#333' }]} onPress={addCategory}>
                                <Text style={styles.btnText}>Añadir Categoría</Text>
                            </Pressable>
                        </View>

                        <View style={styles.separator} />

                        <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            {/* TARJETA 1 */}
                            <View style={{ flex: 1, minWidth: 320, backgroundColor: '#f9f9f9', padding: 25, borderRadius: 12, borderWidth: 1, borderColor: '#eee' }}>
                                <Text style={[styles.subtitle, { color: '#333', fontWeight: 'bold' }]}>Estilos del Catálogo de la App</Text>

                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#555', flex: 1, paddingRight: 10 }}>Mostrar ofertas arriba de todo?</Text>
                                    <Switch value={showOffersOnTop} onValueChange={setShowOffersOnTop} trackColor={{ true: '#007AFF', false: '#ccc' }} />
                                </View>

                                <Text style={{ fontSize: 14, color: '#555', marginTop: 10 }}>Estilo de Ofertas (Recomendado: Tarjetas)</Text>
                                <View style={{ flexDirection: 'row', gap: 15, marginTop: 10 }}>
                                    <Pressable style={[styles.chip, offersView === 'cards' && styles.chipActive]} onPress={() => setOffersView('cards')}>
                                        <Text style={[styles.chipText, offersView === 'cards' && styles.chipTextActive]}>Tarjetas</Text>
                                    </Pressable>
                                    <Pressable style={[styles.chip, offersView === 'list' && styles.chipActive]} onPress={() => setOffersView('list')}>
                                        <Text style={[styles.chipText, offersView === 'list' && styles.chipTextActive]}>Lista</Text>
                                    </Pressable>
                                </View>

                                <Text style={{ fontSize: 14, color: '#555', marginTop: 20 }}>Estilo de Productos Regulares (Recomendado: Lista)</Text>
                                <View style={{ flexDirection: 'row', gap: 15, marginTop: 10 }}>
                                    <Pressable style={[styles.chip, productsView === 'cards' && styles.chipActive]} onPress={() => setProductsView('cards')}>
                                        <Text style={[styles.chipText, productsView === 'cards' && styles.chipTextActive]}>Tarjetas</Text>
                                    </Pressable>
                                    <Pressable style={[styles.chip, productsView === 'list' && styles.chipActive]} onPress={() => setProductsView('list')}>
                                        <Text style={[styles.chipText, productsView === 'list' && styles.chipTextActive]}>Lista</Text>
                                    </Pressable>
                                </View>

                                <View style={styles.separator} />

                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#555', flex: 1 }}>Mostrar % de Descuento en Ofertas</Text>
                                    <Switch value={showOfferDiscountPercentage} onValueChange={setShowOfferDiscountPercentage} trackColor={{ true: '#007AFF', false: '#ccc' }} />
                                </View>

                                <View style={styles.separator} />

                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#555', flex: 1 }}>Mostrar estado de pedidos a clientes</Text>
                                    <Switch value={showOrderStatusToClients} onValueChange={setShowOrderStatusToClients} trackColor={{ true: '#007AFF', false: '#ccc' }} />
                                </View>
                            </View>

                            {/* TARJETA 2 */}
                            <View style={{ flex: 1, minWidth: 320, backgroundColor: '#f9f9f9', padding: 25, borderRadius: 12, borderWidth: 1, borderColor: '#eee' }}>
                                <Text style={[styles.subtitle, { color: '#333', fontWeight: 'bold', marginBottom: 25 }]}>Modificadores de Carrito (Cantidades y Mínimos)</Text>

                                <View style={{ gap: 25 }}>
                                    {!settings.isFoodBusiness && (
                                        <>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontWeight: 'bold', color: '#444' }}>Añadir por cantidad de (Gr/Kg)</Text>
                                                    <Text style={{ fontSize: 12, color: '#888' }}>Escala en que aumentan los botones + y -. Ej: 0.25 (Iría de 0.25 en 0.25)</Text>
                                                </View>
                                                <TextInput
                                                    style={[styles.input, { width: 100, textAlign: 'center', backgroundColor: '#fff' }]}
                                                    keyboardType="numeric"
                                                    value={checkoutRules.weightStep?.toString() || '0'}
                                                    onChangeText={v => {
                                                        const val = v.replace(',', '.');
                                                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                            setCheckoutRules({ ...checkoutRules, weightStep: val as any });
                                                        }
                                                    }}
                                                />
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontWeight: 'bold', color: '#444' }}>Cantidad Mínima Inicial x Ítem (Gr/Kg)</Text>
                                                    <Text style={{ fontSize: 12, color: '#888' }}>Lo mínimo que se agrega al carrito con el 1er tap. Ej: 0.5</Text>
                                                </View>
                                                <TextInput
                                                    style={[styles.input, { width: 100, textAlign: 'center', backgroundColor: '#fff' }]}
                                                    keyboardType="numeric"
                                                    value={checkoutRules.minWeightPerItem?.toString() || '0'}
                                                    onChangeText={v => {
                                                        const val = v.replace(',', '.');
                                                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                            setCheckoutRules({ ...checkoutRules, minWeightPerItem: val as any });
                                                        }
                                                    }}
                                                />
                                            </View>
                                            <View style={{ marginTop: -10, marginBottom: 5 }}>
                                                <Text style={{ fontSize: 13, color: '#FF3B30', fontWeight: '800', fontStyle: 'italic' }}>
                                                    💡 Si el valor es 0, las cantidades se pueden añadir libremente.
                                                </Text>
                                            </View>
                                        </>
                                    )}

                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontWeight: 'bold', color: '#444' }}>Compra Mínima - Delivery ($)</Text>
                                        </View>
                                        <TextInput
                                            style={[styles.input, { width: 100, textAlign: 'center', backgroundColor: '#fff' }]}
                                            keyboardType="numeric"
                                            value={checkoutRules.minOrderValueDelivery?.toString() || '0'}
                                            onChangeText={v => setCheckoutRules({ ...checkoutRules, minOrderValueDelivery: parseFloat(v.replace(',', '.')) || 0 })}
                                        />
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontWeight: 'bold', color: '#444' }}>Compra Mínima - Retiro Sucursal ($)</Text>
                                        </View>
                                        <TextInput
                                            style={[styles.input, { width: 100, textAlign: 'center', backgroundColor: '#fff' }]}
                                            keyboardType="numeric"
                                            value={checkoutRules.minOrderValuePickup?.toString() || '0'}
                                            onChangeText={v => setCheckoutRules({ ...checkoutRules, minOrderValuePickup: parseFloat(v.replace(',', '.')) || 0 })}
                                        />
                                    </View>
                                </View>
                            </View>
                            {/* TARJETA 3: Agenda */}
                            <View style={{ flex: 1, minWidth: 320, backgroundColor: '#f9f9f9', padding: 25, borderRadius: 12, borderWidth: 1, borderColor: '#eee' }}>
                                <Text style={[styles.subtitle, { color: '#333', fontWeight: 'bold', marginBottom: 25 }]}>Agenda y Horarios de Pedido</Text>

                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontWeight: 'bold', color: '#444' }}>Elección de horario para ENVÍO</Text>
                                        <Text style={{ fontSize: 12, color: '#888' }}>Si se desactiva, se pedirá el día pero no el horario exacto.</Text>
                                    </View>
                                    <Switch value={deliverySchedulingActive} onValueChange={setDeliverySchedulingActive} trackColor={{ true: '#34C759', false: '#ccc' }} />
                                </View>

                                <View style={styles.separator} />

                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontWeight: 'bold', color: '#444' }}>Elección de horario para RETIRO</Text>
                                        <Text style={{ fontSize: 12, color: '#888' }}>Si se desactiva, los pedidos de retiro no pedirán fecha/hora.</Text>
                                    </View>
                                    <Switch value={pickupSchedulingActive} onValueChange={setPickupSchedulingActive} trackColor={{ true: '#34C759', false: '#ccc' }} />
                                </View>

                                {pickupSchedulingActive && settings.branches.length > 0 && (
                                    <View style={{ marginTop: 15, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: '#eee' }}>
                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#666', marginBottom: 10 }}>Habilitar agenda por sucursal:</Text>
                                        {settings.branches.map(branch => {
                                            const isBranchDisabled = disabledBranchesForScheduling.includes(branch.id);
                                            return (
                                                <View key={branch.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                    <Text style={{ fontSize: 13, color: '#444' }}>{branch.name}</Text>
                                                    <Switch
                                                        value={!isBranchDisabled}
                                                        onValueChange={(val) => {
                                                            if (val) setDisabledBranchesForScheduling(disabledBranchesForScheduling.filter(id => id !== branch.id));
                                                            else setDisabledBranchesForScheduling([...disabledBranchesForScheduling, branch.id]);
                                                        }}
                                                        trackColor={{ true: '#34C759', false: '#ccc' }}
                                                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                                                    />
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>

                            {/* TARJETA 4: Reglas Gastronómicas (Mix & Match / Cross-selling) */}
                            {settings.isFoodBusiness && (
                                <View style={{ flex: 1, minWidth: 320, backgroundColor: '#fdf2f8', padding: 25, borderRadius: 12, borderWidth: 1, borderColor: '#fbcfe8' }}>
                                    <Text style={[styles.subtitle, { color: '#db2777', fontWeight: 'bold', marginBottom: 20 }]}>🍡 Descuentos Mix & Match (Por Cantidad)</Text>

                                    {/* List of rules */}
                                    <View style={{ gap: 10, marginBottom: 20 }}>
                                        {mixAndMatchRules.map((rule) => (
                                            <View key={rule.id} style={{ backgroundColor: '#fff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#fbcfe8', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontWeight: 'bold', color: '#333' }}>{rule.name}</Text>
                                                    <Text style={{ fontSize: 12, color: '#666' }}>
                                                        Al llevar {rule.minQuantity} o más de {rule.type === 'category' ? `categoría "${rule.categoryId}"` : `${rule.productIds?.length} productos`}: ${rule.discountPricePerUnit} c/u
                                                    </Text>
                                                </View>
                                                <Pressable onPress={() => setMixAndMatchRules(mixAndMatchRules.filter(r => r.id !== rule.id))}>
                                                    <FontAwesome name="trash" size={16} color="#db2777" />
                                                </Pressable>
                                            </View>
                                        ))}
                                        {mixAndMatchRules.length === 0 && (
                                            <Text style={{ fontStyle: 'italic', color: '#999', fontSize: 13 }}>No hay reglas de Mix & Match creadas.</Text>
                                        )}
                                    </View>

                                    {/* Form to create a new Mix & Match rule */}
                                    <View style={{ backgroundColor: '#fff', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#fbcfe8', gap: 10, marginBottom: 25 }}>
                                        <Text style={{ fontWeight: 'bold', color: '#db2777', fontSize: 14 }}>+ Nueva Regla de Mix & Match</Text>

                                        <TextInput
                                            style={[styles.input, { backgroundColor: '#fff' }]}
                                            placeholder="Nombre (ej: Docena Empanadas)"
                                            value={newMmName}
                                            onChangeText={setNewMmName}
                                        />

                                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                                            <Text style={{ fontSize: 13, color: '#555' }}>Aplicar a:</Text>
                                            <Pressable
                                                style={{ backgroundColor: newMmType === 'category' ? '#db2777' : '#eee', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }}
                                                onPress={() => setNewMmType('category')}
                                            >
                                                <Text style={{ color: newMmType === 'category' ? '#fff' : '#333', fontSize: 12 }}>Categoría</Text>
                                            </Pressable>
                                            <Pressable
                                                style={{ backgroundColor: newMmType === 'products' ? '#db2777' : '#eee', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }}
                                                onPress={() => setNewMmType('products')}
                                            >
                                                <Text style={{ color: newMmType === 'products' ? '#fff' : '#333', fontSize: 12 }}>Productos</Text>
                                            </Pressable>
                                        </View>

                                        {newMmType === 'category' ? (
                                            <View style={{ height: 35, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, paddingHorizontal: 8, justifyContent: 'center' }}>
                                                {Platform.OS === 'web' ? (
                                                    <select value={newMmCategoryId} onChange={(e) => setNewMmCategoryId(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%' }}>
                                                        <option value="">Selecciona Categoría</option>
                                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                ) : (
                                                    <TextInput style={{ padding: 0 }} placeholder="Nombre categoría" value={newMmCategoryId} onChangeText={setNewMmCategoryId} />
                                                )}
                                            </View>
                                        ) : (
                                            <View style={{ gap: 5 }}>
                                                <Text style={{ fontSize: 12, color: '#666' }}>Seleccioná los productos (con el check de la lista principal) y tocalos:</Text>
                                                <Pressable
                                                    style={{ backgroundColor: '#db2777', padding: 6, borderRadius: 4, alignItems: 'center' }}
                                                    onPress={() => {
                                                        if (selectedIds.size === 0) {
                                                            Alert.alert("Error", "Seleccioná productos usando el checkbox de la tabla superior.");
                                                            return;
                                                        }
                                                        setNewMmProductIds(Array.from(selectedIds));
                                                        Alert.alert("Productos vinculados", `Se vincularon ${selectedIds.size} productos.`);
                                                    }}
                                                >
                                                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Vincular seleccionados ({selectedIds.size})</Text>
                                                </Pressable>
                                            </View>
                                        )}

                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <TextInput
                                                style={[styles.input, { flex: 1, backgroundColor: '#fff', textAlign: 'center' }]}
                                                placeholder="Cant. Mín."
                                                keyboardType="numeric"
                                                value={newMmMinQty}
                                                onChangeText={setNewMmMinQty}
                                            />
                                            <TextInput
                                                style={[styles.input, { flex: 1, backgroundColor: '#fff', textAlign: 'center' }]}
                                                placeholder="Precio c/u ($)"
                                                keyboardType="numeric"
                                                value={newMmPrice}
                                                onChangeText={setNewMmPrice}
                                            />
                                        </View>

                                        <Pressable
                                            style={{ backgroundColor: '#10b981', padding: 8, borderRadius: 6, alignItems: 'center' }}
                                            onPress={() => {
                                                if (!newMmName || !newMmMinQty || !newMmPrice) {
                                                    Alert.alert("Error", "Completa todos los campos de Mix & Match.");
                                                    return;
                                                }
                                                if (newMmType === 'category' && !newMmCategoryId) {
                                                    Alert.alert("Error", "Selecciona una categoría.");
                                                    return;
                                                }
                                                if (newMmType === 'products' && newMmProductIds.length === 0) {
                                                    Alert.alert("Error", "Vincula al menos un producto.");
                                                    return;
                                                }
                                                const rule: MixAndMatchRule = {
                                                    id: Date.now().toString(),
                                                    name: newMmName,
                                                    type: newMmType,
                                                    categoryId: newMmType === 'category' ? newMmCategoryId : undefined,
                                                    productIds: newMmType === 'products' ? newMmProductIds : undefined,
                                                    minQuantity: parseInt(newMmMinQty) || 0,
                                                    discountPricePerUnit: parseFloat(newMmPrice.replace(',', '.')) || 0
                                                };
                                                setMixAndMatchRules([...mixAndMatchRules, rule]);
                                                setNewMmName('');
                                                setNewMmMinQty('');
                                                setNewMmPrice('');
                                                setNewMmProductIds([]);
                                            }}
                                        >
                                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Añadir Regla</Text>
                                        </Pressable>
                                    </View>

                                    <View style={styles.separator} />

                                    <Text style={[styles.subtitle, { color: '#0284c7', fontWeight: 'bold', marginBottom: 20 }]}>🍕 Venta Sugerida y Cruzada (Cross-selling)</Text>

                                    {/* List of cross sell rules */}
                                    <View style={{ gap: 10, marginBottom: 20 }}>
                                        {crossSellRules.map((rule) => {
                                            const reward = products.find(p => p.id === rule.rewardProductId);
                                            return (
                                                <View key={rule.id} style={{ backgroundColor: '#fff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#bae6fd', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontWeight: 'bold', color: '#333' }}>{rule.message}</Text>
                                                        <Text style={{ fontSize: 12, color: '#666' }}>
                                                            Trigger: {rule.triggerQuantity} de {rule.triggerType === 'category' ? `categoría "${rule.triggerCategoryId}"` : 'producto específico'}. Premio: {reward ? reward.name : 'cargando...'} a ${rule.rewardPrice}.
                                                        </Text>
                                                    </View>
                                                    <Pressable onPress={() => setCrossSellRules(crossSellRules.filter(r => r.id !== rule.id))}>
                                                        <FontAwesome name="trash" size={16} color="#0284c7" />
                                                    </Pressable>
                                                </View>
                                            );
                                        })}
                                        {crossSellRules.length === 0 && (
                                            <Text style={{ fontStyle: 'italic', color: '#999', fontSize: 13 }}>No hay reglas de Cross-selling creadas.</Text>
                                        )}
                                    </View>

                                    {/* Form to create a new Cross Sell rule */}
                                    <View style={{ backgroundColor: '#fff', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#bae6fd', gap: 10 }}>
                                        <Text style={{ fontWeight: 'bold', color: '#0284c7', fontSize: 14 }}>+ Nueva Regla de Cross-selling</Text>

                                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                                            <Text style={{ fontSize: 13, color: '#555' }}>Trigger por:</Text>
                                            <Pressable
                                                style={{ backgroundColor: newCsTriggerType === 'category' ? '#0284c7' : '#eee', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }}
                                                onPress={() => setNewCsTriggerType('category')}
                                            >
                                                <Text style={{ color: newCsTriggerType === 'category' ? '#fff' : '#333', fontSize: 12 }}>Categoría</Text>
                                            </Pressable>
                                            <Pressable
                                                style={{ backgroundColor: newCsTriggerType === 'product' ? '#0284c7' : '#eee', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }}
                                                onPress={() => setNewCsTriggerType('product')}
                                            >
                                                <Text style={{ color: newCsTriggerType === 'product' ? '#fff' : '#333', fontSize: 12 }}>Producto</Text>
                                            </Pressable>
                                        </View>

                                        {newCsTriggerType === 'category' ? (
                                            <View style={{ height: 35, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, paddingHorizontal: 8, justifyContent: 'center' }}>
                                                {Platform.OS === 'web' ? (
                                                    <select value={newCsTriggerCategoryId} onChange={(e) => setNewCsTriggerCategoryId(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%' }}>
                                                        <option value="">Selecciona Categoría Trigger</option>
                                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                ) : (
                                                    <TextInput style={{ padding: 0 }} placeholder="Nombre categoría trigger" value={newCsTriggerCategoryId} onChangeText={setNewCsTriggerCategoryId} />
                                                )}
                                            </View>
                                        ) : (
                                            <View style={{ gap: 5 }}>
                                                <Text style={{ fontSize: 12, color: '#666' }}>Seleccioná el producto trigger en la lista superior y tocalo:</Text>
                                                <Pressable
                                                    style={{ backgroundColor: '#0284c7', padding: 6, borderRadius: 4, alignItems: 'center' }}
                                                    onPress={() => {
                                                        const sel = Array.from(selectedIds);
                                                        if (sel.length !== 1) {
                                                            Alert.alert("Error", "Selecciona exactamente 1 producto de trigger.");
                                                            return;
                                                        }
                                                        setNewCsTriggerProductId(sel[0]);
                                                        const p = products.find(prod => prod.id === sel[0]);
                                                        Alert.alert("Producto trigger", `Se vincularon "${p ? p.name : 'producto'}" como trigger.`);
                                                    }}
                                                >
                                                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Vincular trigger seleccionado ({selectedIds.size === 1 ? 'OK' : 'Elige 1'})</Text>
                                                </Pressable>
                                            </View>
                                        )}

                                        <TextInput
                                            style={[styles.input, { backgroundColor: '#fff', textAlign: 'center' }]}
                                            placeholder="Cant. Trigger (ej: 6)"
                                            keyboardType="numeric"
                                            value={newCsTriggerQty}
                                            onChangeText={setNewCsTriggerQty}
                                        />

                                        <View style={styles.separator} />

                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#555' }}>Premio / Producto Ofrecido:</Text>
                                        <View style={{ gap: 5 }}>
                                            <Text style={{ fontSize: 12, color: '#666' }}>Seleccioná el producto premio en la lista superior y tocalo:</Text>
                                            <Pressable
                                                style={{ backgroundColor: '#0284c7', padding: 6, borderRadius: 4, alignItems: 'center' }}
                                                onPress={() => {
                                                    const sel = Array.from(selectedIds);
                                                    if (sel.length !== 1) {
                                                        Alert.alert("Error", "Selecciona exactamente 1 producto de premio.");
                                                        return;
                                                    }
                                                    setNewCsRewardProductId(sel[0]);
                                                    const p = products.find(prod => prod.id === sel[0]);
                                                    Alert.alert("Producto premio", `Se vincularon "${p ? p.name : 'producto'}" como premio.`);
                                                }}
                                            >
                                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Vincular premio seleccionado ({selectedIds.size === 1 ? 'OK' : 'Elige 1'})</Text>
                                            </Pressable>
                                        </View>

                                        <TextInput
                                            style={[styles.input, { backgroundColor: '#fff', textAlign: 'center' }]}
                                            placeholder="Precio Especial del Premio ($)"
                                            keyboardType="numeric"
                                            value={newCsRewardPrice}
                                            onChangeText={newCsRewardPrice => setNewCsRewardPrice(newCsRewardPrice)}
                                        />

                                        <TextInput
                                            style={[styles.input, { backgroundColor: '#fff' }]}
                                            placeholder="Mensaje (ej: ¡Llevando 6 empanadas sumá Pizza a $800!)"
                                            value={newCsMessage}
                                            onChangeText={setNewCsMessage}
                                        />

                                        <Pressable
                                            style={{ backgroundColor: '#10b981', padding: 8, borderRadius: 6, alignItems: 'center' }}
                                            onPress={() => {
                                                if (!newCsTriggerQty || !newCsRewardProductId || !newCsRewardPrice || !newCsMessage) {
                                                    Alert.alert("Error", "Completa todos los campos de Cross-selling.");
                                                    return;
                                                }
                                                if (newCsTriggerType === 'category' && !newCsTriggerCategoryId) {
                                                    Alert.alert("Error", "Selecciona categoría trigger.");
                                                    return;
                                                }
                                                if (newCsTriggerType === 'product' && !newCsTriggerProductId) {
                                                    Alert.alert("Error", "Vincula producto trigger.");
                                                    return;
                                                }
                                                const rule: CrossSellRule = {
                                                    id: Date.now().toString(),
                                                    triggerType: newCsTriggerType,
                                                    triggerCategoryId: newCsTriggerType === 'category' ? newCsTriggerCategoryId : undefined,
                                                    triggerProductId: newCsTriggerType === 'product' ? newCsTriggerProductId : undefined,
                                                    triggerQuantity: parseInt(newCsTriggerQty) || 0,
                                                    rewardProductId: newCsRewardProductId,
                                                    rewardPrice: parseFloat(newCsRewardPrice.replace(',', '.')) || 0,
                                                    message: newCsMessage
                                                };
                                                setCrossSellRules([...crossSellRules, rule]);
                                                setNewCsTriggerQty('');
                                                setNewCsRewardProductId('');
                                                setNewCsRewardPrice('');
                                                setNewCsMessage('');
                                                setNewCsTriggerProductId('');
                                                setNewCsTriggerCategoryId('');
                                            }}
                                        >
                                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Añadir Regla</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            )}
                        </View>

                        <Pressable
                            style={[styles.addBtn, { backgroundColor: '#111', marginTop: 30, maxWidth: 500, padding: 15, alignItems: 'center' }, isSaving && { opacity: 0.7 }]}
                            onPress={handleSaveSettings}
                            disabled={isSaving}
                        >
                            <Text style={[styles.btnText, { fontSize: 15 }]}>{isSaving ? 'Guardando...' : 'Guardar Ajustes'}</Text>
                        </Pressable>

                    </View>
                </View>

                {/* PASTE MODAL */}
                {isPasteModalOpen && (
                    <Modal transparent animationType="slide">
                        <View style={styles.modalBg}>
                            <View style={styles.modalCard}>
                                <Text style={styles.modalTitle}>Importar desde Excel</Text>
                                <Text style={{ marginBottom: 10, color: '#555' }}>
                                    Copiá las filas de tu Excel y pegalas acá. {'\n'}
                                    Columnas requeridas: <Text style={{ fontWeight: 'bold' }}>Nombre, Precio, P. Oferta, Imagen</Text>. Las separaciones mediante 'Tab' se procesarán automáticamente al pegar.
                                </Text>
                                <TextInput
                                    style={styles.textarea}
                                    multiline
                                    numberOfLines={10}
                                    placeholder="Pegar aquí los datos Excel..."
                                    value={pasteText}
                                    onChangeText={setPasteText}
                                />
                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15, gap: 10 }}>
                                    <Pressable style={[styles.addBtn, { backgroundColor: '#888' }]} onPress={() => { setIsPasteModalOpen(false); setPasteText(''); }}>
                                        <Text style={styles.btnText}>Cancelar</Text>
                                    </Pressable>
                                    <Pressable style={[styles.addBtn, { backgroundColor: '#34C759' }]} onPress={handlePaste}>
                                        <Text style={styles.btnText}>Importar</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </Modal>
                )}

                {/* PASTE CATEGORY SELECTION MODAL */}
                {isPasteCategoryModalOpen && (
                    <Modal transparent animationType="slide">
                        <View style={styles.modalBg}>
                            <View style={[styles.modalCard, { maxWidth: 400 }]}>
                                <Text style={styles.modalTitle}>Seleccionar Categoría</Text>
                                <Text style={{ marginBottom: 15, color: '#555' }}>
                                    ¿A qué categoría pertenecen los nuevos productos importados?
                                </Text>

                                <select
                                    style={StyleSheet.flatten([styles.webSelect, { height: 45, fontSize: 16, marginBottom: 20 }])}
                                    value={pasteCategory}
                                    onChange={(e) => setPasteCategory(e.target.value)}
                                >
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    <option value="NEW_CATEGORY">+ Añadir categoría...</option>
                                </select>

                                {pasteCategory === 'NEW_CATEGORY' && (
                                    <View style={{ marginBottom: 20 }}>
                                        <TextInput
                                            style={styles.modalInput}
                                            placeholder="Nombre de la nueva categoría..."
                                            value={newCatName}
                                            onChangeText={setNewCatName}
                                        />
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <Text style={{ fontWeight: 'bold' }}>Color:</Text>
                                            <input
                                                type="color"
                                                value={newCatColor}
                                                onChange={(e) => setNewCatColor(e.target.value)}
                                                style={{ width: 60, height: 40, border: 'none', cursor: 'pointer', backgroundColor: 'transparent' }}
                                            />
                                            <Text style={{ fontSize: 12, color: '#666' }}>(Usa el gotero para precisión)</Text>
                                        </View>
                                    </View>
                                )}

                                {businessProfile?.id !== 'VfxrjO1hPyeq71vQrLc3JUAgxq93' && (
                                    <View style={{ marginBottom: 20 }}>
                                        <Text style={{ fontWeight: 'bold', marginBottom: 10, color: '#334155' }}>¿Cómo se venden estos productos?</Text>
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <Pressable
                                                style={[styles.chip, pasteUnitType === 'kg' && styles.chipActive]}
                                                onPress={() => setPasteUnitType('kg')}
                                            >
                                                <Text style={[styles.chipText, pasteUnitType === 'kg' && styles.chipTextActive]}>Por Kilo</Text>
                                            </Pressable>
                                            <Pressable
                                                style={[styles.chip, pasteUnitType === 'unit' && styles.chipActive]}
                                                onPress={() => setPasteUnitType('unit')}
                                            >
                                                <Text style={[styles.chipText, pasteUnitType === 'unit' && styles.chipTextActive]}>Por Unidad</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                )}

                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                                    <Pressable style={[styles.addBtn, { backgroundColor: '#888' }]} onPress={() => setIsPasteCategoryModalOpen(false)}>
                                        <Text style={styles.btnText}>Cancelar</Text>
                                    </Pressable>
                                    <Pressable style={[styles.addBtn, { backgroundColor: '#007AFF' }]} onPress={() => {
                                        let finalCat = pasteCategory;
                                        if (pasteCategory === 'NEW_CATEGORY') {
                                            if (!newCatName.trim()) return Alert.alert('Error', 'Ingresa un nombre para la categoría');
                                            const cat = newCatName.trim();
                                            if (!categories.includes(cat)) {
                                                setCategories(prev => [...prev, cat]);
                                                setCategoryColors(prev => ({ ...prev, [cat]: newCatColor }));
                                            }
                                            finalCat = cat;
                                        }
                                        setIsPasteCategoryModalOpen(false);
                                        performActualImport(finalCat, pasteUnitType);
                                    }}>
                                        <Text style={styles.btnText}>Confirmar e Importar</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </Modal>
                )}

                {/* HELP MODAL */}
                {isHelpOpen && (
                    <Modal transparent animationType="fade">
                        <View style={styles.modalBg}>
                            <View style={[styles.modalCard, { maxWidth: 500 }]}>
                                <Text style={styles.modalTitle}>¿Cómo usar la tabla? 💡</Text>
                                <Text style={{ color: '#444', marginBottom: 5 }}>- <Text style={{ fontWeight: 'bold' }}>Precio ($): </Text>Tu precio regular de venta.</Text>
                                <Text style={{ color: '#444', marginBottom: 5 }}>- <Text style={{ fontWeight: 'bold' }}>P. Oferta: </Text>Podés escribir el número final (ej. <Text style={{ fontWeight: 'bold' }}>$800</Text>) o el porcentaje (ej. <Text style={{ fontWeight: 'bold' }}>20%</Text>) y la app calculará el valor sola al cambiar de casilla.</Text>
                                <Text style={{ color: '#444', marginBottom: 5 }}>- <Text style={{ fontWeight: 'bold' }}>Oferta?: </Text>Este botón pone en color verde la promo y hace que la oferta se publique activa a los clientes.</Text>
                                <Text style={{ color: '#444', marginBottom: 5 }}>- <Text style={{ fontWeight: 'bold' }}>Stock?: </Text>Sirve para habilitar/deshabilitar temporalmente el producto sin tener que borrarlo.</Text>
                                <Text style={{ color: '#444', marginBottom: 5 }}>- <Text style={{ fontWeight: 'bold' }}>📋 Pegar desde Excel: </Text>Copiá y pegá los productos masivamente en el orden: Nombre, Precio, Promo, URL.</Text>
                                <Pressable style={[styles.addBtn, { alignSelf: 'center', marginTop: 25, width: '100%', padding: 15, alignItems: 'center' }]} onPress={() => setIsHelpOpen(false)}>
                                    <Text style={styles.btnText}>¡Entendido!</Text>
                                </Pressable>
                            </View>
                        </View>
                    </Modal>
                )}
                {/* OFFER ORIGIN MODAL */}
                {isOfferOriginModalOpen && (
                    <Modal transparent animationType="slide">
                        <View style={styles.modalBg}>
                            <View style={[styles.modalCard, { alignItems: 'center' }]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 15 }}>
                                    <Text style={styles.modalTitle}>Crear Nueva Oferta</Text>
                                    <Pressable onPress={() => setIsOfferOriginModalOpen(false)}>
                                        <Text style={{ color: '#FF3B30', fontSize: 18, fontWeight: 'bold' }}>X</Text>
                                    </Pressable>
                                </View>
                                <Text style={{ color: '#555', marginBottom: 20, textAlign: 'center' }}>¿Qué productos querés incluir en este combo promocional?</Text>

                                <Pressable style={[styles.addBtn, { width: '100%', marginBottom: 15, padding: 15, alignItems: 'center', backgroundColor: selectedIds.size > 0 ? '#007AFF' : '#ccc' }]} onPress={handleOpenComboModalWithSelected} disabled={selectedIds.size === 0}>
                                    <Text style={styles.btnText}>Usar los {selectedIds.size} ítems marcados en la tabla</Text>
                                </Pressable>
                                <Pressable style={[styles.addBtn, { width: '100%', backgroundColor: '#FF9500', marginBottom: 15, padding: 15, alignItems: 'center' }]} onPress={handleOpenComboModalEmpty}>
                                    <Text style={styles.btnText}>Seleccionarlos manualmente de todo el catálogo</Text>
                                </Pressable>

                                <Pressable style={{ marginTop: 10, padding: 10 }} onPress={() => setIsOfferOriginModalOpen(false)}>
                                    <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>Cancelar</Text>
                                </Pressable>
                            </View>
                        </View>
                    </Modal>
                )}

                {/* DRAFTS MODAL */}
                {isDraftsModalOpen && (
                    <Modal visible={isDraftsModalOpen} animationType="slide" transparent>
                        <View style={styles.modalBg}>
                            <View style={[styles.modalCard, { width: '95%', maxWidth: 1400, flex: 0.9, padding: 20 }]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                                    <Text style={styles.modalTitle}>Borradores de Productos</Text>
                                    <Pressable onPress={handleCloseDrafts}>
                                        <Text style={{ color: '#FF3B30', fontSize: 18, fontWeight: 'bold' }}>X Cerrar</Text>
                                    </Pressable>
                                </View>
                                <Text style={{ fontSize: 14, color: '#666', marginBottom: 15, backgroundColor: '#f0f7ff', padding: 10, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#007AFF' }}>
                                    💡 <Text style={{ fontWeight: 'bold' }}>Tip:</Text> Arrastrá una fila sobre otra para fusionarlas en escalas de precio (Ej: 1kg y 2kg). La app recordará esta unión para futuros pegados automáticos.
                                </Text>

                                <View style={{ flexDirection: 'row', marginBottom: 15 }}>
                                    <Pressable style={[styles.addBtn, { marginRight: 10 }]} onPress={addDraftRow}>
                                        <Text style={styles.btnText}>+ Nueva Fila</Text>
                                    </Pressable>
                                    {lastPasteBackup && (
                                        <Pressable style={[styles.addBtn, { backgroundColor: '#FF3B30', marginRight: 10 }]} onPress={undoPaste}>
                                            <Text style={styles.btnText}>↩ Deshacer Pegado</Text>
                                        </Pressable>
                                    )}
                                    <Pressable style={[styles.addBtn, { backgroundColor: '#34C759', marginLeft: 'auto' }]} onPress={() => { saveDrafts(); setIsDraftsModalOpen(false); }}>
                                        <Text style={styles.btnText}>✔ Guardar Todos al Catálogo</Text>
                                    </Pressable>
                                </View>

                                <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 8 }}>
                                    <ScrollView showsVerticalScrollIndicator={true}>
                                        <View style={{ minWidth: 1350 }}>
                                            {renderHeaderRow(true)}
                                            {drafts.map((draft) => {
                                                const liveRaw = activePromos[draft.id!] ?? draft.promotionalPrice?.toString() ?? '';
                                                const liveCalc = activePromos[draft.id!] !== undefined ? parsePromoStr(liveRaw, Number(draft.price)) : draft.promotionalPrice;

                                                // Handle Merge via DnD
                                                const onDropRow = (sourceId: string) => {
                                                    if (sourceId === draft.id) return;
                                                    const source = drafts.find(d => d.id === sourceId);
                                                    if (!source) return;

                                                    const sourceInfo = extractScaleInfo(source.name || '');
                                                    const targetInfo = extractScaleInfo(draft.name || '');

                                                    // Clean target name if it was like "Asado 1kg" to just "Asado"
                                                    const newTargetName = targetInfo.baseName;

                                                    const newTier = { quantity: sourceInfo.quantity, price: source.price || 0 };
                                                    const updatedDraft = {
                                                        ...draft,
                                                        name: newTargetName,
                                                        bulkPricing: [...(draft.bulkPricing || []), newTier].sort((a, b) => a.quantity - b.quantity)
                                                    };

                                                    // If target didn't have bulk pricing yet, let's add its own current price as a tier too? 
                                                    // Optional, but helpful.
                                                    if (!draft.bulkPricing || draft.bulkPricing.length === 0) {
                                                        updatedDraft.bulkPricing = [
                                                            { quantity: targetInfo.quantity, price: draft.price || 0 },
                                                            newTier
                                                        ].sort((a, b) => a.quantity - b.quantity);
                                                    }

                                                    // Remember this merge for future imports
                                                    const newMemory = { ...mergeMemory, [source.name!]: newTargetName, [draft.name!]: newTargetName };
                                                    saveMemory(newMemory);

                                                    setDrafts(drafts.map(d => d.id === draft.id ? updatedDraft : d).filter(d => d.id !== sourceId));
                                                };

                                                const isOver = hoveredRowId === draft.id;

                                                return (
                                                    <View
                                                        key={draft.id}
                                                        style={[styles.row, isOver && { backgroundColor: '#e0f2fe', borderLeftWidth: 4, borderLeftColor: '#007AFF' }]}
                                                        {...(Platform.OS === 'web' ? {
                                                            draggable: true,
                                                            onDragStart: (e: any) => {
                                                                e.dataTransfer.setData('text/plain', draft.id);
                                                                e.dataTransfer.effectAllowed = 'move';
                                                            },
                                                            onDragOver: (e: any) => {
                                                                e.preventDefault();
                                                                setHoveredRowId(draft.id!);
                                                            },
                                                            onDragLeave: () => setHoveredRowId(null),
                                                            onDrop: (e: any) => {
                                                                e.preventDefault();
                                                                setHoveredRowId(null);
                                                                const sourceId = e.dataTransfer.getData('text/plain');
                                                                onDropRow(sourceId);
                                                            }
                                                        } : {})}
                                                    >
                                                        <View style={[styles.cell, { flex: 2 }]}>
                                                            <TextInput style={styles.input} placeholder="Nombre" value={draft.name} onChangeText={(val) => updateDraft(draft.id!, 'name', val)} />
                                                        </View>
                                                        <View style={[styles.cell, { flex: 1.5 }]}>
                                                            <SelectCategory value={draft.category || ''} onChange={(val) => updateDraft(draft.id!, 'category', val)} />
                                                        </View>
                                                        <View style={[styles.cell, { flex: 1 }]}>
                                                            <TextInput style={styles.input} placeholder="$$$" value={draft.price ? draft.price.toString() : ''} onChangeText={(val) => updateDraft(draft.id!, 'price', parseFloat(val) || 0)} keyboardType="numeric" />
                                                        </View>
                                                        <View style={[styles.cell, { flex: 1 }]}>
                                                            <TextInput
                                                                style={styles.input}
                                                                placeholder="$$$ o %"
                                                                value={liveRaw}
                                                                onChangeText={(val) => setActivePromos({ ...activePromos, [draft.id!]: val })}
                                                                onEndEditing={() => handlePromoCommit(draft.id!, liveRaw, Number(draft.price), true)}
                                                            />
                                                        </View>
                                                        <View style={[styles.cell, { width: 90, alignItems: 'center', justifyContent: 'center' }]}>
                                                            <Text style={{ fontSize: 12, color: '#FF3B30', fontWeight: 'bold' }}>{renderOfferCalc(Number(draft.price), liveCalc)}</Text>
                                                        </View>
                                                        {!isDraftsModalOpen && (
                                                            <View style={[styles.cell, { width: 170 }]}>
                                                                {(draft.bulkPricing || []).map((bp, i) => (
                                                                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                                                        <TextInput style={[styles.input, { flex: 1, padding: 4, height: 30, fontSize: 12 }]} value={bp.quantity ? bp.quantity.toString() : ''} onChangeText={(val) => {
                                                                            const newBp = [...(draft.bulkPricing || [])];
                                                                            newBp[i] = { ...newBp[i], quantity: parseFloat(val) || 0 };
                                                                            updateDraft(draft.id!, 'bulkPricing', newBp);
                                                                        }} keyboardType="numeric" placeholder="Cant" />
                                                                        <Text style={{ marginHorizontal: 4, fontSize: 12 }}>x</Text>
                                                                        <TextInput style={[styles.input, { flex: 1.2, padding: 4, height: 30, fontSize: 12 }]} value={bp.price ? bp.price.toString() : ''} onChangeText={(val) => {
                                                                            const newBp = [...(draft.bulkPricing || [])];
                                                                            newBp[i] = { ...newBp[i], price: parseFloat(val) || 0 };
                                                                            updateDraft(draft.id!, 'bulkPricing', newBp);
                                                                        }} keyboardType="numeric" placeholder="$Total" />
                                                                        <Pressable onPress={() => {
                                                                            const newBp = [...(draft.bulkPricing || [])];
                                                                            newBp.splice(i, 1);
                                                                            updateDraft(draft.id!, 'bulkPricing', newBp.length > 0 ? newBp : undefined);
                                                                        }} style={{ padding: 4 }}>
                                                                            <Text style={{ color: '#FF3B30', fontWeight: 'bold', fontSize: 14 }}>X</Text>
                                                                        </Pressable>
                                                                    </View>
                                                                ))}
                                                                <Pressable onPress={() => {
                                                                    const newBp = [...(draft.bulkPricing || []), { quantity: 0, price: 0 }];
                                                                    updateDraft(draft.id!, 'bulkPricing', newBp);
                                                                }} style={{ paddingVertical: 4 }}>
                                                                    <Text style={{ color: '#007AFF', fontSize: 12, textAlign: 'center', fontWeight: 'bold' }}>+ Agregar Nivel</Text>
                                                                </Pressable>
                                                            </View>
                                                        )}
                                                        <View style={[styles.cell, { width: 60, alignItems: 'center' }]}>
                                                            <Switch style={{ transform: [{ scale: 0.8 }] } as any} value={draft.isOfferActive || false} onValueChange={(val) => updateDraft(draft.id!, 'isOfferActive', val)} trackColor={{ false: '#ccc', true: '#FF9500' }} thumbColor={'#fff'} />
                                                        </View>
                                                        <View style={[styles.cell, { width: 60, alignItems: 'center' }]}>
                                                            <Switch style={{ transform: [{ scale: 0.8 }] } as any} value={draft.available} onValueChange={(val) => updateDraft(draft.id!, 'available', val)} trackColor={{ false: '#ccc', true: '#007AFF' }} thumbColor={'#fff'} />
                                                        </View>
                                                        <View style={[styles.cell, { flex: 2, maxWidth: 200 }]}>
                                                            <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                                                                {draft.imageUrl ? (
                                                                    <Image source={{ uri: draft.imageUrl }} style={{ width: 30, height: 30, borderRadius: 4 }} />
                                                                ) : null}
                                                                <Pressable
                                                                    style={{ padding: 8, backgroundColor: '#f0f0f0', borderRadius: 4, borderWidth: 1, borderColor: '#ddd', flex: 1, alignItems: 'center' }}
                                                                    onPress={() => setPickerState({ visible: true, type: 'draft', id: draft.id! })}
                                                                >
                                                                    <Text style={{ fontSize: 13, fontWeight: '500' }}>📷 {draft.imageUrl ? 'Cambiar' : 'Subir'}</Text>
                                                                </Pressable>
                                                                <Pressable
                                                                    style={{ padding: 8, backgroundColor: '#f0f9ff', borderRadius: 4, borderWidth: 1, borderColor: '#bae6fd', alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}
                                                                    onPress={() => {
                                                                        setEditingProduct(draft);
                                                                        setIsDetailModalOpen(true);
                                                                    }}
                                                                >
                                                                    <FontAwesome name="pencil" size={14} color="#0284c7" />
                                                                </Pressable>
                                                            </View>
                                                        </View>
                                                        <Pressable style={[styles.cell, { width: 40, alignItems: 'center' }]} onPress={() => removeDraft(draft.id!)}>
                                                            <Text style={{ color: 'red', fontWeight: 'bold' }}>X</Text>
                                                        </Pressable>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>
                )}

                {/* COMBO MODAL */}
                <Modal visible={isComboModalOpen} transparent={true} animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { maxWidth: 650, width: '95%', maxHeight: '90%' }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                                <Text style={styles.modalTitle}>{editingComboId ? 'Editar Oferta / Combo' : 'Crear Oferta Bundle / Combo'}</Text>
                                <Pressable onPress={() => setIsComboModalOpen(false)}>
                                    <Text style={{ color: '#FF3B30', fontSize: 18, fontWeight: 'bold' }}>X Cerrar</Text>
                                </Pressable>
                            </View>
                            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                {comboView === 'list' ? (
                                    <>
                                        <Text style={{ marginBottom: 20, color: '#666' }}>Gestioná tus combos y ofertas grupales aquí.</Text>

                                        <ScrollView style={{ maxHeight: 400, marginBottom: 20 }}>
                                            {myOffers.length === 0 ? (
                                                <Text style={{ textAlign: 'center', color: '#888', fontStyle: 'italic', padding: 20 }}>No hay combos creados.</Text>
                                            ) : (
                                                myOffers.map(offer => (
                                                    <View key={offer.id} style={{ backgroundColor: '#f3e8ff', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#d8b4fe' }}>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{offer.name} <Text style={{ color: '#8a2be2' }}>(${offer.bundlePrice})</Text></Text>
                                                            <View style={{ flexDirection: 'row', gap: 15 }}>
                                                                <Pressable onPress={() => { handleEditCombo(offer); setComboView('create'); }}>
                                                                    <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>✏️ Editar</Text>
                                                                </Pressable>
                                                                <Pressable onPress={() => setOffers(offers.filter(o => o.id !== offer.id))}>
                                                                    <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>🗑️ Eliminar</Text>
                                                                </Pressable>
                                                            </View>
                                                        </View>
                                                        <Text style={{ color: '#6b21a8', fontSize: 13 }}>{offer.requirements?.length} productos incluidos.</Text>
                                                    </View>
                                                ))
                                            )}
                                        </ScrollView>

                                        <Pressable
                                            style={[styles.addBtn, { backgroundColor: '#8a2be2', padding: 15, alignItems: 'center' }]}
                                            onPress={() => { setEditingComboId(null); setComboName(''); setComboDesc(''); setComboCategories([]); setComboQuantities({}); setComboPrice(''); setComboView('create'); }}
                                        >
                                            <Text style={styles.btnText}>+ Crear Nuevo Combo</Text>
                                        </Pressable>
                                    </>
                                ) : (
                                    <>
                                        <Text style={{ marginBottom: 20, color: '#666' }}>El cliente debe llevar SI O SI las cantidades exactas establecidas aquí para aplicar la promo.</Text>

                                        <Text style={styles.modalLabel}>Título Llamativo del Combo</Text>
                                        <TextInput style={styles.modalInput} placeholder="Ej: ASADO FAMILIAR, PACK BURGUERS" value={comboName} onChangeText={setComboName} />

                                        <Text style={styles.modalLabel}>Descripción Corta (opcional)</Text>
                                        <TextInput style={styles.modalInput} placeholder="Ej: Especial para 4 personas, todo incluido." value={comboDesc} onChangeText={setComboDesc} />

                                        <Text style={styles.modalLabel}>Categorías del Combo</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 }}>
                                            {categories.map(c => {
                                                const isSelected = comboCategories.includes(c);
                                                return (
                                                    <Pressable
                                                        key={c}
                                                        onPress={() => {
                                                            if (isSelected) setComboCategories(comboCategories.filter(cat => cat !== c));
                                                            else setComboCategories([...comboCategories, c]);
                                                        }}
                                                        style={[styles.filterChip, isSelected && { backgroundColor: categoryColors[c] || '#007AFF', borderColor: categoryColors[c] || '#007AFF' }]}
                                                    >
                                                        <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>{c}</Text>
                                                    </Pressable>
                                                );
                                            })}
                                        </View>

                                        <View style={styles.separator} />

                                        <Text style={styles.modalLabel}>Añadir más productos al combo:</Text>
                                        <TextInput style={styles.modalInput} placeholder="🔍 Buscar por nombre para añadir a los requisitos..." value={comboSearch} onChangeText={setComboSearch} />

                                        {comboSearch.length > 0 && (
                                            <View style={{ maxHeight: 150, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 15, backgroundColor: '#f9f9f9' }}>
                                                <ScrollView keyboardShouldPersistTaps="handled">
                                                    {products.filter(p => !comboQuantities[p.id] && p.name.toLowerCase().includes(comboSearch.toLowerCase())).map(p => (
                                                        <Pressable key={p.id} onPress={() => { setComboQuantities({ ...comboQuantities, [p.id]: '1' }); setComboSearch(''); }} style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
                                                            <Text style={{ fontWeight: '500' }}>+ {p.name}</Text>
                                                        </Pressable>
                                                    ))}
                                                </ScrollView>
                                            </View>
                                        )}

                                        <Text style={styles.modalLabel}>Requisitos y Cantidades Obligatorias</Text>
                                        {Object.keys(comboQuantities).length === 0 ? (
                                            <Text style={{ color: '#888', fontStyle: 'italic', marginBottom: 15 }}>No hay ítems agregados al combo.</Text>
                                        ) : (
                                            <View style={{ backgroundColor: '#f4f5f7', padding: 15, borderRadius: 8, marginBottom: 15 }}>
                                                {Object.keys(comboQuantities).map(id => {
                                                    const prod = products.find(p => p.id === id);
                                                    if (!prod) return null;
                                                    return (
                                                        <View key={id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                            <Pressable onPress={() => { const copy = { ...comboQuantities }; delete copy[id]; setComboQuantities(copy); }}><Text style={{ color: '#FF3B30', marginRight: 10, fontWeight: 'bold', fontSize: 18 }}>X</Text></Pressable>
                                                            <Text style={{ fontWeight: '500', flex: 1 }}>{prod.name} (${prod.price}/u)</Text>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                                <Text>Cant. Necesaria:</Text>
                                                                <TextInput
                                                                    style={[styles.modalInput, { width: 80, marginBottom: 0, textAlign: 'center' }]}
                                                                    keyboardType="numeric"
                                                                    value={comboQuantities[id]}
                                                                    onChangeText={(val) => setComboQuantities({ ...comboQuantities, [id]: val })}
                                                                />
                                                            </View>
                                                        </View>
                                                    )
                                                })}
                                            </View>
                                        )}

                                        <View style={styles.separator} />

                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                            <View>
                                                <Text style={styles.modalLabel}>Precio Final del Combo Entero ($)</Text>
                                                <Text style={{ fontSize: 13, color: '#FF3B30' }}>Suma regular de ítems: ${Object.keys(comboQuantities).reduce((sum, id) => {
                                                    const prod = products.find(p => p.id === id);
                                                    const req = parseFloat(comboQuantities[id]?.replace(',', '.') || '0') || 0;
                                                    return sum + (prod ? prod.price * req : 0);
                                                }, 0).toFixed(2)}</Text>
                                            </View>
                                            <TextInput style={[styles.modalInput, { width: 170, fontSize: 18, fontWeight: 'bold' }]} keyboardType="numeric" placeholder="Precio Final" value={comboPrice} onChangeText={setComboPrice} />
                                        </View>
                                    </>
                                )}
                            </ScrollView>

                            {comboView === 'create' && (
                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 15 }}>
                                    <Pressable style={styles.modalBtnCancel} onPress={() => {
                                        if (myOffers.length > 0) setComboView('list');
                                        else setIsComboModalOpen(false);
                                    }}>
                                        <Text style={styles.modalBtnTextCancel}>Cancelar</Text>
                                    </Pressable>
                                    <Pressable style={styles.modalBtnConfirm} onPress={async () => {
                                        await handleSaveCombo();
                                        setComboView('list');
                                    }}>
                                        <Text style={styles.modalBtnTextConfirm}>{editingComboId ? '✓ Guardar Cambios' : '✓ Guardar e Iniciar Oferta'}</Text>
                                    </Pressable>
                                </View>
                            )}
                        </View>
                    </View>
                </Modal>

                {/* VOLUME PRICING MODAL */}
                <Modal visible={isVolumePricingModalOpen} transparent={true} animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { maxWidth: volumeView === 'list' ? 600 : 800, width: '95%' }]}>

                            {volumeView === 'list' && (
                                <>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                        <Text style={styles.modalTitle}>Precios por Volumen Configurados</Text>
                                        <Pressable onPress={() => setIsVolumePricingModalOpen(false)}>
                                            <Text style={{ color: '#FF3B30', fontSize: 18, fontWeight: 'bold' }}>X Cerrar</Text>
                                        </Pressable>
                                    </View>

                                    <ScrollView style={{ maxHeight: 400 }}>
                                        {(() => {
                                            const masterIds = Array.from(new Set([
                                                ...products.filter(p => p.parentId).map(p => p.parentId!),
                                                ...products.filter(p => p.bulkPricing && p.bulkPricing.length > 0).map(p => p.id)
                                            ]));

                                            return masterIds.map(parentId => {
                                                const parent = products.find(p => p.id === parentId);
                                                if (!parent) return null;
                                                const children = products.filter(p => p.parentId === parentId);
                                                return (
                                                    <View key={parentId} style={{ backgroundColor: '#f9f9f9', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#eee' }}>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{parent.name}</Text>
                                                            <View style={{ flexDirection: 'row', gap: 15 }}>
                                                                <Pressable onPress={() => handleEditVolumePricing(parentId)}>
                                                                    <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>✏️ Editar</Text>
                                                                </Pressable>
                                                                <Pressable onPress={() => handleDeleteVolumePricing(parentId)}>
                                                                    <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>🗑️ Eliminar</Text>
                                                                </Pressable>
                                                            </View>
                                                        </View>
                                                        {children.map(c => (
                                                            <Text key={c.id} style={{ color: '#555', marginLeft: 10 }}>• 📦 {c.name} - ${c.price} ({c.volumeLevelQuantity} {parent.unitType === 'unit' ? 'u.' : 'kg'})</Text>
                                                        ))}
                                                        {(parent.bulkPricing || []).map((bp, idx) => (
                                                            <Text key={`tier-${idx}`} style={{ color: '#555', marginLeft: 10 }}>• 🔥 ≥{bp.quantity} a ${(bp.price / bp.quantity).toFixed(0)} c/u</Text>
                                                        ))}
                                                    </View>
                                                );
                                            });
                                        })()}
                                        {products.filter(p => p.parentId || (p.bulkPricing && p.bulkPricing.length > 0)).length === 0 && (
                                            <Text style={{ color: '#888', textAlign: 'center', fontStyle: 'italic' }}>No hay precios por volumen configurados.</Text>
                                        )}
                                    </ScrollView>

                                    <Pressable
                                        style={[styles.addBtn, { backgroundColor: '#10b981', marginTop: 20, padding: 15, alignItems: 'center' }]}
                                        onPress={() => { setVolumeParentId(null); setVolumeLevels([{ id: Math.random().toString(), productId: '', price: '', quantity: '' }]); setVolumeView('create'); }}
                                    >
                                        <Text style={styles.btnText}>+ Nueva Configuración</Text>
                                    </Pressable>
                                </>
                            )}

                            {volumeView === 'create' && (
                                <>
                                    <Text style={styles.modalTitle}>Configurar Niveles de Volumen</Text>

                                    <Text style={styles.modalLabel}>Producto Principal</Text>
                                    <SearchableDropdown
                                        value={volumeParentId || ''}
                                        onSelect={setVolumeParentId}
                                        placeholder="Buscar Producto Principal..."
                                        options={products.filter(p => !p.parentId)}
                                        style={{ marginBottom: 20 }}
                                    />

                                    <Text style={styles.modalLabel}>Niveles Asociados</Text>
                                    <View style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 8, zIndex: 50 }}>
                                        <View style={{ flexDirection: 'row', backgroundColor: '#f4f5f7', padding: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
                                            <Text style={{ flex: 2, fontWeight: 'bold', fontSize: 13 }}>Item Nivel</Text>
                                            <Text style={{ flex: 1, fontWeight: 'bold', fontSize: 13 }}>Precio ($)</Text>
                                            <Text style={{ flex: 1, fontWeight: 'bold', fontSize: 13 }}>Cantidad/Kg</Text>
                                            <Text style={{ flex: 1, fontWeight: 'bold', fontSize: 13 }}>Precio x Kg</Text>
                                            <Text style={{ width: 40 }}></Text>
                                        </View>
                                        {volumeLevels.map((level, idx) => {
                                            const pQ = parseFloat(level.price) || 0;
                                            const vQ = parseFloat(level.quantity) || 0;
                                            const pricePerKg = vQ > 0 ? (pQ / vQ).toFixed(2) : '0.00';

                                            return (
                                                <View key={level.id} style={{ flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center', backgroundColor: '#fff', zIndex: volumeLevels.length - idx }}>
                                                    <View style={{ flex: 2, paddingRight: 10 }}>
                                                        <SearchableDropdown
                                                            value={level.productId}
                                                            placeholder="Buscar producto..."
                                                            options={[{ id: 'tier', name: '🔥 Solo precio (mismo ítem)' }, ...products.filter(p => p.id !== volumeParentId)]}
                                                            onSelect={(val) => {
                                                                const newV = [...volumeLevels];
                                                                newV[idx].productId = val;
                                                                if (val === 'tier') {
                                                                    const parent = products.find(p => p.id === volumeParentId);
                                                                    if (parent) newV[idx].price = parent.price.toString();
                                                                } else {
                                                                    const selectedProd = products.find(p => p.id === val);
                                                                    if (selectedProd) newV[idx].price = selectedProd.price.toString();
                                                                }
                                                                setVolumeLevels(newV);
                                                            }}
                                                        />
                                                    </View>
                                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                                        <TextInput style={styles.input} keyboardType="numeric" value={level.price} onChangeText={(val) => { const newV = [...volumeLevels]; newV[idx].price = val; setVolumeLevels(newV); }} />
                                                    </View>
                                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                                        <TextInput style={styles.input} keyboardType="numeric" value={level.quantity} onChangeText={(val) => { const newV = [...volumeLevels]; newV[idx].quantity = val; setVolumeLevels(newV); }} />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: '#888' }}>${pricePerKg}</Text>
                                                    </View>
                                                    <Pressable style={{ width: 40, alignItems: 'center' }} onPress={() => { const newV = volumeLevels.filter((_, i) => i !== idx); setVolumeLevels(newV); }}>
                                                        <Text style={{ color: '#FF3B30', fontWeight: 'bold', fontSize: 18 }}>X</Text>
                                                    </Pressable>
                                                </View>
                                            );
                                        })}
                                    </View>

                                    <Pressable style={{ marginTop: 15 }} onPress={() => setVolumeLevels([...volumeLevels, { id: Math.random().toString(), productId: '', price: '', quantity: '' }])}>
                                        <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>+ Añadir otro nivel</Text>
                                    </Pressable>

                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                                        <Pressable style={styles.modalBtnCancel} onPress={() => {
                                            const hasExisting = products.some(p => p.parentId);
                                            if (hasExisting) setVolumeView('list');
                                            else setIsVolumePricingModalOpen(false);
                                        }}>
                                            <Text style={styles.modalBtnTextCancel}>Cancelar</Text>
                                        </Pressable>
                                        <Pressable style={styles.modalBtnConfirm} onPress={() => {
                                            if (!volumeParentId) return Alert.alert('Error', 'Seleccione un producto principal');
                                            if (volumeLevels.some(l => !l.productId || !l.price || !l.quantity)) return Alert.alert('Error', 'Complete todos los campos de los niveles.');
                                            setVolumeView('confirm');
                                        }}>
                                            <Text style={styles.modalBtnTextConfirm}>Continuar</Text>
                                        </Pressable>
                                    </View>
                                </>
                            )}

                            {volumeView === 'confirm' && (
                                <>
                                    <Text style={styles.modalTitle}>Resumen de Configuración</Text>
                                    <Text style={{ marginBottom: 15, fontSize: 16 }}>
                                        Has configurado lo siguiente para <Text style={{ fontWeight: 'bold' }}>{products.find(p => p.id === volumeParentId)?.name}</Text>:
                                    </Text>
                                    <View style={{ backgroundColor: '#f0f7ff', padding: 15, borderRadius: 8, marginBottom: 20 }}>
                                        {volumeLevels.map(level => {
                                            const prod = products.find(p => p.id === level.productId);
                                            const name = level.productId === 'tier' ? 'El mismo producto (Solo Descuento)' : prod?.name;
                                            const icon = level.productId === 'tier' ? '🔥' : '📦';
                                            return (
                                                <Text key={level.id} style={{ fontSize: 15, marginBottom: 5 }}>
                                                    • {icon} {name} actuará como nivel de <Text style={{ fontWeight: 'bold' }}>{level.quantity} {products.find(p => p.id === volumeParentId)?.unitType === 'unit' ? 'u.' : 'kg'}</Text> y costará <Text style={{ fontWeight: 'bold' }}>${level.price}</Text>.
                                                </Text>
                                            );
                                        })}
                                    </View>

                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                                        <Pressable style={styles.modalBtnCancel} onPress={() => setVolumeView('create')}>
                                            <Text style={styles.modalBtnTextCancel}>Editar</Text>
                                        </Pressable>
                                        <Pressable style={styles.modalBtnConfirm} onPress={handleSaveVolumePricingConfirm}>
                                            <Text style={styles.modalBtnTextConfirm}>Está Bien</Text>
                                        </Pressable>
                                    </View>
                                </>
                            )}

                        </View>
                    </View>
                </Modal>

                {/* DAILY OFFERS MODAL */}
                <Modal visible={isDailyOffersModalOpen} transparent={true} animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { maxWidth: dailyOffersView === 'list' ? 700 : 500, width: '95%', maxHeight: '90%' }]}>
                            {dailyOffersView === 'list' && (
                                <>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                        <Text style={styles.modalTitle}>🔥 Ofertas del Día Activas</Text>
                                        <Pressable onPress={() => setIsDailyOffersModalOpen(false)}>
                                            <Text style={{ fontSize: 24, color: '#999' }}>×</Text>
                                        </Pressable>
                                    </View>
                                    
                                    <ScrollView style={{ maxHeight: 400 }}>
                                        {products.filter(p => p.isDailyOffer).map(product => (
                                            <View key={product.id} style={{ flexDirection: 'row', padding: 15, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, marginBottom: 10 }}>
                                                <View style={{ flex: 2 }}>
                                                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{product.name}</Text>
                                                    <Text style={{ color: '#666', fontSize: 13 }}>
                                                        Llevando {product.dailyOfferMinQty} u. a ${product.dailyOfferPrice} c/u
                                                    </Text>
                                                </View>
                                                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                                    <Pressable style={{ backgroundColor: '#fee2e2', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5' }} onPress={() => handleDeleteDailyOffer(product.id)}>
                                                        <Text style={{ color: '#dc2626', fontWeight: 'bold' }}>Eliminar</Text>
                                                    </Pressable>
                                                </View>
                                            </View>
                                        ))}
                                        {products.filter(p => p.isDailyOffer).length === 0 && (
                                            <Text style={{ textAlign: 'center', color: '#666', fontStyle: 'italic', padding: 20 }}>No hay ofertas del día activas.</Text>
                                        )}
                                    </ScrollView>
                                    
                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, gap: 10 }}>
                                        <Pressable style={styles.modalBtnCancel} onPress={() => setIsDailyOffersModalOpen(false)}>
                                            <Text style={styles.modalBtnTextCancel}>Cerrar</Text>
                                        </Pressable>
                                        <Pressable style={styles.modalBtnConfirm} onPress={() => { setDailyOfferDraft({ id: '', price: '', minQty: '' }); setDailyOffersView('create'); }}>
                                            <Text style={styles.modalBtnTextConfirm}>+ Añadir Oferta</Text>
                                        </Pressable>
                                    </View>
                                </>
                            )}
                            
                            {dailyOffersView === 'create' && (
                                <>
                                    <Text style={styles.modalTitle}>Nueva Oferta del Día</Text>
                                    <Text style={{ marginBottom: 15, color: '#555' }}>Seleccioná el producto, su cantidad mínima para aplicar la oferta y el precio unitario final.</Text>
                                    
                                    <View style={{ marginBottom: 15, zIndex: 9999 }}>
                                        <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>1. Producto Base:</Text>
                                        <SearchableDropdown
                                            value={dailyOfferDraft?.id || ''}
                                            placeholder="Buscar producto..."
                                            options={products.filter(p => !p.isDailyOffer)}
                                            onSelect={(val) => {
                                                const p = products.find(prod => prod.id === val);
                                                setDailyOfferDraft(prev => ({ ...prev!, id: val, price: p?.price.toString() || '' }));
                                            }}
                                        />
                                    </View>
                                    
                                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>2. Cantidad Mínima:</Text>
                                            <TextInput
                                                style={styles.input}
                                                keyboardType="numeric"
                                                placeholder="Ej: 3"
                                                value={dailyOfferDraft?.minQty || ''}
                                                onChangeText={(val) => setDailyOfferDraft(prev => ({ ...prev!, minQty: val }))}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>3. Precio Oferta (c/u):</Text>
                                            <TextInput
                                                style={styles.input}
                                                keyboardType="numeric"
                                                placeholder="Ej: 1500"
                                                value={dailyOfferDraft?.price || ''}
                                                onChangeText={(val) => setDailyOfferDraft(prev => ({ ...prev!, price: val }))}
                                            />
                                        </View>
                                    </View>
                                    
                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                                        <Pressable style={styles.modalBtnCancel} onPress={() => {
                                            if (products.some(p => p.isDailyOffer)) setDailyOffersView('list');
                                            else setIsDailyOffersModalOpen(false);
                                        }}>
                                            <Text style={styles.modalBtnTextCancel}>Cancelar</Text>
                                        </Pressable>
                                        <Pressable style={styles.modalBtnConfirm} onPress={handleSaveDailyOffer}>
                                            <Text style={styles.modalBtnTextConfirm}>Guardar Oferta</Text>
                                        </Pressable>
                                    </View>
                                </>
                            )}
                        </View>
                    </View>
                </Modal>

                {/* SPECIALS MODAL */}
                <Modal visible={isSpecialsModalOpen} transparent={true} animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { maxWidth: specialsView === 'list' ? 700 : 650, width: '95%', maxHeight: '90%' }]}>

                            {specialsView === 'list' && (
                                <>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                        <Text style={[styles.modalTitle, { color: '#eab308' }]}>⚡ Ofertas Especiales (Flash Sales)</Text>
                                        <Pressable onPress={() => setIsSpecialsModalOpen(false)}>
                                            <Text style={{ color: '#FF3B30', fontSize: 18, fontWeight: 'bold' }}>X Cerrar</Text>
                                        </Pressable>
                                    </View>

                                    <ScrollView style={{ maxHeight: 400 }}>
                                        {products.filter(p => p.specialOffer?.active).map(p => (
                                            <View key={p.id} style={{ backgroundColor: '#fefce8', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#fef08a' }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{p.name} <Text style={{ color: '#eab308' }}>(${p.specialOffer?.price})</Text></Text>
                                                    <View style={{ flexDirection: 'row', gap: 15 }}>
                                                        <Pressable onPress={() => handleEditSpecial(p.id)}>
                                                            <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>✏️ Editar</Text>
                                                        </Pressable>
                                                        <Pressable onPress={() => handleDeleteSpecial(p.id)}>
                                                            <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>🗑️ Eliminar</Text>
                                                        </Pressable>
                                                    </View>
                                                </View>
                                                {p.specialOffer?.limitByStock && (
                                                    <Text style={{ color: '#854d0e', marginLeft: 10, fontSize: 13 }}>📦 Stock asignado: {p.specialOffer.initialStock} | Quedan: {p.specialOffer.stockRemaining}</Text>
                                                )}
                                                {p.specialOffer?.limitByTime && (
                                                    <Text style={{ color: '#854d0e', marginLeft: 10, fontSize: 13 }}>⏱️ Horario: {new Date(p.specialOffer.timeWindows[0].startTime).toLocaleString()} - {new Date(p.specialOffer.timeWindows[0].endTime).toLocaleString()}</Text>
                                                )}
                                                <Text style={{ color: '#854d0e', marginLeft: 10, fontSize: 13 }}>⭐ Destaque: {p.specialOffer?.highlightMode}</Text>
                                            </View>
                                        ))}
                                    </ScrollView>

                                    <Pressable
                                        style={[styles.addBtn, { backgroundColor: '#eab308', marginTop: 20, padding: 15, alignItems: 'center' }]}
                                        onPress={() => { setSpecialFocusId(null); setSpecialDraft({ active: true, price: '', limitByStock: false, initialStock: '', stockVisibility: 'exact', limitByTime: false, startTime: '', endTime: '', highlightMode: 'banner' }); setSpecialsView('create'); }}
                                    >
                                        <Text style={[styles.btnText, { color: '#000' }]}>+ Crear Nueva Oferta Especial</Text>
                                    </Pressable>
                                </>
                            )}

                            {specialsView === 'create' && (
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                        <Text style={[styles.modalTitle, { color: '#eab308' }]}>{specialFocusId ? 'Editar Oferta Especial' : 'Crear Oferta Especial'}</Text>
                                        <Pressable onPress={() => {
                                            const hasExisting = products.some(p => p.specialOffer?.active);
                                            if (hasExisting) setSpecialsView('list');
                                            else setIsSpecialsModalOpen(false);
                                        }}>
                                            <Text style={{ color: '#FF3B30', fontSize: 18, fontWeight: 'bold' }}>X Cerrar</Text>
                                        </Pressable>
                                    </View>

                                    {!specialFocusId && (
                                        <>
                                            <Text style={styles.modalLabel}>Selecciona el Producto</Text>
                                            <SearchableDropdown
                                                value={specialFocusId || ''}
                                                onSelect={setSpecialFocusId}
                                                placeholder="Buscar Producto..."
                                                options={products}
                                                style={{ marginBottom: 20 }}
                                            />
                                        </>
                                    )}
                                    {specialFocusId && (
                                        <View style={{ marginBottom: 20, padding: 10, backgroundColor: '#f0f0f0', borderRadius: 8 }}>
                                            <Text style={{ fontWeight: 'bold' }}>Producto Seleccionado: {products.find(p => p.id === specialFocusId)?.name}</Text>
                                            <Text>Precio Regular: ${products.find(p => p.id === specialFocusId)?.price}</Text>
                                        </View>
                                    )}

                                    <Text style={styles.modalLabel}>Precio Especial (Requerido)</Text>
                                    <TextInput style={styles.modalInput} keyboardType="numeric" placeholder="Ej: 5000" value={specialDraft.price} onChangeText={(v) => setSpecialDraft({ ...specialDraft, price: v })} />

                                    <View style={styles.separator} />

                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={styles.modalLabel}>¿Limitar por Stock?</Text>
                                        <Switch value={specialDraft.limitByStock} onValueChange={(v) => setSpecialDraft({ ...specialDraft, limitByStock: v })} />
                                    </View>
                                    {specialDraft.limitByStock && (
                                        <View style={{ backgroundColor: '#f9fafb', padding: 15, borderRadius: 8, marginTop: 10, marginBottom: 15 }}>
                                            <Text style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>El producto dejará de estar en oferta cuando el stock llegue a 0.</Text>
                                            <Text style={styles.modalLabel}>Cantidad Inicial de Stock (Kg/U)</Text>
                                            <TextInput style={styles.modalInput} keyboardType="numeric" value={specialDraft.initialStock} onChangeText={(v) => setSpecialDraft({ ...specialDraft, initialStock: v })} />

                                            <Text style={styles.modalLabel}>¿Qué ve el cliente?</Text>
                                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                                <Pressable style={[styles.chip, specialDraft.stockVisibility === 'hidden' && styles.chipActive]} onPress={() => setSpecialDraft({ ...specialDraft, stockVisibility: 'hidden' })}>
                                                    <Text style={[styles.chipText, specialDraft.stockVisibility === 'hidden' && styles.chipTextActive]}>No Mostrar</Text>
                                                </Pressable>
                                                <Pressable style={[styles.chip, specialDraft.stockVisibility === 'vague' && styles.chipActive]} onPress={() => setSpecialDraft({ ...specialDraft, stockVisibility: 'vague' })}>
                                                    <Text style={[styles.chipText, specialDraft.stockVisibility === 'vague' && styles.chipTextActive]}>Poco/Mucho</Text>
                                                </Pressable>
                                                <Pressable style={[styles.chip, specialDraft.stockVisibility === 'exact' && styles.chipActive]} onPress={() => setSpecialDraft({ ...specialDraft, stockVisibility: 'exact' })}>
                                                    <Text style={[styles.chipText, specialDraft.stockVisibility === 'exact' && styles.chipTextActive]}>Cantidad Exacta</Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    )}

                                    <View style={styles.separator} />

                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={styles.modalLabel}>¿Limitar por Tiempo (Horarios)?</Text>
                                        <Switch value={specialDraft.limitByTime} onValueChange={(v) => setSpecialDraft({ ...specialDraft, limitByTime: v })} />
                                    </View>
                                    {specialDraft.limitByTime && (
                                        <View style={{ backgroundColor: '#f9fafb', padding: 15, borderRadius: 8, marginTop: 10, marginBottom: 15 }}>
                                            <Text style={{ fontSize: 13, color: '#666', marginBottom: 15 }}>Haz click en los días del calendario para activar la oferta y configurar sus horarios.</Text>

                                            {/* CALENDAR GRID */}
                                            <View style={{ marginBottom: 20 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                                    {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
                                                        <View key={i} style={{ width: '14.28%', alignItems: 'center', paddingVertical: 5 }}><Text style={{ color: '#999', fontSize: 10, fontWeight: 'bold' }}>{d}</Text></View>
                                                    ))}
                                                    {(() => {
                                                        const today = new Date();
                                                        const year = today.getFullYear();
                                                        const month = today.getMonth();
                                                        const firstDay = new Date(year, month, 1).getDay();
                                                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                        const days = [];
                                                        for (let i = 0; i < firstDay; i++) days.push(<View key={`empty-${i}`} style={{ width: '14.28%' }} />);
                                                        for (let d = 1; d <= daysInMonth; d++) {
                                                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                                            const isSelected = specialDraft.dateConfigs?.some((dc: any) => dc.date === dateStr);
                                                            days.push(
                                                                <Pressable
                                                                    key={d}
                                                                    onPress={() => {
                                                                        const current = specialDraft.dateConfigs || [];
                                                                        if (isSelected) {
                                                                            setSpecialDraft({ ...specialDraft, dateConfigs: current.filter((dc: any) => dc.date !== dateStr) });
                                                                        } else {
                                                                            setSpecialDraft({ ...specialDraft, dateConfigs: [...current, { date: dateStr, slots: [{ start: widestHours.start, end: widestHours.end }] }] });
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        width: '14.28%',
                                                                        aspectRatio: 1,
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        backgroundColor: isSelected ? '#eab308' : 'transparent',
                                                                        borderRadius: 4,
                                                                        borderWidth: 0.5,
                                                                        borderColor: '#eee'
                                                                    }}
                                                                >
                                                                    <Text style={{ fontWeight: isSelected ? 'bold' : 'normal', color: isSelected ? '#000' : '#444' }}>{d}</Text>
                                                                </Pressable>
                                                            );
                                                        }
                                                        return days;
                                                    })()}
                                                </View>
                                            </View>

                                            {/* DATE CONFIG LIST */}
                                            {(specialDraft.dateConfigs || []).sort((a: any, b: any) => a.date.localeCompare(b.date)).map((dc: any, idx: number) => (
                                                <View key={dc.date} style={{ backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#eab308' }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                        <Text style={{ fontWeight: 'bold', color: '#854d0e' }}>📅 {new Date(dc.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
                                                        <Pressable onPress={() => {
                                                            const next = [...specialDraft.dateConfigs];
                                                            next[idx].slots = [...next[idx].slots, { start: widestHours.start, end: widestHours.end }];
                                                            setSpecialDraft({ ...specialDraft, dateConfigs: next });
                                                        }}>
                                                            <Text style={{ color: '#007AFF', fontSize: 12, fontWeight: 'bold' }}>+ Franja</Text>
                                                        </Pressable>
                                                    </View>

                                                    {dc.slots.map((slot: any, sIdx: number) => (
                                                        <View key={sIdx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                                                            <TextInput
                                                                style={[styles.modalInput, { flex: 1, marginBottom: 0, padding: 5, height: 30, fontSize: 13 }]}
                                                                value={slot.start}
                                                                onChangeText={(v) => {
                                                                    const next = [...specialDraft.dateConfigs];
                                                                    next[idx].slots[sIdx].start = v;
                                                                    setSpecialDraft({ ...specialDraft, dateConfigs: next });
                                                                }}
                                                            />
                                                            <Text style={{ fontSize: 10 }}>a</Text>
                                                            <TextInput
                                                                style={[styles.modalInput, { flex: 1, marginBottom: 0, padding: 5, height: 30, fontSize: 13 }]}
                                                                value={slot.end}
                                                                onChangeText={(v) => {
                                                                    const next = [...specialDraft.dateConfigs];
                                                                    next[idx].slots[sIdx].end = v;
                                                                    setSpecialDraft({ ...specialDraft, dateConfigs: next });
                                                                }}
                                                            />
                                                            {dc.slots.length > 1 && (
                                                                <Pressable onPress={() => {
                                                                    const next = [...specialDraft.dateConfigs];
                                                                    next[idx].slots = next[idx].slots.filter((_: any, i: number) => i !== sIdx);
                                                                    setSpecialDraft({ ...specialDraft, dateConfigs: next });
                                                                }}>
                                                                    <FontAwesome name="trash" size={14} color="#FF3B30" />
                                                                </Pressable>
                                                            )}
                                                        </View>
                                                    ))}
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    <View style={styles.separator} />

                                    <Text style={styles.modalLabel}>Tipo de Destaque Visual</Text>
                                    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                                        <Pressable style={[styles.chip, specialDraft.highlightMode === 'none' && styles.chipActive]} onPress={() => setSpecialDraft({ ...specialDraft, highlightMode: 'none' })}>
                                            <Text style={[styles.chipText, specialDraft.highlightMode === 'none' && styles.chipTextActive]}>Normal</Text>
                                        </Pressable>
                                        <Pressable style={[styles.chip, specialDraft.highlightMode === 'destacado' && styles.chipActive]} onPress={() => setSpecialDraft({ ...specialDraft, highlightMode: 'destacado' })}>
                                            <Text style={[styles.chipText, specialDraft.highlightMode === 'destacado' && styles.chipTextActive]}>Destacado (Oro)</Text>
                                        </Pressable>
                                        <Pressable style={[styles.chip, specialDraft.highlightMode === 'banner' && styles.chipActive]} onPress={() => setSpecialDraft({ ...specialDraft, highlightMode: 'banner' })}>
                                            <Text style={[styles.chipText, specialDraft.highlightMode === 'banner' && styles.chipTextActive]}>Banner Gigante + Oro</Text>
                                        </Pressable>
                                    </View>

                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 30 }}>
                                        <Pressable style={styles.modalBtnCancel} onPress={() => {
                                            const hasExisting = products.some(p => p.specialOffer?.active);
                                            if (hasExisting) setSpecialsView('list');
                                            else setIsSpecialsModalOpen(false);
                                        }}>
                                            <Text style={styles.modalBtnTextCancel}>Cancelar</Text>
                                        </Pressable>
                                        <Pressable style={[styles.modalBtnConfirm, { backgroundColor: '#eab308' }]} onPress={handleSaveSpecialConfirm}>
                                            <Text style={[styles.modalBtnTextConfirm, { color: '#000' }]}>Guardar Oferta Especial</Text>
                                        </Pressable>
                                    </View>
                                </ScrollView>
                            )}

                        </View>
                    </View>
                </Modal>

                {/* EXCEL EDITOR MODAL */}
                {isExcelEditorOpen && (
                    <Modal visible={isExcelEditorOpen} transparent animationType="slide">
                        <View style={styles.modalBg}>
                            <View style={[styles.modalCard, { width: '95%', maxWidth: 1000, flex: 0.9, padding: 20 }]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                                    <Text style={styles.modalTitle}>Editor Rápido</Text>
                                    <View style={{ flexDirection: 'row', gap: 15 }}>
                                        <Pressable style={[styles.modalBtnCancel, { paddingHorizontal: 20 }]} onPress={handleCloseExcel}>
                                            <Text style={styles.modalBtnTextCancel}>Cerrar</Text>
                                        </Pressable>
                                        <Pressable style={[styles.modalBtnConfirm, { paddingHorizontal: 20 }]} onPress={handleSaveExcel}>
                                            <Text style={styles.modalBtnTextConfirm}>✓ Guardar Cambios</Text>
                                        </Pressable>
                                    </View>
                                </View>
                                <Text style={{ fontSize: 14, color: '#666', marginBottom: 15, backgroundColor: '#f0f7ff', padding: 10, borderRadius: 8 }}>
                                    💡 <Text style={{ fontWeight: 'bold' }}>Tip Excel:</Text> Haz click y arrastra para seleccionar celdas. Luego presiona <Text style={{ fontWeight: 'bold' }}>CTRL+V</Text> para pegar valores copiados. Puedes usar <Text style={{ fontWeight: 'bold' }}>CTRL+Z</Text> para deshacer. Tipea directamente para editar una celda.
                                </Text>

                                <View style={{ flexDirection: 'row', marginBottom: 15, alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        {selectedIds.size > 0 ? (
                                            <>
                                                <Text style={{ fontWeight: 'bold', marginRight: 15 }}>{selectedIds.size} seleccionados</Text>
                                                <Pressable style={[styles.addBtn, { backgroundColor: '#FF3B30', marginRight: 10 }]} onPress={deleteSelected}>
                                                    <Text style={styles.btnText}>Eliminar Seleccionados</Text>
                                                </Pressable>
                                            </>
                                        ) : (
                                            <Text style={{ color: '#888' }}>Ningún producto seleccionado. Arrastrá para seleccionar.</Text>
                                        )}
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        <Pressable
                                            style={[{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: showMappingCol ? '#1e293b' : '#e2e8f0' }]}
                                            onPress={() => setShowMappingCol(!showMappingCol)}
                                        >
                                            <Text style={{ color: showMappingCol ? '#fff' : '#1e293b', fontWeight: 'bold', fontSize: 13 }}>
                                                {showMappingCol ? 'Ocultar Mapeo' : 'Mostrar Mapeo'}
                                            </Text>
                                        </Pressable>
                                        <Pressable
                                            style={[{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: showSortOrderCol ? '#1e293b' : '#e2e8f0' }]}
                                            onPress={() => setShowSortOrderCol(!showSortOrderCol)}
                                        >
                                            <Text style={{ color: showSortOrderCol ? '#fff' : '#1e293b', fontWeight: 'bold', fontSize: 13 }}>
                                                {showSortOrderCol ? 'Ocultar Orden' : 'Mostrar Orden'}
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>

                                <ScrollView
                                    style={[{ borderWidth: 1, borderColor: '#eee', borderRadius: 8, flex: 1 }, Platform.OS === 'web' && { userSelect: 'none' } as any]}
                                    {...(Platform.OS === 'web' ? {
                                        onMouseUp: () => {
                                            setIsExcelSelecting(false);
                                            setRowSelectionMode(null);
                                            if (excelSelectionStart && excelSelectionEnd) {
                                                const minCol = Math.min(excelSelectionStart.col, excelSelectionEnd.col);
                                                const maxCol = Math.max(excelSelectionStart.col, excelSelectionEnd.col);
                                                const minRow = Math.min(excelSelectionStart.row, excelSelectionEnd.row);
                                                const maxRow = Math.max(excelSelectionStart.row, excelSelectionEnd.row);
                                                if (minCol === 1 && maxCol === 1 && minRow !== maxRow) {
                                                    // Mass category selection triggered
                                                    setIsMassCategoryOpen(true);
                                                }
                                            }
                                        },
                                        onMouseLeave: () => {
                                            setIsExcelSelecting(false);
                                            setRowSelectionMode(null);
                                        }
                                    } : {})}
                                >
                                    <View style={[styles.row, styles.headerRow, { paddingHorizontal: 15 }]}>
                                        <Text style={[styles.headerText, { width: 40 }]}>Sel.</Text>
                                        <Text style={[styles.headerText, { flex: 2, textAlign: 'left' }]}>Nombre</Text>
                                        <Text style={[styles.headerText, { flex: 1.5, textAlign: 'left' }]}>Categoría</Text>
                                        <Text style={[styles.headerText, { flex: 1, textAlign: 'left' }]}>Precio ($)</Text>
                                        <Text style={[styles.headerText, { flex: 1, textAlign: 'left' }]}>P. Oferta ($)</Text>
                                        {showSortOrderCol && <Text style={[styles.headerText, { width: 60, textAlign: 'left', color: '#0369a1' }]}>Orden</Text>}
                                        {showMappingCol && <Text style={[styles.headerText, { flex: 1.5, textAlign: 'left', color: '#0369a1' }]}>Mapeo Excel</Text>}
                                    </View>
                                    {sortedExcelProducts.map((p, rowIdx) => {
                                        const isRowSelected = selectedIds.has(p.id);
                                        const isFocused = p.id === excelFocusId;

                                        const renderExcelCell = (colIdx: number, flexSize: number, field: string) => {
                                            const isSelected = excelSelectionStart && excelSelectionEnd &&
                                                rowIdx >= Math.min(excelSelectionStart.row, excelSelectionEnd.row) &&
                                                rowIdx <= Math.max(excelSelectionStart.row, excelSelectionEnd.row) &&
                                                colIdx >= Math.min(excelSelectionStart.col, excelSelectionEnd.col) &&
                                                colIdx <= Math.max(excelSelectionStart.col, excelSelectionEnd.col);

                                            const isEditing = excelEditingCell?.row === rowIdx && excelEditingCell?.col === colIdx;

                                            let displayValue = '';
                                            if (field === 'price') displayValue = p.price.toString();
                                            else if (field === 'promotionalPrice') displayValue = activePromos[p.id] ?? p.promotionalPrice?.toString() ?? '';
                                            else if (field === 'name') displayValue = p.name;
                                            else if (field === 'category') displayValue = p.category;
                                            else if (field === 'sortOrder') displayValue = p.sortOrder?.toString() || '0';
                                            else if (field === 'excelMappingName') displayValue = p.excelMappingName || '';

                                            let isDuplicateSortOrder = false;
                                            if (field === 'sortOrder' && p.sortOrder !== undefined && p.sortOrder !== 0) {
                                                isDuplicateSortOrder = sortedExcelProducts.some(other => other.id !== p.id && other.category === p.category && other.sortOrder === p.sortOrder);
                                            }

                                            return (
                                                <View
                                                    key={field}
                                                    style={[
                                                        styles.cell,
                                                        {
                                                            flex: flexSize,
                                                            borderWidth: 1,
                                                            borderColor: isDuplicateSortOrder ? '#f97316' : (isSelected ? '#0284c7' : '#e2e8f0'),
                                                            backgroundColor: isDuplicateSortOrder ? '#ffedd5' : (isSelected ? '#e0f2fe' : '#fff'),
                                                            padding: 0
                                                        },
                                                        Platform.OS === 'web' && { userSelect: 'none' } as any
                                                    ]}
                                                    {...(Platform.OS === 'web' ? {
                                                        onMouseDown: (e: any) => {
                                                            if (isEditing) return;
                                                            e.preventDefault();
                                                            setExcelSelectionStart({ row: rowIdx, col: colIdx });
                                                            setExcelSelectionEnd({ row: rowIdx, col: colIdx });
                                                            setIsExcelSelecting(true);
                                                            setExcelEditingCell(null);
                                                        },
                                                        onMouseEnter: () => {
                                                            if (isExcelSelecting) {
                                                                setExcelSelectionEnd({ row: rowIdx, col: colIdx });
                                                            }
                                                        },
                                                        onDoubleClick: () => {
                                                            setExcelEditingCell({ row: rowIdx, col: colIdx });
                                                        },
                                                        onMouseUp: () => {
                                                            if (excelSelectionStart && excelSelectionEnd && excelSelectionStart.row === rowIdx && excelSelectionStart.col === colIdx && excelSelectionEnd.row === rowIdx && excelSelectionEnd.col === colIdx) {
                                                                setExcelEditingCell({ row: rowIdx, col: colIdx });
                                                            }
                                                        }
                                                    } : {})}
                                                >
                                                    {isEditing ? (
                                                        <TextInput
                                                            style={[styles.input, { borderWidth: 0, height: '100%', width: '100%', margin: 0, padding: 8, outlineStyle: 'none' } as any]}
                                                            autoFocus
                                                            value={displayValue}
                                                            onChangeText={(val) => {
                                                                if (field === 'promotionalPrice') setActivePromos({ ...activePromos, [p.id]: val });
                                                                else if (field === 'price') updateDraftProduct(p.id, 'price', parseFloat(val.replace(/[^0-9,.-]/g, '')) || 0);
                                                                else if (field === 'name') updateDraftProduct(p.id, 'name', val);
                                                                else if (field === 'category') updateDraftProduct(p.id, 'category', val);
                                                                else if (field === 'sortOrder') updateDraftProduct(p.id, 'sortOrder', parseFloat(val.replace(',', '.')) || 0);
                                                                else if (field === 'excelMappingName') updateDraftProduct(p.id, 'excelMappingName', val);
                                                            }}
                                                            onBlur={() => {
                                                                setExcelEditingCell(null);
                                                                if (field === 'promotionalPrice') {
                                                                    updateDraftProduct(p.id, 'promotionalPrice', parseFloat(activePromos[p.id]?.replace(/[^0-9,.-]/g, '')) || undefined);
                                                                }
                                                            }}
                                                        />
                                                    ) : (
                                                        <Text style={{ padding: 8, fontSize: 14, color: '#333', minHeight: 38 }} numberOfLines={1}>{displayValue}</Text>
                                                    )}
                                                </View>
                                            );
                                        };

                                        return (
                                            <View
                                                key={p.id}
                                                style={[
                                                    styles.row,
                                                    { paddingHorizontal: 15 },
                                                    isRowSelected && { backgroundColor: '#f8fafc' },
                                                    isFocused && { borderLeftWidth: 4, borderLeftColor: '#FF9500', backgroundColor: '#fff8eb' }
                                                ]}
                                            >
                                                <View
                                                    style={[{ width: 40, justifyContent: 'center', cursor: 'pointer' }, Platform.OS === 'web' && { userSelect: 'none' } as any]}
                                                    {...(Platform.OS === 'web' ? {
                                                        onMouseDown: (e: any) => {
                                                            const isCurrentlySelected = selectedIds.has(p.id);
                                                            const mode = isCurrentlySelected ? 'remove' : 'add';
                                                            setRowSelectionMode(mode);

                                                            const next = new Set(selectedIds);
                                                            if (mode === 'add') next.add(p.id);
                                                            else next.delete(p.id);
                                                            setSelectedIds(next);
                                                        },
                                                        onMouseEnter: () => {
                                                            if (rowSelectionMode) {
                                                                const next = new Set(selectedIds);
                                                                if (rowSelectionMode === 'add') next.add(p.id);
                                                                else next.delete(p.id);
                                                                setSelectedIds(next);
                                                            }
                                                        }
                                                    } : {})}
                                                >
                                                    <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: isRowSelected ? '#007AFF' : '#ccc', backgroundColor: isRowSelected ? '#007AFF' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                                        {isRowSelected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                                                    </View>
                                                </View>
                                                {renderExcelCell(0, 2, 'name')}
                                                {renderExcelCell(1, 1.5, 'category')}
                                                {renderExcelCell(2, 1, 'price')}
                                                {renderExcelCell(3, 1, 'promotionalPrice')}
                                                {showSortOrderCol && renderExcelCell(4, 0.5, 'sortOrder')}
                                                {showMappingCol && renderExcelCell(showSortOrderCol ? 5 : 4, 1.5, 'excelMappingName')}
                                            </View>
                                        );
                                    })}
                                </ScrollView>

                                {/* MASS CATEGORY MODAL */}
                                {isMassCategoryOpen && (
                                    <Modal visible={true} transparent animationType="fade">
                                        <View style={styles.modalBg}>
                                            <View style={[styles.modalCard, { maxWidth: 400 }]}>
                                                <Text style={styles.modalTitle}>Cambiar Categoría a las celdas seleccionadas</Text>
                                                <Text style={{ marginBottom: 15, color: '#666' }}>Se cambiará la categoría de todas las filas seleccionadas.</Text>

                                                <View style={{ maxHeight: 300 }}>
                                                    <ScrollView>
                                                        {categories.map(cat => (
                                                            <Pressable
                                                                key={cat}
                                                                style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                                                                onPress={() => {
                                                                    if (!excelSelectionStart || !excelSelectionEnd) return;
                                                                    const minRow = Math.min(excelSelectionStart.row, excelSelectionEnd.row);
                                                                    const maxRow = Math.max(excelSelectionStart.row, excelSelectionEnd.row);

                                                                    const nextProds = [...draftExcelProducts];
                                                                    for (let r = minRow; r <= maxRow; r++) {
                                                                        const prodId = sortedExcelProducts[r]?.id;
                                                                        if (!prodId) continue;
                                                                        const pIndex = nextProds.findIndex(p => p.id === prodId);
                                                                        if (pIndex !== -1) {
                                                                            nextProds[pIndex] = { ...nextProds[pIndex], category: cat };
                                                                        }
                                                                    }
                                                                    pushExcelState(nextProds);
                                                                    setIsMassCategoryOpen(false);
                                                                }}
                                                            >
                                                                <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: categoryColors[cat] || '#888' }} />
                                                                <Text style={{ fontSize: 16 }}>{cat}</Text>
                                                            </Pressable>
                                                        ))}
                                                        <Pressable
                                                            style={{ padding: 12, backgroundColor: '#f0f7ff', marginTop: 10, borderRadius: 8, alignItems: 'center' }}
                                                            onPress={() => {
                                                                setIsMassCategoryOpen(false);
                                                                // Provide a way to create a new category and assign it, though native UI flow might be complex here.
                                                                // User asked for "añadir categoría", let's prompt them simply via window.prompt on Web, or alert them.
                                                                if (Platform.OS === 'web') {
                                                                    const newCat = window.prompt('Nombre de la nueva categoría:');
                                                                    if (newCat && newCat.trim()) {
                                                                        const cat = newCat.trim();
                                                                        if (!categories.includes(cat)) {
                                                                            setCategories([...categories, cat]);
                                                                        }
                                                                        if (!excelSelectionStart || !excelSelectionEnd) return;
                                                                        const minRow = Math.min(excelSelectionStart.row, excelSelectionEnd.row);
                                                                        const maxRow = Math.max(excelSelectionStart.row, excelSelectionEnd.row);
                                                                        const nextProds = [...draftExcelProducts];
                                                                        for (let r = minRow; r <= maxRow; r++) {
                                                                            const prodId = sortedExcelProducts[r]?.id;
                                                                            if (!prodId) continue;
                                                                            const pIndex = nextProds.findIndex(p => p.id === prodId);
                                                                            if (pIndex !== -1) nextProds[pIndex] = { ...nextProds[pIndex], category: cat };
                                                                        }
                                                                        pushExcelState(nextProds);
                                                                    }
                                                                } else {
                                                                    Alert.alert('Crear Categoría', 'Debes crear la categoría desde la pantalla principal primero.');
                                                                }
                                                            }}
                                                        >
                                                            <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>+ Nueva Categoría...</Text>
                                                        </Pressable>
                                                    </ScrollView>
                                                </View>

                                                <Pressable style={[styles.modalBtnCancel, { marginTop: 15 }]} onPress={() => setIsMassCategoryOpen(false)}>
                                                    <Text style={styles.modalBtnTextCancel}>Cancelar</Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    </Modal>
                                )}

                            </View>
                        </View>
                    </Modal>
                )}

                {/* AUTOMATIC RESTOCK MODAL */}
                {isRestockModalOpen && (() => {
                    const targetProduct = products.find(p => p.id === restockProductId);
                    const hasScheduledRestock = targetProduct?.autoRestock && targetProduct?.restockDate && targetProduct?.restockTime;

                    return (
                        <Modal transparent animationType="fade">
                            <Pressable
                                style={styles.modalBg}
                                onPress={() => {
                                    setIsHourDropdownOpen(false);
                                    setIsMinuteDropdownOpen(false);
                                }}
                            >
                                <View style={[styles.modalCard, { maxWidth: 460 }]} onStartShouldSetResponder={() => true}>
                                    <Text style={styles.modalTitle}>
                                        {restockModalMode === 'deactivate'
                                            ? "Desactivar Stock"
                                            : (hasScheduledRestock ? "Gestión de Reposición de Stock" : "¿Reponer automáticamente?")}
                                    </Text>
                                    <Text style={{ color: '#555', fontSize: 14, marginBottom: 15 }}>
                                        Producto: <Text style={{ fontWeight: 'bold' }}>"{targetProduct?.name}"</Text> {restockModalMode === 'deactivate' ? "(Actualmente en stock)" : "(Actualmente sin stock)"}
                                    </Text>

                                    {restockModalMode === 'deactivate' ? (
                                        /* FLUJO A: DESACTIVAR STOCK (EL PRODUCTO ESTABA ACTIVO) */
                                        <View>
                                            {wantsRestock === null ? (
                                                /* PASO A1: PREGUNTAR QUÃ‰ HACER AL DESACTIVAR */
                                                <View style={{ gap: 15 }}>
                                                    <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 10 }}>
                                                        ¿Qué deseas hacer con el stock de este producto?
                                                    </Text>

                                                    <View style={{ flexDirection: 'column', gap: 12 }}>
                                                        <Pressable
                                                            style={{
                                                                backgroundColor: '#ef4444',
                                                                paddingVertical: 14,
                                                                borderRadius: 8,
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}
                                                            onPress={() => {
                                                                updateProduct(restockProductId!, 'available', false);
                                                                updateProduct(restockProductId!, 'autoRestock', false);
                                                                updateProduct(restockProductId!, 'restockDate', undefined);
                                                                updateProduct(restockProductId!, 'restockTime', undefined);
                                                                setIsRestockModalOpen(false);
                                                            }}
                                                        >
                                                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>â¹ï¸ Desactivar stock (tiempo indefinido)</Text>
                                                        </Pressable>

                                                        <Pressable
                                                            style={{
                                                                backgroundColor: '#2563eb',
                                                                paddingVertical: 14,
                                                                borderRadius: 8,
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}
                                                            onPress={() => setWantsRestock(true)}
                                                        >
                                                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>📅 Asignar día y horario de reposición</Text>
                                                        </Pressable>
                                                    </View>

                                                    <Pressable
                                                        style={[styles.modalBtnCancel, { alignSelf: 'center', marginTop: 10 }]}
                                                        onPress={() => setIsRestockModalOpen(false)}
                                                    >
                                                        <Text style={styles.modalBtnTextCancel}>Cancelar</Text>
                                                    </Pressable>
                                                </View>
                                            ) : (
                                                /* PASO A2: FORMULARIO DE ALTA DE HORARIO AL DESACTIVAR */
                                                <View style={{ gap: 15 }}>
                                                    <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#333' }}>
                                                        Asignar día y horario de reposición:
                                                    </Text>

                                                    {/* DÃA DE REPOSICIÃ“N */}
                                                    <View>
                                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#4b5563', marginBottom: 6 }}>
                                                            Día en el que se va a reponer:
                                                        </Text>
                                                        <View style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden', backgroundColor: '#f9fafb' }}>
                                                            {Platform.OS === 'web' ? (
                                                                <select
                                                                    value={restockDate}
                                                                    onChange={(e) => setRestockDate(e.target.value)}
                                                                    style={{ width: '100%', padding: 12, border: 'none', backgroundColor: 'transparent', outline: 'none', fontSize: 15, fontWeight: '600' }}
                                                                >
                                                                    {next10Days.map(day => (
                                                                        <option key={day.value} value={day.value}>{day.label}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8 }}>
                                                                    {next10Days.slice(0, 3).map(day => (
                                                                        <Pressable
                                                                            key={day.value}
                                                                            style={{
                                                                                paddingHorizontal: 12,
                                                                                paddingVertical: 6,
                                                                                borderRadius: 6,
                                                                                backgroundColor: restockDate === day.value ? '#2563eb' : '#e5e7eb'
                                                                            }}
                                                                            onPress={() => setRestockDate(day.value)}
                                                                        >
                                                                            <Text style={{ color: restockDate === day.value ? '#fff' : '#333', fontSize: 12, fontWeight: 'bold' }}>{day.label}</Text>
                                                                        </Pressable>
                                                                    ))}
                                                                </View>
                                                            )}
                                                        </View>
                                                        <TextInput
                                                            style={[styles.input, { marginTop: 8, fontSize: 14 }]}
                                                            placeholder="Formato: AAAA-MM-DD"
                                                            value={restockDate}
                                                            onChangeText={setRestockDate}
                                                        />
                                                    </View>

                                                    {/* HORARIO (HORAS Y MINUTOS) */}
                                                    <View>
                                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#4b5563', marginBottom: 6 }}>
                                                            Horario de reposición:
                                                        </Text>
                                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                                            <View style={{ position: 'relative', flex: 1 }}>
                                                                <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Hora (00-23)</Text>
                                                                <TextInput
                                                                    style={[styles.input, { textAlign: 'center', fontSize: 18, fontWeight: 'bold' }]}
                                                                    value={restockHour}
                                                                    onChangeText={(val) => {
                                                                        const cleaned = val.replace(/[^0-9]/g, '').slice(0, 2);
                                                                        const num = parseInt(cleaned);
                                                                        if (!val || (!isNaN(num) && num >= 0 && num <= 23)) {
                                                                            setRestockHour(cleaned);
                                                                        }
                                                                    }}
                                                                    onFocus={() => {
                                                                        setIsHourDropdownOpen(true);
                                                                        setIsMinuteDropdownOpen(false);
                                                                    }}
                                                                    placeholder="00"
                                                                    maxLength={2}
                                                                    keyboardType="numeric"
                                                                />
                                                                {isHourDropdownOpen && (
                                                                    <View style={styles.timeDropdown}>
                                                                        <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="always">
                                                                            {Array.from({ length: 24 }).map((_, h) => {
                                                                                const hStr = String(h).padStart(2, '0');
                                                                                return (
                                                                                    <Pressable
                                                                                        key={hStr}
                                                                                        style={styles.timeDropdownItem}
                                                                                        onPress={() => {
                                                                                            setRestockHour(hStr);
                                                                                            setIsHourDropdownOpen(false);
                                                                                            setIsMinuteDropdownOpen(true);
                                                                                        }}
                                                                                    >
                                                                                        <Text style={styles.timeDropdownText}>{hStr}</Text>
                                                                                    </Pressable>
                                                                                );
                                                                            })}
                                                                        </ScrollView>
                                                                    </View>
                                                                )}
                                                            </View>

                                                            <Text style={{ fontSize: 24, fontWeight: 'bold', alignSelf: 'center', marginTop: 15 }}>:</Text>

                                                            <View style={{ position: 'relative', flex: 1 }}>
                                                                <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Minutos (00-59)</Text>
                                                                <TextInput
                                                                    style={[styles.input, { textAlign: 'center', fontSize: 18, fontWeight: 'bold' }]}
                                                                    value={restockMinute}
                                                                    onChangeText={(val) => {
                                                                        const cleaned = val.replace(/[^0-9]/g, '').slice(0, 2);
                                                                        const num = parseInt(cleaned);
                                                                        if (!val || (!isNaN(num) && num >= 0 && num <= 59)) {
                                                                            setRestockMinute(cleaned);
                                                                        }
                                                                    }}
                                                                    onFocus={() => {
                                                                        setIsMinuteDropdownOpen(true);
                                                                        setIsHourDropdownOpen(false);
                                                                    }}
                                                                    placeholder="01"
                                                                    maxLength={2}
                                                                    keyboardType="numeric"
                                                                />
                                                                {isMinuteDropdownOpen && (
                                                                    <View style={styles.timeDropdown}>
                                                                        <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="always">
                                                                            {Array.from({ length: 60 }).map((_, m) => {
                                                                                const mStr = String(m).padStart(2, '0');
                                                                                return (
                                                                                    <Pressable
                                                                                        key={mStr}
                                                                                        style={styles.timeDropdownItem}
                                                                                        onPress={() => {
                                                                                            setRestockMinute(mStr);
                                                                                            setIsMinuteDropdownOpen(false);
                                                                                        }}
                                                                                    >
                                                                                        <Text style={styles.timeDropdownText}>{mStr}</Text>
                                                                                    </Pressable>
                                                                                );
                                                                            })}
                                                                        </ScrollView>
                                                                    </View>
                                                                )}
                                                            </View>
                                                        </View>
                                                    </View>

                                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                                                        <Pressable
                                                            style={styles.modalBtnCancel}
                                                            onPress={() => setWantsRestock(null)}
                                                        >
                                                            <Text style={styles.modalBtnTextCancel}>Volver</Text>
                                                        </Pressable>
                                                        <Pressable
                                                            style={[styles.modalBtnConfirm, { backgroundColor: '#10b981' }]}
                                                            onPress={() => {
                                                                const h = restockHour || '00';
                                                                const m = restockMinute || '01';
                                                                updateProduct(restockProductId!, 'available', false);
                                                                updateProduct(restockProductId!, 'autoRestock', true);
                                                                updateProduct(restockProductId!, 'restockDate', restockDate);
                                                                updateProduct(restockProductId!, 'restockTime', `${h}:${m}`);
                                                                setIsRestockModalOpen(false);
                                                            }}
                                                        >
                                                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Aceptar y Confirmar</Text>
                                                        </Pressable>
                                                    </View>
                                                </View>
                                            )}
                                        </View>
                                    ) : (
                                        /* FLUJO B: REACTIVAR STOCK (EL PRODUCTO YA ESTABA SIN STOCK) */
                                        <View>
                                            {hasScheduledRestock ? (
                                                /* CASO B1: YA TIENE UN HORARIO PROGRAMADO */
                                                <View style={{ gap: 15 }}>
                                                    <View style={{ backgroundColor: '#eff6ff', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#3b82f6' }}>
                                                        <Text style={{ fontSize: 14, color: '#1e40af', fontWeight: 'bold', marginBottom: 2 }}>
                                                            📅 Reposición automática programada
                                                        </Text>
                                                        <Text style={{ fontSize: 13, color: '#1e3a8a' }}>
                                                            Fecha: {targetProduct.restockDate} a las {targetProduct.restockTime} hs
                                                        </Text>
                                                    </View>

                                                    {/* BOTÃ“N PREPONDERANTE: REPONER AHORA */}
                                                    <Pressable
                                                        style={{
                                                            backgroundColor: '#10b981',
                                                            paddingVertical: 14,
                                                            borderRadius: 8,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            shadowColor: '#10b981',
                                                            shadowOpacity: 0.2,
                                                            shadowRadius: 4,
                                                            elevation: 2
                                                        }}
                                                        onPress={() => {
                                                            updateProduct(restockProductId!, 'available', true);
                                                            updateProduct(restockProductId!, 'autoRestock', false);
                                                            updateProduct(restockProductId!, 'restockDate', undefined);
                                                            updateProduct(restockProductId!, 'restockTime', undefined);
                                                            setIsRestockModalOpen(false);
                                                        }}
                                                    >
                                                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>✅ Reponer ahora (Poner en Stock)</Text>
                                                    </Pressable>

                                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#4b5563', marginTop: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 5 }}>
                                                        Editar horario de reposición programado:
                                                    </Text>

                                                    {/* DÃA DE REPOSICIÃ“N */}
                                                    <View>
                                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#4b5563', marginBottom: 6 }}>
                                                            Día de reposición:
                                                        </Text>
                                                        <View style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden', backgroundColor: '#f9fafb' }}>
                                                            {Platform.OS === 'web' ? (
                                                                <select
                                                                    value={restockDate}
                                                                    onChange={(e) => setRestockDate(e.target.value)}
                                                                    style={{ width: '100%', padding: 12, border: 'none', backgroundColor: 'transparent', outline: 'none', fontSize: 15, fontWeight: '600' }}
                                                                >
                                                                    {next10Days.map(day => (
                                                                        <option key={day.value} value={day.value}>{day.label}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8 }}>
                                                                    {next10Days.slice(0, 3).map(day => (
                                                                        <Pressable
                                                                            key={day.value}
                                                                            style={{
                                                                                paddingHorizontal: 12,
                                                                                paddingVertical: 6,
                                                                                borderRadius: 6,
                                                                                backgroundColor: restockDate === day.value ? '#2563eb' : '#e5e7eb'
                                                                            }}
                                                                            onPress={() => setRestockDate(day.value)}
                                                                        >
                                                                            <Text style={{ color: restockDate === day.value ? '#fff' : '#333', fontSize: 12, fontWeight: 'bold' }}>{day.label}</Text>
                                                                        </Pressable>
                                                                    ))}
                                                                </View>
                                                            )}
                                                        </View>
                                                        <TextInput
                                                            style={[styles.input, { marginTop: 8, fontSize: 14 }]}
                                                            placeholder="Formato: AAAA-MM-DD"
                                                            value={restockDate}
                                                            onChangeText={setRestockDate}
                                                        />
                                                    </View>

                                                    {/* HORARIO (HORAS Y MINUTOS) */}
                                                    <View>
                                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#4b5563', marginBottom: 6 }}>
                                                            Horario de reposición:
                                                        </Text>
                                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                                            <View style={{ position: 'relative', flex: 1 }}>
                                                                <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Hora (00-23)</Text>
                                                                <TextInput
                                                                    style={[styles.input, { textAlign: 'center', fontSize: 18, fontWeight: 'bold' }]}
                                                                    value={restockHour}
                                                                    onChangeText={(val) => {
                                                                        const cleaned = val.replace(/[^0-9]/g, '').slice(0, 2);
                                                                        const num = parseInt(cleaned);
                                                                        if (!val || (!isNaN(num) && num >= 0 && num <= 23)) {
                                                                            setRestockHour(cleaned);
                                                                        }
                                                                    }}
                                                                    onFocus={() => {
                                                                        setIsHourDropdownOpen(true);
                                                                        setIsMinuteDropdownOpen(false);
                                                                    }}
                                                                    placeholder="00"
                                                                    maxLength={2}
                                                                    keyboardType="numeric"
                                                                />
                                                                {isHourDropdownOpen && (
                                                                    <View style={styles.timeDropdown}>
                                                                        <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="always">
                                                                            {Array.from({ length: 24 }).map((_, h) => {
                                                                                const hStr = String(h).padStart(2, '0');
                                                                                return (
                                                                                    <Pressable
                                                                                        key={hStr}
                                                                                        style={styles.timeDropdownItem}
                                                                                        onPress={() => {
                                                                                            setRestockHour(hStr);
                                                                                            setIsHourDropdownOpen(false);
                                                                                            setIsMinuteDropdownOpen(true);
                                                                                        }}
                                                                                    >
                                                                                        <Text style={styles.timeDropdownText}>{hStr}</Text>
                                                                                    </Pressable>
                                                                                );
                                                                            })}
                                                                        </ScrollView>
                                                                    </View>
                                                                )}
                                                            </View>

                                                            <Text style={{ fontSize: 24, fontWeight: 'bold', alignSelf: 'center', marginTop: 15 }}>:</Text>

                                                            <View style={{ position: 'relative', flex: 1 }}>
                                                                <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Minutos (00-59)</Text>
                                                                <TextInput
                                                                    style={[styles.input, { textAlign: 'center', fontSize: 18, fontWeight: 'bold' }]}
                                                                    value={restockMinute}
                                                                    onChangeText={(val) => {
                                                                        const cleaned = val.replace(/[^0-9]/g, '').slice(0, 2);
                                                                        const num = parseInt(cleaned);
                                                                        if (!val || (!isNaN(num) && num >= 0 && num <= 59)) {
                                                                            setRestockMinute(cleaned);
                                                                        }
                                                                    }}
                                                                    onFocus={() => {
                                                                        setIsMinuteDropdownOpen(true);
                                                                        setIsHourDropdownOpen(false);
                                                                    }}
                                                                    placeholder="01"
                                                                    maxLength={2}
                                                                    keyboardType="numeric"
                                                                />
                                                                {isMinuteDropdownOpen && (
                                                                    <View style={styles.timeDropdown}>
                                                                        <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="always">
                                                                            {Array.from({ length: 60 }).map((_, m) => {
                                                                                const mStr = String(m).padStart(2, '0');
                                                                                return (
                                                                                    <Pressable
                                                                                        key={mStr}
                                                                                        style={styles.timeDropdownItem}
                                                                                        onPress={() => {
                                                                                            setRestockMinute(mStr);
                                                                                            setIsMinuteDropdownOpen(false);
                                                                                        }}
                                                                                    >
                                                                                        <Text style={styles.timeDropdownText}>{mStr}</Text>
                                                                                    </Pressable>
                                                                                );
                                                                            })}
                                                                        </ScrollView>
                                                                    </View>
                                                                )}
                                                            </View>
                                                        </View>
                                                    </View>

                                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 15 }}>
                                                        <Pressable
                                                            style={[styles.modalBtnCancel, { backgroundColor: '#fef2f2' }]}
                                                            onPress={() => {
                                                                updateProduct(restockProductId!, 'autoRestock', false);
                                                                updateProduct(restockProductId!, 'restockDate', undefined);
                                                                updateProduct(restockProductId!, 'restockTime', undefined);
                                                                setIsRestockModalOpen(false);
                                                            }}
                                                        >
                                                            <Text style={[styles.modalBtnTextCancel, { color: '#ef4444' }]}>Quitar Reposición</Text>
                                                        </Pressable>
                                                        <Pressable
                                                            style={styles.modalBtnCancel}
                                                            onPress={() => setIsRestockModalOpen(false)}
                                                        >
                                                            <Text style={styles.modalBtnTextCancel}>Cerrar</Text>
                                                        </Pressable>
                                                        <Pressable
                                                            style={[styles.modalBtnConfirm, { backgroundColor: '#007AFF' }]}
                                                            onPress={() => {
                                                                const h = restockHour || '00';
                                                                const m = restockMinute || '01';
                                                                updateProduct(restockProductId!, 'autoRestock', true);
                                                                updateProduct(restockProductId!, 'restockDate', restockDate);
                                                                updateProduct(restockProductId!, 'restockTime', `${h}:${m}`);
                                                                setIsRestockModalOpen(false);
                                                            }}
                                                        >
                                                            <Text style={styles.modalBtnTextConfirm}>Guardar Cambios</Text>
                                                        </Pressable>
                                                    </View>
                                                </View>
                                            ) : (
                                                /* CASO B2: NO TIENE HORARIO CONFIGURADO TODAVÃA */
                                                <View>
                                                    {wantsRestock === null ? (
                                                        <View style={{ gap: 15 }}>
                                                            <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 10 }}>
                                                                ¿Qué deseas hacer con este producto?
                                                            </Text>

                                                            <View style={{ flexDirection: 'column', gap: 12 }}>
                                                                <Pressable
                                                                    style={{
                                                                        backgroundColor: '#10b981',
                                                                        paddingVertical: 14,
                                                                        borderRadius: 8,
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center'
                                                                    }}
                                                                    onPress={() => {
                                                                        updateProduct(restockProductId!, 'available', true);
                                                                        updateProduct(restockProductId!, 'autoRestock', false);
                                                                        updateProduct(restockProductId!, 'restockDate', undefined);
                                                                        updateProduct(restockProductId!, 'restockTime', undefined);
                                                                        setIsRestockModalOpen(false);
                                                                    }}
                                                                >
                                                                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>✅ Reponer ahora (Poner en Stock)</Text>
                                                                </Pressable>

                                                                <Pressable
                                                                    style={{
                                                                        backgroundColor: '#f3f4f6',
                                                                        paddingVertical: 14,
                                                                        borderRadius: 8,
                                                                        borderWidth: 1,
                                                                        borderColor: '#d1d5db',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center'
                                                                    }}
                                                                    onPress={() => setWantsRestock(true)}
                                                                >
                                                                    <Text style={{ color: '#374151', fontWeight: 'bold', fontSize: 15 }}>📅 Asignar día y horario de reposición</Text>
                                                                </Pressable>
                                                            </View>

                                                            <Pressable
                                                                style={[styles.modalBtnCancel, { alignSelf: 'center', marginTop: 10 }]}
                                                                onPress={() => setIsRestockModalOpen(false)}
                                                            >
                                                                <Text style={styles.modalBtnTextCancel}>Volver atrás</Text>
                                                            </Pressable>
                                                        </View>
                                                    ) : (
                                                        /* FORMULARIO DE ALTA DE HORARIO */
                                                        <View style={{ gap: 15 }}>
                                                            <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#333' }}>
                                                                Asignar día y horario de reposición:
                                                            </Text>

                                                            {/* DÃA DE REPOSICIÃ“N */}
                                                            <View>
                                                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#4b5563', marginBottom: 6 }}>
                                                                    Día en el que se va a reponer:
                                                                </Text>
                                                                <View style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden', backgroundColor: '#f9fafb' }}>
                                                                    {Platform.OS === 'web' ? (
                                                                        <select
                                                                            value={restockDate}
                                                                            onChange={(e) => setRestockDate(e.target.value)}
                                                                            style={{ width: '100%', padding: 12, border: 'none', backgroundColor: 'transparent', outline: 'none', fontSize: 15, fontWeight: '600' }}
                                                                        >
                                                                            {next10Days.map(day => (
                                                                                <option key={day.value} value={day.value}>{day.label}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8 }}>
                                                                            {next10Days.slice(0, 3).map(day => (
                                                                                <Pressable
                                                                                    key={day.value}
                                                                                    style={{
                                                                                        paddingHorizontal: 12,
                                                                                        paddingVertical: 6,
                                                                                        borderRadius: 6,
                                                                                        backgroundColor: restockDate === day.value ? '#2563eb' : '#e5e7eb'
                                                                                    }}
                                                                                    onPress={() => setRestockDate(day.value)}
                                                                                >
                                                                                    <Text style={{ color: restockDate === day.value ? '#fff' : '#333', fontSize: 12, fontWeight: 'bold' }}>{day.label}</Text>
                                                                                </Pressable>
                                                                            ))}
                                                                        </View>
                                                                    )}
                                                                </View>
                                                                <TextInput
                                                                    style={[styles.input, { marginTop: 8, fontSize: 14 }]}
                                                                    placeholder="Formato: AAAA-MM-DD"
                                                                    value={restockDate}
                                                                    onChangeText={setRestockDate}
                                                                />
                                                            </View>

                                                            {/* HORARIO (HORAS Y MINUTOS) */}
                                                            <View>
                                                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#4b5563', marginBottom: 6 }}>
                                                                    Horario de reposición:
                                                                </Text>
                                                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                                                    <View style={{ position: 'relative', flex: 1 }}>
                                                                        <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Hora (00-23)</Text>
                                                                        <TextInput
                                                                            style={[styles.input, { textAlign: 'center', fontSize: 18, fontWeight: 'bold' }]}
                                                                            value={restockHour}
                                                                            onChangeText={(val) => {
                                                                                const cleaned = val.replace(/[^0-9]/g, '').slice(0, 2);
                                                                                const num = parseInt(cleaned);
                                                                                if (!val || (!isNaN(num) && num >= 0 && num <= 23)) {
                                                                                    setRestockHour(cleaned);
                                                                                }
                                                                            }}
                                                                            onFocus={() => {
                                                                                setIsHourDropdownOpen(true);
                                                                                setIsMinuteDropdownOpen(false);
                                                                            }}
                                                                            placeholder="00"
                                                                            maxLength={2}
                                                                            keyboardType="numeric"
                                                                        />
                                                                        {isHourDropdownOpen && (
                                                                            <View style={styles.timeDropdown}>
                                                                                <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="always">
                                                                                    {Array.from({ length: 24 }).map((_, h) => {
                                                                                        const hStr = String(h).padStart(2, '0');
                                                                                        return (
                                                                                            <Pressable
                                                                                                key={hStr}
                                                                                                style={styles.timeDropdownItem}
                                                                                                onPress={() => {
                                                                                                    setRestockHour(hStr);
                                                                                                    setIsHourDropdownOpen(false);
                                                                                                    setIsMinuteDropdownOpen(true);
                                                                                                }}
                                                                                            >
                                                                                                <Text style={styles.timeDropdownText}>{hStr}</Text>
                                                                                            </Pressable>
                                                                                        );
                                                                                    })}
                                                                                </ScrollView>
                                                                            </View>
                                                                        )}
                                                                    </View>

                                                                    <Text style={{ fontSize: 24, fontWeight: 'bold', alignSelf: 'center', marginTop: 15 }}>:</Text>

                                                                    <View style={{ position: 'relative', flex: 1 }}>
                                                                        <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Minutos (00-59)</Text>
                                                                        <TextInput
                                                                            style={[styles.input, { textAlign: 'center', fontSize: 18, fontWeight: 'bold' }]}
                                                                            value={restockMinute}
                                                                            onChangeText={(val) => {
                                                                                const cleaned = val.replace(/[^0-9]/g, '').slice(0, 2);
                                                                                const num = parseInt(cleaned);
                                                                                if (!val || (!isNaN(num) && num >= 0 && num <= 59)) {
                                                                                    setRestockMinute(cleaned);
                                                                                }
                                                                            }}
                                                                            onFocus={() => {
                                                                                setIsMinuteDropdownOpen(true);
                                                                                setIsHourDropdownOpen(false);
                                                                            }}
                                                                            placeholder="01"
                                                                            maxLength={2}
                                                                            keyboardType="numeric"
                                                                        />
                                                                        {isMinuteDropdownOpen && (
                                                                            <View style={styles.timeDropdown}>
                                                                                <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="always">
                                                                                    {Array.from({ length: 60 }).map((_, m) => {
                                                                                        const mStr = String(m).padStart(2, '0');
                                                                                        return (
                                                                                            <Pressable
                                                                                                key={mStr}
                                                                                                style={styles.timeDropdownItem}
                                                                                                onPress={() => {
                                                                                                    setRestockMinute(mStr);
                                                                                                    setIsMinuteDropdownOpen(false);
                                                                                                }}
                                                                                            >
                                                                                                <Text style={styles.timeDropdownText}>{mStr}</Text>
                                                                                            </Pressable>
                                                                                        );
                                                                                    })}
                                                                                </ScrollView>
                                                                            </View>
                                                                        )}
                                                                    </View>
                                                                </View>
                                                            </View>

                                                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                                                                <Pressable
                                                                    style={styles.modalBtnCancel}
                                                                    onPress={() => setWantsRestock(null)}
                                                                >
                                                                    <Text style={styles.modalBtnTextCancel}>Volver</Text>
                                                                </Pressable>
                                                                <Pressable
                                                                    style={[styles.modalBtnConfirm, { backgroundColor: '#10b981' }]}
                                                                    onPress={() => {
                                                                        const h = restockHour || '00';
                                                                        const m = restockMinute || '01';
                                                                        updateProduct(restockProductId!, 'available', false);
                                                                        updateProduct(restockProductId!, 'autoRestock', true);
                                                                        updateProduct(restockProductId!, 'restockDate', restockDate);
                                                                        updateProduct(restockProductId!, 'restockTime', `${h}:${m}`);
                                                                        setIsRestockModalOpen(false);
                                                                    }}
                                                                >
                                                                    <Text style={styles.modalBtnTextConfirm}>Aceptar y Confirmar</Text>
                                                                </Pressable>
                                                            </View>
                                                        </View>
                                                    )}
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            </Pressable>
                        </Modal>
                    );
                })()}

                {/* CUSTOM CONFIRM MODAL */}
                {customConfirm?.visible && (
                    <Modal transparent animationType="fade">
                        <View style={styles.modalBg}>
                            <View style={[styles.modalCard, { maxWidth: 400, alignItems: 'center' }]}>
                                <Text style={[styles.modalTitle, { textAlign: 'center' }]}>{customConfirm.title}</Text>
                                {customConfirm.isWarning && (
                                    <Text style={{ color: '#FF3B30', fontWeight: 'bold', marginBottom: 10, textAlign: 'center', fontSize: 16 }}>⚠️ PRECAUCIÓN</Text>
                                )}
                                <Text style={{ color: '#444', marginBottom: 25, textAlign: 'center', fontSize: 15 }}>{customConfirm.message}</Text>
                                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 15, width: '100%' }}>
                                    <Pressable style={[styles.modalBtnCancel, { flex: 1, alignItems: 'center' }]} onPress={customConfirm.onCancel}>
                                        <Text style={styles.modalBtnTextCancel}>{customConfirm.cancelText}</Text>
                                    </Pressable>
                                    <Pressable style={[styles.modalBtnConfirm, { flex: 1, alignItems: 'center', backgroundColor: customConfirm.isWarning ? '#FF3B30' : '#007AFF' }]} onPress={customConfirm.onConfirm}>
                                        <Text style={styles.modalBtnTextConfirm}>{customConfirm.confirmText}</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </Modal>
                )}

            </ScrollView>

            {/* ACTION BAR INFERIOR DE GUARDADO FIREBASE */}
            <View style={[styles.fixedFooter, { zIndex: 100 }]}>
                <Pressable
                    style={[styles.saveBtnFixed, isSaving && styles.saveBtnFixedDisabled]}
                    onPress={handleSaveCatalog}
                    disabled={isSaving || !settings}
                >
                    <Text style={[styles.saveBtnTextFixed, isSaving && styles.saveBtnTextDisabled]}>
                        {isSaving ? "Guardando en la Nube..." : "Guardar Todo Online (Catálogo y Ajustes)"}
                    </Text>
                </Pressable>
            </View>

            {/* IMAGE PICKER PORTAL */}
            {pickerState && (
                <ImagePickerPortal
                    visible={pickerState.visible}
                    businessId={businessProfile.id}
                    initialImageUrl={pickerState.type === 'product' ? products.find(p => p.id === pickerState.id)?.imageUrl : drafts.find(d => d.id === pickerState.id)?.imageUrl}
                    onUploadComplete={(url: string) => {
                        if (pickerState.type === 'product') {
                            updateProduct(pickerState.id, 'imageUrl', url);
                        } else {
                            updateDraft(pickerState.id, 'imageUrl', url);
                        }
                        setEditingProduct(prev => prev && prev.id === pickerState.id ? { ...prev, imageUrl: url } : prev);
                        setPickerState(null);
                    }}
                    onCancel={() => setPickerState(null)}
                />
            )}

            {/* DETAIL EDITOR MODAL */}
            {isDetailModalOpen && editingProduct && (
                <Modal visible={isDetailModalOpen} transparent animationType="slide">
                    <View style={styles.modalBg}>
                        <View style={[styles.modalCard, { width: '90%', maxWidth: 500, padding: 25 }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <Text style={styles.modalTitle}>✏️ Editar Detalles</Text>
                                <Pressable onPress={() => { setIsDetailModalOpen(false); setEditingProduct(null); }}>
                                    <FontAwesome name="times" size={20} color="#666" />
                                </Pressable>
                            </View>

                            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
                                <View style={{ gap: 15, paddingBottom: 15 }}>
                                    <View>
                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#64748b', marginBottom: 5 }}>Nombre:</Text>
                                        <TextInput
                                            style={styles.modalInput}
                                            value={editingProduct.name}
                                            onChangeText={v => setEditingProduct(prev => prev ? { ...prev, name: v } : null)}
                                            placeholder="Nombre del producto..."
                                        />
                                    </View>

                                    <View>
                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#64748b', marginBottom: 5 }}>Categoría:</Text>
                                        <SelectCategory
                                            value={editingProduct.category || ''}
                                            onChange={v => setEditingProduct(prev => prev ? { ...prev, category: v } : null)}
                                        />
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#64748b', marginBottom: 5 }}>Precio ($):</Text>
                                            <TextInput
                                                style={styles.modalInput}
                                                value={editingProduct.price !== undefined ? editingProduct.price.toString() : ''}
                                                onChangeText={v => setEditingProduct(prev => prev ? { ...prev, price: parseFloat(v) || 0 } : null)}
                                                keyboardType="numeric"
                                                placeholder="Precio..."
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#64748b', marginBottom: 5 }}>Precio Oferta ($):</Text>
                                            <TextInput
                                                style={styles.modalInput}
                                                value={editingProduct.promotionalPrice !== undefined ? editingProduct.promotionalPrice.toString() : ''}
                                                onChangeText={v => setEditingProduct(prev => prev ? { ...prev, promotionalPrice: parseFloat(v) || undefined } : null)}
                                                keyboardType="numeric"
                                                placeholder="Oferta (opcional)..."
                                            />
                                        </View>
                                    </View>

                                    <View>
                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#64748b', marginBottom: 5 }}>Descripción:</Text>
                                        <TextInput
                                            style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                                            value={editingProduct.description || ''}
                                            onChangeText={v => setEditingProduct(prev => prev ? { ...prev, description: v } : null)}
                                            multiline
                                            numberOfLines={3}
                                            placeholder="Descripción del producto..."
                                        />
                                    </View>

                                    <View>
                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#64748b', marginBottom: 5 }}>Ingredientes:</Text>
                                        <TextInput
                                            style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                                            value={editingProduct.ingredients || ''}
                                            onChangeText={v => setEditingProduct(prev => prev ? { ...prev, ingredients: v } : null)}
                                            multiline
                                            numberOfLines={3}
                                            placeholder="Ingredientes (salsa, de qué está hecho, etc.)..."
                                        />
                                    </View>

                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 10 }}>
                                        {editingProduct.imageUrl ? (
                                            <Image source={{ uri: editingProduct.imageUrl }} style={{ width: 60, height: 60, borderRadius: 8 }} />
                                        ) : (
                                            <View style={{ width: 60, height: 60, borderRadius: 8, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' }}>
                                                <FontAwesome name="camera" size={20} color="#94a3b8" />
                                            </View>
                                        )}
                                        <Pressable
                                            style={{ flex: 1, padding: 10, backgroundColor: '#f1f5f9', borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center' }}
                                            onPress={() => {
                                                const isDraft = drafts.some(d => d.id === editingProduct.id);
                                                setPickerState({ visible: true, type: isDraft ? 'draft' : 'product', id: editingProduct.id! });
                                            }}
                                        >
                                            <Text style={{ fontWeight: '600', color: '#475569' }}>📷 {editingProduct.imageUrl ? 'Cambiar Foto' : 'Subir Foto'}</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            </ScrollView>

                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                                <Pressable
                                    style={[styles.modalBtnCancel, { paddingHorizontal: 20 }]}
                                    onPress={() => { setIsDetailModalOpen(false); setEditingProduct(null); }}
                                >
                                    <Text style={styles.modalBtnTextCancel}>Cancelar</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.modalBtnConfirm, { paddingHorizontal: 20 }]}
                                    onPress={() => {
                                        const isDraft = drafts.some(d => d.id === editingProduct.id);
                                        if (isDraft) {
                                            setDrafts(drafts.map(d => d.id === editingProduct.id ? editingProduct : d));
                                        } else {
                                            setProducts(products.map(p => p.id === editingProduct.id ? editingProduct as Product : p));
                                        }
                                        setIsDetailModalOpen(false);
                                        setEditingProduct(null);
                                    }}
                                >
                                    <Text style={styles.modalBtnTextConfirm}>Guardar</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
            {/* SMART EXCEL IMPORT MODAL */}
            <ExcelImportModal
                visible={isSmartExcelModalOpen}
                onClose={() => setIsSmartExcelModalOpen(false)}
                existingProducts={products}
                onApplyImport={async (importedProds, updatedAliases, rawRows) => {
                    if (businessProfile?.status === 'trial' && importedProds.length > 20) {
                        Alert.alert('Límite de Prueba', 'Alcanzaste el límite de 20 productos de la versión de prueba. Se cargaron solo los primeros 20. ¡Contactanos para desbloquear la versión completa!');
                        importedProds = importedProds.slice(0, 20);
                    }
                    recordCatalogChange('Importación desde Excel Inteligente', products);
                    setProducts(importedProds);
                    if (user?.email === 'cocobustos.93@gmail.com' && rawRows && rawRows.length > 0) {
                        const newSettings = { ...settings, rawExcelGrid: rawRows };
                        await saveBusinessSettings(businessProfile.id, newSettings);
                        setSettings(newSettings);
                    }
                    alert('Catálogo actualizado e importado correctamente desde Excel.');
                }}
            />

            {/* SUPERADMIN RAW EXCEL EDITOR */}
            {isSuperadminRawExcelOpen && settings.rawExcelGrid && (
                <SuperadminRawExcelEditor
                    visible={isSuperadminRawExcelOpen}
                    onClose={() => setIsSuperadminRawExcelOpen(false)}
                    initialRows={settings.rawExcelGrid}
                    onSaveAndSync={async (newRows, parsedItems) => {
                        // Sincronizar catálogo
                        const updatedProducts = [...products];
                        parsedItems.forEach(item => {
                            const normRaw = normalizeName(item.rawName);
                            const pIdx = updatedProducts.findIndex(p => {
                                const normPName = normalizeName(p.name);
                                const normMapping = p.excelMappingName ? normalizeName(p.excelMappingName) : '';
                                const defaultAliasMatch = DEFAULT_ROCIO_ALIASES[normRaw] ? normalizeName(DEFAULT_ROCIO_ALIASES[normRaw]) : '';
                                return normPName === normRaw || (normMapping !== '' && normMapping === normRaw) || (defaultAliasMatch !== '' && normPName === defaultAliasMatch);
                            });
                            if (pIdx !== -1) {
                                updatedProducts[pIdx] = { ...updatedProducts[pIdx], price: item.price };
                                if (item.isDailyOffer) {
                                    updatedProducts[pIdx].dailyOfferPrice = item.dailyOfferPrice;
                                    updatedProducts[pIdx].dailyOfferMinQty = item.dailyOfferMinQty;
                                } else {
                                    updatedProducts[pIdx].dailyOfferPrice = undefined;
                                }
                            }
                        });
                        setProducts(updatedProducts);

                        // Save raw excel to settings
                        const newSettings = { ...settings, rawExcelGrid: newRows };
                        await saveBusinessSettings(businessProfile.id, newSettings);
                        setSettings(newSettings);
                    }}
                />
            )}

            {/* GENERAL CATALOG HISTORY MODAL */}
            {isHistoryModalOpen && (
                <Modal visible={isHistoryModalOpen} transparent animationType="fade">
                    <View style={styles.modalBg}>
                        <View style={[styles.modalCard, { width: 650 }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                                <Text style={styles.modalTitle}>📜 Historial de Cambios del Catálogo</Text>
                                <Pressable onPress={() => setIsHistoryModalOpen(false)}>
                                    <Text style={{ fontSize: 20, color: '#666', fontWeight: 'bold' }}>✕</Text>
                                </Pressable>
                            </View>
                            <Text style={{ fontSize: 13, color: '#666', marginBottom: 15 }}>
                                Cada vez que realizas un cambio (importación, edición o eliminación), se guarda un registro. Puedes restaurar el catálogo a cualquier estado anterior:
                            </Text>

                            <ScrollView style={{ maxHeight: 380 }}>
                                {catalogHistory.length === 0 ? (
                                    <View style={{ padding: 20, alignItems: 'center' }}>
                                        <Text style={{ color: '#999' }}>Aún no hay cambios registrados en esta sesión.</Text>
                                    </View>
                                ) : (
                                    catalogHistory.map((rec, index) => (
                                        <View key={rec.id || index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                                            <View style={{ flex: 1, marginRight: 10 }}>
                                                <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#1e293b' }}>{rec.action}</Text>
                                                <Text style={{ fontSize: 12, color: '#64748b' }}>📅 {rec.timestamp} | 📦 {rec.products.length} productos en total</Text>
                                            </View>
                                            <Pressable
                                                style={{ backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                                                onPress={() => {
                                                    recordCatalogChange(`Restaurado a versión anterior (${rec.timestamp})`, products);
                                                    setProducts(rec.products);
                                                    Alert.alert('Restaurado', `El catálogo ha sido vuelto al estado de: ${rec.action} (${rec.timestamp}).`);
                                                    setIsHistoryModalOpen(false);
                                                }}
                                            >
                                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>↩️ Restaurar</Text>
                                            </Pressable>
                                        </View>
                                    ))
                                )}
                            </ScrollView>

                            <View style={{ marginTop: 15, alignItems: 'flex-end' }}>
                                <Pressable style={[styles.modalBtnCancel, { paddingHorizontal: 20 }]} onPress={() => setIsHistoryModalOpen(false)}>
                                    <Text style={styles.modalBtnTextCancel}>Cerrar</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f5f7' },
    content: { padding: 30, paddingBottom: 100 },
    pageTitle: { fontSize: 28, fontWeight: '800', color: '#111', marginBottom: 5 },
    subtitle: { fontSize: 14, color: '#666', marginBottom: 30 },
    section: { backgroundColor: '#fff', borderRadius: 12, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#222', marginRight: 15 },
    searchInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 8, flex: 1, minWidth: 200 },
    addBtn: { backgroundColor: '#007AFF', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8 },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center', paddingVertical: 12 },
    headerRow: { backgroundColor: '#fafafa', borderBottomWidth: 2, borderColor: '#ddd', paddingVertical: 16 },
    cell: { paddingHorizontal: 5 },
    headerText: { fontWeight: 'bold', color: '#555', fontSize: 13, textAlign: 'center' },
    input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 4, padding: 8, fontSize: 14, width: '100%' },
    webSelect: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 4, padding: 8, fontSize: 14, width: '100%', outline: 'none' },

    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalCard: { width: 600, maxWidth: '90%', backgroundColor: '#fff', borderRadius: 12, padding: 25, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10 },
    modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
    textarea: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, height: 200, padding: 10, textAlignVertical: 'top', fontSize: 14 },

    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f1f1', borderWidth: 1, borderColor: '#ddd' },
    chipActive: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
    chipText: { fontSize: 14, color: '#666', fontWeight: 'bold' },
    chipTextActive: { color: '#fff' },

    filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#eee' },
    filterChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
    filterChipText: { fontSize: 12, color: '#555', fontWeight: 'bold' },
    filterChipTextActive: { color: '#fff' },
    separator: { height: 1, backgroundColor: '#eaebed', marginVertical: 30 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 25, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
    modalLabel: { fontSize: 14, fontWeight: 'bold', color: '#444', marginBottom: 5, marginTop: 10 },
    modalInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, backgroundColor: '#f9f9f9', marginBottom: 15, fontSize: 15 },
    modalBtnCancel: { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#eee', borderRadius: 8 },
    modalBtnTextCancel: { fontWeight: 'bold', color: '#555' },
    modalBtnConfirm: { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#FF3B30', borderRadius: 8 },
    modalBtnTextConfirm: { fontWeight: 'bold', color: '#fff' },

    fixedFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingVertical: 15, backgroundColor: 'rgba(255,255,255,0.9)', borderTopWidth: 1, borderTopColor: '#eaeaea', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 15 },
    saveBtnFixed: { backgroundColor: '#10b981', paddingVertical: 16, paddingHorizontal: 30, borderRadius: 12, width: '100%', maxWidth: 400, alignItems: 'center', shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6 },
    saveBtnFixedDisabled: { backgroundColor: '#1f2937', shadowColor: '#000', shadowOpacity: 0.1 },
    saveBtnTextFixed: { color: '#fff', fontSize: 16, fontWeight: '900' },
    saveBtnTextDisabled: { color: '#9ca3af' },

    timeDropdown: {
        position: 'absolute',
        top: 75,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        maxHeight: 150,
        zIndex: 1000,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 5,
        elevation: 5
    },
    timeDropdownItem: {
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        alignItems: 'center'
    },
    timeDropdownText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333'
    }
});





