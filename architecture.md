# Arquitectura del Proyecto: Tienda / Butcher App

Este documento sirve como el mapa principal ("memoria") del proyecto para que cualquier agente de IA o desarrollador entienda el contexto rápidamente al iniciar una sesión.

## Stack Tecnológico
- **Framework Frontend:** React Native con Expo (v54+)
- **Navegación:** Expo Router (File-based routing)
- **Backend as a Service:** Firebase (Auth, Firestore, Functions, Storage)
- **Notas de dependencias:** 
  - Se utiliza `primereact` y `primeicons` (posiblemente para componentes web/UI).
  - *Nota sobre Supabase:* Aunque el paquete `@supabase/supabase-js` está en el `package.json` y existe una carpeta `supabase/`, **no se está usando activamente**. El backend principal y activo es Firebase.

## Arquitectura Multi-tenant (White-label)
El proyecto es una solución **Multi-tenant y Marca Blanca (White-label)**. Esto se controla dinámicamente mediante la variable de entorno `APP_VARIANT` en el archivo `app.config.js`.
- **Apps Dedicadas (Ej. Rocio Carnicerias):** Generan su propio compilado con su `slug`, `package` (`com.rociocarnicerias.app`), íconos y configuración nativa.
- **App Universal (TusPedidos):** Funciona como un hub o marketplace genérico (`com.tuspedidos.app`).
El código fuente es compartido, pero la compilación (assets, nombres, identifiers de iOS/Android) se adapta a la variable inyectada al momento de hacer build en EAS (Expo Application Services).


## Estructura de Directorios

### `/app` (Navegación / Pantallas)
Utiliza Expo Router para separar la aplicación en tres dominios principales:
- `(admin)/`: Espacio para la administración general o super-admin.
- `(business)/`: Espacio para los dueños de los negocios (ej. carnicerías).
- `(store)/`: La fachada pública o interfaz para los clientes/compradores.
- Archivos sueltos: Pantallas base como `welcome.tsx` y flujos de autenticación como `business-auth.tsx`.

### `/src` (Lógica y Componentes)
- `config/`: Configuraciones de inicialización (ej. `firebase.ts`).
- `services/`: Lógica de comunicación con la base de datos (ej. `businessService.ts`, `storageService.ts`).
- `context/`: Manejo de estado global usando React Context.
- `components/`: Componentes de UI reutilizables (separados de las pantallas completas).
- `data/` y `types/`: Datos estáticos (ej. seeds) y definiciones de TypeScript.
- `utils/`: Funciones de ayuda generales.

### `/functions`
- Contiene el backend de Node.js para Firebase Cloud Functions (en `index.js`).

## Reglas de Negocio Clave (Business Logic)
- **Autenticación de Clientes:** La obligatoriedad de registrarse o permitir compras como invitado (Guest Checkout) **depende de la configuración de cada negocio**. No es una regla global.
- **Descubrimiento (App Universal):** Los clientes acceden a un negocio específico mediante: (1) Escaneo de un código QR en el local, (2) Redirección por Link directo, o (3) Introduciendo un código alfanumérico único del negocio. *No* hay un buscador global o listado general.
- **Pagos:** Todos los pagos se realizan **por fuera de la plataforma** (efectivo, transferencia acordada por fuera). La app solo registra el pedido y calcula los totales.
- **Optimización de Base de Datos:** Se usa una "Arquitectura de Documento Único" para los catálogos (`businesses/{id}/catalog/data`) que guarda productos y ofertas en un solo doc para minimizar lecturas en Firestore.

## Flujo de Trabajo y Convenciones
- **Enrutamiento:** Siempre usar la convención de `expo-router` en la carpeta `app`. Las rutas están agrupadas por rol (admin/business/store).
- **Datos y Backend:** Las consultas a la base de datos de Firebase deben encapsularse en la carpeta `src/services/`.
- **Nuevos Features:** Al pedir una funcionalidad nueva o un agente de IA que analice una idea, debe validar a qué rol le pertenece y usar los servicios existentes en `/src/services`.
