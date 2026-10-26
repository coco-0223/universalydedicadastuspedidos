const fs = require('fs');

let code = fs.readFileSync('app/(business)/products.tsx', 'utf8');

// Replace Daily Offers modal overlay
code = code.replace(
    'Modal visible={isDailyOffersModalOpen} transparent={true} animationType="slide">\n                      <View style={styles.modalOverlay}>',
    'Modal visible={isDailyOffersModalOpen} transparent={true} animationType="slide">\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsDailyOffersModalOpen(false)}>'
);
code = code.replace(
    'Modal visible={isDailyOffersModalOpen} transparent={true} animationType="slide">\r\n                      <View style={styles.modalOverlay}>',
    'Modal visible={isDailyOffersModalOpen} transparent={true} animationType="slide">\r\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsDailyOffersModalOpen(false)}>'
);

// Specials modal
code = code.replace(
    'Modal visible={isSpecialsModalOpen} transparent={true} animationType="slide">\n                      <View style={styles.modalOverlay}>',
    'Modal visible={isSpecialsModalOpen} transparent={true} animationType="slide">\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsSpecialsModalOpen(false)}>'
);
code = code.replace(
    'Modal visible={isSpecialsModalOpen} transparent={true} animationType="slide">\r\n                      <View style={styles.modalOverlay}>',
    'Modal visible={isSpecialsModalOpen} transparent={true} animationType="slide">\r\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsSpecialsModalOpen(false)}>'
);

// Combos modal
code = code.replace(
    'Modal visible={isCombosModalOpen} transparent={true} animationType="slide">\n                      <View style={styles.modalOverlay}>',
    'Modal visible={isCombosModalOpen} transparent={true} animationType="slide">\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsCombosModalOpen(false)}>'
);
code = code.replace(
    'Modal visible={isCombosModalOpen} transparent={true} animationType="slide">\r\n                      <View style={styles.modalOverlay}>',
    'Modal visible={isCombosModalOpen} transparent={true} animationType="slide">\r\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsCombosModalOpen(false)}>'
);

// Volume modal
code = code.replace(
    'Modal visible={isVolumeModalOpen} transparent={true} animationType="slide">\n                      <View style={styles.modalOverlay}>',
    'Modal visible={isVolumeModalOpen} transparent={true} animationType="slide">\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsVolumeModalOpen(false)}>'
);
code = code.replace(
    'Modal visible={isVolumeModalOpen} transparent={true} animationType="slide">\r\n                      <View style={styles.modalOverlay}>',
    'Modal visible={isVolumeModalOpen} transparent={true} animationType="slide">\r\n                      <Pressable style={styles.modalOverlay} onPress={() => setIsVolumeModalOpen(false)}>'
);

// Detail modal
code = code.replace(
    'Modal visible={isDetailModalOpen} transparent animationType="slide">\n                      <View style={styles.modalBg}>',
    'Modal visible={isDetailModalOpen} transparent animationType="slide">\n                      <Pressable style={styles.modalBg} onPress={() => { setIsDetailModalOpen(false); setEditingProduct(null); }}>'
);
code = code.replace(
    'Modal visible={isDetailModalOpen} transparent animationType="slide">\r\n                      <View style={styles.modalBg}>',
    'Modal visible={isDetailModalOpen} transparent animationType="slide">\r\n                      <Pressable style={styles.modalBg} onPress={() => { setIsDetailModalOpen(false); setEditingProduct(null); }}>'
);

// History modal
code = code.replace(
    'Modal visible={isHistoryModalOpen} transparent animationType="fade">\n                      <View style={styles.modalBg}>',
    'Modal visible={isHistoryModalOpen} transparent animationType="fade">\n                      <Pressable style={styles.modalBg} onPress={() => setIsHistoryModalOpen(false)}>'
);
code = code.replace(
    'Modal visible={isHistoryModalOpen} transparent animationType="fade">\r\n                      <View style={styles.modalBg}>',
    'Modal visible={isHistoryModalOpen} transparent animationType="fade">\r\n                      <Pressable style={styles.modalBg} onPress={() => setIsHistoryModalOpen(false)}>'
);

// Help modal
code = code.replace(
    'Modal visible={isHelpOpen} transparent animationType="fade">\n                      <View style={styles.modalBg}>',
    'Modal visible={isHelpOpen} transparent animationType="fade">\n                      <Pressable style={styles.modalBg} onPress={() => setIsHelpOpen(false)}>'
);
code = code.replace(
    'Modal visible={isHelpOpen} transparent animationType="fade">\r\n                      <View style={styles.modalBg}>',
    'Modal visible={isHelpOpen} transparent animationType="fade">\r\n                      <Pressable style={styles.modalBg} onPress={() => setIsHelpOpen(false)}>'
);

// Replace closing </View>\n                  </Modal>
code = code.replace(/<\/View>\r?\n\s*<\/Modal>/g, '</Pressable>\n                  </Modal>');

// Ensure inner modal cards stopPropagation so clicking inside card doesn't close modal
code = code.replaceAll(
    'style={[styles.modalContent,',
    'onPress={(e) => e.stopPropagation ? e.stopPropagation() : null} style={[styles.modalContent,'
);
code = code.replaceAll(
    'style={[styles.modalCard,',
    'onPress={(e) => e.stopPropagation ? e.stopPropagation() : null} style={[styles.modalCard,'
);

fs.writeFileSync('app/(business)/products.tsx', code);
console.log('Backdrop click-to-close script applied!');
