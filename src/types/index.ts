export type Role = 'client' | 'business' | null;

export interface TesterActivity {
    id: string;
    name: string;
    phone?: string;
    platform?: 'app' | 'web';
    lastActiveDate: string; // YYYY-MM-DD
    interactionsToday: number;
    consecutiveDays: number;
    completedDates: string[]; // history of completions
    updatedAt: string;
}

export interface User {
    id: string;
    name: string;
    surname: string;
    address: string;
    doorbell?: string;
    deliveryInstructions?: string;
    neighborhood?: string;
    phone?: string;
    role: Role;
    email?: string;
    favorites?: string[];
    hasOrderedBefore?: boolean;
    scanPoints?: number; // Para sistema de puntos por QR presencial
    rafflePoints?: number; // Puntos para sorteos
    totalSpent?: number; // Gasto total acumulado
    usedCoupons?: Record<string, number>; // Seguimiento de usos de cupones { code: usos }
    deletedNotifications?: string[]; // IDs de notificaciones eliminadas por el usuario
}

export interface AppNotification {
    id: string;
    businessId: string;
    userId: string | 'all'; // 'all' for broadcast
    title: string;
    message: string;
    type: 'order_update' | 'offer' | 'price_update' | 'custom' | 'coupon';
    read: boolean;
    createdAt: string;
    actionUrl?: string; // Deep link equivalent for inside the app
}

export interface BusinessProfile {
    onboardingCompleted?: boolean;
    id: string; // The tenant ID
    name: string;
    description?: string;
    logoUrl?: string;
    bannerUrl?: string; // Nuevo
    primaryColor: string;
    secondaryColor?: string; // Nuevo
    accentColor?: string; // Nuevo
    fontFamily?: string; // Nuevo
    isActive?: boolean; // Toggle for superadmin to disable business
    status?: 'active' | 'trial';
    trialExpiresAt?: string; // ISO string
}

export interface BusinessData {
    profile: BusinessProfile;
    settings: BusinessSettings;
    products: Product[];
    offers: Offer[];
    orders: Order[];
}

export interface Product {
    id: string;
    businessId?: string; // Phase 1: Support for multiple businesses
    name: string;
    description: string;
    ingredients?: string;
    price: number;
    imageUrl: string;
    categoryId?: string; // or just category: string
    category: string;
    available: boolean;
    unitType?: 'kg' | 'unit' | 'piece';
    groupId?: string;
    minQuantityForGroupPrice?: number;
    availableForSuggestions?: boolean;
    featured?: boolean;
    promotionalPrice?: number;
    isOfferActive?: boolean;
    isOfferCard?: boolean;
    bulkPricing?: { quantity: number; price: number }[];
    parentId?: string;
    volumeLevelQuantity?: number;
    excelMappingName?: string;
    specialOffer?: SpecialOfferConfig;
    sortOrder?: number;
    autoRestock?: boolean;
    restockDate?: string;
    restockTime?: string;
    stock?: number;
    advancePrice?: number;
    isDailyOffer?: boolean;
    dailyOfferMinQty?: number;
    dailyOfferPrice?: number;
    approxWeight?: number; // Peso aproximado por pieza (en kg) cuando unitType es 'unit'
}

export interface SpecialOfferConfig {
    active: boolean;
    
    // Pricing
    price: number;
    bulkPricing?: { quantity: number; price: number }[]; // Precios por volumen en promoción
    
    // Stock constraint
    limitByStock: boolean;
    initialStock?: number;
    stockRemaining?: number;
    stockVisibility: 'hidden' | 'vague' | 'exact'; // 'hidden' = no mostrar, 'vague' = queda poco/mucho, 'exact' = mostrar KGs
    
    // Time constraint
    limitByTime: boolean;
    timeWindows: { startTime: string; endTime: string }[]; // Formato ISO Date
    
    // Visibility/Highlight
    highlightMode: 'none' | 'banner' | 'destacado';
}

export interface OfferRequirement {
    productId: string;
    quantity: number;
}

export interface Offer {
    id: string;
    businessId?: string; // Phase 1
    name: string;
    description: string;
    requirements: OfferRequirement[];
    bundlePrice: number;
    active: boolean;
    categories?: string[];
    specialConfig?: any;
    isSpecialBanner?: boolean;
    isSpecialBannerCard?: boolean;
}

