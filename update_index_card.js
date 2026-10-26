
const fs = require("fs");
let content = fs.readFileSync("c:/Tienda/app/(store)/(client)/index.tsx", "utf8");

let searchStr = `<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginBottom: 4 }}>
                        <Text style={[styles.productName, { marginBottom: 0, flex: 1 }]}>{item.baseProduct.name}</Text>
                        <Pressable onPress={() => toggleFavorite(item.baseProduct.id)} style={{ padding: 4 }}>
                            <FontAwesome name={favorites.includes(item.baseProduct.id) ? 'star' : 'star-o'} size={18} color={favorites.includes(item.baseProduct.id) ? '#fbbf24' : '#ccc'} />
                        </Pressable>
                    </View>`;

let replaceStr = `<View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 5, marginBottom: 4 }}>
                        <Text style={[styles.productName, { marginBottom: 0, flex: 1 }]}>
                            {item.baseProduct.name}
                            {!hidePrices && \` + 1 \${item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'} \${settings?.currency || '$'}\${bestVariant ? bestVariant.price : basePrice}\`}
                        </Text>
                        <Pressable onPress={() => toggleFavorite(item.baseProduct.id)} style={{ padding: 4 }}>
                            <FontAwesome name={favorites.includes(item.baseProduct.id) ? 'star' : 'star-o'} size={18} color={favorites.includes(item.baseProduct.id) ? '#fbbf24' : '#ccc'} />
                        </Pressable>
                    </View>`;

let replaced = false;
if (content.includes(searchStr)) { content = content.replace(searchStr, replaceStr); replaced = true; }
else if (content.includes(searchStr.replace(/\r\n/g, "\n"))) { content = content.replace(searchStr.replace(/\r\n/g, "\n"), replaceStr); replaced = true; }
else if (content.includes(searchStr.replace(/\n/g, "\r\n"))) { content = content.replace(searchStr.replace(/\n/g, "\r\n"), replaceStr); replaced = true; }

if(!replaced) console.log("Could not find product title");

let searchStr2 = `<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                        {bestVariant && !hidePrices ? (
                            <>
                                <Text style={styles.productOldPrice}>{settings?.currency || '$'}{basePrice}</Text>
                                <Text style={[styles.productPrice, { color: businessProfile.primaryColor }]}>{settings?.currency || '$'}{bestVariant.price}</Text>
                            </>
                        ) : (
                            <View>
                                <Text style={styles.productPrice}>{hidePrices ? (restrictionData.reopensAt ? \`Consultá precios a las \${restrictionData.reopensAt} hs\` : '') : \`\${settings?.currency || '$'}\${basePrice}\`}</Text>
                                {item.baseProduct.advancePrice !== undefined && item.baseProduct.advancePrice > 0 && !hidePrices && (
                                    <Text style={{ fontSize: 12, color: '#10b981', fontWeight: 'bold', marginTop: 2 }}>
                                        {settings?.currency || '$'}{item.baseProduct.advancePrice} (Comprando Anticipado)
                                    </Text>
                                )}
                            </View>
                        )}
                        {!hidePrices && <Text style={styles.unitType}>/ {item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}</Text>}
                    </View>`;

let replaceStr2 = `<View style={{ flexDirection: 'column', gap: 4, marginTop: 10 }}>
                        {bulkTiers.length > 0 && !hidePrices && (
                            <View style={{ backgroundColor: '#f3f4f6', padding: 6, borderRadius: 6 }}>
                                {bulkTiers.map((bp, i) => (
                                    <Text key={i} style={{ color: '#1f2937', fontSize: 12, fontWeight: 'bold' }}>
                                        Llevando {bp.quantity}{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'}: {settings?.currency || '$'}{(bp.price / bp.quantity).toFixed(0)} c/u
                                    </Text>
                                ))}
                            </View>
                        )}
                        {item.baseProduct.isDailyOffer && !hidePrices && (
                            <View style={{ backgroundColor: '#fef3c7', padding: 6, borderRadius: 6, borderWidth: 1, borderColor: '#f59e0b' }}>
                                <Text style={{ color: '#d97706', fontSize: 12, fontWeight: 'bold' }}>
                                    💵 PRECIO EFECTIVO (Mínimo {item.baseProduct.dailyOfferMinQty || 1}{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'})
                                </Text>
                                <Text style={{ color: '#d97706', fontSize: 13, fontWeight: 'bold' }}>
                                    {settings?.currency || '$'}{item.baseProduct.dailyOfferPrice}
                                </Text>
                                <Text style={{ color: '#d97706', fontSize: 11, marginTop: 2 }}>
                                    (💳 Otros medios: {settings?.currency || '$'}{basePrice * (item.baseProduct.dailyOfferMinQty || 1)})
                                </Text>
                            </View>
                        )}
                    </View>`;

let replaced2 = false;
if (content.includes(searchStr2)) { content = content.replace(searchStr2, replaceStr2); replaced2 = true; }
else if (content.includes(searchStr2.replace(/\r\n/g, "\n"))) { content = content.replace(searchStr2.replace(/\r\n/g, "\n"), replaceStr2); replaced2 = true; }
else if (content.includes(searchStr2.replace(/\n/g, "\r\n"))) { content = content.replace(searchStr2.replace(/\n/g, "\r\n"), replaceStr2); replaced2 = true; }

if(!replaced2) console.log("Could not find product price section");

fs.writeFileSync("c:/Tienda/app/(store)/(client)/index.tsx", content, "utf8");

