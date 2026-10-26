import { saveCatalogToFirebase } from './businessService';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const generateDefaultCatalog = (businessId: string, type: string, saleTypes: string[] = ['kg']) => {
    const products: any[] = [];
    const mainUnit = saleTypes && saleTypes.includes('kg') ? 'kg' : 'unit';
    
    if (type === 'carniceria' || type === 'default') {
        // 5 cortes Vacuno
        products.push(createProd(businessId, 'Asado de Novillo', 'Vacuno', 7500, mainUnit));
        products.push(createProd(businessId, 'Vacío', 'Vacuno', 8200, mainUnit));
        products.push(createProd(businessId, 'Matambre', 'Vacuno', 8000, mainUnit));
        products.push(createProd(businessId, 'Nalga para Milanesas', 'Vacuno', 8500, mainUnit));
        products.push(createProd(businessId, 'Roast Beef', 'Vacuno', 6500, mainUnit));

        // 5 cortes Pollo
        products.push(createProd(businessId, 'Pollo Entero', 'Pollo', 2500, mainUnit));
        products.push(createProd(businessId, 'Suprema de Pollo', 'Pollo', 5000, mainUnit));
        products.push(createProd(businessId, 'Pata Muslo', 'Pollo', 2800, mainUnit));
        products.push(createProd(businessId, 'Alitas de Pollo', 'Pollo', 1500, mainUnit));
        products.push(createProd(businessId, 'Milanesas de Pollo', 'Pollo', 4500, mainUnit));

        // 5 cortes Cerdo
        products.push(createProd(businessId, 'Pechito de Cerdo', 'Cerdo', 4500, mainUnit));
        products.push(createProd(businessId, 'Bondiola', 'Cerdo', 6000, mainUnit));
        products.push(createProd(businessId, 'Carré de Cerdo', 'Cerdo', 4800, mainUnit));
        products.push(createProd(businessId, 'Costillitas de Cerdo', 'Cerdo', 4500, mainUnit));
        products.push(createProd(businessId, 'Matambre de Cerdo', 'Cerdo', 7000, mainUnit));

        // 5 Achuras
        products.push(createProd(businessId, 'Chinchulines', 'Achuras', 3500, mainUnit));
        products.push(createProd(businessId, 'Mollejas', 'Achuras', 9500, mainUnit));
        products.push(createProd(businessId, 'Riñones', 'Achuras', 2500, mainUnit));
        products.push(createProd(businessId, 'Tripa Gorda', 'Achuras', 2000, mainUnit));
        products.push(createProd(businessId, 'Chorizo Bombón', 'Achuras', 4500, mainUnit));

        // 5 Embutidos
        products.push(createProd(businessId, 'Chorizo Puro Cerdo', 'Embutidos', 5000, mainUnit));
        products.push(createProd(businessId, 'Chorizo Colorado', 'Embutidos', 6500, mainUnit));
        products.push(createProd(businessId, 'Morcilla con Nuez', 'Embutidos', 4000, mainUnit));
        products.push(createProd(businessId, 'Morcilla Vasca', 'Embutidos', 4200, mainUnit));
        products.push(createProd(businessId, 'Salchicha Parrillera', 'Embutidos', 5500, mainUnit));

        // Oferta del día (pertenece a Vacuno)
        const ofertaDia = createProd(businessId, 'Especial Picada Especial', 'Vacuno', 5500, mainUnit);
        ofertaDia.isDailyOffer = true;
        ofertaDia.dailyOfferPrice = 4500;
        ofertaDia.dailyOfferMinQty = 2;
        products.push(ofertaDia);

        // Oferta Especial (pertenece a Vacuno)
        const ofertaEsp = createProd(businessId, 'Tapa de Asado Promoción', 'Vacuno', 7000, mainUnit);
        ofertaEsp.promotionalPrice = 6000;
        products.push(ofertaEsp);

        // Combo asignado a Vacuno (NO categoría Combos)
        const combo = createProd(businessId, 'Combo Asado Familiar', 'Vacuno', 25000, 'unit');
        combo.isCombo = true;
        combo.comboDetails = {
            description: "2kg Asado, 1kg Vacío, 1kg Chorizo, 1 Morcilla",
            items: [
                { name: "Asado de Novillo", quantity: 2, unitType: 'kg' },
                { name: "Vacío", quantity: 1, unitType: 'kg' },
                { name: "Chorizo Puro Cerdo", quantity: 1, unitType: 'kg' }
            ]
        };
        products.push(combo);
    } else if (type === 'verduleria') {
        const cats = ['Verduras', 'Frutas', 'Pesados', 'Hierbas', 'Frutos Secos'];
        cats.forEach(cat => {
            for (let i = 1; i <= 5; i++) {
                products.push(createProd(businessId, `${cat.slice(0, -1)} Selección ${i}`, cat, 800 * i, mainUnit));
            }
        });
    } else if (type === 'fiambreria') {
        const cats = ['Fiambres', 'Quesos', 'Embutidos', 'Picadas', 'Encurtidos'];
        cats.forEach(cat => {
            for (let i = 1; i <= 5; i++) {
                products.push(createProd(businessId, `${cat.slice(0, -1)} Especial ${i}`, cat, 1200 * i, mainUnit));
            }
        });
    } else if (type === 'ropa' || type === 'indumentaria') {
        const cats = ['Remeras', 'Pantalones', 'Abrigos', 'Calzado', 'Accesorios'];
        cats.forEach(cat => {
            for (let i = 1; i <= 5; i++) {
                products.push(createProd(businessId, `${cat.slice(0, -1)} Modelo ${i}`, cat, 8000 * i, 'unit'));
            }
        });
    } else if (type === 'kiosco' || type === 'almacen') {
        const cats = ['Bebidas', 'Golosinas', 'Galletitas', 'Lácteos', 'Limpieza'];
        cats.forEach(cat => {
            for (let i = 1; i <= 5; i++) {
                products.push(createProd(businessId, `Producto ${i} de ${cat}`, cat, 500 * i, 'unit'));
            }
        });
    } else if (type === 'tecnologia' || type === 'electronica') {
        const cats = ['Celulares', 'Audio', 'Computación', 'Accesorios', 'Gaming'];
        cats.forEach(cat => {
            for (let i = 1; i <= 5; i++) {
                products.push(createProd(businessId, `Artículo ${cat} Mod. ${i}`, cat, 25000 * i, 'unit'));
            }
        });
    } else if (type === 'gastronomia') {
        const cats = ['Hamburguesas', 'Pizzas', 'Empanadas', 'Bebidas', 'Postres'];
        cats.forEach(cat => {
            for (let i = 1; i <= 5; i++) {
                products.push(createProd(businessId, `${cat.slice(0, -1)} Especial ${i}`, cat, 3500 * i, 'unit'));
            }
        });
    } else {
        const cats = ['Categoría 1', 'Categoría 2', 'Categoría 3', 'Categoría 4', 'Categoría 5'];
        cats.forEach(cat => {
            for (let i = 1; i <= 5; i++) {
                products.push(createProd(businessId, `Producto Genérico ${i} (${cat})`, cat, 1000 * i, 'unit'));
            }
        });
    }

    return products;
};

