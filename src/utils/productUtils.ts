import { Product } from '../types';

export const isSpecialActive = (p: Product) => {
    if (!p.specialOffer?.active) return false;
    if (p.specialOffer.limitByStock && (p.specialOffer.stockRemaining || 0) <= 0) return false;
    if (p.specialOffer.limitByTime && p.specialOffer.timeWindows && p.specialOffer.timeWindows.length > 0) {
        const now = new Date();
        // Check if ANY time window is currently active
        return p.specialOffer.timeWindows.some(tw => {
            const start = new Date(tw.startTime);
            const end = new Date(tw.endTime);
            return now >= start && now <= end;
        });
    }
    return true;
};

export interface ItemPricing {
    quantity: number;
    unitPrice: number;
    cashUnitPrice: number;
    hasCashDiscount: boolean;
    totalPrice: number;
    cashTotalPrice: number;
}

export const getItemPricing = (
    item: {
        product: Product;
        quantity: number;
        actualQuantity?: number;
        actualPrice?: number;
        unitPrice?: number;
        cashUnitPrice?: number;
        hasCashDiscount?: boolean;
    },
    offers: any[] = [],
    isFoodBusiness: boolean = false
): ItemPricing => {
    const qty = item.actualQuantity ?? item.quantity ?? 1;

    // 1. Regular / other payment methods unit price:
    let normalUnitPrice: number;
    if (item.actualPrice !== undefined && item.actualPrice !== null) {
        normalUnitPrice = item.actualPrice;
    } else if (item.unitPrice !== undefined && item.unitPrice !== null) {
        normalUnitPrice = item.unitPrice;
    } else {
        const specialActive = isSpecialActive(item.product);
        normalUnitPrice = specialActive ? (item.product.specialOffer?.price || item.product.price) : item.product.price;

        if (!isFoodBusiness) {
            let effectiveTiers = item.product.bulkPricing ? [...item.product.bulkPricing] : [];
            const singleItemOffers = (offers || []).filter((o: any) => o.active && o.requirements?.length === 1 && o.requirements[0].productId === item.product.id);
            for (let o of singleItemOffers) {
                effectiveTiers.push({ quantity: o.requirements[0].quantity, price: o.bundlePrice });
            }
            if (effectiveTiers.length > 0) {
                const sortedTiers = [...effectiveTiers].sort((a: any, b: any) => b.quantity - a.quantity);
                for (let tier of sortedTiers) {
                    if (qty >= tier.quantity) {
                        normalUnitPrice = tier.price / tier.quantity;
                        break;
                    }
                }
            }
        }
    }

    // 2. Cash unit price:
    let cashUnitPrice = normalUnitPrice;
    if (item.cashUnitPrice !== undefined && item.cashUnitPrice !== null) {
        cashUnitPrice = item.cashUnitPrice;
    } else if (!isFoodBusiness && item.product.isDailyOffer && item.product.dailyOfferPrice) {
        const minQty = item.product.dailyOfferMinQty || 1;
        if (qty >= minQty) {
            cashUnitPrice = item.product.dailyOfferPrice / minQty;
        }
    }

    const hasCashDiscount = cashUnitPrice < (normalUnitPrice - 0.001);
    const totalPrice = normalUnitPrice * qty;
    const cashTotalPrice = (hasCashDiscount ? cashUnitPrice : normalUnitPrice) * qty;

    return {
        quantity: qty,
        unitPrice: normalUnitPrice,
        cashUnitPrice: hasCashDiscount ? cashUnitPrice : normalUnitPrice,
        hasCashDiscount,
        totalPrice,
        cashTotalPrice
    };
};

export interface OrderPricing {
    totalPrice: number;
    cashTotalPrice: number;
    hasCashDiscount: boolean;
}

export const getOrderPricing = (
    order: {
        items?: any[];
        totalPrice: number;
        cashTotalPrice?: number;
        subtotal?: number;
        cashSubtotal?: number;
        isCustomTotal?: boolean;
    },
    offers: any[] = [],
    isFoodBusiness: boolean = false
): OrderPricing => {
    const normalTotal = order.totalPrice || 0;

    // Check if cashTotalPrice is explicitly stored and valid
    if (order.cashTotalPrice !== undefined && order.cashTotalPrice !== null && !isNaN(order.cashTotalPrice)) {
        const hasCashDiscount = order.cashTotalPrice < (normalTotal - 0.001);
        return {
            totalPrice: normalTotal,
            cashTotalPrice: order.cashTotalPrice,
            hasCashDiscount
        };
    }

    // Dynamic fallback calculation from items
    let sumNormal = 0;
    let sumCash = 0;
    let anyItemHasCashDiscount = false;

    (order.items || []).forEach(item => {
        const p = getItemPricing(item, offers, isFoodBusiness);
        sumNormal += p.totalPrice;
        sumCash += p.cashTotalPrice;
        if (p.hasCashDiscount) {
            anyItemHasCashDiscount = true;
        }
    });

    const diff = sumNormal - sumCash;
    if (anyItemHasCashDiscount && diff > 0.01) {
        const cashTotal = Math.max(0, normalTotal - diff);
        return {
            totalPrice: normalTotal,
            cashTotalPrice: cashTotal,
            hasCashDiscount: true
        };
    }

    return {
        totalPrice: normalTotal,
        cashTotalPrice: normalTotal,
        hasCashDiscount: false
    };
};
