import * as XLSX from 'xlsx';
import { Product } from '../types';

export interface ParsedExcelItem {
    rawName: string;
    category: string;
    price: number;
    isDailyOffer?: boolean;
    dailyOfferPrice?: number;
    dailyOfferMinQty?: number;
    unitType?: 'kg' | 'unit';
    matchedProductId?: string;
    action?: 'update' | 'create';
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
    return name
        .replace(/\b(\d+(\.\d+)?)\s*(kg|kilos|kilo|gr|gramos|u|unidades|unidad|piezas|pieza)\b/gi, '')
        .replace(/\bx\s*(\d+(\.\d+)?)\s*(kg|kilos|kilo|gr|gramos|u|unidades|unidad)?\b/gi, '')
        .replace(/\b(1|2|3|4|5|10)\s*k\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Limpia y formatea el nombre visible de un producto (Capitalizado y sin pesos pegados)
 */
export const cleanDisplayProductName = (name: string): string => {
    const stripped = stripQuantitiesFromName(name);
    if (!stripped) return name.trim();
    // Capitalizar primera letra de cada palabra clave
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

/**
 * Main parser for Rocio Carniceria Excel files
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

    // Helper to process a 2-column block (Name Col, Price Col)
    const processColumnPair = (
        nameColIdx: number, 
        priceColIdx: number, 
        defaultCategory: string,
        maxRow = rows.length,
        startRow = 1
    ) => {
        for (let r = startRow; r < Math.min(rows.length, maxRow); r++) {
            const row = rows[r];
            if (!row) continue;
            
            const rawNameVal = row[nameColIdx];
            const priceVal = row[priceColIdx];
            
            if (!rawNameVal) continue;
            const rawName = rawNameVal.toString().trim();
            if (!rawName || rawName.length < 2) continue;

            // Ignorar encabezados dentro del bloque
            const norm = normalizeName(rawName);
            if (norm === 'el kg' || norm === 'por pieza' || norm.includes('oferta exclusiva')) continue;

            const price = parseExcelPrice(priceVal);
            if (price <= 0) continue;

            // Extraer posible cantidad si dice "2 kg", "x 3", etc.
            let minQty = 1;
            const qtyMatch = rawName.match(/(\d+)\s*(kg|kilos|u|unidades|x\d+)/i);
            if (qtyMatch) {
                minQty = parseInt(qtyMatch[1], 10) || 1;
            }

            parsedItems.push({
                rawName,
                category: defaultCategory,
                price,
                dailyOfferMinQty: minQty
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

            let minQty = 1;
            const qtyMatch = rawName.match(/(\d+)\s*(kg|kilos|u|unidades|x\d+)/i);
            if (qtyMatch) {
                minQty = parseInt(qtyMatch[1], 10) || 1;
            }

            parsedItems.push({
                rawName,
                category: 'General',
                price,
                isDailyOffer: true,
                dailyOfferPrice: price,
                dailyOfferMinQty: minQty
            });
        }
    }

    // 2. POLLO / VACUNO / EMBUTIDOS (Otras Columnas)
    // Col C (2) & F (5): Vacuno Principal (Bola de lomo, Cuadrada, Nalga, Peceto...)
    processColumnPair(2, 5, 'Vacuno');

    // Col G (6) & I (8): Embutidos (Chorizo mezcla, puro cerdo, morcilla...)
    processColumnPair(6, 8, 'Embutidos');

    // Col J (9) & L (11): Cerdo (Milanesas / Cortes especiales)
    processColumnPair(9, 11, 'Cerdo (Milanesas)');

    // Col M (12) & P (15): Cerdo (Cortes Normales)
    processColumnPair(12, 15, 'Cerdo');

    // Col Q (16) & S (18) o T (19): Achuras & Pollo
    processColumnPair(16, 18, 'Achuras');

    // REGLA: VACUNO MAYORISTA (Col AH=33 & AI=34). Ignorar AF-AG (31-32)
    processColumnPair(33, 34, 'Vacuno Mayorista');

    // NOTA: CONGELADOS BAJALA (Cols V-W / 21-22) y columnas AJ a AS (35-44) son ignoradas por las reglas del negocio.

    return parsedItems;
};

/**
 * PARSER UNIVERSAL HORIZONTAL:
 * Estructura de bloques de 3 columnas + 1 vacía de separación:
 * [Producto | Cantidad | Precio] | [separador] | [Producto | Cantidad | Precio]
 * La Fila 0 (o encabezado) define la Categoría para cada bloque.
 * Detecta duplicados para generar reglas de descuento por cantidad.
 */
export const parseUniversalHorizontalExcel = (rows: any[][]): ParsedExcelItem[] => {
    if (!rows || rows.length < 2) return [];

    const parsedItems: ParsedExcelItem[] = [];
    const maxCols = Math.max(...rows.map(r => (r ? r.length : 0)));

    // Identificar bloques (cada bloque suele ocupar 3 columnas de datos)
    for (let c = 0; c < maxCols; c++) {
        const headerCat = (rows[0]?.[c] || '').toString().trim();
        // Si hay un título en la Fila 0 (ej. 'Vacuno', 'Solo Efectivo', 'Pollo')
        if (headerCat) {
            const prodCol = c;
            const qtyCol = c + 1;
            const priceCol = c + 2;

            const isCashOfferBlock = normalizeName(headerCat).includes('efectivo') || normalizeName(headerCat).includes('oferta');
            const categoryName = isCashOfferBlock ? 'Ofertas del Día' : headerCat;

            for (let r = 1; r < rows.length; r++) {
                const row = rows[r];
                if (!row) continue;

                const rawProdName = (row[prodCol] || '').toString().trim();
                const rawQty = row[qtyCol];
                const rawPrice = row[priceCol];

                if (!rawProdName || rawProdName.length < 2) continue;

                const price = parseExcelPrice(rawPrice);
                if (price <= 0) continue;

                // Extraer cantidad (puede venir como '1 kg', '2', '2 kg', '1 u')
                let qtyNum = 1;
                let unitType: 'kg' | 'unit' = 'kg';

                if (rawQty) {
                    const strQty = rawQty.toString().toLowerCase();
                    const matchNum = strQty.match(/(\d+(\.\d+)?)/);
                    if (matchNum) qtyNum = parseFloat(matchNum[1]);
                    if (strQty.includes('u') || strQty.includes('unidad') || strQty.includes('pieza')) {
                        unitType = 'unit';
                    }
                }

                // Limpieza a prueba de tontos: si el usuario puso "Asado 1kg", lo limpia a "Asado"
                const cleanName = cleanDisplayProductName(rawProdName);

                parsedItems.push({
                    rawName: cleanName,
                    category: categoryName,
                    price: price,
                    unitType: unitType,
                    dailyOfferMinQty: qtyNum,
                    isDailyOffer: isCashOfferBlock,
                    dailyOfferPrice: isCashOfferBlock ? price : undefined
                });
            }

            // Saltamos las columnas de este bloque (prod, qty, price) para buscar el siguiente
            c += 2;
        }
    }

    return parsedItems;
};

/**
 * Generador de Plantilla Universal Horizontal en formato Excel (.xlsx)
 */
export const generateUniversalTemplateAoa = () => {
    return [
        ['Solo Efectivo', 'Cantidad', 'Precio', '', 'Vacuno', 'Cantidad', 'Precio', '', 'Pollo', 'Cantidad', 'Precio', '', 'Cerdo', 'Cantidad', 'Precio'],
        ['Asado', '1 kg', 8500, '', 'Vacío', '1 kg', 9200, '', 'Suprema', '1 kg', 6000, '', 'Costillita de Cerdo', '1 kg', 7500],
        ['Asado (Promo 2kg)', '2 kg', 8000, '', 'Costilla', '1 kg', 7800, '', 'Pata y Muslo', '3 kg', 5200, '', 'Bondiola', '1 kg', 8900],
        ['Milanesa de Carne', '1 kg', 7900, '', 'Nalga', '1 kg', 8900, '', 'Alitas', '1 kg', 3200, '', 'Matambre de Cerdo', '1 kg', 9800],
        ['Milanesa de Carne', '2 kg', 7400, '', 'Bola de Lomo', '1 kg', 8500, '', '', '', '', '', 'Chorizo Puro Cerdo', '1 kg', 6500]
    ];
};