const createProd = (businessId: string, name: string, category: string, price: number, unitType: string): any => {
    return {
        id: Math.random().toString(36).substring(2, 15),
        businessId,
        name,
        category,
        price,
        unitType,
        isVisible: true,
        inStock: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
};

export const applyDemoOnboarding = async (businessId: string, data: any) => {
    // 1. Crear Productos
    const products = generateDefaultCatalog(businessId, data.rubro, data.ventas);
    await saveCatalogToFirebase(businessId, products, []);

    // 2. Extraer categorías reales de los productos (sin meter 'Combos' ni etiquetas fijas)
    const categories = Array.from(new Set(products.map(p => p.category)));

    // 3. Medios de pago
    let paymentMethods: string[] = ['Efectivo'];
    if (data.pagos === 'transferencia') paymentMethods = ['Efectivo', 'Transferencia'];
    if (data.pagos === 'todas') paymentMethods = ['Efectivo', 'Transferencia', 'MercadoPago'];

    // 4. Actualizar documento principal de Firebase
    const businessRef = doc(db, 'businesses', businessId);
    await setDoc(businessRef, {
        onboardingCompleted: true,
        profile: {
            id: businessId,
            name: data.businessName || 'Mi Negocio',
            primaryColor: data.primaryColor || '#0f172a',
            address: data.address || '',
            onboardingCompleted: true,
            demoRubro: data.rubro
        },
        settings: {
            categories,
            paymentMethods,
            deliveryRules: {
                methods: {
                    pickup: true,
                    delivery: data.envios !== 'no'
                },
                standardCost: data.envios === 'si' ? 1500 : 0,
                freeDeliveryThreshold: 0
            }
        }
    }, { merge: true });
};
