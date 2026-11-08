import * as XLSX from 'xlsx';

export interface ProspectLead {
    id: string; // normalizado o autogenerado (slug o id único)
    businessName: string; // Nombre Negocio (ej: Carnicería Don Juan)
    contactName?: string; // Nombre de la Persona (ej: Juan Pérez)
    name: string; // compatibility accessor (businessName)
    phone: string; // Whatsapp
    planPrice: number; // Tarifa
    priceCode: string; // ej: k9, k12, k15, vp26
    email?: string; // Email
    instagram?: string; // Instagram (ej: @carniceriadonjuan o link)
    website?: string; // Página Web (ej: www.donjuan.com.ar)
    province?: string; // Provincia
    zone?: string; // Zona
    address?: string; // Dirección
    country?: string; // País
    notes?: string;
    assignedTo?: string; // email del colaborador asignado para contactar (ej: diego@gmail.com)
    createdBy?: string; // quien cargó el prospecto
    status: 'pending' | 'contacted' | 'registered' | 'needs_verification' | 'archived';
    isCritical?: boolean; // Advertencia crítica (ej: importado sin teléfono o con datos incompletos)
    criticalReason?: string; // Razón de la advertencia crítica
    verificationReason?: string; // ej: "Posible duplicado con 'Carnicería Don Juan' (mismo negocio)"
    matchedWithId?: string; // id del prospecto existente con el que colisiona para contrastar
    createdAt: string;
    updatedAt: string;
    lastContactedAt?: string;
}

export interface WhatsAppTemplate {
    id: string;
    name: string;
    text: string; // Puede contener [nombre], [negocio], [precio], [link], [dias], [responsable], [zona], [provincia], [instagram]
    isDefault?: boolean;
    createdAt: string;
}

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
    {
        id: 'promo_7dias',
        name: 'Promo 7 días gratis (Estándar)',
        text: '¡Hola [nombre]! 👋 Te armamos una demo personalizada de tu tienda online para [negocio] en TusPedidos para que la pruebes gratis por [dias] días: [link]\n\nSi te sirve para tu negocio, tenés una tarifa promocional fijada de $[precio]/mes.',
        isDefault: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 'directo_catalogo',
        name: 'Invitación a subir catálogo',
        text: 'Hola [nombre]! 🚀 Ya podés entrar a gestionar el catálogo y pedidos de [negocio] sin costo: [link]\n\nCualquier duda con la carga de productos o precios me avisás por acá.',
        createdAt: new Date().toISOString()
    },
    {
        id: 'recordatorio_oferta',
        name: 'Cupo exclusivo / Tarifa especial',
        text: 'Hola [nombre], ¿cómo estás? Te reservamos uno de los cupos bonificados para [negocio] con acceso de prueba acá: [link]\n\nLa suscripción mensual te queda congelada en $[precio]/mes.',
        createdAt: new Date().toISOString()
    }
];

export const priceToOpaqueCode = (price: number): string => {
    if (price === 9000) return 'fn26';
    if (price === 20000) return 'vp26';
    const thousands = Math.round(price / 1000);
    return `k${thousands}`;
};

/**
 * Lista de códigos de área argentinos oficiales (2, 3 o 4 dígitos)
 */
