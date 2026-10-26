
const fs = require("fs");
let content = fs.readFileSync("c:/Tienda/app/(store)/(client)/_layout.tsx", "utf8");

let searchStr = `    const total = cart.reduce((sum, item) => {
        let unitPrice = item.product.price;
        let effectiveTiers = item.product.bulkPricing ? [...item.product.bulkPricing] : [];
        const singleItemOffers = (offers || []).filter(o => o.active && o.requirements?.length === 1 && o.requirements[0].productId === item.product.id);
        for (let o of singleItemOffers) {
            effectiveTiers.push({ quantity: o.requirements[0].quantity, price: o.bundlePrice });
        }

        if (effectiveTiers.length > 0) {
            const sortedTiers = [...effectiveTiers].sort((a, b) => b.quantity - a.quantity);
            for (let tier of sortedTiers) {
                if (item.quantity >= tier.quantity) {
                    unitPrice = (tier.price / tier.quantity);
                    break;
                }
            }
        }
        return sum + (unitPrice * item.quantity);
    }, 0);`;

let replaceStr = `    let cashTotal = 0;
    const total = cart.reduce((sum, item) => {
        let unitPrice = item.product.price;
        let effectiveTiers = item.product.bulkPricing ? [...item.product.bulkPricing] : [];
        const singleItemOffers = (offers || []).filter(o => o.active && o.requirements?.length === 1 && o.requirements[0].productId === item.product.id);
        for (let o of singleItemOffers) {
            effectiveTiers.push({ quantity: o.requirements[0].quantity, price: o.bundlePrice });
        }

        if (effectiveTiers.length > 0) {
            const sortedTiers = [...effectiveTiers].sort((a, b) => b.quantity - a.quantity);
            for (let tier of sortedTiers) {
                if (item.quantity >= tier.quantity) {
                    unitPrice = (tier.price / tier.quantity);
                    break;
                }
            }
        }
        
        let cashUnitPrice = unitPrice;
        if (item.product.isDailyOffer && item.product.dailyOfferMinQty && item.product.dailyOfferPrice) {
            if (item.quantity >= item.product.dailyOfferMinQty) {
                cashUnitPrice = item.product.dailyOfferPrice / item.product.dailyOfferMinQty;
            }
        }
        cashTotal += cashUnitPrice * item.quantity;

        return sum + (unitPrice * item.quantity);
    }, 0);`;

content = content.replace(searchStr, replaceStr);
content = content.replace(searchStr.replace(/\r\n/g, "\n"), replaceStr);
content = content.replace(searchStr.replace(/\n/g, "\r\n"), replaceStr);

let searchStr2 = `                            <View style={styles.cartInfo}>
                                <FontAwesome name="shopping-basket" size={20} color="#fff" style={{ marginRight: 10 }} />
                                <Text style={styles.cartText}>
                                    {itemsCount} {itemsCount === 1 ? 'ítem' : 'ítems'} añadidos
                                </Text>
                            </View>
                            <Text style={styles.cartTotal}>Ver \${total.toFixed(2)}</Text>`;

let replaceStr2 = `                            <View style={styles.cartInfo}>
                                <FontAwesome name="shopping-basket" size={20} color="#fff" style={{ marginRight: 10 }} />
                                <Text style={styles.cartText}>
                                    {itemsCount} {itemsCount === 1 ? 'ítem' : 'ítems'} añadidos
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.cartTotal}>Ver \${total.toFixed(2)}</Text>
                                {cashTotal < total && (
                                    <Text style={{ color: '#4ade80', fontSize: 13, fontWeight: 'bold' }}>Efectivo: \${cashTotal.toFixed(2)}</Text>
                                )}
                            </View>`;

content = content.replace(searchStr2, replaceStr2);
content = content.replace(searchStr2.replace(/\r\n/g, "\n"), replaceStr2);
content = content.replace(searchStr2.replace(/\n/g, "\r\n"), replaceStr2);

fs.writeFileSync("c:/Tienda/app/(store)/(client)/_layout.tsx", content, "utf8");

