
const fs = require("fs");
let content = fs.readFileSync("c:/Tienda/app/(store)/(client)/index.tsx", "utf8");

let startStr = "<View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>";
let endStr = "</View>";

// Instead of string replace, let's do something safer. We can write a specific javascript program that replaces based on tokens or AST, but for now we just match the literal strings.

let searchStr = `                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Text style={[styles.literalListName, !item.baseProduct.available && { color: '#94a3b8' }, { flex: 1 }]}>{item.baseProduct.name}</Text>
                        </View>
                        {availableStock !== null && (
                            <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: 'bold', marginTop: 1 }}>
                                📦 {availableStock} disponibles
                            </Text>
                        )}
                        <View style={{ flexDirection: 'column', gap: 2, marginTop: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                {promoView && !hidePrices ? (
                                    <>
                                        <Text style={[styles.literalListPrice, { textDecorationLine: 'line-through', color: '#999', fontSize: 13 }]}>{settings?.currency || '$'}{basePrice}/{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}</Text>
                                        <Text style={[styles.literalListPrice, { color: businessProfile.primaryColor, fontWeight: 'bold' }]}>{settings?.currency || '$'}{promoView}/{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}</Text>
                                    </>
                                ) : (
                                    <View>
                                        <Text style={styles.literalListPrice}>{hidePrices ? (restrictionData.reopensAt ? \`Volvé a mirar nuestros precios a las \${restrictionData.reopensAt} hs\` : '') : \`\${settings?.currency || '$'}\${basePrice} / \${item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}\`}{item.baseProduct.advancePrice !== undefined && item.baseProduct.advancePrice > 0 ? ' (Hoy)' : ''}</Text>
                                        {item.baseProduct.advancePrice !== undefined && item.baseProduct.advancePrice > 0 && !hidePrices && (
                                            <Text style={{ fontSize: 11, color: '#10b981', fontWeight: 'bold', marginTop: 1 }}>
                                                {settings?.currency || '$'}{item.baseProduct.advancePrice} / {item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'} (Anticipado)
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </View>
                            {bulkTiers.map((bp, i) => (
                                !hidePrices && (
                                    <Text key={i} style={[styles.literalListPrice, { color: '#cf2e2e', fontSize: 12, fontStyle: 'italic' }]}>
                                        (Llevando {bp.quantity}{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'} a \${(bp.price / bp.quantity).toFixed(0)} cada {item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'})
                                    </Text>
                                )
                            ))}
                            {item.baseProduct.isDailyOffer && !hidePrices && (
                                <Text style={[styles.literalListPrice, { color: '#d97706', fontSize: 12, fontStyle: 'italic', fontWeight: 'bold' }]}>
                                    💵 Efectivo (mín. \${item.baseProduct.dailyOfferMinQty || 1}\${item.baseProduct.unitType === "unit" ? "u" : "kg"}): \${item.baseProduct.dailyOfferPrice} | 💳 Otros: \${basePrice * (item.baseProduct.dailyOfferMinQty || 1)}
                                </Text>
                            )}
                        </View>`;

let replaceStr = `                        <View style={{ flexDirection: 'column', gap: 2 }}>
                            <Text style={[styles.literalListName, !item.baseProduct.available && { color: '#94a3b8' }]}>
                                {item.baseProduct.name}
                                {!hidePrices && \` 1 \${item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'} \${settings?.currency || '$'}\${promoView || basePrice}\`}
                            </Text>
                            {promoView && !hidePrices && (
                                <Text style={{ textDecorationLine: 'line-through', color: '#999', fontSize: 12 }}>
                                    Regular: {settings?.currency || '$'}{basePrice}
                                </Text>
                            )}
                        </View>
                        {availableStock !== null && (
                            <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: 'bold', marginTop: 1 }}>
                                📦 {availableStock} disponibles
                            </Text>
                        )}
                        <View style={{ flexDirection: 'column', gap: 4, marginTop: 4 }}>
                            {item.baseProduct.isDailyOffer && !hidePrices && (
                                <View style={{ backgroundColor: '#fef3c7', padding: 6, borderRadius: 6, borderWidth: 1, borderColor: '#f59e0b' }}>
                                    <Text style={{ color: '#d97706', fontSize: 12, fontWeight: 'bold' }}>
                                        💵 OFERTA EN EFECTIVO (Mínimo {item.baseProduct.dailyOfferMinQty || 1}{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'})
                                    </Text>
                                    <Text style={{ color: '#d97706', fontSize: 12, fontWeight: 'bold' }}>
                                        Precio Efectivo: {settings?.currency || '$'}{item.baseProduct.dailyOfferPrice}
                                    </Text>
                                    <Text style={{ color: '#d97706', fontSize: 11, marginTop: 2 }}>
                                        (💳 Otros medios: {settings?.currency || '$'}{basePrice * (item.baseProduct.dailyOfferMinQty || 1)})
                                    </Text>
                                </View>
                            )}
                            {bulkTiers.map((bp, i) => (
                                !hidePrices && (
                                    <View key={i} style={{ backgroundColor: '#f3f4f6', padding: 4, borderRadius: 4 }}>
                                        <Text style={{ color: '#1f2937', fontSize: 12, fontWeight: 'bold' }}>
                                            Llevando {bp.quantity}{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}
                                        </Text>
                                        <Text style={{ color: '#4b5563', fontSize: 11 }}>
                                            Efectivo / Otros: {settings?.currency || '$'}{(bp.price / bp.quantity).toFixed(0)} el {item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}
                                        </Text>
                                    </View>
                                )
                            ))}
                        </View>`;

let replaced = false;
if (content.includes(searchStr)) {
    content = content.replace(searchStr, replaceStr);
    replaced = true;
} else if (content.includes(searchStr.replace(/\r\n/g, "\n"))) {
    content = content.replace(searchStr.replace(/\r\n/g, "\n"), replaceStr);
    replaced = true;
} else if (content.includes(searchStr.replace(/\n/g, "\r\n"))) {
    content = content.replace(searchStr.replace(/\n/g, "\r\n"), replaceStr);
    replaced = true;
}

if (!replaced) {
    console.log("Could not replace list view");
}

fs.writeFileSync("c:/Tienda/app/(store)/(client)/index.tsx", content, "utf8");

