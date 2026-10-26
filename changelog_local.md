# Historial de Cambios Local (Fuera de Git)

Este archivo mantiene un registro manual de los cambios, pruebas y modificaciones realizadas en el proyecto, con fecha y hora, para tener un backup visual y r√°pido del progreso sin depender exclusivamente del historial de Git.

---

### [2026-09-15 22:05] - Inicio de Feature: Importador Inteligente de Excel
- **Acci√≥n:** Creaci√≥n de rama aislada `feature/excel-import-smart`.
- **An√°lisis:** Se inspeccion√≥ el archivo de referencia `listas precios (65).xlsx`. Se detect√≥ una estructura horizontal multi-columna compleja (Vacuno, Embutidos, Cerdo, Pollo, etc.) con encabezados irregulares y precios mixtos.
- **Decisi√≥n de Dise√±o:** Se implementar√° un parser heur√≠stico (`src/utils/excelParser.ts`) que escanear√° la matriz 2D buscando emparejamientos [Producto - Precio].
- **Regla de Negocio:** Se configur√≥ el sistema para leer **exclusivamente la Hoja 1** del Excel, descartando la Hoja 2 por contener informaci√≥n en desuso.

---

### [2026-09-16 02:15] - Implementaci√≥n Completa de Importaci√≥n Inteligente y Filtros
- **Acci√≥n:** Desarrollo del m√≥dulo `excelParser.ts`, modal interactivo `ExcelImportModal.tsx`, integraci√≥n en `products.tsx` y visualizaci√≥n de leyendas en `index.tsx`.
- **Nuevas Funcionalidades:**
  1. **Librer√≠a `xlsx`:** Instalada para procesar archivos `.xlsx` nativamente en el navegador sin dependencias de servidor.
  2. **Parser Espec√≠fico de Roc√≠o Carnicer√≠as (`src/utils/excelParser.ts`):**
     - Lectura exclusiva de la Hoja 1 (`Sheet1`).
     - Exclusi√≥n de la secci√≥n `CONGELADOS BAJALA`.
     - Exclusi√≥n de columnas AJ a AS.
     - Lectura de Vacuno Mayorista de la columna AH-AI (ignorando AF-AG).
     - Lectura de ofertas en la columna AB hasta la fila de corte (`"individuales"` / `"-sept"`).
     - Separaci√≥n de Cerdo para Milanesas (K-L) vs Cerdo Normal (O-P).
  3. **Modal Asistente de Importaci√≥n (`src/components/ExcelImportModal.tsx`):**
     - Switch para activar/desactivar ofertas en efectivo de la columna AB.
     - Detecci√≥n de productos no mapeados con cuadro para elegir entre *"Crear producto nuevo"* o *"Vincular a producto existente"*.
     - **Memoria de Alias (`excelMappingName`):** Al vincular un producto no reconocido a uno existente, se le asigna `excelMappingName` y se guarda permanentemente en Firebase para saltearse la pregunta en pr√≥ximas subidas.
     - Transacci√≥n reversible: Toda la importaci√≥n se guarda como 1 sola acci√≥n en el historial (`pushExcelState`), permitiendo **deshacer todo con Ctrl+Z (Undo) en 1 clic**.
  4. **Filtro "‚ú® Nuevos" en Panel de Administraci√≥n (`app/(business)/products.tsx`):**
     - A√±adido chip de filtro r√°pido **‚ú® Nuevos** con un bot√≥n de ayuda `‚ùì` que despliega la explicaci√≥n.
  5. **Leyenda Comparativa de Precios en Efectivo (`app/(store)/(client)/index.tsx`):**
     - Muestra el distintivo `üíµ En efectivo: $X | üí≥ Otros medios: $Y` cuando el producto posee una oferta en efectivo activa (`isDailyOffer: true`).

- **2026-09-16 03:15 AM**: Se agregÛ el botÛn de 'Deshacer ImportaciÛn' visible tras importar un Excel inteligente, permitiendo revertir la carga. (app/(business)/products.tsx)
- **2026-09-16 03:22 AM**: Se aÒadiÛ un buscador de texto arriba de los selects de vinculaciÛn en el modal de importaciÛn Excel para poder filtrar las opciones f·cilmente sin que se borre el progreso. Adem·s, se ordenaron alfabÈticamente los productos del cat·logo en la lista desplegable de vinculaciÛn. (src/components/ExcelImportModal.tsx)
- **2026-09-16 03:40 AM**:
1. Habilitado desplazamiento horizontal con scroll y soporte de mouse en PC para el carrusel de Ofertas del DÌa y Ofertas Especiales. (app/(store)/(client)/index.tsx)
2. Implementado sistema de Historial General de Cambios del Cat·logo ('?? Historial de Cambios') con registro de timestamps y botÛn de restauraciÛn de versiones previas. (app/(business)/products.tsx)
3. AÒadida la configuraciÛn y ediciÛn de Cantidad MÌnima para Ofertas del DÌa ('minQty') en el modal de importaciÛn inteligente de Excel. (src/components/ExcelImportModal.tsx)
4. AÒadido el atributo de Peso Aproximado por pieza ('approxWeight') para ventas por unidad y c·lculo estimado en carrito y cat·logo. (src/types/index.ts, src/components/ExcelImportModal.tsx, app/(store)/(client)/cart.tsx)

- **2026-10-23 14:50**: Visualizaci√≥n completa y dual de precios en efectivo y otros medios de pago tanto en items particulares (en verde) como en totales para el cliente (modal Resumen Final/Tu Pedido y Mis Pedidos) y para el due√±o del negocio (Tarjetas de pedidos en Panel Admin y Ticket impreso). C√°lculos din√°micos y retrocompatibles en arquitectura multi-tenant compartida (Universal y Dedicada). (src/types/index.ts, src/utils/productUtils.ts, app/(store)/(client)/cart.tsx, app/(store)/(client)/orders.tsx, app/(business)/admin.tsx)