export interface OrderItem {
    product: Product;
    quantity: number; // Client requested quantity
    actualQuantity?: number; // For post-sale editing by butcher
    actualPrice?: number; // For post-sale editing of price per kg
    unitPrice?: number; // Unit price for other payment methods
    cashUnitPrice?: number; // Unit price in cash if cash discount applies
    hasCashDiscount?: boolean;
}

export type OrderStatus = string; // Simplified from union to allow custom statuses
// Standard statuses for logic reference: 'pending', 'confirmed', 'ready', 'delivered', 'cancelled'
export type DeliveryMethod = 'pickup' | 'delivery';

export interface ChatbotOrder {
    id: string; // N#Pedido or fallback
    clientName: string; // Nombre y Apellido
    clientPhone: string; // Telefono
    createdAt: string; // Dia de creación
    scheduledDate: string; // Dia (en que quiere recibir o retirar)
    timeSlot: string; // Horario de Franja
    branch: string; // Sucursal a Retirar
    orderText: string; // Pedido
    notes: string; // Observaciones
    address: string; // Dirección
    paymentMethod: string; // Medio de Pago
    isPrinted: boolean; // Impresión
}

export interface Order {
    id: string;
    businessId?: string; // Phase 1
    clientId: string;
    clientName?: string; // Adding full name, phone and address for unregistered users or to decouple
    clientPhone?: string;
    clientAddress?: string;
    branchId?: string; // Which branch to pickup from
    items: OrderItem[];
    subtotal?: number;
    cashSubtotal?: number;
    discountApplied?: number;
    deliveryCost?: number;
    totalPrice: number;
    cashTotalPrice?: number;
    isCustomTotal?: boolean;
    status: OrderStatus;
    deliveryMethod: DeliveryMethod;
    paymentMethod?: string; // Added payment method
    scheduledTime: string; // ISO string
    createdAt: string; // ISO string
    notes?: string;
    lastModifiedBy?: 'client' | 'business';
    clientModified?: boolean;
    modificationHistory?: {
        timestamp: string;
        modifiedBy: 'client' | 'business';
        description: string;
    }[];
    deleted?: boolean;
    deletedAt?: string | null;
    archived?: boolean;
    archivedAt?: string | null;
}

export interface Branch {
    id: string;
    name: string;
    address: string;
    phone: string;
    // 0 = Sunday, 1 = Monday. Empty array means closed that day.
    schedule: Record<number, { openTime: string, closeTime: string }[]>;
}

export interface Milestone {
    id: string;
    amountThreshold: number;
    discountPercentage?: number;
    fixedDiscountAmount?: number;
    maxDiscountAmount?: number;
}

export interface MilestoneGroup {
    id: string;
    name: string;
    timeLimitDays?: number; // Optional limit (e.g. 30 days since first purchase)
    milestones: Milestone[];
}

export interface Coupon {
    code: string;
    description?: string;
    discountPercentage?: number;
    maxDiscountAmount?: number;
    hasMaxDiscount?: boolean;
    fixedDiscountAmount?: number;
    minOrderAmount?: number;
    active: boolean; // Si es false, NADIE lo puede usar
    public?: boolean; // Si es false, NO APARECE en la app (pero quienes lo saben sí lo pueden escribir y usar)
    isWelcome?: boolean; // Only appliable if it's the client's FIRST order
    maxUsesPerClient?: number; // Cantidad de veces que puede utilizarlo el cliente (opcional)
    expirationDate?: string; // Fecha y hora de caducidad (ISO string)
    showTimer?: boolean; // Si debe mostrarse como un temporizador de cuenta regresiva
    requiresManualCode?: boolean; // Si es true, debe ingresarse manualmente
}

export interface RafflePrize {
    id: string;
    type: 'fixed_discount' | 'item' | 'percent_discount' | 'cash' | 'text';
    value?: number; // For discounts
    productId?: string; // For item prizes
    productName?: string; // Cache for display
    quantity?: number;
    description: string;
    position: number; // 1 for first place, 2 for second, etc.
}

export interface RaffleWinner {
    userId: string;
    userName: string;
    prizeId: string;
    ticketNumber: string;
    wonAt: string;
    redeemed: boolean;
}

export interface Raffle {
    id: string;
    title: string;
    description: string;
    drawStartDate: string; // ISO string
    drawEndDate: string; // ISO string
    redemptionDeadlineDays?: number; // Days to claim prize
    conditions: string;
    active: boolean;
    minOrderAmount?: number;
    maxWinners: number;
    prizes: RafflePrize[];
    winners?: RaffleWinner[];
    participantsCount?: number;
    showWelcomePopup?: boolean; // Muestra un popup al entrar a la app
    pointRules?: {
        amountForOnePoint?: number;
        pointsPerOrder?: number;
        pointsForPickup?: number;
        pointsForDelivery?: number;
        eligibleDays?: number[]; // [0,1,2,3,4,5,6] (0 = Domingo, etc)
    };
}

