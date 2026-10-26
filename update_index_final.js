
const fs = require("fs");
let content = fs.readFileSync("c:/Tienda/app/(store)/(client)/index.tsx", "utf8");

// HEADER
content = content.replace(
`<View style={styles.brandRow}>
                        {businessProfile.logoUrl ? (
                            <Image source={{ uri: businessProfile.logoUrl }} style={styles.logoImage} />
                        ) : null}
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{businessProfile.name}</Text>
                            {!!businessProfile.description && (
                                <Text style={styles.businessDesc}>{businessProfile.description}</Text>
                            )}
                        </View>
                    </View>`,
`<View style={[styles.brandRow, { justifyContent: "center" }]}>
                        <View style={{ width: 60, alignItems: "flex-end" }}>
                            {businessProfile.logoUrl ? (
                                <Image source={{ uri: businessProfile.logoUrl }} style={styles.logoImage} />
                            ) : null}
                        </View>
                        <View style={{ alignItems: "center", flex: 1, paddingHorizontal: 10 }}>
                            <Text style={[styles.title, { textAlign: "center" }]}>{businessProfile.name}</Text>
                            {!!businessProfile.description && (
                                <Text style={[styles.businessDesc, { textAlign: "center" }]}>{businessProfile.description}</Text>
                            )}
                        </View>
                        <View style={{ width: 60 }} />
                    </View>`
);
content = content.replace(
`<View style={styles.brandRow}>\r
                        {businessProfile.logoUrl ? (\r
                            <Image source={{ uri: businessProfile.logoUrl }} style={styles.logoImage} />\r
                        ) : null}\r
                        <View style={{ flex: 1 }}>\r
                            <Text style={styles.title}>{businessProfile.name}</Text>\r
                            {!!businessProfile.description && (\r
                                <Text style={styles.businessDesc}>{businessProfile.description}</Text>\r
                            )}\r
                        </View>\r
                    </View>`,
`<View style={[styles.brandRow, { justifyContent: "center" }]}>
                        <View style={{ width: 60, alignItems: "flex-end" }}>
                            {businessProfile.logoUrl ? (
                                <Image source={{ uri: businessProfile.logoUrl }} style={styles.logoImage} />
                            ) : null}
                        </View>
                        <View style={{ alignItems: "center", flex: 1, paddingHorizontal: 10 }}>
                            <Text style={[styles.title, { textAlign: "center" }]}>{businessProfile.name}</Text>
                            {!!businessProfile.description && (
                                <Text style={[styles.businessDesc, { textAlign: "center" }]}>{businessProfile.description}</Text>
                            )}
                        </View>
                        <View style={{ width: 60 }} />
                    </View>`
);

// CARDS TITLE
content = content.replace(/<Text style=\{\[styles\.productName,\s*\{\s*marginBottom:\s*0,\s*flex:\s*1\s*\}\]\}>\{item\.baseProduct\.name\}<\/Text>/,
`<Text style={[styles.productName, { marginBottom: 0, flex: 1 }]}>
                            {item.baseProduct.name}
                            {!hidePrices && \` 1 \${item.baseProduct.unitType === "unit" ? "u." : "kg"} \${settings?.currency || "$"}\${bestVariant ? bestVariant.price : basePrice}\`}
                        </Text>`
);

// CARDS PRICE SECTION
content = content.replace(/<View style=\{\{\s*flexDirection:\s*'row',\s*alignItems:\s*'center',\s*gap:\s*8,\s*marginTop:\s*10\s*\}\}>[\s\S]*?<\/View>/,
`<View style={{ flexDirection: "column", gap: 4, marginTop: 10 }}>
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
                    </View>`
);

fs.writeFileSync("c:/Tienda/app/(store)/(client)/index.tsx", content, "utf8");

