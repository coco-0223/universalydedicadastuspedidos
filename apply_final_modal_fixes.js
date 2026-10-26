const fs = require('fs');

let code = fs.readFileSync('app/(business)/products.tsx', 'utf8');

// 1. Replace SearchableDropdown
const dropdownStart = code.indexOf('const SearchableDropdown = ({ value, onSelect, placeholder, options, style }');
if (dropdownStart !== -1) {
    const searchEndTag = '    };\n\n    const filteredProducts';
    const altEndTag = '    };\r\n\r\n    const filteredProducts';
    
    let dropdownEnd = code.indexOf(searchEndTag, dropdownStart);
    if (dropdownEnd === -1) dropdownEnd = code.indexOf(altEndTag, dropdownStart);

    if (dropdownEnd !== -1) {
        const replacement = `const SearchableDropdown = ({ value, onSelect, placeholder, options, style }: { value: string, onSelect: (val: string) => void, placeholder: string, options: any[], style?: any }) => {
        const [search, setSearch] = useState('');
        const [isOpen, setIsOpen] = useState(false);
        const selectedOption = options.find(o => o.id === value);

        const filtered = useMemo(() => {
            if (!search) return options;
            const low = search.toLowerCase();
            return options.filter(o => o.name.toLowerCase().includes(low));
        }, [search, options]);

        return (
            <View style={[{ zIndex: isOpen ? 9999 : 1, position: 'relative' }, style]}>
                <Pressable
                    style={[
                        styles.modalInput, 
                        { 
                            marginBottom: 0, 
                            backgroundColor: '#fff', 
                            flexDirection: 'row', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            cursor: 'pointer' 
                        }
                    ]}
                    onPress={() => {
                        setIsOpen(!isOpen);
                        setSearch('');
                    }}
                >
                    <Text style={{ color: selectedOption ? '#1e293b' : '#94a3b8', fontSize: 14, fontWeight: selectedOption ? 'bold' : 'normal' }}>
                        {selectedOption ? selectedOption.name : placeholder}
                    </Text>
                    <FontAwesome name={isOpen ? "chevron-up" : "chevron-down"} size={12} color="#64748b" />
                </Pressable>

                {isOpen && (
                    <View 
                        style={{ 
                            position: 'absolute', 
                            top: 45, 
                            left: 0, 
                            right: 0, 
                            backgroundColor: '#fff', 
                            borderWidth: 1, 
                            borderColor: '#cbd5e1', 
                            borderRadius: 8, 
                            maxHeight: 220, 
                            zIndex: 10000, 
                            shadowColor: '#000', 
                            shadowOffset: { width: 0, height: 4 }, 
                            shadowOpacity: 0.15, 
                            shadowRadius: 8, 
                            elevation: 8 
                        }}
                    >
                        <View style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#f8fafc' }}>
                            <TextInput
                                style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: '#1e293b' }}
                                placeholder="🔍 Buscar producto..."
                                value={search}
                                onChangeText={setSearch}
                                autoFocus
                            />
                        </View>
                        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 160 }}>
                            {filtered.map(opt => (
                                <Pressable
                                    key={opt.id}
                                    style={({ pressed }) => ({
                                        padding: 10,
                                        backgroundColor: pressed ? '#f1f5f9' : (opt.id === value ? '#eff6ff' : '#fff'),
                                        borderBottomWidth: 1,
                                        borderBottomColor: '#f1f5f9',
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    })}
                                    onPress={() => {
                                        onSelect(opt.id);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                >
                                    <Text style={{ fontWeight: opt.id === value ? 'bold' : 'normal', color: opt.id === value ? '#2563eb' : '#1e293b', fontSize: 13 }}>
                                        {opt.name} {opt.price !== undefined ? \`(\$\${opt.price})\` : ''}
                                    </Text>
                                    {opt.id === value && <FontAwesome name="check" size={12} color="#2563eb" />}
                                </Pressable>
                            ))}
                            {filtered.length === 0 && (
                                <Text style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                    No se encontraron productos
                                </Text>
                            )}
                        </ScrollView>
                    </View>
                )}
            </View>
        );
    };`;
        code = code.substring(0, dropdownStart) + replacement + code.substring(dropdownEnd + 6);
        console.log('SearchableDropdown replaced successfully.');
    }
}

