
const fs = require("fs");
let content = fs.readFileSync("c:/Tienda/app/(store)/(client)/index.tsx", "utf8");

const target = `                    <View style={styles.brandRow}>
                        {businessProfile.logoUrl ? (
                            <Image source={{ uri: businessProfile.logoUrl }} style={styles.logoImage} />
                        ) : null}
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{businessProfile.name}</Text>
                            {!!businessProfile.description && (
                                <Text style={styles.businessDesc}>{businessProfile.description}</Text>
                            )}
                        </View>
                    </View>`;

const replacement = `                    <View style={[styles.brandRow, { justifyContent: "center" }]}>
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
                    </View>`;

content = content.replace(target, replacement);
content = content.replace(target.replace(/\r\n/g, "\n"), replacement);
content = content.replace(target.replace(/\n/g, "\r\n"), replacement);

fs.writeFileSync("c:/Tienda/app/(store)/(client)/index.tsx", content, "utf8");

