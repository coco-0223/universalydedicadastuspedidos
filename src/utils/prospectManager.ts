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

export const sanitizeWhatsAppPhone = (rawPhone: string): string => {
    let clean = (rawPhone || '').replace(/[^0-9]/g, '');
    if (!clean) return '';
    if (clean.startsWith('0')) clean = clean.substring(1);
    if (clean.length === 10) {
        clean = `549${clean}`;
    } else if (clean.startsWith('54') && !clean.startsWith('549') && clean.length === 12) {
        clean = `549${clean.substring(2)}`;
    }
    return clean;
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
    const origin = params.baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://tuspedidos-mu.vercel.app');
    const link = `${origin}/iniciar-demo?b=${encodeURIComponent(params.slug)}&name=${encodeURIComponent(params.businessName)}&c=${encodeURIComponent(params.code)}`;
    
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