// 2. Click outside backdrop closing
// Daily Offers
code = code.replace(
    '<Modal visible={isDailyOffersModalOpen} transparent={true} animationType="slide">\n                      <View style={styles.modalOverlay}>',
    '<Modal visible={isDailyOffersModalOpen} transparent={true} animationType="slide">\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsDailyOffersModalOpen(false)}>'
);
code = code.replace(
    '<Modal visible={isDailyOffersModalOpen} transparent={true} animationType="slide">\r\n                      <View style={styles.modalOverlay}>',
    '<Modal visible={isDailyOffersModalOpen} transparent={true} animationType="slide">\r\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsDailyOffersModalOpen(false)}>'
);

// Specials
code = code.replace(
    '<Modal visible={isSpecialsModalOpen} transparent={true} animationType="slide">\n                      <View style={styles.modalOverlay}>',
    '<Modal visible={isSpecialsModalOpen} transparent={true} animationType="slide">\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsSpecialsModalOpen(false)}>'
);
code = code.replace(
    '<Modal visible={isSpecialsModalOpen} transparent={true} animationType="slide">\r\n                      <View style={styles.modalOverlay}>',
    '<Modal visible={isSpecialsModalOpen} transparent={true} animationType="slide">\r\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsSpecialsModalOpen(false)}>'
);

// Combos
code = code.replace(
    '<Modal visible={isCombosModalOpen} transparent={true} animationType="slide">\n                      <View style={styles.modalOverlay}>',
    '<Modal visible={isCombosModalOpen} transparent={true} animationType="slide">\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsCombosModalOpen(false)}>'
);
code = code.replace(
    '<Modal visible={isCombosModalOpen} transparent={true} animationType="slide">\r\n                      <View style={styles.modalOverlay}>',
    '<Modal visible={isCombosModalOpen} transparent={true} animationType="slide">\r\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsCombosModalOpen(false)}>'
);

// Volume
code = code.replace(
    '<Modal visible={isVolumeModalOpen} transparent={true} animationType="slide">\n                      <View style={styles.modalOverlay}>',
    '<Modal visible={isVolumeModalOpen} transparent={true} animationType="slide">\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsVolumeModalOpen(false)}>'
);
code = code.replace(
    '<Modal visible={isVolumeModalOpen} transparent={true} animationType="slide">\r\n                      <View style={styles.modalOverlay}>',
    '<Modal visible={isVolumeModalOpen} transparent={true} animationType="slide">\r\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsVolumeModalOpen(false)}>'
);

// Detail
code = code.replace(
    '<Modal visible={isDetailModalOpen} transparent animationType="slide">\n                      <View style={styles.modalBg}>',
    '<Modal visible={isDetailModalOpen} transparent animationType="slide">\n                      <Pressable style={styles.modalBg} onPress={() => { setIsDetailModalOpen(false); setEditingProduct(null); }}>'
);
code = code.replace(
    '<Modal visible={isDetailModalOpen} transparent animationType="slide">\r\n                      <View style={styles.modalBg}>',
    '<Modal visible={isDetailModalOpen} transparent animationType="slide">\r\n                      <Pressable style={styles.modalBg} onPress={() => { setIsDetailModalOpen(false); setEditingProduct(null); }}>'
);

// History
code = code.replace(
    '<Modal visible={isHistoryModalOpen} transparent animationType="fade">\n                      <View style={styles.modalBg}>',
    '<Modal visible={isHistoryModalOpen} transparent animationType="fade">\n                      <Pressable style={styles.modalBg} onPress={() => setIsHistoryModalOpen(false)}>'
);
code = code.replace(
    '<Modal visible={isHistoryModalOpen} transparent animationType="fade">\r\n                      <View style={styles.modalBg}>',
    '<Modal visible={isHistoryModalOpen} transparent animationType="fade">\r\n                      <Pressable style={styles.modalBg} onPress={() => setIsHistoryModalOpen(false)}>'
);

