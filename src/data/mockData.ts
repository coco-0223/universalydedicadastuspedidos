import { BusinessData, BusinessSettings, Offer, Product } from '../types';
import Constants from 'expo-constants';
const isDedicatedBuild = Constants.expoConfig?.extra?.appVariant === 'rocio';

export const IS_DEDICATED_APP = isDedicatedBuild; 
export const DEDICATED_OWNER_EMAILS = ['juanpablob.bustos@gmail.com', 'cbagenciamarketing@gmail.com', 'cocobustos.93@gmail.com']; 
export const CURRENT_BUSINESS_ID = 'VfxrjO1hPyeq71vQrLc3JUAgxq93'; 

/**
 * CONFIGURACIÓN POR DEFECTO (FALLBACK)
 * Estos datos se usan si no hay conexión a Firebase o mientras se carga el comercio.
 */
export const defaultSettings: BusinessSettings = {
    branches: [
        {
            id: 'b1',
            name: 'Cargando sucursal...',
            address: '',
            phone: '',
            schedule: {
                1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: []
            }
        }
    ],
    allowDelivery: true,
    allowPickup: true,
    leadTimeHours: 1,
    maxDaysInAdvance: 7,
    slotIntervalMinutes: 30,
    deliveryRules: {
        standardCost: 0,
        freeDeliveryThreshold: 0,
        deliveryDays: [1, 2, 3, 4, 5, 6]
    },
    marketingModules: {
        milestonesActive: false,
        aiUpsellActive: false,
        couponsActive: false,
        rafflesActive: false,
        claimOffer: {
            active: false,
            title: '�No te vayas sin tu descuento!',
            discountType: 'percentage',
            discountValue: 10,
            durationMinutes: 15,
            triggerDelaySeconds: 2
        }
    },
    guestCheckout: {
        allowGuest: true,
        requireEmail: false,
        requirePhone: true,
        allowPurchases: true,
        allowCoupons: false,
        allowMilestones: false
    },
    categories: ['Varios'],
    categoryColors: { 'Varios': '#007AFF' },
    milestoneGroups: [],
    coupons: [],
    orderStatuses: [
        { id: 'pending', label: 'RECIBIDO', color: '#64748b' },
        { id: 'confirmed', label: 'Confirmado', color: '#f59e0b' },
        { id: 'ready', label: 'Listo', color: '#3b82f6' },
        { id: 'delivered', label: 'Entregado', color: '#10b981', isSuccess: true },
        { id: 'cancelled', label: 'Cancelado', color: '#ef4444', isCancelled: true }
    ],
    displaySettings: {
        offersView: 'cards',
        productsView: 'list',
        showOfferDiscountPercentage: true,
        showOrderStatusToClients: true
    },
    currency: '$'
};

/**
 * DICCIONARIO DE COMERCIOS PARA APP UNIVERSAL (MeatMarket) FALLBACK
 */
export const businesses: Record<string, BusinessData> = {
    default: {
        profile: {
            id: 'default',
            name: 'Cargando...',
            description: 'Buscando el mejor asado para vos.',
            primaryColor: '#18181b'
        },
        settings: defaultSettings,
        products: [],
        offers: [],
        orders: []
    }
};

export const mockProducts: Product[] = [];
export const mockOffers: Offer[] = [];
export const mockOrders: any[] = [];