export const ARGENTINA_AREA_CODES = [
    // 2 dígitos
    '11',
    // 3 dígitos (principales ciudades / capitales)
    '220', '221', '223', '230', '237', '249', '260', '261', '263', '264', '266',
    '280', '291', '294', '297', '298', '299', '336', '341', '342', '343', '345',
    '348', '351', '353', '358', '362', '364', '370', '376', '379', '380', '381',
    '383', '385', '387', '388',
    // 4 dígitos (interior)
    '2202', '2221', '2223', '2224', '2225', '2226', '2227', '2241', '2242', '2243',
    '2244', '2245', '2246', '2252', '2254', '2255', '2257', '2261', '2262', '2264',
    '2265', '2266', '2267', '2268', '2271', '2272', '2273', '2274', '2281', '2283',
    '2284', '2285', '2286', '2291', '2292', '2296', '2297', '2314', '2316', '2317',
    '2320', '2323', '2324', '2325', '2326', '2331', '2333', '2334', '2335', '2336',
    '2337', '2338', '2342', '2343', '2344', '2345', '2346', '2352', '2353', '2354',
    '2355', '2356', '2357', '2358', '2364', '2392', '2393', '2394', '2395', '2396',
    '2473', '2474', '2475', '2477', '2478', '2901', '2902', '2920', '2921', '2922',
    '2923', '2924', '2925', '2926', '2927', '2928', '2929', '2931', '2932', '2933',
    '2934', '2935', '2936', '2940', '2942', '2945', '2946', '2948', '2952', '2953',
    '2954', '2962', '2963', '2964', '2966', '2972', '2974', '2982', '2983', '3327',
    '3329', '3382', '3385', '3387', '3388', '3400', '3401', '3402', '3404', '3405',
    '3406', '3407', '3408', '3409', '3442', '3444', '3445', '3446', '3447', '3454',
    '3455', '3456', '3458', '3460', '3462', '3463', '3464', '3465', '3466', '3467',
    '3468', '3469', '3471', '3472', '3476', '3482', '3483', '3487', '3489', '3491',
    '3492', '3493', '3496', '3497', '3498', '3521', '3522', '3524', '3525', '3532',
    '3533', '3537', '3541', '3542', '3543', '3544', '3546', '3547', '3548', '3549',
    '3562', '3563', '3564', '3571', '3572', '3573', '3574', '3575', '3576', '3582',
    '3583', '3584', '3585', '3711', '3715', '3716', '3718', '3721', '3725', '3731',
    '3734', '3735', '3741', '3743', '3751', '3754', '3755', '3756', '3757', '3758',
    '3772', '3773', '3774', '3775', '3777', '3781', '3782', '3786', '3821', '3825',
    '3826', '3827', '3832', '3835', '3837', '3838', '3841', '3843', '3844', '3845',
    '3846', '3854', '3855', '3856', '3857', '3858', '3861', '3862', '3863', '3865',
    '3867', '3868', '3869', '3873', '3876', '3877', '3878', '3885', '3886', '3887',
    '3888'
];

/**
 * Normaliza e identifica inteligentemente números de WhatsApp de Argentina:
 * Formatos de entrada comunes:
 * - 1145678901 (10 dígitos con código de área) -> 5491145678901
 * - 1545678901 (8 dígitos + prefijo 15 sin código de área) -> asume AMBA '11' -> 5491145678901
 * - 45678901 (8 dígitos fijo/móvil local AMBA) -> 5491145678901
 * - 11 15 45678901 -> 5491145678901
 * - 351 15 9876543 (Córdoba con 15 intermedio) -> 5493519876543
 * - +54 9 11 ... o +54 11 ... -> 54911...
 *
 * Rechaza números inválidos o demasiado cortos (ej: 11232345 son solo 8 dígitos comenzando con 112... no es móvil de 10 dígitos)
 */
export const sanitizeWhatsAppPhone = (rawPhone: string): string => {
    let clean = (rawPhone || '').replace(/[^0-9]/g, '');
    if (!clean) return '';

    // Si comienza con 0 inicial de discado nacional (ej: 011..., 0351...), quitarlo
    if (clean.startsWith('0')) {
        clean = clean.substring(1);
    }

    // Quitar prefijo de país si ya lo tenía (+54 o +549)
    if (clean.startsWith('549')) {
        clean = clean.substring(3);
    } else if (clean.startsWith('54')) {
        clean = clean.substring(2);
    }

    // Caso A: El usuario puso el 15 luego del código de área (ej: 11 15 45678901 o 351 15 2345678)
    // Probamos si coincide con algún código de área seguido de 15
    for (const code of ['11', ...ARGENTINA_AREA_CODES.filter(c => c !== '11')]) {
        if (clean.startsWith(code + '15')) {
            const rest = clean.substring(code.length + 2);
            // El resto debe completar 10 dígitos junto con el código
            if (code.length + rest.length === 10) {
                clean = code + rest;
                break;
            }
        }
    }

    // Caso B: El usuario puso solo el 15 inicial (ej: 1545678901 -> 15 + 8 dígitos locales de Buenos Aires)
    if (clean.startsWith('15') && clean.length === 10) {
        // 15 + 8 dígitos -> En Argentina si ponen 15 sin código de área, es 11 (AMBA)
        clean = '11' + clean.substring(2);
    }

    // Caso C: Puso un número local de 8 dígitos de Buenos Aires sin código ni 15 (ej: 45678901 o 65432109)
    if (clean.length === 8 && !clean.startsWith('11')) {
        clean = '11' + clean;
    }

    // Validación de longitud argentina oficial: 10 dígitos (código de área + número de abonado)
    if (clean.length === 10) {
        // Verificar si los primeros 2, 3 o 4 dígitos corresponden a un código de área argentino
        const hasValidAreaCode = ARGENTINA_AREA_CODES.some(code => clean.startsWith(code));
        if (hasValidAreaCode) {
            // Formato oficial de WhatsApp internacional para Argentina: 549 + 10 dígitos (ej: 5491145678901)
            return `549${clean}`;
        }
    }

    // Si ya tiene formato internacional completo de 12 dígitos (549 + 10)
    if (clean.length === 12 && clean.startsWith('9')) {
        const sub = clean.substring(1);
        if (ARGENTINA_AREA_CODES.some(code => sub.startsWith(code))) {
            return `54${clean}`;
        }
    }

    // Si no cumple el formato válido argentino para WhatsApp, devolver vacío para marcar como crítico / inválido
    return '';
};

