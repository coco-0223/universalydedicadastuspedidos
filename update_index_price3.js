
const fs = require("fs");
let content = fs.readFileSync("c:/Tienda/app/(store)/(client)/index.tsx", "utf8");

let search = `<View style={styles.singlePriceRow}>`;
let replace = `<View style={{ flexDirection: "column", gap: 4, marginTop: 10 }}>
                                {bulkTiers.length > 0 && !hidePrices && (
                                    <View style={{ backgroundColor: "#f3f4f6", padding: 6, borderRadius: 6 }}>
                                        {bulkTiers.map((bp, i) => (
                                            <Text key={i} style={{ color: "#1f2937", fontSize: 12, fontWeight: "bold" }}>
                                                Llevando {bp.quantity}{item.baseProduct.unitType === "unit" ? "u." : "kg"}: {settings?.currency || "$"}{(bp.price / bp.quantity).toFixed(0)} c/u
                                            </Text>
                                        ))}
                                    </View>
                                )}
                                {item.baseProduct.isDailyOffer && !hidePrices && (
                                    <View style={{ backgroundColor: "#fef3c7", padding: 6, borderRadius: 6, borderWidth: 1, borderColor: "#f59e0b" }}>
                                        <Text style={{ color: "#d97706", fontSize: 12, fontWeight: "bold" }}>
                                            💵 PRECIO EFECTIVO (Mín. {item.baseProduct.dailyOfferMinQty || 1}{item.baseProduct.unitType === "unit" ? "u." : "kg"})
                                        </Text>
                                        <Text style={{ color: "#d97706", fontSize: 13, fontWeight: "bold" }}>
                                            {settings?.currency || "$"}{item.baseProduct.dailyOfferPrice}
                                        </Text>
                                        <Text style={{ color: "#d97706", fontSize: 11, marginTop: 2 }}>
                                            (💳 Otros medios: {settings?.currency || "$"}{basePrice * (item.baseProduct.dailyOfferMinQty || 1)})
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <View style={styles.singlePriceRow}>`;

content = content.replace(search, replace);
fs.writeFileSync("c:/Tienda/app/(store)/(client)/index.tsx", content, "utf8");

