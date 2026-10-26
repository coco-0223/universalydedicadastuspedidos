import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

interface DatePickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (date: Date) => void;
    initialDate?: Date;
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const DatePickerModal: React.FC<DatePickerModalProps> = ({ visible, onClose, onSelect, initialDate }) => {
    const [currentDate, setCurrentDate] = useState(initialDate || new Date());

    useEffect(() => {
        if (visible) {
            setCurrentDate(initialDate || new Date());
        }
    }, [visible, initialDate]);

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleDayPress = (day: number) => {
        const selected = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        onSelect(selected);
        onClose();
    };

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year: number, month: number) => {
        let day = new Date(year, month, 1).getDay();
        // Adjust so Monday is 0 and Sunday is 6
        return day === 0 ? 6 : day - 1;
    };

    const generateCalendarGrid = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);

        const grid = [];
        let dayCounter = 1;

        for (let row = 0; row < 6; row++) {
            const rowDays = [];
            for (let col = 0; col < 7; col++) {
                if (row === 0 && col < firstDay) {
                    rowDays.push(<View key={`empty-${row}-${col}`} style={styles.dayCell} />);
                } else if (dayCounter <= daysInMonth) {
                    const d = dayCounter;
                    const isSelected = initialDate && d === initialDate.getDate() && month === initialDate.getMonth() && year === initialDate.getFullYear();
                    const isToday = d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

                    rowDays.push(
                        <Pressable 
                            key={`day-${d}`} 
                            style={[
                                styles.dayCell, 
                                isSelected ? styles.selectedDay : null,
                                !isSelected && isToday ? styles.todayDay : null
                            ]} 
                            onPress={() => handleDayPress(d)}
                        >
                            <Text style={[
                                styles.dayText, 
                                isSelected ? styles.selectedDayText : null,
                                !isSelected && isToday ? styles.todayDayText : null
                            ]}>
                                {d}
                            </Text>
                        </Pressable>
                    );
                    dayCounter++;
                } else {
                    rowDays.push(<View key={`empty-end-${row}-${col}`} style={styles.dayCell} />);
                }
            }
            grid.push(<View key={`row-${row}`} style={styles.weekRow}>{rowDays}</View>);
            if (dayCounter > daysInMonth) break;
        }

        return grid;
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.header}>
                        <Pressable onPress={handlePrevMonth} style={styles.navBtn}>
                            <FontAwesome name="chevron-left" size={16} color="#475569" />
                        </Pressable>
                        <Text style={styles.monthText}>{MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}</Text>
                        <Pressable onPress={handleNextMonth} style={styles.navBtn}>
                            <FontAwesome name="chevron-right" size={16} color="#475569" />
                        </Pressable>
                    </View>

                    <View style={styles.daysHeader}>
                        {DAYS.map((d, i) => (
                            <Text key={i} style={styles.dayHeaderText}>{d}</Text>
                        ))}
                    </View>

                    <View style={styles.gridContainer}>
                        {generateCalendarGrid()}
                    </View>

                    <Pressable style={styles.closeBtn} onPress={onClose}>
                        <Text style={styles.closeBtnText}>Cancelar</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalBox: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        width: '100%',
        maxWidth: 350,
        ...Platform.select({
            web: { boxShadow: '0 10px 25px rgba(0,0,0,0.2)' },
            default: { elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 }
        })
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    navBtn: {
        padding: 10,
        backgroundColor: '#f1f5f9',
        borderRadius: 8,
    },
    monthText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    daysHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    dayHeaderText: {
        width: 35,
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 'bold',
        color: '#64748b',
    },
    gridContainer: {
        marginBottom: 20,
    },
    weekRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 5,
    },
    dayCell: {
        width: 35,
        height: 35,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 18,
    },
    dayText: {
        fontSize: 14,
        color: '#334155',
    },
    selectedDay: {
        backgroundColor: '#0f766e',
    },
    selectedDayText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    todayDay: {
        backgroundColor: '#ccfbf1',
    },
    todayDayText: {
        color: '#0f766e',
        fontWeight: 'bold',
    },
    closeBtn: {
        padding: 12,
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        alignItems: 'center',
    },
    closeBtnText: {
        color: '#64748b',
        fontWeight: 'bold',
    }
});
