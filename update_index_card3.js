const fs = require('fs');
let content = fs.readFileSync('c:/Tienda/app/(store)/(client)/index.tsx', 'utf8');

let newContent = content;

newContent = newContent.replace(/<View style=\{\{\s*flexDirection:\s*'row',\s*alignItems:\s*'center',\s*justifyContent:\s*'space-between',\s*gap:\s*5,\s*marginBottom:\s*4\s*\}\}>\s*<Text style=\{\[styles\.productName,\s*\{\s*marginBottom:\s*0,\s*flex:\s*1\s*\}\]\}>\{item\.baseProduct\.name\}<\/Text>/g, 
\<View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 5, marginBottom: 4 }}>
    <Text style={[styles.productName, { marginBottom: 0, flex: 1 }]}>
        {item.baseProduct.name}
        {!hidePrices && \\\ 1 \\\ \\\\\\\\\}
    </Text>\);

newContent = newContent.replace(/<View style=\{\{\s*flexDirection:\s*'row',\s*alignItems:\s*'center',\s*gap:\s*8,\s*marginTop:\s*10\s*\}\}>[\s\S]*?<\/View>/, 
\<View style={{ flexDirection: 'column', gap: 4, marginTop: 10 }}>
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
                💵 PRECIO EFECTIVO (Mín. {item.baseProduct.dailyOfferMinQty || 1}{item.baseProduct.unitType === 'unit' ? 'u.' : 'kg'})
            </Text>
            <Text style={{ color: '#d97706', fontSize: 13, fontWeight: 'bold' }}>
                {settings?.currency || '$'}{item.baseProduct.dailyOfferPrice}
            </Text>
            <Text style={{ color: '#d97706', fontSize: 11, marginTop: 2 }}>
                (💳 Otros medios: {settings?.currency || '$'}{basePrice * (item.baseProduct.dailyOfferMinQty || 1)})
            </Text>
        </View>
    )}
</View>\);

fs.writeFileSync('c:/Tienda/app/(store)/(client)/index.tsx', newContent, 'utf8');