export const nameToSlug = (name: string): string => {
    return (name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
};

export const cleanBusinessNameForComparison = (name: string): string => {
    return (name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(carniceria|granja|almacen|panaderia|verduleria|polleria|fiambreria|resto|bar|cafeteria|minimarket|supermercado|kiosco)\b/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
};

export const renderWhatsAppMessage = (
    templateText: string,
    params: {
        contactName?: string;
        businessName: string;
        price: number;
        slug: string;
        code: string;
        responsable?: string;
        zone?: string;
        province?: string;
        instagram?: string;
        dias?: number;
        baseUrl?: string;
    }
): string => {
    // URL pública oficial de producción de Vercel del proyecto TusPedidos
    const defaultPublicUrl = 'https://tuspedidos-web.vercel.app';
    let origin = params.baseUrl;

    if (!origin) {
        if (typeof window !== 'undefined') {
            const currentOrigin = window.location.origin;
            // Si estamos probando en localhost o 127.0.0.1, mandamos SIEMPRE el dominio de Vercel
            if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1') || currentOrigin.includes('192.168.')) {
                origin = defaultPublicUrl;
            } else {
                origin = currentOrigin;
            }
        } else {
            origin = defaultPublicUrl;
        }
    } else if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        origin = defaultPublicUrl;
    }

    const link = `${origin}/iniciar-demo?lead=${encodeURIComponent(params.slug)}&b=${encodeURIComponent(params.slug)}&name=${encodeURIComponent(params.businessName)}&c=${encodeURIComponent(params.code)}`;
    
    const salutationName = params.contactName || params.businessName || 'tu negocio';

    return templateText
        .replace(/\[nombre\]/gi, salutationName)
        .replace(/\[negocio\]/gi, params.businessName || 'tu negocio')
        .replace(/\[precio\]/gi, (params.price || 9000).toLocaleString())
        .replace(/\[link\]/gi, link)
        .replace(/\[dias\]/gi, (params.dias || 7).toString())
        .replace(/\[responsable\]/gi, params.responsable || '')
        .replace(/\[zona\]/gi, params.zone || '')
        .replace(/\[provincia\]/gi, params.province || '')
        .replace(/\[instagram\]/gi, params.instagram || '');
};

/**
 * Descarga directamente un archivo .xlsx real de Microsoft Excel
 * con estilos y las 11 columnas exactas:
 * Nombre Negocio | Nombre | Whatsapp | Tarifa | Email | Instagram | Página Web | Provincia | Zona | Dirección | País
 */
export const downloadProspectExcelFile = () => {
    if (typeof window === 'undefined') return;

    const headers = [
        'Nombre Negocio',
        'Nombre',
        'Whatsapp',
        'Tarifa',
        'Email',
        'Instagram',
        'Página Web',
        'Provincia',
        'Zona',
        'Dirección',
        'País'
    ];
    const data = [
        headers,
        ['Carnicería Don Juan', 'Juan Carlos', '1123456789', 9000, 'donjuan@gmail.com', '@donjuan_carnes', 'www.donjuan.com.ar', 'Buenos Aires', 'Ramos Mejía', 'Av. de Mayo 450', 'Argentina'],
        ['Granja La Estancia', 'Pedro', '3519876543', 12000, '', '@granja_laestancia', '', 'Córdoba', 'Centro', 'San Martín 120', 'Argentina'],
        ['Panadería El Trébol', 'Esteban', '1165432109', 9000, 'eltrebol@hotmail.com', '@panaderiaeltrebol', 'www.eltrebol.com.ar', 'Buenos Aires', 'Morón', 'Belgrano 880', 'Argentina']
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Ajustar anchos de columnas para que abra prolijo
    worksheet['!cols'] = [
        { wch: 24 }, // Nombre Negocio
        { wch: 18 }, // Nombre
        { wch: 16 }, // Whatsapp
        { wch: 12 }, // Tarifa
        { wch: 22 }, // Email
        { wch: 20 }, // Instagram
        { wch: 22 }, // Página Web
        { wch: 16 }, // Provincia
        { wch: 16 }, // Zona
        { wch: 24 }, // Dirección
        { wch: 14 }  // País
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prospectos');

    XLSX.writeFile(workbook, 'plantilla_prospectos_tuspedidos.xlsx');
};
