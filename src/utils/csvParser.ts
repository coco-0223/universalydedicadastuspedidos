export function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    currentCell += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentCell);
                currentCell = '';
            } else if (char === '\n' || char === '\r') {
                currentRow.push(currentCell);
                currentCell = '';
                rows.push(currentRow);
                currentRow = [];
                if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                    i++;
                }
            } else {
                currentCell += char;
            }
        }
    }
    if (currentRow.length > 0 || currentCell) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }
    
    // Filter out completely empty rows
    return rows.filter(row => row.length > 1 || (row.length === 1 && row[0].trim() !== ''));
}