export interface ClaimOfferSettings {
    active: boolean;
    title: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    durationMinutes: number;
    triggerDelaySeconds: number;
}

export interface BusinessSettings {
    branches: Branch[];

    // Disponibilidad
    allowDelivery: boolean;
    allowPickup: boolean;
    leadTimeHours: number;
    maxDaysInAdvance: number;
    slotIntervalMinutes: number;
    deliveryRules: {
        standardCost: number;
        freeDeliveryThreshold: number;
        deliveryDays: number[]; // [1,2,3,4,5] = Lunes a Viernes
    };

    // Métodos de Pago
    paymentMethods?: string[];

    rawExcelGrid?: any[][]; // Excel importado original (solo superadmin)

    // Bloqueo de Compras por Horarios
    purchaseRestrictions?: {
        active: boolean; // Prende la funcionalidad de restricciones
        showPricesWhenRestricted: boolean; // Permitir que vean precios aunque no puedan comprar
        schedule: Record<number, { startTime: string; endTime: string }[]>; // Días y franjas prohibidas
    };

    // Marketing Toggles
    marketingModules: {
        milestonesActive: boolean;
        aiUpsellActive: boolean;
        couponsActive: boolean;
        rafflesActive?: boolean;
        volumeUpsellActive?: boolean;
        claimOffer?: ClaimOfferSettings;
    };

    deliveryScheduling?: {
        active: boolean;
    };
    pickupScheduling?: {
        active: boolean;
        disabledBranches?: string[]; // IDs of branches where scheduling is disabled
    };

    // Sistema de Puntos (Loyalty)
    loyaltyPoints?: {
        active: boolean;
        spendAmount?: number; // e.g. 10000
        cashbackAmount?: number; // e.g. 350
        spentForOnePoint: number; // For backwards compatibility
        valuePerPoint: number; // For backwards compatibility
    };

    // Re-engagement (Push Notifications)
    pushReengagement?: {
        active: boolean;
        daysInactive: number;
        discountPercentage: number;
    };

    // FOMO Flash Offer
    flashOffer?: {
        active: boolean;
        discountPercentage: number;
        durationMinutes: number;
        title: string;
        message: string;
    };

    // Guest Checkout Rules
    guestCheckout: {
        allowGuest: boolean;
        requireEmail: boolean;
        requirePhone: boolean;
        allowPurchases: boolean;
        allowCoupons: boolean;
        allowMilestones: boolean;
    };

    // Modificadores de Compra y Cantidad
    checkoutRules?: {
        minWeightPerItem?: number;
        weightStep?: number;
        minOrderValueDelivery?: number;
        minOrderValuePickup?: number;
    };

    orderStatuses?: {
        id: string;
        label: string;
        color: string;
        isSuccess?: boolean;
        isCancelled?: boolean;
        isReady?: boolean;
    }[];

    categories: string[];
    categoryColors?: Record<string, string>;
    categorySortOrder?: Record<string, number>;

    displaySettings: {
        offersView: 'cards' | 'list'; // 'cards' recommended
        productsView: 'cards' | 'list'; // 'list' recommended
        showOfferDiscountPercentage: boolean;
        showOffersOnTop?: boolean;
        showOrderStatusToClients?: boolean;
    };

    milestoneGroups: MilestoneGroup[];
    coupons: Coupon[];
    raffles?: Raffle[];
    nativeAppUrl?: string; // Para apps dedicadas en Play Store (Ej: Rocío Carnicerías)
    currency?: string; // Moneda a utilizar ($ o €)
    isFoodBusiness?: boolean;
    mixAndMatchRules?: MixAndMatchRule[];
    crossSellRules?: CrossSellRule[];
}

export interface MixAndMatchRule {
    id: string;
    name: string;
    type: 'category' | 'products';
    categoryId?: string; // name of the category (e.g. "Empanadas")
    productIds?: string[];
    minQuantity: number;
    discountPricePerUnit: number;
}

export interface CrossSellRule {
    id: string;
    triggerType: 'category' | 'product';
    triggerCategoryId?: string; // category name trigger
    triggerProductId?: string;
    triggerQuantity: number;
    rewardProductId: string;
    rewardPrice: number;
    message: string;
}




