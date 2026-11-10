import * as XLSX from 'xlsx';
import { Product } from '../types';

export interface ParsedExcelItem {
    rawName: string;
    cleanName?: string;
    category: string;
    price: number;
    isDailyOffer?: boolean;
    dailyOfferPrice?: number;
    dailyOfferMinQty?: number;
    unitType?: 'kg' | 'unit' | 'piece';
    matchedProductId?: string;
    action?: 'update' | 'create';
    explicitUnit?: string;
}

export interface ExcelParseOptions {
    treatColABAsCashOffers?: boolean;
    isRocioVariant?: boolean;
}

/**
 * Clean up text (spaces, lowercase, accents) for fuzzy alias matching
 */
export const normalizeName = (name: string): string => {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
};

/**
 * Capitaliza automáticamente cada palabra excepto artículos y preposiciones.
 * Elimina números seguidos de unidades (kg, g, l, ml, u) en el nombre del producto
 * para mantener el título limpio y sin duplicados por peso.
 */
export const cleanAndCapitalizeName = (name: string): string => {
    if (!name) return '';
    let cleaned = name.replace(/\bx\s*\d+(\.\d+)?\s*(kg|kilos|kilo|g|gr|gramos|l|litros|litro|ml|u|unidades|unidad|piezas|pieza)?\b/gi, '');
    cleaned = cleaned.replace(/\b\d+(\.\d+)?\s*(kg|kilos|kilo|g|gr|gramos|l|litros|litro|ml|u|unidades|unidad|piezas|pieza)\b/gi, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/\s+[xX]$/, '').trim();
    
    const minorWords = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en', 'a', 'con', 'sin', 'por', 'para', 'al']);
    const words = cleaned.toLowerCase().split(' ');
    const capitalized = words.map((w, idx) => {
        if (!w) return '';
        if (idx > 0 && minorWords.has(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
    return capitalized || name.trim();
};

/**
 * Detecta unidad (kg, unit, piece) y cantidad indicada en el texto o columna
 */
export const extractUnitTypeAndQty = (rawName: string, explicitUnit?: string): { unitType: 'kg' | 'unit' | 'piece', qty: number } => {
    let unitType: 'kg' | 'unit' | 'piece' = 'kg';
    let qty = 0;
    const normExp = (explicitUnit || '').toString().toLowerCase().trim();
    
    if (normExp.includes('piez')) unitType = 'piece';
    else if (normExp.includes('u') || normExp.includes('unid') || normExp.includes('l') || normExp.includes('litr')) unitType = 'unit';
    else if (normExp.includes('k') || normExp.includes('kg') || normExp.includes('gram')) unitType = 'kg';
    else {
        if (/\bpiezas?|pieza\b/i.test(rawName)) unitType = 'piece';
        else if (/\bunidades?|unid|u|l|litros?|ml\b/i.test(rawName)) unitType = 'unit';
        else if (/\bkilos?|kg|gramos?|g|gr\b/i.test(rawName)) unitType = 'kg';
    }
    
    const qtyMatch = rawName.match(/(\d+(\.\d+)?)\s*(kg|kilos|kilo|g|gr|gramos|l|litros|litro|ml|u|unidades|unidad|piezas|pieza)/i) || rawName.match(/\bx\s*(\d+(\.\d+)?)/i);
    if (qtyMatch) {
        qty = parseFloat(qtyMatch[1]) || 0;
    }
    return { unitType, qty };
};

/**
 * Parse a price string or number into clean float
 */
export const parseExcelPrice = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = val.toString().replace('$', '').replace(/\./g, '').replace(',', '.').trim();
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
};

/**
 * Known default alias mappings for Rocio Carniceria
 */
export const DEFAULT_ROCIO_ALIASES: Record<string, string> = {
    "bondio": "Bondiola",
    "bondiola": "Bondiola",
    "pata x3": "Pata y Muslo",
    "pata tres": "Pata y Muslo",
    "pata muslo": "Pata y Muslo",
    "pata y muslo": "Pata y Muslo",
    "bola de lomo": "Bola de Lomo",
    "cuadrada": "Cuadrada",
    "nalga": "Nalga",
    "peceto": "Peceto",
    "roast beef": "Roast Beef",
    "suprema": "Suprema",
    "supremas": "Suprema",
    "pollo": "Pollo",
    "alita": "Alitas",
    "alitas": "Alitas",
    "milanesa de pollo": "Milanesas de Pollo",
    "milanesas de pollo": "Milanesas de Pollo",
    "milanesa de cerdo": "Milanesas de Cerdo",
    "milanesas de cerdo": "Milanesas de Cerdo",
    "milanesa de carne": "Milanesas de Carne",
    "milanesas de carne": "Milanesas de Carne",
    "carne picada": "Carne Picada",
    "picada especial": "Picada Especial",
    "picada": "Carne Picada",
    "falda": "Falda",
    "osobuco": "Osobuco",
    "bife": "Bifes Surtidos",
    "bifes": "Bifes Surtidos",
    "bifes surtidos": "Bifes Surtidos"
};

export const stripQuantitiesFromName = (name: string): string => {
    return normalizeName(name)
        .replace(/\b(\d+)\s*(kg|kilos|kilo|u|unidades|unidad|piezas|pieza)\b/gi, '')
        .replace(/\bx\s*\d+\b/gi, '')
        .replace(/\bx\s*(kg|kilos|kilo|u|unidades)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Main parser for Excel files
 */
export const getExcelRows = (fileBuffer: ArrayBuffer): any[][] => {
    const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
};

export const parseRocioExcelData = (fileBuffer: ArrayBuffer, options: ExcelParseOptions = {}): ParsedExcelItem[] => {
    const rows = getExcelRows(fileBuffer);
    return parseRocioExcelRows(rows, options);
};

export const parseRocioExcelRows = (rows: any[][], options: ExcelParseOptions = {}): ParsedExcelItem[] => {
    if (!rows || rows.length === 0) return [];

    const parsedItems: ParsedExcelItem[] = [];

    // Helper to process a column block (Name Col, Price Col, optional Unit Col)
    const processColumnPair = (
        nameColIdx: number, 
        priceColIdx: number, 
        defaultCategory: string,
        unitColIdx?: number,
        maxRow = rows.length,
        startRow = 1
    ) => {
        for (let r = startRow; r < Math.min(rows.length, maxRow); r++) {
            const row = rows[r];
            if (!row) continue;
            
            const rawNameVal = row[nameColIdx];
            const priceVal = row[priceColIdx];
            const explicitUnit = unitColIdx !== undefined && row[unitColIdx] ? row[unitColIdx].toString() : undefined;
            
            if (!rawNameVal) continue;
            const rawName = rawNameVal.toString().trim();
            if (!rawName || rawName.length < 2) continue;

            // Ignorar encabezados dentro del bloque
            const norm = normalizeName(rawName);
            if (
                norm === 'el kg' || 
                norm === 'por pieza' || 
                norm === 'producto' ||
                norm === 'item' ||
                norm === 'nombre' ||
                norm.includes('oferta exclusiva') ||
                norm === 'vacuno' ||
                norm === 'embutidos' ||
                norm === 'cerdo' ||
                norm === 'pollo' ||
                norm === 'achuras'
            ) continue;

            const price = parseExcelPrice(priceVal);
            if (price <= 0) continue;

            const { unitType, qty } = extractUnitTypeAndQty(rawName, explicitUnit);
            const cleanName = cleanAndCapitalizeName(rawName);

            parsedItems.push({
                rawName,
                cleanName,
                category: defaultCategory,
                price,
                dailyOfferMinQty: qty,
                unitType,
                explicitUnit
            });
        }
    };

    // 1. COLUMNA A (0) & B (1): Ofertas en Efectivo / Ofertas del Día
    if (options.treatColABAsCashOffers !== false) {
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row) continue;

            const nameVal = row[0];
            const priceVal = row[1];
            if (!nameVal) continue;

            const rawName = nameVal.toString().trim();
            const norm = normalizeName(rawName);
            if (!rawName || norm.includes('oferta') || norm.includes('miercoles') || norm.includes('el kg')) continue;

            const price = parseExcelPrice(priceVal);
            if (price <= 0) continue;

            const { unitType, qty } = extractUnitTypeAndQty(rawName);
            const cleanName = cleanAndCapitalizeName(rawName);

            parsedItems.push({
                rawName,
                cleanName,
                category: 'Ofertas del Día (Efectivo)',
                price,
                isDailyOffer: true,
                dailyOfferPrice: price,
                dailyOfferMinQty: qty,
                unitType
            });
        }
    }

    // 2. DETECCIÓN AUTOMÁTICA DE PLANTILLA DINÁMICA (Si la fila 0 o 1 tiene nombres de categoría personalizados)
    const headerRow = rows[0] || [];
    const subHeaderRow = rows[1] || [];
    let isDynamicTemplate = false;

    // Buscar si hay bloques de 3 o 4 columnas creados con nuestra plantilla
    for (let c = 3; c < headerRow.length; c += 4) {
        const catName = (headerRow[c] || '').toString().trim();
        if (catName && catName !== '' && (subHeaderRow[c] || '').toString().toLowerCase().includes('producto')) {
            isDynamicTemplate = true;
            processColumnPair(c, c + 1, catName, c + 2, rows.length, 2);
        }
    }

    // 3. SI NO ES PLANTILLA DINÁMICA DE 4 COLS, USAR MAPEO ESTÁNDAR (Rocío o 2-Columnas)
    if (!isDynamicTemplate) {
        // Col E (4) & F (5): Vacuno Principal (Bola de lomo, Cuadrada, Nalga, Peceto...)
        processColumnPair(4, 5, 'Vacuno');

        // Col H (7) & I (8): Embutidos (Chorizo mezcla, puro cerdo, morcilla...)
        processColumnPair(7, 8, 'Embutidos');

        // Col K (10) & L (11): Cerdo (Milanesas / Cortes especiales)
        processColumnPair(10, 11, 'Cerdo (Milanesas)');

        // Col O (14) & P (15): Cerdo (Cortes Normales)
        processColumnPair(14, 15, 'Cerdo');

        // Col R (17) & S (18): Pollo
        processColumnPair(17, 18, 'Pollo');

        // Col U (20) & V (21): Achuras
        processColumnPair(20, 21, 'Achuras');

        // REGLA: VACUNO MAYORISTA (Col AH=33 & AI=34). Ignorar AF-AG (31-32)
        processColumnPair(33, 34, 'Vacuno Mayorista');
    }

    return parsedItems;
};