// Help
code = code.replace(
    '<Modal visible={isHelpOpen} transparent animationType="fade">\n                      <View style={styles.modalBg}>',
    '<Modal visible={isHelpOpen} transparent animationType="fade">\n                      <Pressable style={styles.modalBg} onPress={() => setIsHelpOpen(false)}>'
);
code = code.replace(
    '<Modal visible={isHelpOpen} transparent animationType="fade">\r\n                      <View style={styles.modalBg}>',
    '<Modal visible={isHelpOpen} transparent animationType="fade">\r\n                      <Pressable style={styles.modalBg} onPress={() => setIsHelpOpen(false)}>'
);

// Mass Category
code = code.replace(
    '<Modal visible={true} transparent animationType="fade">\n                                          <View style={styles.modalBg}>',
    '<Modal visible={true} transparent animationType="fade">\n                                          <Pressable style={styles.modalBg} onPress={() => setIsMassCategoryOpen(false)}>'
);
code = code.replace(
    '<Modal visible={true} transparent animationType="fade">\r\n                                          <View style={styles.modalBg}>',
    '<Modal visible={true} transparent animationType="fade">\r\n                                          <Pressable style={styles.modalBg} onPress={() => setIsMassCategoryOpen(false)}>'
);

// Make inner content Pressable to prevent backdrop click closing when clicking inside modal card
const innerModalSearch1 = '<View style={[styles.modalContent, { maxWidth: dailyOffersView === \'list\' ? 700 : 500';
code = code.replaceAll(innerModalSearch1, '<Pressable onPress={(e) => e.stopPropagation?.()} style={[styles.modalContent, { maxWidth: dailyOffersView === \'list\' ? 700 : 500');

const innerModalSearch2 = '<View style={[styles.modalContent, { maxWidth: specialsView === \'list\' ? 700 : 650';
code = code.replaceAll(innerModalSearch2, '<Pressable onPress={(e) => e.stopPropagation?.()} style={[styles.modalContent, { maxWidth: specialsView === \'list\' ? 700 : 650');

const innerModalSearch3 = '<View style={[styles.modalContent, { maxWidth: combosView === \'list\' ? 700 : 650';
code = code.replaceAll(innerModalSearch3, '<Pressable onPress={(e) => e.stopPropagation?.()} style={[styles.modalContent, { maxWidth: combosView === \'list\' ? 700 : 650');

const innerModalSearch4 = '<View style={[styles.modalContent, { maxWidth: volumeView === \'list\' ? 700 : 650';
code = code.replaceAll(innerModalSearch4, '<Pressable onPress={(e) => e.stopPropagation?.()} style={[styles.modalContent, { maxWidth: volumeView === \'list\' ? 700 : 650');

const innerModalSearch5 = '<View style={[styles.modalCard, { width: \'90%\', maxWidth: 500, padding: 25 }]}>';
code = code.replaceAll(innerModalSearch5, '<Pressable onPress={(e) => e.stopPropagation?.()} style={[styles.modalCard, { width: \'90%\', maxWidth: 500, padding: 25 }]}>');

const innerModalSearch6 = '<View style={[styles.modalCard, { width: 650 }]}>';
code = code.replaceAll(innerModalSearch6, '<Pressable onPress={(e) => e.stopPropagation?.()} style={[styles.modalCard, { width: 650 }]}>');

const innerModalSearch7 = '<View style={[styles.modalCard, { maxWidth: 550, width: \'90%\' }]}>';
code = code.replaceAll(innerModalSearch7, '<Pressable onPress={(e) => e.stopPropagation?.()} style={[styles.modalCard, { maxWidth: 550, width: \'90%\' }]}>');

const innerModalSearch8 = '<View style={[styles.modalCard, { maxWidth: 400 }]}>';
code = code.replaceAll(innerModalSearch8, '<Pressable onPress={(e) => e.stopPropagation?.()} style={[styles.modalCard, { maxWidth: 400 }]}>');

// Replace ending outer View tag for modals
fs.writeFileSync('app/(business)/products.tsx', code);
console.log('All modal updates applied successfully!');
