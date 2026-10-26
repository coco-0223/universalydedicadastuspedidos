
const fs = require("fs");
let content = fs.readFileSync("c:/Tienda/app/(store)/(client)/cart.tsx", "utf8");

// 1. Replace the individual item subtotal
let itemSubtotalSearch = `<Text style={{ fontSize: 13, color: '#374151', fontWeight: 'bold', marginRight: 38 }}>
                Subtotal: \${Math.round(unitPrice * item.quantity).toLocaleString('es-AR')}
            </Text>`;

let itemSubtotalReplace = `<View style={{ alignItems: 'flex-end', marginRight: 38 }}>
                <Text style={{ fontSize: 13, color: '#374151', fontWeight: 'bold' }}>
                    Subtotal: \${Math.round(unitPrice * item.quantity).toLocaleString('es-AR')}
                </Text>
                {(() => {
                    let itemCashPrice = unitPrice;
                    if (item.product.isDailyOffer && item.product.dailyOfferMinQty && item.product.dailyOfferPrice) {
                        if (item.quantity >= item.product.dailyOfferMinQty) {
                            itemCashPrice = item.product.dailyOfferPrice / item.product.dailyOfferMinQty;
                        }
                    }
                    if (itemCashPrice < unitPrice) {
                        return (
                            <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: 'bold' }}>
                                En Efectivo: \${Math.round(itemCashPrice * item.quantity).toLocaleString('es-AR')}
                            </Text>
                        );
                    }
                    return null;
                })()}
            </View>`;

content = content.replace(itemSubtotalSearch, itemSubtotalReplace);
content = content.replace(itemSubtotalSearch.replace(/\r\n/g, "\n"), itemSubtotalReplace);
content = content.replace(itemSubtotalSearch.replace(/\n/g, "\r\n"), itemSubtotalReplace);


// 2. Replace the general subtotal in the cart summary
let generalSubtotalSearch = `<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{ fontSize: 16, color: '#666' }}>Subtotal</Text>
                                <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{settings?.currency || '$'}{subtotal.toFixed(2)}</Text>
                            </View>`;

let generalSubtotalReplace = `<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{ fontSize: 16, color: '#666' }}>Subtotal</Text>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{settings?.currency || '$'}{subtotal.toFixed(2)}</Text>
                                    {cashSubtotal < normalSubtotal && (
                                        <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: 'bold' }}>En Efectivo: {settings?.currency || '$'}{cashSubtotal.toFixed(2)}</Text>
                                    )}
                                </View>
                            </View>`;

content = content.replace(generalSubtotalSearch, generalSubtotalReplace);
content = content.replace(generalSubtotalSearch.replace(/\r\n/g, "\n"), generalSubtotalReplace);
content = content.replace(generalSubtotalSearch.replace(/\n/g, "\r\n"), generalSubtotalReplace);

fs.writeFileSync("c:/Tienda/app/(store)/(client)/cart.tsx", content, "utf8");

