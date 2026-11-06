import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, ActivityIndicator, Alert, Platform, TextInput, Modal } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { collection, getDocs, doc, getDoc, updateDoc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../src/config/firebase';
import { useRouter } from 'expo-router';
import { useAppContext } from '../../src/context/AppContext';
import { SuperAdminRecord, isPrimarySuperAdmin, PRIMARY_SUPERADMIN_EMAIL } from '../../src/utils/superAdminAuth';
import {
    ProspectLead,
    WhatsAppTemplate,
    DEFAULT_WHATSAPP_TEMPLATES,
    priceToOpaqueCode,
    sanitizeWhatsAppPhone,
    nameToSlug,
    cleanBusinessNameForComparison,
    renderWhatsAppMessage,
    downloadProspectExcelFile
} from '../../src/utils/prospectManager';

interface BusinessRowData {
    id: string;
    name: string;
    email: string;
    branchesCount: number;
    clientsCount: number;
    ordersCount: number;
    totalSales: number;
    productsCount: number;
    categories: string[];
    isActive: boolean;
    status?: 'active' | 'trial';
    trialExpiresAt?: string;
    planPrice?: number;
}

interface BlockedAttempt {
    id: string;
    businessName: string;
    username: string;
    reason: string;
    type: 'ip' | 'device';
    ip?: string;
    previousBusinessId?: string;
    createdAt: string;
}

interface AdminRequest {
    id: string;
    businessId: string;
    businessName: string;
    ownerEmail: string;
    requestType: 'web' | 'app' | 'chatbot';
    ownerPhone?: string;
    ownerName?: string;
    createdAt: string;
    status: 'pending' | 'completed';
}

export default function AdminDashboardScreen() {
    const router = useRouter();
    const { user } = useAppContext();
    const isOwner = isPrimarySuperAdmin(user?.email);

    const [loading, setLoading] = useState(true);
    const [businesses, setBusinesses] = useState<BusinessRowData[]>([]);
    const [requests, setRequests] = useState<AdminRequest[]>([]);
    const [blockedAttempts, setBlockedAttempts] = useState<BlockedAttempt[]>([]);
    const [sortBy, setSortBy] = useState<keyof BusinessRowData>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // SuperAdmin Invitations & Management (Only Owner can invite or approve)
    const [superadmins, setSuperadmins] = useState<SuperAdminRecord[]>([]);
    const [inviteEmailInput, setInviteEmailInput] = useState('');
    const [isInviting, setIsInviting] = useState(false);

    // Prospects Leads & WhatsApp Templates System
    const [prospects, setProspects] = useState<ProspectLead[]>([]);
    const [templates, setTemplates] = useState<WhatsAppTemplate[]>(DEFAULT_WHATSAPP_TEMPLATES);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('promo_7dias');

    // Tabs de Prospección: 'mine' (Mis prospectos) | 'others' (Otros prospectos) | 'all' (Todos) | 'verification' (A contrastar)
    const [prospectsActiveTab, setProspectsActiveTab] = useState<'mine' | 'others' | 'all' | 'verification'>('mine');
    const [prospectsCollaboratorFilter, setProspectsCollaboratorFilter] = useState<string>('all');

    // Modals
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [isEditLeadModalOpen, setIsEditLeadModalOpen] = useState(false);
    const [editingLead, setEditingLead] = useState<ProspectLead | null>(null);

    const [pasteRawText, setPasteRawText] = useState('');
    const [sheetsUrlInput, setSheetsUrlInput] = useState('');
    const [isLoadingSheets, setIsLoadingSheets] = useState(false);
    const [importDefaultAssignedTo, setImportDefaultAssignedTo] = useState<string>('');
    const [parsedPreview, setParsedPreview] = useState<{
        newLeads: ProspectLead[];
        duplicateLeads: { lead: ProspectLead; reason: string }[];
        suspiciousLeads: { lead: ProspectLead; existingLead: ProspectLead | BusinessRowData; reason: string }[];
        invalidRows: { raw: string; reason: string }[];
    }>({ newLeads: [], duplicateLeads: [], suspiciousLeads: [], invalidRows: [] });
    const [includeIncompleteLeads, setIncludeIncompleteLeads] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // Template editing state
    const [editingTemplate, setEditingTemplate] = useState<{ id?: string; name: string; text: string }>({ name: '', text: '' });

    
    const handleUpdatePlanPrice = async (bId: string, bName: string, currentPrice?: number) => {
        let inputPrice: string | null = null;
        if (Platform.OS === 'web') {
            inputPrice = prompt(`Modificar tarifa mensual para ${bName}:`, (currentPrice || 9000).toString());
        }
        if (!inputPrice) return;

        const newPrice = parseInt(inputPrice.replace(/[^0-9]/g, ''), 10);
        if (isNaN(newPrice) || newPrice <= 0) {
            if (Platform.OS === 'web') alert('Por favor ingresá un monto numérico válido.');
            return;
        }

        try {
            setLoading(true);
            const busRef = doc(db, 'businesses', bId);
            await updateDoc(busRef, {
                'profile.planPrice': newPrice
            });
            setBusinesses(prev => prev.map(b => b.id === bId ? { ...b, planPrice: newPrice } : b));
            const msg = `Tarifa de ${bName} actualizada a $${newPrice.toLocaleString()}/mes.`;
            if (Platform.OS === 'web') alert(msg);
        } catch (e) {
            console.error("Error updating plan price:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleExtendTrial = async (bId: string, days: number, bName: string) => {
        try {
            setLoading(true);
            const busRef = doc(db, 'businesses', bId);
            const busSnap = await getDoc(busRef);
            if (!busSnap.exists()) return;

            const currentData = busSnap.data();
            const currentExpires = currentData.profile?.trialExpiresAt ? new Date(currentData.profile.trialExpiresAt) : new Date();
            const baseDate = currentExpires.getTime() > Date.now() ? currentExpires : new Date();
            baseDate.setDate(baseDate.getDate() + days);

            await updateDoc(busRef, {
                'profile.status': 'trial',
                'profile.trialExpiresAt': baseDate.toISOString(),
                isActive: true
            });

            setBusinesses(prev => prev.map(b => b.id === bId ? {
                ...b,
                status: 'trial',
                trialExpiresAt: baseDate.toISOString(),
                isActive: true
            } : b));

            const msg = `Se extendió la prueba de ${bName} por ${days} días (Vence: ${baseDate.toLocaleDateString()}).`;
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Éxito', msg);
        } catch (e) {
            console.error("Error extending trial:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleActivatePermanent = async (bId: string, bName: string) => {
        if (Platform.OS === 'web') {
            if (!confirm(`¿Activar a ${bName} de forma permanente como cliente activo?`)) return;
        }
        try {
            setLoading(true);
            const busRef = doc(db, 'businesses', bId);
            await updateDoc(busRef, {
                'profile.status': 'active',
                isActive: true
            });
            setBusinesses(prev => prev.map(b => b.id === bId ? { ...b, status: 'active', isActive: true } : b));
            const msg = `${bName} ahora está ACTIVO PERMANENTE.`;
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Éxito', msg);
        } catch (e) {
            console.error("Error activating permanent:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteBlockedAttempt = async (attemptId: string) => {
        try {
            await deleteDoc(doc(db, 'blocked_attempts', attemptId));
            setBlockedAttempts(prev => prev.filter(a => a.id !== attemptId));
        } catch (e) {}
    };

    const handleUnblockIp = async (ip: string, attemptId: string) => {
        try {
            const ipDocId = ip.replace(/[^a-zA-Z0-9_-]/g, '_');
            await deleteDoc(doc(db, 'trial_ips', ipDocId));
            await deleteDoc(doc(db, 'blocked_attempts', attemptId));
            setBlockedAttempts(prev => prev.filter(a => a.id !== attemptId));
            const msg = `Se desbloqueó la IP ${ip}. Ya puede solicitar una nueva prueba.`;
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Éxito', msg);
        } catch (e) {}
    };

    const handleResetOnboarding = async (bId: string, bName: string) => {
        if (Platform.OS === 'web') {
            if (!confirm(`¿Estás seguro de reiniciar el Onboarding para ${bName}? Esto borrará su catálogo actual.`)) return;
        } else {
            // No Alert natively here for brevity, just assuming web for Superadmin
        }
        
        try {
            setLoading(true);
            await updateDoc(doc(db, 'businesses', bId), { onboardingCompleted: false });
            await setDoc(doc(db, `businesses/${bId}/catalog`, 'data'), { products: [], offers: [] }, { merge: true });
            await fetchAllData();
            if (Platform.OS === 'web') alert('Onboarding reiniciado con éxito. Al iniciar sesión se mostrarán las preguntas nuevamente.');
        } catch (e) {
            console.error(e);
            if (Platform.OS === 'web') alert('Error al reiniciar onboarding');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Users to map owner emails
            const usersSnap = await getDocs(collection(db, 'users'));
            const usersMap: Record<string, any> = {};
            usersSnap.forEach(doc => {
                usersMap[doc.id] = doc.data();
            });

            // 2. Fetch Businesses
            const businessSnap = await getDocs(collection(db, 'businesses'));
            const businessList: BusinessRowData[] = [];

            // Fetch metrics for each business in parallel
            await Promise.all(businessSnap.docs.map(async (bDoc) => {
                const bId = bDoc.id;
                const bData = bDoc.data();
                const profile = bData.profile || {};
                const settings = bData.settings || {};
                const name = profile.name || 'Sin Nombre';
                const email = usersMap[bId]?.email || 'Sin Email';

                // Count branches
                const branchesCount = settings.branches?.length || 0;

                // Fetch orders to compute sales, clients, and orders count
                let ordersCount = 0;
                let totalSales = 0;
                let clientsCount = 0;
                try {
                    const ordersSnap = await getDocs(collection(db, `businesses/${bId}/orders`));
                    ordersCount = ordersSnap.size;
                    
                    const uniqueClients = new Set<string>();
                    ordersSnap.forEach(oDoc => {
                        const o = oDoc.data();
                        totalSales += o.totalPrice || 0;
                        uniqueClients.add(o.clientId || o.clientPhone || 'Desconocido');
                    });
                    clientsCount = uniqueClients.size;
                } catch (err) {
                    console.warn(`Error loading orders for business ${bId}:`, err);
                }

                // Fetch catalog
                let productsCount = 0;
                let categories: string[] = [];
                try {
                    const catalogRef = doc(db, `businesses/${bId}/catalog`, 'data');
                    const catalogSnap = await getDoc(catalogRef);
                    if (catalogSnap.exists()) {
                        const catalogData = catalogSnap.data();
                        const products = catalogData.products || [];
                        productsCount = products.length;
                        categories = Array.from(new Set(products.map((p: any) => p.category).filter(Boolean))) as string[];
                    } else {
                        // Fallback
                        const productsSnap = await getDocs(collection(db, `businesses/${bId}/products`));
                        productsCount = productsSnap.size;
                        const uniqueCats = new Set<string>();
                        productsSnap.forEach(pDoc => {
                            const p = pDoc.data();
                            if (p.category) uniqueCats.add(p.category);
                        });
                        categories = Array.from(uniqueCats);
                    }
                } catch (err) {
                    console.warn(`Error loading catalog for business ${bId}:`, err);
                }

                businessList.push({
                    id: bId,
                    name,
                    email,
                    branchesCount,
                    clientsCount,
                    ordersCount,
                    totalSales,
                    productsCount,
                    categories,
                    isActive: bData.isActive !== false,
                    status: bData.profile?.status || 'active',
                    trialExpiresAt: bData.profile?.trialExpiresAt,
                    planPrice: bData.profile?.planPrice || 9000
                });
            }));

            setBusinesses(businessList);

            // 3. Fetch Web/App requests
            const reqSnap = await getDocs(collection(db, 'admin_requests'));
            const reqList: AdminRequest[] = reqSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as AdminRequest)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            setRequests(reqList);

            // 4. Fetch Blocked Attempts
            try {
                const blockedSnap = await getDocs(collection(db, 'blocked_attempts'));
                const blockedList: BlockedAttempt[] = blockedSnap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as BlockedAttempt)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setBlockedAttempts(blockedList);
            } catch (err) {
                console.warn("Error fetching blocked attempts:", err);
            }

            // 5. Fetch SuperAdmin List
            try {
                const saSnap = await getDocs(collection(db, 'superadmins'));
                const saList: SuperAdminRecord[] = saSnap.docs.map(doc => ({
                    ...doc.data()
                } as SuperAdminRecord)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setSuperadmins(saList);
            } catch (err) {
                console.warn("Error fetching superadmins:", err);
            }

            // 6. Fetch Prospects Leads
            try {
                const prosSnap = await getDocs(collection(db, 'prospect_leads'));
                const prosList: ProspectLead[] = prosSnap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as ProspectLead)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setProspects(prosList);
            } catch (err) {
                console.warn("Error fetching prospect leads:", err);
            }

            // 7. Fetch WhatsApp Templates
            try {
                const templSnap = await getDocs(collection(db, 'whatsapp_templates'));
                if (!templSnap.empty) {
                    const loadedTemplates: WhatsAppTemplate[] = templSnap.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    } as WhatsAppTemplate));
                    setTemplates(loadedTemplates);
                } else {
                    // Seed initial default templates to Firebase
                    for (const defT of DEFAULT_WHATSAPP_TEMPLATES) {
                        await setDoc(doc(db, 'whatsapp_templates', defT.id), defT);
                    }
                    setTemplates(DEFAULT_WHATSAPP_TEMPLATES);
                }
            } catch (err) {
                console.warn("Error fetching whatsapp templates:", err);
            }

        } catch (error) {
            console.error("Error fetching admin dashboard data:", error);
            if (Platform.OS === 'web') alert('Error al cargar datos del panel.');
            else Alert.alert('Error', 'Error al cargar datos del panel.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    useEffect(() => {
        if (user?.email && !importDefaultAssignedTo) {
            setImportDefaultAssignedTo(user.email);
        }
    }, [user?.email]);

    const handleSort = (field: keyof BusinessRowData) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc'); // Default to desc for numbers, asc for strings
        }
    };

    const sortedBusinesses = useMemo(() => {
        return [...businesses].sort((a, b) => {
            let valA = a[sortBy];
            let valB = b[sortBy];

            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortOrder === 'asc' 
                    ? valA.localeCompare(valB) 
                    : valB.localeCompare(valA);
            }

            if (Array.isArray(valA) && Array.isArray(valB)) {
                return sortOrder === 'asc' 
                    ? valA.length - valB.length 
                    : valB.length - valA.length;
            }

            // Number comparison
            const numA = (valA as number) || 0;
            const numB = (valB as number) || 0;
            return sortOrder === 'asc' ? numA - numB : numB - numA;
        });
    }, [businesses, sortBy, sortOrder]);

    const handleUpdateRequestStatus = async (reqId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';
        try {
            await updateDoc(doc(db, 'admin_requests', reqId), { status: newStatus });
            setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: newStatus as any } : r));
        } catch (error) {
            console.error("Error updating request:", error);
            Alert.alert("Error", "No se pudo actualizar la solicitud.");
        }
    };

    const handleToggleBusinessStatus = async (businessId: string, currentStatus: boolean, businessName: string) => {
        const action = currentStatus ? "suspender" : "reactivar";
        const confirmToggle = Platform.OS === 'web'
            ? window.confirm(`¿Seguro que querés ${action} la tienda "${businessName}"?`)
            : true;

        if (!confirmToggle && Platform.OS === 'web') return;
        
        const executeToggle = async () => {
            try {
                await updateDoc(doc(db, 'businesses', businessId), { isActive: !currentStatus });
                setBusinesses(prev => prev.map(b => b.id === businessId ? { ...b, isActive: !currentStatus } : b));
            } catch (error) {
                console.error("Error toggling business status:", error);
                Alert.alert("Error", `No se pudo ${action} la tienda.`);
            }
        };

        if (Platform.OS !== 'web') {
            Alert.alert(
                `${currentStatus ? 'Suspender' : 'Reactivar'} Tienda`,
                `¿Seguro que querés ${action} la tienda "${businessName}"?`,
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Sí", onPress: executeToggle }
                ]
            );
        } else {
            executeToggle();
        }
    };

    const handleDeleteRequest = async (reqId: string) => {
        const confirmDelete = Platform.OS === 'web' 
            ? window.confirm("¿Seguro que querés eliminar esta solicitud?") 
            : true;
        
        if (!confirmDelete) return;

        try {
            await deleteDoc(doc(db, 'admin_requests', reqId));
            setRequests(prev => prev.filter(r => r.id !== reqId));
        } catch (error) {
            console.error("Error deleting request:", error);
            Alert.alert("Error", "No se pudo eliminar la solicitud.");
        }
    };

    // --- Gestor de Invitaciones de SuperAdmins (Solo para el Dueño Principal) ---
    const handleSendInvitation = async () => {
        if (!isOwner) {
            const msg = 'Solo el Administrador Principal (Owner) puede enviar invitaciones.';
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Permiso denegado', msg);
            return;
        }

        const cleanEmail = inviteEmailInput.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
            const msg = 'Ingresá un email válido.';
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Error', msg);
            return;
        }

        if (cleanEmail === PRIMARY_SUPERADMIN_EMAIL) {
            const msg = 'Este correo ya es el SuperAdmin Principal.';
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Atención', msg);
            return;
        }

        try {
            setIsInviting(true);
            const now = new Date().toISOString();
            const newRecord: SuperAdminRecord = {
                email: cleanEmail,
                role: 'invited_admin',
                status: 'pending',
                invitedBy: user?.email || PRIMARY_SUPERADMIN_EMAIL,
                createdAt: now,
                updatedAt: now
            };

            await setDoc(doc(db, 'superadmins', cleanEmail), newRecord);
            setSuperadmins(prev => {
                const filtered = prev.filter(s => s.email.toLowerCase() !== cleanEmail);
                return [newRecord, ...filtered];
            });
            setInviteEmailInput('');

            const successMsg = `Invitación enviada para ${cleanEmail}. Podés aprobarla ahora o cuando se registre con ese mail en TusPedidos.`;
            if (Platform.OS === 'web') alert(successMsg);
            else Alert.alert('Invitación Enviada', successMsg);
        } catch (err: any) {
            console.error('Error enviando invitación:', err);
            const errMsg = err?.message || 'No se pudo registrar la invitación.';
            if (Platform.OS === 'web') alert(errMsg);
            else Alert.alert('Error', errMsg);
        } finally {
            setIsInviting(false);
        }
    };

    const handleUpdateSuperAdminStatus = async (targetEmail: string, newStatus: 'approved' | 'rejected') => {
        if (!isOwner) {
            const msg = 'Solo el Administrador Principal (Owner) puede aprobar o rechazar administradores.';
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Permiso denegado', msg);
            return;
        }

        const confirmAction = Platform.OS === 'web'
            ? window.confirm(`¿Seguro que querés ${newStatus === 'approved' ? 'APROBAR' : 'RECHAZAR'} el acceso a ${targetEmail}?`)
            : true;
        if (!confirmAction) return;

        try {
            setLoading(true);
            const cleanEmail = targetEmail.trim().toLowerCase();
            const now = new Date().toISOString();

            await updateDoc(doc(db, 'superadmins', cleanEmail), {
                status: newStatus,
                updatedAt: now
            });

            setSuperadmins(prev => prev.map(s => s.email.toLowerCase() === cleanEmail ? { ...s, status: newStatus, updatedAt: now } : s));
            const msg = `El usuario ${cleanEmail} fue ${newStatus === 'approved' ? 'APROBADO con permisos de SuperAdmin' : 'RECHAZADO'}.`;
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Éxito', msg);
        } catch (err) {
            console.error('Error actualizando estado de superadmin:', err);
            Alert.alert('Error', 'No se pudo actualizar el estado.');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSuperAdmin = async (targetEmail: string) => {
        if (!isOwner) {
            const msg = 'Solo el Administrador Principal (Owner) puede revocar administradores.';
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Permiso denegado', msg);
            return;
        }

        const confirmDelete = Platform.OS === 'web'
            ? window.confirm(`¿Seguro que querés ELIMINAR y revocar todos los permisos a ${targetEmail}?`)
            : true;
        if (!confirmDelete) return;

        try {
            setLoading(true);
            const cleanEmail = targetEmail.trim().toLowerCase();
            await deleteDoc(doc(db, 'superadmins', cleanEmail));
            setSuperadmins(prev => prev.filter(s => s.email.toLowerCase() !== cleanEmail));
            const msg = `Se revocó y eliminó el acceso de ${cleanEmail}.`;
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('Eliminado', msg);
        } catch (err) {
            console.error('Error eliminando superadmin:', err);
            Alert.alert('Error', 'No se pudo eliminar el administrador.');
        } finally {
            setLoading(false);
        }
    };

    // --- Parser de Carga Masiva (Ctrl+V desde Google Sheets / Excel) con Detección en Etapas ---
    const handleParsePastedData = (rawText: string) => {
        setPasteRawText(rawText);
        if (!rawText.trim()) {
            setParsedPreview({ newLeads: [], duplicateLeads: [], suspiciousLeads: [], invalidRows: [] });
            return;
        }

        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const newLeads: ProspectLead[] = [];
        const duplicateLeads: { lead: ProspectLead; reason: string }[] = [];
        const suspiciousLeads: { lead: ProspectLead; existingLead: ProspectLead | BusinessRowData; reason: string }[] = [];
        const invalidRows: { raw: string; reason: string }[] = [];

        // Mapas de referencia existentes
        const phoneToLeadMap = new Map<string, ProspectLead>();
        const slugToLeadMap = new Map<string, ProspectLead>();
        const cleanNameToLeadMap = new Map<string, ProspectLead>();

        prospects.forEach(p => {
            if (p.phone) phoneToLeadMap.set(p.phone, p);
            if (p.id) slugToLeadMap.set(p.id.toLowerCase(), p);
            const cName = cleanBusinessNameForComparison(p.name);
            if (cName.length >= 3) cleanNameToLeadMap.set(cName, p);
        });

        const registeredBusinessNames = new Map<string, BusinessRowData>();
        businesses.forEach(b => {
            const cName = cleanBusinessNameForComparison(b.name);
            if (cName.length >= 3) registeredBusinessNames.set(cName, b);
        });

        lines.forEach((line) => {
            let parts: string[] = [];
            if (line.includes('\t')) {
                parts = line.split('\t');
            } else if (line.includes(';')) {
                parts = line.split(';');
            } else if (line.includes(',')) {
                parts = line.split(',');
            } else {
                parts = [line];
            }

            parts = parts.map(p => p.trim());
            // Columnas soportadas:
            // Formato oficial de 11 columnas:
            // 0: Nombre Negocio | 1: Nombre | 2: Whatsapp | 3: Tarifa | 4: Email | 5: Instagram | 6: Página Web | 7: Provincia | 8: Zona | 9: Dirección | 10: País
            let businessName = '';
            let contactName = '';
            let rawPhone = '';
            let rawPrice = '';
            let rawEmail = '';
            let rawInstagram = '';
            let rawWebsite = '';
            let province = '';
            let zone = '';
            let address = '';
            let country = '';
            let rawAssigned = importDefaultAssignedTo || (user?.email || '');

            // Detectamos si la columna 1 o la columna 2 es el teléfono
            const isSecondColPhone = Boolean(sanitizeWhatsAppPhone(parts[1]));
            const isThirdColPhone = Boolean(sanitizeWhatsAppPhone(parts[2]));

            if (isSecondColPhone && parts.length <= 6) {
                // Formato rápido alternativo de 6 cols: [Nombre Negocio, Whatsapp, Tarifa, Email, Asignado, Notas]
                businessName = parts[0] || '';
                contactName = '';
                rawPhone = parts[1] || '';
                rawPrice = parts[2] || '';
                rawEmail = parts[3] || '';
                rawAssigned = parts[4] || rawAssigned;
            } else if (isThirdColPhone || parts.length >= 7) {
                // Formato oficial estándar (donde col 0 es Negocio, col 1 es Persona, col 2 es Whatsapp)
                businessName = parts[0] || '';
                contactName = parts[1] || '';
                rawPhone = parts[2] || '';
                rawPrice = parts[3] || '';
                rawEmail = parts[4] || '';
                rawInstagram = parts[5] || '';
                rawWebsite = parts[6] || '';
                province = parts[7] || '';
                zone = parts[8] || '';
                address = parts[9] || '';
                country = parts[10] || '';
            } else {
                // Intento flexible: si no tiene tantas columnas
                businessName = parts[0] || '';
                contactName = parts[1] || '';
                rawPhone = parts[2] || '';
                rawPrice = parts[3] || '';
                rawEmail = parts[4] || '';
            }

            const sanitizedPhone = sanitizeWhatsAppPhone(rawPhone);
            const slug = nameToSlug(businessName);
            let parsedPrice = parseInt((rawPrice || '').replace(/[^0-9]/g, ''), 10);
            if (isNaN(parsedPrice) || parsedPrice <= 0) {
                parsedPrice = 9000;
            }

            const now = new Date().toISOString();
            const leadItem: ProspectLead = {
                id: slug || `lead-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                businessName: businessName || 'Sin Nombre',
                contactName: contactName || undefined,
                name: businessName || 'Sin Nombre',
                phone: sanitizedPhone,
                planPrice: parsedPrice,
                priceCode: priceToOpaqueCode(parsedPrice),
                email: rawEmail && rawEmail.includes('@') ? rawEmail.toLowerCase().trim() : undefined,
                instagram: rawInstagram ? rawInstagram.trim() : undefined,
                website: rawWebsite ? rawWebsite.trim() : undefined,
                province: province || undefined,
                zone: zone || undefined,
                address: address || undefined,
                country: country || undefined,
                assignedTo: rawAssigned ? rawAssigned.toLowerCase().trim() : (user?.email || undefined),
                createdBy: user?.email || PRIMARY_SUPERADMIN_EMAIL,
                status: 'pending',
                createdAt: now,
                updatedAt: now
            };

            // Fila incompleta
            if (!businessName || businessName.length < 2) {
                invalidRows.push({
                    raw: line,
                    reason: 'Falta el nombre del negocio'
                });
                return;
            }

            // --- ETAPA 1: Coincidencia Estricta por Teléfono (Mismo número -> 100% Duplicado) ---
            if (sanitizedPhone && phoneToLeadMap.has(sanitizedPhone)) {
                const existing = phoneToLeadMap.get(sanitizedPhone)!;
                duplicateLeads.push({
                    lead: leadItem,
                    reason: `Número de WhatsApp ya registrado con '${existing.businessName || existing.name}' (+${sanitizedPhone})`
                });
                return;
            }

            // --- ETAPA 2: Detección Inteligente por Nombre Similar sin Teléfono o con distinto teléfono ---
            const cleanName = cleanBusinessNameForComparison(businessName);
            if (cleanName.length >= 3) {
                // Chequear contra prospectos ya cargados
                if (cleanNameToLeadMap.has(cleanName)) {
                    const matchedLead = cleanNameToLeadMap.get(cleanName)!;
                    leadItem.status = 'needs_verification';
                    leadItem.verificationReason = `Mismo nombre de negocio que '${matchedLead.businessName || matchedLead.name}' (${matchedLead.phone ? 'tel: +' + matchedLead.phone : 'sin tel'})`;
                    leadItem.matchedWithId = matchedLead.id;
                    suspiciousLeads.push({
                        lead: leadItem,
                        existingLead: matchedLead,
                        reason: `Posible duplicado: ya existe '${matchedLead.businessName || matchedLead.name}' (${matchedLead.phone ? 'con tel' : 'sin tel'})`
                    });
                    newLeads.push(leadItem);
                    return;
                }

                // Chequear contra comercios ya registrados en la app
                if (registeredBusinessNames.has(cleanName)) {
                    const matchedBusiness = registeredBusinessNames.get(cleanName)!;
                    leadItem.status = 'needs_verification';
                    leadItem.verificationReason = `Mismo nombre que el comercio registrado '${matchedBusiness.name}'`;
                    leadItem.matchedWithId = matchedBusiness.id;
                    suspiciousLeads.push({
                        lead: leadItem,
                        existingLead: matchedBusiness,
                        reason: `Comercio ya registrado en la plataforma: '${matchedBusiness.name}'`
                    });
                    newLeads.push(leadItem);
                    return;
                }
            }

            // Si no tiene teléfono pero el nombre es nuevo
            if (!sanitizedPhone) {
                invalidRows.push({
                    raw: line,
                    reason: 'Sin teléfono / WhatsApp (podés importarlo como borrador para buscar el número después)'
                });
                return;
            }

            // Lead nuevo limpio
            newLeads.push(leadItem);
            if (sanitizedPhone) phoneToLeadMap.set(sanitizedPhone, leadItem);
            if (slug) slugToLeadMap.set(slug, leadItem);
            if (cleanName.length >= 3) cleanNameToLeadMap.set(cleanName, leadItem);
        });

        setParsedPreview({ newLeads, duplicateLeads, suspiciousLeads, invalidRows });
    };

    // Sincronización directa pegando enlace de Google Sheets
    const handleFetchGoogleSheetsUrl = async () => {
        const rawUrl = sheetsUrlInput.trim();
        if (!rawUrl) {
            alert('Por favor pegá el link de tu Google Sheets.');
            return;
        }

        try {
            setIsLoadingSheets(true);
            // Extraer el Spreadsheet ID de URLs comunes
            // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...
            const match = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
            let tsvUrl = rawUrl;

            if (match && match[1]) {
                const sheetId = match[1];
                // Intentar formato tsv para mantener celdas intactas
                tsvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=tsv`;
            } else if (!rawUrl.includes('format=tsv') && !rawUrl.includes('output=tsv')) {
                // Si es un link publicado
                tsvUrl = rawUrl.replace(/\/pubhtml.*/, '/pub?output=tsv');
            }

            const response = await fetch(tsvUrl);
            if (!response.ok) {
                throw new Error(`No se pudo acceder a la hoja (código ${response.status}). Asegurate de que el enlace tenga permisos de "Cualquier persona con el enlace puede ver" o esté publicado en la web.`);
            }

            const textData = await response.text();
            if (!textData || textData.trim().length === 0) {
                alert('La hoja de Google Sheets parece estar vacía.');
                return;
            }

            // Omitir cabecera si la primera línea contiene "Nombre Negocio" o "Whatsapp"
            const lines = textData.split(/\r?\n/).filter(l => l.trim().length > 0);
            let dataLines = lines;
            if (lines.length > 0) {
                const first = lines[0].toLowerCase();
                if (first.includes('nombre') || first.includes('whatsapp') || first.includes('negocio') || first.includes('tarifa')) {
                    dataLines = lines.slice(1);
                }
            }

            const cleanText = dataLines.join('\n');
            setPasteRawText(cleanText);
            handleParsePastedData(cleanText);
        } catch (err: any) {
            console.error('Error al leer Google Sheets:', err);
            alert(err?.message || 'Error al conectar con Google Sheets. Verificá que la hoja sea pública o usa el copiado y pegado directo (Ctrl+C / Ctrl+V).');
        } finally {
            setIsLoadingSheets(false);
        }
    };

    // Confirmar y guardar la importación masiva en Firebase
    const handleCommitImport = async () => {
        let leadsToSave = [...parsedPreview.newLeads];
        if (includeIncompleteLeads && parsedPreview.invalidRows.length > 0) {
            // Si el usuario marcó incluir filas incompletas con motivos críticos
            parsedPreview.invalidRows.forEach((inv, idx) => {
                const parts = inv.raw.includes('\t') ? inv.raw.split('\t') : (inv.raw.includes(';') ? inv.raw.split(';') : inv.raw.split(','));
                const cleanParts = parts.map(p => p.trim());
                const bName = cleanParts[0] || `Prospecto Incompleto ${idx + 1}`;
                const contact = cleanParts[1] || '';
                // Intentar encontrar teléfono en cualquiera de las celdas
                let foundPhone = '';
                for (let i = 1; i < cleanParts.length; i++) {
                    const sp = sanitizeWhatsAppPhone(cleanParts[i]);
                    if (sp && sp.length >= 8) {
                        foundPhone = sp;
                        break;
                    }
                }
                const slug = nameToSlug(bName) || `lead-manual-${Date.now()}-${idx}`;
                const now = new Date().toISOString();
                leadsToSave.push({
                    id: slug,
                    businessName: bName,
                    contactName: contact || undefined,
                    name: bName,
                    phone: foundPhone,
                    planPrice: 9000,
                    priceCode: 'fn26',
                    assignedTo: importDefaultAssignedTo || (user?.email || undefined),
                    status: 'pending',
                    isCritical: true,
                    criticalReason: inv.reason || 'Datos incompletos / Sin teléfono verificado',
                    createdAt: now,
                    updatedAt: now,
                    notes: `⚠️ Importado con advertencia: ${inv.reason}`
                });
            });
        }

        if (leadsToSave.length === 0) {
            if (Platform.OS === 'web') alert('No hay prospectos válidos para importar.');
            return;
        }

        try {
            setIsImporting(true);
            const batch = writeBatch(db);
            leadsToSave.forEach((lead) => {
                const leadRef = doc(db, 'prospect_leads', lead.id);
                batch.set(leadRef, lead, { merge: true });
            });
            await batch.commit();

            setProspects(prev => [...leadsToSave, ...prev]);
            setIsImportModalOpen(false);
            setPasteRawText('');
            setParsedPreview({ newLeads: [], duplicateLeads: [], suspiciousLeads: [], invalidRows: [] });

            const successMsg = `¡Se importaron ${leadsToSave.length} prospectos exitosamente!`;
            if (Platform.OS === 'web') alert(successMsg);
            else Alert.alert('Éxito', successMsg);
        } catch (e: any) {
            console.error('Error importando prospectos:', e);
            if (Platform.OS === 'web') alert('Error al guardar prospectos: ' + e.message);
        } finally {
            setIsImporting(false);
        }
    };

    // Eliminación Masiva Inteligente de Prospectos (Sin checkbox 1 por 1)
    const handleBulkDeleteProspects = async (filterMode: 'all' | 'contacted' | 'pending' | 'duplicate') => {
        let targets: ProspectLead[] = [];
        let label = '';
        if (filterMode === 'all') {
            targets = prospects;
            label = 'TODOS los prospectos (' + prospects.length + ')';
        } else if (filterMode === 'contacted') {
            targets = prospects.filter(p => p.status === 'contacted');
            label = 'los prospectos YA CONTACTADOS (' + targets.length + ')';
        } else if (filterMode === 'pending') {
            targets = prospects.filter(p => p.status === 'pending');
            label = 'los prospectos PENDIENTES (' + targets.length + ')';
        }

        if (targets.length === 0) {
            if (Platform.OS === 'web') alert('No hay prospectos en esa categoría para eliminar.');
            return;
        }

        const confirmAction = Platform.OS === 'web'
            ? window.confirm(`¿Seguro que querés ELIMINAR en masa a ${label}? Esta acción no se puede deshacer.`)
            : true;
        if (!confirmAction) return;

        try {
            setLoading(true);
            const batch = writeBatch(db);
            targets.forEach(t => {
                batch.delete(doc(db, 'prospect_leads', t.id));
            });
            await batch.commit();

            const targetIds = new Set(targets.map(t => t.id));
            setProspects(prev => prev.filter(p => !targetIds.has(p.id)));

            const doneMsg = `Se eliminaron ${targets.length} prospectos correctamente.`;
            if (Platform.OS === 'web') alert(doneMsg);
            else Alert.alert('Eliminados', doneMsg);
        } catch (err: any) {
            console.error('Error en eliminación masiva:', err);
            Alert.alert('Error', 'No se pudieron eliminar los prospectos.');
        } finally {
            setLoading(false);
        }
    };

    // Resolver conflicto de verificación (humano decide si es el mismo negocio u otro)
    const handleResolveVerification = async (leadId: string, action: 'keep_separate' | 'merge_into_existing' | 'discard') => {
        const lead = prospects.find(p => p.id === leadId);
        if (!lead) return;

        try {
            setLoading(true);
            if (action === 'discard') {
                await deleteDoc(doc(db, 'prospect_leads', leadId));
                setProspects(prev => prev.filter(p => p.id !== leadId));
                if (Platform.OS === 'web') alert(`Se descartó el prospecto duplicado "${lead.name}".`);
            } else if (action === 'keep_separate') {
                // El humano confirma que son negocios diferentes aunque tengan nombre similar
                const now = new Date().toISOString();
                await updateDoc(doc(db, 'prospect_leads', leadId), {
                    status: 'pending',
                    verificationReason: undefined,
                    matchedWithId: undefined,
                    updatedAt: now
                });
                setProspects(prev => prev.map(p => p.id === leadId ? {
                    ...p,
                    status: 'pending',
                    verificationReason: undefined,
                    matchedWithId: undefined,
                    updatedAt: now
                } : p));
                if (Platform.OS === 'web') alert(`"${lead.name}" aprobado como comercio independiente.`);
            } else if (action === 'merge_into_existing') {
                // Combinar datos: si este lead tiene teléfono o datos nuevos, traspasarlos al existente
                if (lead.matchedWithId) {
                    const existingProspect = prospects.find(p => p.id === lead.matchedWithId);
                    if (existingProspect) {
                        const mergedUpdates: any = { updatedAt: new Date().toISOString() };
                        if (!existingProspect.phone && lead.phone) mergedUpdates.phone = lead.phone;
                        if (!existingProspect.email && lead.email) mergedUpdates.email = lead.email;
                        if (!existingProspect.assignedTo && lead.assignedTo) mergedUpdates.assignedTo = lead.assignedTo;
                        if (lead.notes) mergedUpdates.notes = (existingProspect.notes ? existingProspect.notes + ' | ' : '') + lead.notes;

                        await updateDoc(doc(db, 'prospect_leads', existingProspect.id), mergedUpdates);
                        setProspects(prev => prev.map(p => p.id === existingProspect.id ? { ...p, ...mergedUpdates } : p));
                    }
                }
                // Eliminar el duplicado secundario
                await deleteDoc(doc(db, 'prospect_leads', leadId));
                setProspects(prev => prev.filter(p => p.id !== leadId));
                if (Platform.OS === 'web') alert(`Datos fusionados en el comercio principal y duplicado eliminado.`);
            }
        } catch (e: any) {
            console.error('Error resolviendo verificación:', e);
            Alert.alert('Error', 'No se pudo procesar la verificación.');
        } finally {
            setLoading(false);
        }
    };

    // Guardar edición manual de un lead
    const handleSaveEditedLead = async () => {
        if (!editingLead) return;
        try {
            setLoading(true);
            const now = new Date().toISOString();
            const updated = {
                businessName: (editingLead.businessName || editingLead.name).trim(),
                contactName: editingLead.contactName?.trim() || undefined,
                name: (editingLead.businessName || editingLead.name).trim(),
                phone: sanitizeWhatsAppPhone(editingLead.phone),
                email: editingLead.email?.trim() || undefined,
                province: editingLead.province?.trim() || undefined,
                zone: editingLead.zone?.trim() || undefined,
                address: editingLead.address?.trim() || undefined,
                country: editingLead.country?.trim() || undefined,
                planPrice: editingLead.planPrice || 9000,
                priceCode: priceToOpaqueCode(editingLead.planPrice || 9000),
                assignedTo: editingLead.assignedTo?.trim() || undefined,
                notes: editingLead.notes?.trim() || undefined,
                updatedAt: now
            };
            await updateDoc(doc(db, 'prospect_leads', editingLead.id), updated);
            setProspects(prev => prev.map(p => p.id === editingLead.id ? { ...p, ...updated } : p));
            setIsEditLeadModalOpen(false);
            setEditingLead(null);
            if (Platform.OS === 'web') alert('Prospecto actualizado.');
        } catch (e: any) {
            console.error('Error guardando lead:', e);
            Alert.alert('Error', 'No se pudo actualizar el prospecto.');
        } finally {
            setLoading(false);
        }
    };

    // Envío de WhatsApp con 1 Clic usando la plantilla seleccionada
    const handleSendWhatsAppLead = async (lead: ProspectLead) => {
        if (!lead.phone) {
            if (Platform.OS === 'web') alert('Este prospecto no tiene número de teléfono registrado.');
            return;
        }

        const currentTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0] || DEFAULT_WHATSAPP_TEMPLATES[0];
        const messageText = renderWhatsAppMessage(currentTemplate.text, {
            contactName: lead.contactName,
            businessName: lead.businessName || lead.name,
            price: lead.planPrice || 9000,
            slug: lead.id,
            code: lead.priceCode || 'fn26',
            responsable: lead.assignedTo || user?.email || '',
            zone: lead.zone,
            province: lead.province,
            dias: 7
        });

        const encodedMsg = encodeURIComponent(messageText);
        const waUrl = `https://wa.me/${lead.phone}?text=${encodedMsg}`;

        // Abrir WhatsApp en nueva pestaña
        if (typeof window !== 'undefined') {
            window.open(waUrl, '_blank');
        }

        // Marcar como contactado automáticamente
        try {
            const now = new Date().toISOString();
            await updateDoc(doc(db, 'prospect_leads', lead.id), {
                status: 'contacted',
                lastContactedAt: now,
                updatedAt: now
            });
            setProspects(prev => prev.map(p => p.id === lead.id ? { ...p, status: 'contacted', lastContactedAt: now } : p));
        } catch (e) {
            console.warn('Error actualizando estado de prospecto a contactado:', e);
        }
    };

    // Guardar / Crear Plantilla de WhatsApp
    const handleSaveTemplate = async () => {
        const title = editingTemplate.name.trim();
        const text = editingTemplate.text.trim();
        if (!title || !text) {
            if (Platform.OS === 'web') alert('Completá el nombre y el texto de la plantilla.');
            return;
        }

        try {
            setLoading(true);
            const templateId = editingTemplate.id || `tpl_${Date.now()}`;
            const templateData: WhatsAppTemplate = {
                id: templateId,
                name: title,
                text: text,
                createdAt: new Date().toISOString()
            };

            await setDoc(doc(db, 'whatsapp_templates', templateId), templateData);
            setTemplates(prev => {
                const filtered = prev.filter(t => t.id !== templateId);
                return [...filtered, templateData];
            });
            setSelectedTemplateId(templateId);
            setIsTemplateModalOpen(false);
            setEditingTemplate({ name: '', text: '' });
            if (Platform.OS === 'web') alert('Plantilla guardada con éxito.');
        } catch (e: any) {
            console.error('Error guardando plantilla:', e);
            Alert.alert('Error', 'No se pudo guardar la plantilla.');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTemplate = async (templateId: string) => {
        if (templates.length <= 1) {
            if (Platform.OS === 'web') alert('Tenés que mantener al menos una plantilla activa.');
            return;
        }
        if (Platform.OS === 'web') {
            if (!confirm('¿Seguro que querés eliminar esta plantilla?')) return;
        }
        try {
            setLoading(true);
            await deleteDoc(doc(db, 'whatsapp_templates', templateId));
            setTemplates(prev => prev.filter(t => t.id !== templateId));
            if (selectedTemplateId === templateId) {
                const remaining = templates.filter(t => t.id !== templateId);
                setSelectedTemplateId(remaining[0]?.id || 'promo_7dias');
            }
        } catch (e) {
            console.error('Error eliminando plantilla:', e);
        } finally {
            setLoading(false);
        }
    };

    // Card totals
    const totalSalesSum = businesses.reduce((s, b) => s + b.totalSales, 0);
    const totalOrdersSum = businesses.reduce((s, b) => s + b.ordersCount, 0);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Cargando información del sistema...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Panel de Control Principal</Text>
                    <Text style={styles.subtitle}>Resumen global de comercios, prospección de leads y equipo TusPedidos.</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    <Pressable 
                        style={[styles.refreshBtn, { backgroundColor: '#10b981' }]} 
                        onPress={() => setIsImportModalOpen(true)}
                    >
                        <FontAwesome name="clipboard" size={16} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.refreshBtnText}>📥 Carga Masiva (Ctrl+V)</Text>
                    </Pressable>
                    <Pressable 
                        style={[styles.refreshBtn, { backgroundColor: '#8b5cf6' }]} 
                        onPress={() => setIsTemplateModalOpen(true)}
                    >
                        <FontAwesome name="whatsapp" size={16} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.refreshBtnText}>Plantillas WhatsApp</Text>
                    </Pressable>
                    <Pressable style={styles.refreshBtn} onPress={fetchAllData}>
                        <FontAwesome name="refresh" size={16} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.refreshBtnText}>Actualizar</Text>
                    </Pressable>
                </View>
            </View>

            {/* Stat Cards */}
            <View style={styles.statsGrid}>
                <View style={[styles.statCard, { borderLeftColor: '#3b82f6' }]}>
                    <View style={styles.statInfo}>
                        <Text style={styles.statLabel}>NEGOCIOS REGISTRADOS</Text>
                        <Text style={styles.statValue}>{businesses.length}</Text>
                    </View>
                    <View style={[styles.statIconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                        <FontAwesome name="shopping-bag" size={24} color="#3b82f6" />
                    </View>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#10b981' }]}>
                    <View style={styles.statInfo}>
                        <Text style={styles.statLabel}>PROSPECTOS / LEADS</Text>
                        <Text style={styles.statValue}>{prospects.length} ({prospects.filter(p => p.status === 'contacted').length} cont.)</Text>
                    </View>
                    <View style={[styles.statIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                        <FontAwesome name="users" size={24} color="#10b981" />
                    </View>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#06b6d4' }]}>
                    <View style={styles.statInfo}>
                        <Text style={styles.statLabel}>VENTAS TOTALES ACUMULADAS</Text>
                        <Text style={styles.statValue}>${totalSalesSum.toLocaleString()}</Text>
                    </View>
                    <View style={[styles.statIconContainer, { backgroundColor: 'rgba(6, 182, 212, 0.1)' }]}>
                        <FontAwesome name="money" size={24} color="#06b6d4" />
                    </View>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#eab308' }]}>
                    <View style={styles.statInfo}>
                        <Text style={styles.statLabel}>PEDIDOS TOTALES</Text>
                        <Text style={styles.statValue}>{totalOrdersSum}</Text>
                    </View>
                    <View style={[styles.statIconContainer, { backgroundColor: 'rgba(234, 179, 8, 0.1)' }]}>
                        <FontAwesome name="shopping-cart" size={24} color="#eab308" />
                    </View>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#ec4899' }]}>
                    <View style={styles.statInfo}>
                        <Text style={styles.statLabel}>SOLICITUDES APP/WEB</Text>
                        <Text style={styles.statValue}>{requests.filter(r => r.status === 'pending').length} pendientes</Text>
                    </View>
                    <View style={[styles.statIconContainer, { backgroundColor: 'rgba(236, 72, 153, 0.1)' }]}>
                        <FontAwesome name="bell" size={24} color="#ec4899" />
                    </View>
                </View>
            </View>

            {/* Requests Section */}
            {/* SuperAdmin Invitations & Management Section (Available to Owner only for management, visible info) */}
            {isOwner && (
                <View style={[styles.sectionCard, { borderColor: '#3b82f6', borderWidth: 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <FontAwesome name="user-plus" size={20} color="#3b82f6" />
                            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                                Administradores y Equipo SuperAdmin
                            </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                            Solo vos podés invitar, aprobar o revocar accesos.
                        </Text>
                    </View>
                    <Text style={[styles.sectionSubtitle, { marginBottom: 15 }]}>
                        Los administradores invitados pueden ver métricas, extender planes y gestionar clientes, pero no tienen permiso de enviar ni aceptar invitaciones.
                    </Text>

                    {/* Invite form */}
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                        <TextInput
                            style={{
                                flex: 1,
                                minWidth: 240,
                                backgroundColor: '#1e293b',
                                color: '#fff',
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: '#475569',
                                fontSize: 14
                            }}
                            placeholder="Email del nuevo administrador (ej: socio@gmail.com)"
                            placeholderTextColor="#64748b"
                            value={inviteEmailInput}
                            onChangeText={setInviteEmailInput}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                        <Pressable
                            style={{
                                backgroundColor: isInviting ? '#64748b' : '#3b82f6',
                                paddingHorizontal: 18,
                                paddingVertical: 12,
                                borderRadius: 8,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8
                            }}
                            disabled={isInviting}
                            onPress={handleSendInvitation}
                        >
                            {isInviting ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <FontAwesome name="paper-plane" size={14} color="#fff" />
                            )}
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                                Enviar Invitación
                            </Text>
                        </Pressable>
                    </View>

                    {/* Superadmins list */}
                    <View style={styles.requestsList}>
                        {/* Primary Owner Row */}
                        <View style={[styles.requestRow, { backgroundColor: '#1e293b', borderLeftColor: '#3b82f6', borderLeftWidth: 4 }]}>
                            <View style={styles.reqDetails}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={[styles.reqBusinessName, { color: '#fff' }]}>{PRIMARY_SUPERADMIN_EMAIL}</Text>
                                    <View style={{ backgroundColor: '#1d4ed8', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>PROPIETARIO PRINCIPAL</Text>
                                    </View>
                                </View>
                                <Text style={styles.reqBusinessInfo}>Acceso total y control de invitaciones</Text>
                            </View>
                        </View>

                        {/* Invited Superadmins */}
                        {superadmins.map((sa) => (
                            <View 
                                key={sa.email} 
                                style={[
                                    styles.requestRow, 
                                    sa.status === 'approved' 
                                        ? { backgroundColor: '#132e27', borderLeftColor: '#10b981', borderLeftWidth: 4 }
                                        : sa.status === 'rejected'
                                            ? { backgroundColor: '#2d1519', borderLeftColor: '#ef4444', borderLeftWidth: 4 }
                                            : { backgroundColor: '#292212', borderLeftColor: '#f59e0b', borderLeftWidth: 4 }
                                ]}
                            >
                                <View style={styles.reqDetails}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <Text style={[styles.reqBusinessName, { color: '#fff' }]}>{sa.email}</Text>
                                        <View style={{
                                            backgroundColor: sa.status === 'approved' ? '#065f46' : (sa.status === 'rejected' ? '#7f1d1d' : '#78350f'),
                                            paddingHorizontal: 8,
                                            paddingVertical: 2,
                                            borderRadius: 4
                                        }}>
                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                                                {sa.status === 'approved' ? '✓ APROBADO' : (sa.status === 'rejected' ? '✕ RECHAZADO' : '⏳ PENDIENTE DE APROBACIÓN')}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text style={styles.reqBusinessInfo}>Invitado el: {new Date(sa.createdAt).toLocaleDateString()}</Text>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    {sa.status !== 'approved' && (
                                        <Pressable
                                            style={{ backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                                            onPress={() => handleUpdateSuperAdminStatus(sa.email, 'approved')}
                                        >
                                            <FontAwesome name="check" size={12} color="#fff" />
                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Aprobar</Text>
                                        </Pressable>
                                    )}
                                    {sa.status !== 'rejected' && (
                                        <Pressable
                                            style={{ backgroundColor: '#eab308', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                                            onPress={() => handleUpdateSuperAdminStatus(sa.email, 'rejected')}
                                        >
                                            <FontAwesome name="ban" size={12} color="#000" />
                                            <Text style={{ color: '#000', fontSize: 11, fontWeight: 'bold' }}>Rechazar</Text>
                                        </Pressable>
                                    )}
                                    <Pressable
                                        style={{ backgroundColor: '#dc2626', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                                        onPress={() => handleDeleteSuperAdmin(sa.email)}
                                    >
                                        <FontAwesome name="trash" size={12} color="#fff" />
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {/* Requests Section */}
            {requests.length > 0 && (
                <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>🔔 Solicitudes de App o Web Recientes</Text>
                    <View style={styles.requestsList}>
                        {requests.map((req) => (
                            <View key={req.id} style={[styles.requestRow, req.status === 'completed' && styles.requestRowCompleted]}>
                                <View style={styles.reqBadgeContainer}>
                                    <View style={[
                                        styles.reqBadge, 
                                        req.requestType === 'web' ? { backgroundColor: '#0284c7' } : { backgroundColor: '#10b981' }
                                    ]}>
                                        <FontAwesome name={req.requestType === 'web' ? 'globe' : (req.requestType === 'app' ? 'android' : 'whatsapp')} size={14} color="#fff" />
                                        <Text style={styles.reqBadgeText}>{req.requestType.toUpperCase()}</Text>
                                    </View>
                                </View>

                                <View style={styles.reqDetails}>
                                    <Text style={styles.reqBusinessName}>{req.businessName}</Text>
                                    <Text style={styles.reqBusinessInfo}>Dueño: {req.ownerEmail} • ID: {req.businessId}</Text>
                                    {req.ownerPhone && <Text style={styles.reqBusinessInfo}>Tel/Wsp: {req.ownerPhone}</Text>}
                                    {req.ownerName && <Text style={styles.reqBusinessInfo}>Nombre: {req.ownerName}</Text>}
                                    <Text style={styles.reqDate}>{new Date(req.createdAt).toLocaleString()}</Text>
                                </View>

                                <View style={styles.reqActions}>
                                    <Pressable 
                                        style={[
                                            styles.reqActionBtn, 
                                            req.status === 'completed' ? { backgroundColor: '#475569' } : { backgroundColor: '#10b981' }
                                        ]}
                                        onPress={() => handleUpdateRequestStatus(req.id, req.status)}
                                    >
                                        <FontAwesome name={req.status === 'completed' ? 'undo' : 'check'} size={14} color="#fff" />
                                        <Text style={styles.reqActionBtnText}>
                                            {req.status === 'completed' ? 'Reabrir' : 'Completar'}
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {/* Blocked Attempts Section */}
            {blockedAttempts.length > 0 && (
                <View style={[styles.sectionCard, { borderColor: '#ef4444', borderWidth: 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                        <FontAwesome name="shield" size={20} color="#ef4444" style={{ marginRight: 10 }} />
                        <Text style={[styles.sectionTitle, { color: '#f87171', marginBottom: 0 }]}>
                            Intentos de Registro Bloqueados ({blockedAttempts.length})
                        </Text>
                    </View>
                    <View style={styles.requestsList}>
                        {blockedAttempts.map((att) => (
                            <View key={att.id} style={[styles.requestRow, { backgroundColor: '#1e1b4b', borderLeftColor: '#ef4444', borderLeftWidth: 4 }]}>
                                <View style={styles.reqDetails}>
                                    <Text style={[styles.reqBusinessName, { color: '#fff' }]}>{att.businessName} (usuario: {att.username})</Text>
                                    <Text style={[styles.reqBusinessInfo, { color: '#fca5a5', fontWeight: 'bold' }]}>
                                        Motivo: {att.reason}
                                    </Text>
                                    {att.ip && <Text style={styles.reqBusinessInfo}>IP: {att.ip}</Text>}
                                    <Text style={styles.reqDate}>{new Date(att.createdAt).toLocaleString()}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                    {att.ip && (
                                        <Pressable 
                                            style={{ backgroundColor: '#10b981', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                                            onPress={() => handleUnblockIp(att.ip!, att.id)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>DESBLOQUEAR IP</Text>
                                        </Pressable>
                                    )}
                                    <Pressable 
                                        style={{ backgroundColor: '#475569', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }}
                                        onPress={() => handleDeleteBlockedAttempt(att.id)}
                                    >
                                        <FontAwesome name="trash" size={14} color="#fff" />
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {/* Prospects / Leads Management Section */}
            <View style={[styles.sectionCard, { borderColor: '#10b981', borderWidth: 1 }]}>
                {/* Header Section */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <FontAwesome name="bullhorn" size={20} color="#10b981" />
                        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                            Prospección de Leads y Contactos ({prospects.length})
                        </Text>
                    </View>
                    
                    {/* Botones de acción superior */}
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Pressable 
                            style={{ backgroundColor: '#0284c7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                            onPress={downloadProspectExcelFile}
                        >
                            <FontAwesome name="file-excel-o" size={12} color="#fff" />
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Descargar Plantilla Excel (.xlsx)</Text>
                        </Pressable>

                        <Text style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>Limpieza:</Text>
                        <Pressable 
                            style={{ backgroundColor: '#78350f', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5 }}
                            onPress={() => handleBulkDeleteProspects('contacted')}
                        >
                            <Text style={{ color: '#fef3c7', fontSize: 10, fontWeight: 'bold' }}>Borrar Contactados</Text>
                        </Pressable>
                        <Pressable 
                            style={{ backgroundColor: '#7f1d1d', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5 }}
                            onPress={() => handleBulkDeleteProspects('pending')}
                        >
                            <Text style={{ color: '#fee2e2', fontSize: 10, fontWeight: 'bold' }}>Borrar Pendientes</Text>
                        </Pressable>
                        <Pressable 
                            style={{ backgroundColor: '#450a0a', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5 }}
                            onPress={() => handleBulkDeleteProspects('all')}
                        >
                            <Text style={{ color: '#fca5a5', fontSize: 10, fontWeight: 'bold' }}>Borrar Todos</Text>
                        </Pressable>
                    </View>
                </View>

                {/* TABS: Mis Prospectos | Otros Prospectos | Todos los Prospectos | ⚠️ En Verificación */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 10, marginBottom: 15, flexWrap: 'wrap', gap: 10 }}>
                    {/* Tabs */}
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {/* Tab 1: Mis Prospectos */}
                        <Pressable
                            style={{
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                borderRadius: 8,
                                backgroundColor: prospectsActiveTab === 'mine' ? '#10b981' : '#1e293b',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6
                            }}
                            onPress={() => setProspectsActiveTab('mine')}
                        >
                            <FontAwesome name="user" size={12} color={prospectsActiveTab === 'mine' ? '#000' : '#94a3b8'} />
                            <Text style={{
                                color: prospectsActiveTab === 'mine' ? '#000' : '#94a3b8',
                                fontSize: 12,
                                fontWeight: 'bold'
                            }}>
                                Mis Prospectos ({prospects.filter(p => p.status !== 'needs_verification' && (p.assignedTo?.toLowerCase() === user?.email?.toLowerCase())).length})
                            </Text>
                        </Pressable>

                        {/* Tab 2: Otros Prospectos */}
                        <Pressable
                            style={{
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                borderRadius: 8,
                                backgroundColor: prospectsActiveTab === 'others' ? '#0284c7' : '#1e293b',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6
                            }}
                            onPress={() => setProspectsActiveTab('others')}
                        >
                            <FontAwesome name="users" size={12} color={prospectsActiveTab === 'others' ? '#fff' : '#94a3b8'} />
                            <Text style={{
                                color: prospectsActiveTab === 'others' ? '#fff' : '#94a3b8',
                                fontSize: 12,
                                fontWeight: 'bold'
                            }}>
                                Otros Prospectos ({prospects.filter(p => p.status !== 'needs_verification' && (p.assignedTo?.toLowerCase() !== user?.email?.toLowerCase())).length})
                            </Text>
                        </Pressable>

                        {/* Tab 3: Todos los Prospectos */}
                        <Pressable
                            style={{
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                borderRadius: 8,
                                backgroundColor: prospectsActiveTab === 'all' ? '#6366f1' : '#1e293b',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6
                            }}
                            onPress={() => setProspectsActiveTab('all')}
                        >
                            <FontAwesome name="list" size={12} color={prospectsActiveTab === 'all' ? '#fff' : '#94a3b8'} />
                            <Text style={{
                                color: prospectsActiveTab === 'all' ? '#fff' : '#94a3b8',
                                fontSize: 12,
                                fontWeight: 'bold'
                            }}>
                                Todos los Leads ({prospects.filter(p => p.status !== 'needs_verification').length})
                            </Text>
                        </Pressable>

                        {/* Tab 4: Verificación */}
                        <Pressable
                            style={{
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                borderRadius: 8,
                                backgroundColor: prospectsActiveTab === 'verification' ? '#eab308' : '#1e293b',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                borderWidth: prospects.filter(p => p.status === 'needs_verification').length > 0 ? 1 : 0,
                                borderColor: '#eab308'
                            }}
                            onPress={() => setProspectsActiveTab('verification')}
                        >
                            <FontAwesome name="exclamation-triangle" size={12} color={prospectsActiveTab === 'verification' ? '#000' : '#facc15'} />
                            <Text style={{
                                color: prospectsActiveTab === 'verification' ? '#000' : '#facc15',
                                fontSize: 12,
                                fontWeight: 'bold'
                            }}>
                                ⚠️ En Verificación ({prospects.filter(p => p.status === 'needs_verification').length})
                            </Text>
                        </Pressable>
                    </View>

                    {/* Filtro secundario por Colaborador Asignado */}
                    {prospectsActiveTab === 'all' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ color: '#94a3b8', fontSize: 11 }}>Filtrar por Responsable:</Text>
                            <Pressable
                                style={{
                                    backgroundColor: prospectsCollaboratorFilter === 'all' ? '#3b82f6' : '#1e293b',
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                    borderRadius: 5
                                }}
                                onPress={() => setProspectsCollaboratorFilter('all')}
                            >
                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Todos</Text>
                            </Pressable>
                            {Array.from(new Set(prospects.map(p => p.assignedTo).filter(Boolean))).map((adminEmail) => (
                                <Pressable
                                    key={adminEmail}
                                    style={{
                                        backgroundColor: prospectsCollaboratorFilter === adminEmail ? '#3b82f6' : '#1e293b',
                                        paddingHorizontal: 8,
                                        paddingVertical: 4,
                                        borderRadius: 5
                                    }}
                                    onPress={() => setProspectsCollaboratorFilter(adminEmail!)}
                                >
                                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{adminEmail}</Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
                </View>

                {/* WhatsApp Template Selector Bar (Visible in list tabs) */}
                {prospectsActiveTab !== 'verification' && (
                    <View style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <FontAwesome name="whatsapp" size={18} color="#25D366" />
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Plantilla activa para 1-clic:</Text>
                            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                                {templates.map(tpl => (
                                    <Pressable
                                        key={tpl.id}
                                        style={{
                                            backgroundColor: selectedTemplateId === tpl.id ? '#25D366' : '#334155',
                                            paddingHorizontal: 10,
                                            paddingVertical: 5,
                                            borderRadius: 6
                                        }}
                                        onPress={() => setSelectedTemplateId(tpl.id)}
                                    >
                                        <Text style={{
                                            color: selectedTemplateId === tpl.id ? '#000' : '#cbd5e1',
                                            fontSize: 11,
                                            fontWeight: 'bold'
                                        }}>
                                            {tpl.name}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                        <Pressable
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                            onPress={() => setIsTemplateModalOpen(true)}
                        >
                            <FontAwesome name="gear" size={13} color="#38bdf8" />
                            <Text style={{ color: '#38bdf8', fontSize: 11, fontWeight: 'bold', textDecorationLine: 'underline' }}>
                                Editar / Crear Plantillas
                            </Text>
                        </Pressable>
                    </View>
                )}

                {/* TABS: Mis Prospectos | Otros Prospectos | Todos los Prospectos */}
                {prospectsActiveTab !== 'verification' && (
                    (() => {
                        const filteredProspects = prospects
                            .filter(p => p.status !== 'needs_verification')
                            .filter(p => {
                                const userEmail = user?.email?.toLowerCase().trim() || '';
                                const assigned = (p.assignedTo || '').toLowerCase().trim();
                                if (prospectsActiveTab === 'mine') {
                                    return assigned === userEmail;
                                }
                                if (prospectsActiveTab === 'others') {
                                    return assigned !== userEmail;
                                }
                                // Tab 'all'
                                if (prospectsCollaboratorFilter !== 'all') {
                                    return assigned === prospectsCollaboratorFilter.toLowerCase().trim();
                                }
                                return true;
                            });

                        return filteredProspects.length === 0 ? (
                            <View style={{ padding: 25, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: '#64748b', fontSize: 14 }}>
                                    {prospectsActiveTab === 'mine' 
                                        ? 'No tenés prospectos asignados a tu usuario actualmente.'
                                        : prospectsActiveTab === 'others'
                                            ? 'No hay prospectos asignados a otros colaboradores.'
                                            : 'No tenés prospectos activos en esta vista.'}
                                </Text>
                                <Pressable 
                                    style={{ backgroundColor: '#10b981', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginTop: 10 }}
                                    onPress={() => setIsImportModalOpen(true)}
                                >
                                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>+ Cargar leads desde Google Sheets / Excel</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.horizontalScroll}>
                                <View style={styles.tableContainer}>
                                    <View style={styles.tableHeader}>
                                        <View style={[styles.th, { flex: 2, minWidth: 160 }]}><Text style={styles.thText}>Negocio / Lead</Text></View>
                                        <View style={[styles.th, { flex: 1.5, minWidth: 130 }]}><Text style={styles.thText}>WhatsApp</Text></View>
                                        <View style={[styles.th, { flex: 1.5, minWidth: 140 }]}><Text style={styles.thText}>Responsable Asignado</Text></View>
                                        <View style={[styles.th, { flex: 1.2, minWidth: 100 }]}><Text style={styles.thText}>Tarifa Fijada</Text></View>
                                        <View style={[styles.th, { flex: 1.2, minWidth: 110 }]}><Text style={styles.thText}>Estado</Text></View>
                                        <View style={[styles.th, { flex: 2.2, minWidth: 200, justifyContent: 'center' }]}><Text style={[styles.thText, { textAlign: 'center' }]}>Acciones</Text></View>
                                    </View>

                                    {filteredProspects.map((lead, idx) => {
                                        const isRowCritical = Boolean(lead.isCritical || !lead.phone);
                                        return (
                                        <View 
                                            key={lead.id}
                                            style={[
                                                styles.tableRow,
                                                idx % 2 === 1 && { backgroundColor: '#1e293b' },
                                                isRowCritical && { backgroundColor: '#3b1219', borderLeftWidth: 4, borderLeftColor: '#ef4444' }
                                            ]}
                                        >
                                            <View style={{ flex: 2, minWidth: 160 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                    <Text style={[styles.tdBusinessName, isRowCritical && { color: '#fca5a5' }]}>
                                                        {lead.businessName || lead.name}
                                                    </Text>
                                                    {isRowCritical && (
                                                        <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                                            <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>⚠️ CRÍTICO</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                {lead.contactName && (
                                                    <Text style={{ fontSize: 11, color: '#e2e8f0', fontWeight: '600' }}>👤 {lead.contactName}</Text>
                                                )}
                                                <Text style={styles.tdBusinessId}>slug: {lead.id}</Text>
                                                {lead.criticalReason && (
                                                    <Text style={{ fontSize: 10, color: '#f87171', fontWeight: 'bold', marginTop: 2 }}>
                                                        Motivo: {lead.criticalReason}
                                                    </Text>
                                                )}
                                                {(lead.zone || lead.province) && (
                                                    <Text style={{ fontSize: 10, color: '#38bdf8', marginTop: 2 }}>
                                                        📍 {[lead.zone, lead.province, lead.country].filter(Boolean).join(', ')}
                                                    </Text>
                                                )}
                                                {lead.instagram && (
                                                    <Text style={{ fontSize: 10, color: '#e1306c', marginTop: 2 }}>
                                                        📷 {lead.instagram}
                                                    </Text>
                                                )}
                                                {lead.website && (
                                                    <Text style={{ fontSize: 10, color: '#38bdf8', marginTop: 1 }}>
                                                        🌐 {lead.website}
                                                    </Text>
                                                )}
                                                {lead.notes && <Text style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>📝 {lead.notes}</Text>}
                                            </View>
                                            <View style={{ flex: 1.5, minWidth: 130 }}>
                                                <Text style={{ color: isRowCritical && !lead.phone ? '#ef4444' : '#fff', fontSize: 13, fontWeight: '600' }}>
                                                    {lead.phone ? `+${lead.phone}` : '⚠️ Sin teléfono'}
                                                </Text>
                                                {lead.email && <Text style={{ fontSize: 10, color: '#94a3b8' }}>{lead.email}</Text>}
                                            </View>
                                            <View style={{ flex: 1.5, minWidth: 140 }}>
                                                {lead.assignedTo ? (
                                                    <View style={{ backgroundColor: '#1e3a8a', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' }}>
                                                        <Text style={{ color: '#93c5fd', fontSize: 11, fontWeight: 'bold' }}>👤 {lead.assignedTo}</Text>
                                                    </View>
                                                ) : (
                                                    <Text style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>Sin asignar</Text>
                                                )}
                                            </View>
                                            <View style={{ flex: 1.2, minWidth: 100 }}>
                                                <Text style={{ color: '#38bdf8', fontSize: 13, fontWeight: 'bold' }}>
                                                    ${(lead.planPrice || 9000).toLocaleString()}/m
                                                </Text>
                                                <Text style={{ fontSize: 9, color: '#64748b' }}>código: {lead.priceCode}</Text>
                                            </View>
                                            <View style={{ flex: 1.2, minWidth: 110 }}>
                                                <View style={{
                                                    backgroundColor: lead.status === 'contacted' ? '#065f46' : '#78350f',
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 3,
                                                    borderRadius: 4,
                                                    alignSelf: 'flex-start'
                                                }}>
                                                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                                                        {lead.status === 'contacted' ? '✓ Contactado' : 'Pendiente'}
                                                    </Text>
                                                </View>
                                                {lead.lastContactedAt && (
                                                    <Text style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                                                        {new Date(lead.lastContactedAt).toLocaleDateString()}
                                                    </Text>
                                                )}
                                            </View>
                                            <View style={{ flex: 2.2, minWidth: 200, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                                                <Pressable
                                                    style={{
                                                        backgroundColor: lead.phone ? '#25D366' : '#64748b',
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 6,
                                                        borderRadius: 6,
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        gap: 5,
                                                        opacity: lead.phone ? 1 : 0.6
                                                    }}
                                                    disabled={!lead.phone}
                                                    onPress={() => handleSendWhatsAppLead(lead)}
                                                >
                                                    <FontAwesome name="whatsapp" size={13} color="#000" />
                                                    <Text style={{ color: '#000', fontSize: 11, fontWeight: 'bold' }}>
                                                        {lead.phone ? 'WhatsApp' : 'Sin Tel'}
                                                    </Text>
                                                </Pressable>
                                                <Pressable
                                                    style={{ backgroundColor: '#0284c7', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }}
                                                    onPress={() => {
                                                        setEditingLead({ ...lead });
                                                        setIsEditLeadModalOpen(true);
                                                    }}
                                                >
                                                    <FontAwesome name="pencil" size={12} color="#fff" />
                                                </Pressable>
                                                <Pressable
                                                    style={{ backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 }}
                                                    onPress={async () => {
                                                        if (Platform.OS === 'web' && !confirm(`¿Eliminar al prospecto "${lead.businessName || lead.name}"?`)) return;
                                                        await deleteDoc(doc(db, 'prospect_leads', lead.id));
                                                        setProspects(prev => prev.filter(p => p.id !== lead.id));
                                                    }}
                                                >
                                                    <FontAwesome name="trash" size={12} color="#f87171" />
                                                </Pressable>
                                            </View>
                                        </View>
                                        );
                                    })}
                                </View>
                            </ScrollView>
                        );
                    })()
                )}

                {/* TAB 2: Verificación de Duplicados / Contraste Humano */}
                {prospectsActiveTab === 'verification' && (
                    <View>
                        {prospects.filter(p => p.status === 'needs_verification').length === 0 ? (
                            <View style={{ padding: 30, alignItems: 'center' }}>
                                <FontAwesome name="check-circle" size={32} color="#10b981" style={{ marginBottom: 8 }} />
                                <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold' }}>¡Excelente! No hay comercios pendientes de verificación.</Text>
                                <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Todos los prospectos y números están confirmados y libres de duplicados.</Text>
                            </View>
                        ) : (
                            <View style={{ gap: 12 }}>
                                <Text style={{ color: '#facc15', fontSize: 12, marginBottom: 5 }}>
                                    🔍 Los siguientes negocios fueron identificados con posibles coincidencias (mismo nombre cargado por otro colaborador con/sin teléfono, o registrado previamente). Contrastá los datos y decidí qué hacer:
                                </Text>

                                {prospects.filter(p => p.status === 'needs_verification').map((lead) => {
                                    // Buscar con quién colisionó
                                    const match = prospects.find(p => p.id === lead.matchedWithId) || businesses.find(b => b.id === lead.matchedWithId);
                                    return (
                                        <View key={lead.id} style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#eab308', borderRadius: 10, padding: 14 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                                                {/* Prospecto Nuevo */}
                                                <View style={{ flex: 1, minWidth: 240, backgroundColor: '#0f172a', padding: 12, borderRadius: 8 }}>
                                                    <Text style={{ color: '#facc15', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>📌 PROSPECTO NUEVO EN REVISIÓN</Text>
                                                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>{lead.name}</Text>
                                                    <Text style={{ color: '#94a3b8', fontSize: 11 }}>WhatsApp: {lead.phone ? `+${lead.phone}` : '⚠️ SIN TELÉFONO'}</Text>
                                                    {lead.assignedTo && <Text style={{ color: '#93c5fd', fontSize: 11 }}>Cargado por / Asignado a: {lead.assignedTo}</Text>}
                                                    {lead.notes && <Text style={{ color: '#cbd5e1', fontSize: 11, marginTop: 4 }}>Notas: {lead.notes}</Text>}
                                                    <Text style={{ color: '#f87171', fontSize: 10, marginTop: 6, fontWeight: 'bold' }}>Motivo: {lead.verificationReason}</Text>
                                                </View>

                                                <View style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 10 }}>
                                                    <FontAwesome name="exchange" size={18} color="#eab308" />
                                                    <Text style={{ color: '#eab308', fontSize: 10, fontWeight: 'bold', marginTop: 4 }}>CONTRASTAR</Text>
                                                </View>

                                                {/* Comercio o Prospecto Existente con el que colisiona */}
                                                <View style={{ flex: 1, minWidth: 240, backgroundColor: '#0f172a', padding: 12, borderRadius: 8 }}>
                                                    <Text style={{ color: '#38bdf8', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>🏢 COMERCIO O LEAD YA EXISTENTE</Text>
                                                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>{match ? match.name : lead.matchedWithId}</Text>
                                                    <Text style={{ color: '#94a3b8', fontSize: 11 }}>
                                                        {match && 'phone' in match ? (match.phone ? `+${match.phone}` : '⚠️ Sin teléfono') : (match ? 'Comercio activo en app' : 'Ya registrado')}
                                                    </Text>
                                                    {match && 'assignedTo' in match && match.assignedTo && (
                                                        <Text style={{ color: '#93c5fd', fontSize: 11 }}>Asignado a: {match.assignedTo}</Text>
                                                    )}
                                                </View>
                                            </View>

                                            {/* Botones de decisión humana */}
                                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                                                <Pressable
                                                    style={{ backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                                    onPress={() => handleResolveVerification(lead.id, 'keep_separate')}
                                                >
                                                    <FontAwesome name="check" size={12} color="#000" />
                                                    <Text style={{ color: '#000', fontSize: 11, fontWeight: 'bold' }}>
                                                        Son distintos comercios (Aprobar ambos)
                                                    </Text>
                                                </Pressable>

                                                <Pressable
                                                    style={{ backgroundColor: '#0284c7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                                    onPress={() => handleResolveVerification(lead.id, 'merge_into_existing')}
                                                >
                                                    <FontAwesome name="compress" size={12} color="#fff" />
                                                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                                                        Es el mismo (Fusionar datos)
                                                    </Text>
                                                </Pressable>

                                                <Pressable
                                                    style={{ backgroundColor: '#dc2626', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                                    onPress={() => handleResolveVerification(lead.id, 'discard')}
                                                >
                                                    <FontAwesome name="trash" size={12} color="#fff" />
                                                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                                                        Descartar duplicado
                                                    </Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                )}
            </View>

            {/* Businesses Table */}
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>🏢 Comercios Registrados</Text>
                <Text style={styles.sectionSubtitle}>Hacé clic en cualquier fila para ver el desglose completo del comercio.</Text>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.horizontalScroll}>
                    <View style={styles.tableContainer}>
                        {/* Header */}
                        <View style={styles.tableHeader}>
                            <Pressable style={[styles.th, { flex: 2, minWidth: 160 }]} onPress={() => handleSort('name')}>
                                <Text style={styles.thText}>Negocio</Text>
                                {sortBy === 'name' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 2, minWidth: 160 }]} onPress={() => handleSort('email')}>
                                <Text style={styles.thText}>Email dueño</Text>
                                {sortBy === 'email' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 1, minWidth: 80, justifyContent: 'center' }]} onPress={() => handleSort('branchesCount')}>
                                <Text style={[styles.thText, { textAlign: 'center' }]}>Sucursales</Text>
                                {sortBy === 'branchesCount' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 1, minWidth: 80, justifyContent: 'center' }]} onPress={() => handleSort('clientsCount')}>
                                <Text style={[styles.thText, { textAlign: 'center' }]}>Clientes</Text>
                                {sortBy === 'clientsCount' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 1, minWidth: 80, justifyContent: 'center' }]} onPress={() => handleSort('ordersCount')}>
                                <Text style={[styles.thText, { textAlign: 'center' }]}>Pedidos</Text>
                                {sortBy === 'ordersCount' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 1.2, minWidth: 90, justifyContent: 'flex-end' }]} onPress={() => handleSort('totalSales')}>
                                <Text style={[styles.thText, { textAlign: 'right' }]}>Ventas</Text>
                                {sortBy === 'totalSales' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <Pressable style={[styles.th, { flex: 1, minWidth: 80, justifyContent: 'center' }]} onPress={() => handleSort('productsCount')}>
                                <Text style={[styles.thText, { textAlign: 'center' }]}>Productos</Text>
                                {sortBy === 'productsCount' && (
                                    <FontAwesome name={sortOrder === 'asc' ? 'sort-up' : 'sort-down'} size={12} color="#94a3b8" style={{ marginLeft: 5 }} />
                                )}
                            </Pressable>
                            <View style={[styles.th, { flex: 1, minWidth: 80, justifyContent: 'center' }]}>
                                <Text style={[styles.thText, { textAlign: 'center' }]}>Estado</Text>
                            </View>
                        </View>

                        {/* Rows */}
                        {sortedBusinesses.length === 0 ? (
                            <View style={styles.emptyTable}>
                                <Text style={styles.emptyTableText}>No hay negocios registrados.</Text>
                            </View>
                        ) : (
                            sortedBusinesses.map((b, index) => (
                                <View 
                                    key={b.id} 
                                    style={[
                                        styles.tableRow, 
                                        index % 2 === 1 && { backgroundColor: '#1e293b' }
                                    ]}
                                >
                                    <View style={{ flex: 2, minWidth: 160 }}>
                                        <Text style={styles.tdBusinessName}>{b.name}</Text>
                                        <Text style={styles.tdBusinessId}>slug: {b.id}</Text>
                                        {b.status === 'trial' ? (
                                            <View style={{ marginTop: 4 }}>
                                                {b.trialExpiresAt && new Date(b.trialExpiresAt).getTime() > Date.now() ? (
                                                    <Text style={{ fontSize: 10, color: '#f59e0b', fontWeight: 'bold' }}>
                                                        ⏳ Prueba (vence: {new Date(b.trialExpiresAt).toLocaleDateString()})
                                                    </Text>
                                                ) : (
                                                    <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: 'bold' }}>
                                                        ⚠️ Prueba Vencida
                                                    </Text>
                                                )}
                                            </View>
                                        ) : (
                                            <Text style={{ fontSize: 10, color: '#10b981', fontWeight: 'bold', marginTop: 4 }}>
                                                ⭐ Activo Permanente
                                            </Text>
                                        )}
                                        <Pressable 
                                            style={{ marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                            onPress={() => handleUpdatePlanPrice(b.id, b.name, b.planPrice)}
                                        >
                                            <FontAwesome name="tag" size={10} color="#38bdf8" />
                                            <Text style={{ fontSize: 11, color: '#38bdf8', fontWeight: 'bold', textDecorationLine: 'underline' }}>
                                                Tarifa: ${(b.planPrice || 9000).toLocaleString()}/mes (editar)
                                            </Text>
                                        </Pressable>
                                    </View>
                                    <Text style={[styles.tdText, { flex: 2, minWidth: 160, color: '#94a3b8' }]}>{b.email}</Text>
                                    <Text style={[styles.tdText, { flex: 1, minWidth: 80, textAlign: 'center' }]}>{b.branchesCount}</Text>
                                    <Text style={[styles.tdText, { flex: 1, minWidth: 80, textAlign: 'center' }]}>{b.clientsCount}</Text>
                                    <Text style={[styles.tdText, { flex: 1, minWidth: 80, textAlign: 'center' }]}>{b.ordersCount}</Text>
                                    <Text style={[styles.tdText, { flex: 1.2, minWidth: 90, textAlign: 'right', fontWeight: 'bold', color: '#10b981' }]}>
                                        ${b.totalSales.toLocaleString()}
                                    </Text>
                                    <Text style={[styles.tdText, { flex: 1, minWidth: 80, textAlign: 'center' }]}>{b.productsCount}</Text>
                                    
                                    <View style={{ flex: 2, minWidth: 260, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 5 }}>
                                        <Pressable 
                                            style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, backgroundColor: '#f59e0b' }}
                                            onPress={() => handleExtendTrial(b.id, 7, b.name)}
                                        >
                                            <Text style={{ color: '#000', fontSize: 10, fontWeight: 'bold' }}>+7 DÍAS</Text>
                                        </Pressable>
                                        <Pressable 
                                            style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, backgroundColor: '#0284c7' }}
                                            onPress={() => handleExtendTrial(b.id, 30, b.name)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>+30 DÍAS</Text>
                                        </Pressable>
                                        <Pressable 
                                            style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, backgroundColor: '#10b981' }}
                                            onPress={() => handleActivatePermanent(b.id, b.name)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>PERMANENTE</Text>
                                        </Pressable>
                                        <Pressable 
                                            style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, backgroundColor: '#8b5cf6' }}
                                            onPress={() => router.push({ pathname: '/(admin)/business/[id]', params: { id: b.id } } as any)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>VER</Text>
                                        </Pressable>
                                        <Pressable 
                                            style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, backgroundColor: b.isActive ? '#ef4444' : '#64748b' }}
                                            onPress={() => handleToggleBusinessStatus(b.id, b.isActive, b.name)}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{b.isActive ? 'SUSPENDER' : 'HABILITAR'}</Text>
                                        </Pressable>
                                    </View>

                                </View>
                            ))
                        )}
                    </View>
                </ScrollView>
            </View>

            {/* Modal de Carga Masiva (Ctrl+V) */}
            <Modal
                visible={isImportModalOpen}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setIsImportModalOpen(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 16
                }}>
                    <View style={{
                        width: '100%',
                        maxWidth: 750,
                        backgroundColor: '#1e293b',
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: '#334155',
                        maxHeight: '90%',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        {/* Header modal */}
                        <View style={{
                            padding: 16,
                            borderBottomWidth: 1,
                            borderBottomColor: '#334155',
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <FontAwesome name="clipboard" size={20} color="#10b981" />
                                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                                    Carga Masiva desde Google Sheets / Excel
                                </Text>
                            </View>
                            <Pressable onPress={() => setIsImportModalOpen(false)} style={{ padding: 6 }}>
                                <FontAwesome name="times" size={18} color="#94a3b8" />
                            </Pressable>
                        </View>

                        {/* Contenido scrolleable */}
                        <ScrollView style={{ padding: 16 }}>
                            {/* Opción 1: Conectar por link directo de Google Sheets */}
                            <View style={{ backgroundColor: '#0f172a', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#334155', marginBottom: 15 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                    <FontAwesome name="link" size={14} color="#38bdf8" />
                                    <Text style={{ color: '#38bdf8', fontSize: 13, fontWeight: 'bold' }}>Opción 1: Conectar por Link de Google Sheets</Text>
                                </View>
                                <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8, lineHeight: 16 }}>
                                    Pegá el enlace de tu planilla de Google Sheets (asegurate de que tenga acceso de lectura público o con enlace).
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                    <TextInput
                                        style={{
                                            flex: 1,
                                            backgroundColor: '#1e293b',
                                            color: '#fff',
                                            borderWidth: 1,
                                            borderColor: '#475569',
                                            borderRadius: 6,
                                            paddingHorizontal: 10,
                                            paddingVertical: 7,
                                            fontSize: 12
                                        }}
                                        placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                                        placeholderTextColor="#64748b"
                                        value={sheetsUrlInput}
                                        onChangeText={setSheetsUrlInput}
                                        autoCapitalize="none"
                                    />
                                    <Pressable
                                        style={{
                                            backgroundColor: '#0284c7',
                                            paddingHorizontal: 14,
                                            paddingVertical: 8,
                                            borderRadius: 6,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 6
                                        }}
                                        disabled={isLoadingSheets}
                                        onPress={handleFetchGoogleSheetsUrl}
                                    >
                                        {isLoadingSheets ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <FontAwesome name="download" size={12} color="#fff" />
                                        )}
                                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                                            {isLoadingSheets ? 'Cargando...' : 'Cargar Hoja'}
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>

                            {/* Opción 2: Copiar y pegar directo (Ctrl+C / Ctrl+V) */}
                            <View style={{ backgroundColor: '#0f172a', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#334155', marginBottom: 15 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                    <FontAwesome name="clipboard" size={14} color="#10b981" />
                                    <Text style={{ color: '#10b981', fontSize: 13, fontWeight: 'bold' }}>Opción 2: Copiar y Pegar directo (Ctrl+C / Ctrl+V)</Text>
                                </View>
                                <Text style={{ color: '#cbd5e1', fontSize: 12, marginBottom: 8, lineHeight: 18 }}>
                                    Seleccioná tus filas en Google Sheets o Excel, hacé <Text style={{ fontWeight: 'bold', color: '#38bdf8' }}>Ctrl+C</Text> y pegalas acá abajo con <Text style={{ fontWeight: 'bold', color: '#38bdf8' }}>Ctrl+V</Text>.
                                </Text>

                                {/* Mini tabla guía con las 11 columnas */}
                                <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4, fontWeight: 'bold' }}>Orden oficial de columnas detectadas:</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                                    <View style={{ flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 6, borderWidth: 1, borderColor: '#475569', overflow: 'hidden' }}>
                                        {['0: Nombre Negocio', '1: Nombre', '2: Whatsapp', '3: Tarifa', '4: Email', '5: Instagram', '6: Web', '7: Provincia', '8: Zona', '9: Dirección', '10: País'].map((h, i) => (
                                            <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRightWidth: i < 10 ? 1 : 0, borderRightColor: '#334155', backgroundColor: i === 2 ? '#1e3a8a' : 'transparent' }}>
                                                <Text style={{ color: i === 2 ? '#93c5fd' : '#cbd5e1', fontSize: 10, fontWeight: 'bold' }}>{h}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>

                                <TextInput
                                    style={{
                                        backgroundColor: '#1e293b',
                                        color: '#fff',
                                        borderWidth: 1,
                                        borderColor: '#475569',
                                        borderRadius: 8,
                                        padding: 12,
                                        fontSize: 12,
                                        height: 120,
                                        textAlignVertical: 'top',
                                        fontFamily: Platform.OS === 'web' ? 'monospace' : undefined
                                    }}
                                    placeholder="Pegá acá las filas copiadas (ej: Carnicería Don Juan [Tab] Juan [Tab] 1123456789...)"
                                    placeholderTextColor="#64748b"
                                    multiline={true}
                                    value={pasteRawText}
                                    onChangeText={handleParsePastedData}
                                />
                            </View>

                            {/* Asignar colaborador por defecto para los que no tengan en el excel */}
                            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <Text style={{ color: '#cbd5e1', fontSize: 12 }}>Asignar por defecto a:</Text>
                                <TextInput
                                    style={{
                                        backgroundColor: '#0f172a',
                                        color: '#fff',
                                        borderWidth: 1,
                                        borderColor: '#475569',
                                        borderRadius: 6,
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        fontSize: 12,
                                        minWidth: 220
                                    }}
                                    placeholder="Email de colaborador (opcional)"
                                    placeholderTextColor="#64748b"
                                    value={importDefaultAssignedTo}
                                    onChangeText={(txt) => {
                                        setImportDefaultAssignedTo(txt);
                                        if (pasteRawText) handleParsePastedData(pasteRawText);
                                    }}
                                    autoCapitalize="none"
                                />
                            </View>

                            {/* Resumen de Parseo */}
                            {pasteRawText.trim().length > 0 && (
                                <View style={{ marginTop: 15 }}>
                                    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                                        <View style={{ backgroundColor: '#064e3b', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
                                            <Text style={{ color: '#6ee7b7', fontSize: 11, fontWeight: 'bold' }}>
                                                🟢 Nuevos a crear: {parsedPreview.newLeads.filter(l => l.status !== 'needs_verification').length}
                                            </Text>
                                        </View>
                                        <View style={{ backgroundColor: '#713f12', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
                                            <Text style={{ color: '#fde047', fontSize: 11, fontWeight: 'bold' }}>
                                                ⚠️ A verificación (nombre similar): {parsedPreview.suspiciousLeads.length}
                                            </Text>
                                        </View>
                                        <View style={{ backgroundColor: '#78350f', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
                                            <Text style={{ color: '#fcd34d', fontSize: 11, fontWeight: 'bold' }}>
                                                🟡 Ya existentes (por WhatsApp): {parsedPreview.duplicateLeads.length}
                                            </Text>
                                        </View>
                                        <View style={{ backgroundColor: '#7f1d1d', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
                                            <Text style={{ color: '#fca5a5', fontSize: 11, fontWeight: 'bold' }}>
                                                🔴 Incompletos: {parsedPreview.invalidRows.length}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Preview de Sospechosos / En etapas */}
                                    {parsedPreview.suspiciousLeads.length > 0 && (
                                        <View style={{ marginBottom: 15, backgroundColor: '#292212', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#eab308' }}>
                                            <Text style={{ color: '#facc15', fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>
                                                ⚠️ Detección en etapas (nombre similar o sin tel): Se guardarán en el Tab "En Verificación"
                                            </Text>
                                            {parsedPreview.suspiciousLeads.slice(0, 3).map((s, i) => (
                                                <Text key={i} style={{ color: '#fef08a', fontSize: 11, marginVertical: 1 }}>
                                                    • "{s.lead.name}": {s.reason}
                                                </Text>
                                            ))}
                                        </View>
                                    )}

                                    {/* Preview de Nuevos */}
                                    {parsedPreview.newLeads.length > 0 && (
                                        <View style={{ marginBottom: 15, backgroundColor: '#0f172a', padding: 10, borderRadius: 8 }}>
                                            <Text style={{ color: '#6ee7b7', fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>
                                                Comercios listos para crear ({parsedPreview.newLeads.length}):
                                            </Text>
                                            {parsedPreview.newLeads.slice(0, 5).map((l, i) => (
                                                <Text key={i} style={{ color: '#cbd5e1', fontSize: 11, marginVertical: 1 }}>
                                                    • <Text style={{ fontWeight: 'bold', color: '#fff' }}>{l.name}</Text> (WhatsApp: +{l.phone} - Tarifa: ${l.planPrice.toLocaleString()}/mes)
                                                </Text>
                                            ))}
                                            {parsedPreview.newLeads.length > 5 && (
                                                <Text style={{ color: '#94a3b8', fontSize: 10, fontStyle: 'italic', marginTop: 4 }}>
                                                    ...y {parsedPreview.newLeads.length - 5} más.
                                                </Text>
                                            )}
                                        </View>
                                    )}

                                    {/* Preview de Duplicados detectados */}
                                    {parsedPreview.duplicateLeads.length > 0 && (
                                        <View style={{ marginBottom: 15, backgroundColor: '#292212', padding: 10, borderRadius: 8 }}>
                                            <Text style={{ color: '#fcd34d', fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>
                                                Coincidentes detectados (no se duplicarán):
                                            </Text>
                                            {parsedPreview.duplicateLeads.slice(0, 3).map((d, i) => (
                                                <Text key={i} style={{ color: '#fef08a', fontSize: 11, marginVertical: 1 }}>
                                                    ⚠️ {d.lead.name}: {d.reason}
                                                </Text>
                                            ))}
                                        </View>
                                    )}

                                    {/* Incompletos: Preguntar si los quiere añadir igualmente */}
                                    {parsedPreview.invalidRows.length > 0 && (
                                        <View style={{ marginBottom: 15, backgroundColor: '#2d1519', padding: 12, borderRadius: 8, borderColor: '#dc2626', borderWidth: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                <FontAwesome name="exclamation-circle" size={16} color="#ef4444" />
                                                <Text style={{ color: '#fca5a5', fontSize: 13, fontWeight: 'bold' }}>
                                                    Hay {parsedPreview.invalidRows.length} fila(s) incompleta(s) / con advertencias:
                                                </Text>
                                            </View>
                                            {parsedPreview.invalidRows.slice(0, 5).map((inv, i) => (
                                                <View key={i} style={{ backgroundColor: '#1f1013', padding: 8, borderRadius: 6, marginVertical: 3, borderWidth: 1, borderColor: '#7f1d1d' }}>
                                                    <Text style={{ color: '#fecaca', fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                                                        📄 {inv.raw}
                                                    </Text>
                                                    <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <View style={{ backgroundColor: '#dc2626', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 }}>
                                                            <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>MOTIVO CRÍTICO</Text>
                                                        </View>
                                                        <Text style={{ color: '#f87171', fontSize: 11, fontWeight: 'bold' }}>
                                                            {inv.reason}
                                                        </Text>
                                                    </View>
                                                </View>
                                            ))}
                                            
                                            <Pressable
                                                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8, backgroundColor: '#3b1219', padding: 8, borderRadius: 6 }}
                                                onPress={() => setIncludeIncompleteLeads(!includeIncompleteLeads)}
                                            >
                                                <FontAwesome 
                                                    name={includeIncompleteLeads ? "check-square" : "square-o"} 
                                                    size={18} 
                                                    color="#f87171" 
                                                />
                                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                                                    Añadirlos igualmente como borradores para editar después (se resaltarán en rojo como críticos en el dashboard)
                                                </Text>
                                            </Pressable>
                                        </View>
                                    )}
                                </View>
                            )}
                        </ScrollView>

                        {/* Footer modal */}
                        <View style={{
                            padding: 16,
                            borderTopWidth: 1,
                            borderTopColor: '#334155',
                            flexDirection: 'row',
                            justifyContent: 'flex-end',
                            gap: 10
                        }}>
                            <Pressable 
                                style={{ paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, backgroundColor: '#334155' }}
                                onPress={() => setIsImportModalOpen(false)}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Cancelar</Text>
                            </Pressable>
                            {(() => {
                                const totalToImport = parsedPreview.newLeads.length + (includeIncompleteLeads ? parsedPreview.invalidRows.length : 0);
                                const canImport = totalToImport > 0 && !isImporting;
                                return (
                                    <Pressable
                                        style={{
                                            paddingHorizontal: 20,
                                            paddingVertical: 10,
                                            borderRadius: 8,
                                            backgroundColor: canImport ? '#10b981' : '#64748b',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 8
                                        }}
                                        disabled={!canImport}
                                        onPress={handleCommitImport}
                                    >
                                        {isImporting ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <FontAwesome name="check" size={14} color="#fff" />
                                        )}
                                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                                            Confirmar e Importar {totalToImport} Leads
                                        </Text>
                                    </Pressable>
                                );
                            })()}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal de Gestor de Plantillas de WhatsApp */}
            <Modal
                visible={isTemplateModalOpen}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setIsTemplateModalOpen(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 16
                }}>
                    <View style={{
                        width: '100%',
                        maxWidth: 750,
                        backgroundColor: '#1e293b',
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: '#334155',
                        maxHeight: '90%',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <View style={{
                            padding: 16,
                            borderBottomWidth: 1,
                            borderBottomColor: '#334155',
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <FontAwesome name="whatsapp" size={20} color="#25D366" />
                                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                                    Editor de Plantillas de WhatsApp
                                </Text>
                            </View>
                            <Pressable onPress={() => setIsTemplateModalOpen(false)} style={{ padding: 6 }}>
                                <FontAwesome name="times" size={18} color="#94a3b8" />
                            </Pressable>
                        </View>

                        <ScrollView style={{ padding: 16 }}>
                            {/* Lista de plantillas actuales */}
                            <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 'bold', marginBottom: 10 }}>
                                Plantillas Disponibles:
                            </Text>

                            <View style={{ gap: 10, marginBottom: 20 }}>
                                {templates.map(t => (
                                    <View key={t.id} style={{ backgroundColor: '#0f172a', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155' }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <Text style={{ color: '#38bdf8', fontSize: 13, fontWeight: 'bold' }}>{t.name}</Text>
                                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                                <Pressable
                                                    style={{ backgroundColor: '#0284c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}
                                                    onPress={() => setEditingTemplate({ id: t.id, name: t.name, text: t.text })}
                                                >
                                                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>Editar</Text>
                                                </Pressable>
                                                <Pressable
                                                    style={{ backgroundColor: '#dc2626', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}
                                                    onPress={() => handleDeleteTemplate(t.id)}
                                                >
                                                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>Borrar</Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                        <Text style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 16 }}>{t.text}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Formulario de Crear / Editar */}
                            <View style={{ backgroundColor: '#0f172a', padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#475569' }}>
                                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>
                                    {editingTemplate.id ? '✏️ Modificar Plantilla' : '➕ Crear Nueva Plantilla'}
                                </Text>

                                <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Nombre identificador:</Text>
                                <TextInput
                                    style={{
                                        backgroundColor: '#1e293b',
                                        color: '#fff',
                                        borderWidth: 1,
                                        borderColor: '#334155',
                                        borderRadius: 6,
                                        padding: 8,
                                        fontSize: 13,
                                        marginBottom: 12
                                    }}
                                    placeholder="Ej: Promo Fin de Año"
                                    placeholderTextColor="#64748b"
                                    value={editingTemplate.name}
                                    onChangeText={(name) => setEditingTemplate(prev => ({ ...prev, name }))}
                                />

                                <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Mensaje (con variables dinámicas):</Text>
                                <TextInput
                                    style={{
                                        backgroundColor: '#1e293b',
                                        color: '#fff',
                                        borderWidth: 1,
                                        borderColor: '#334155',
                                        borderRadius: 6,
                                        padding: 10,
                                        fontSize: 12,
                                        height: 100,
                                        textAlignVertical: 'top'
                                    }}
                                    placeholder="Escribí el mensaje usando [nombre], [precio], [link], [dias]..."
                                    placeholderTextColor="#64748b"
                                    multiline={true}
                                    value={editingTemplate.text}
                                    onChangeText={(text) => setEditingTemplate(prev => ({ ...prev, text }))}
                                />

                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                    <Text style={{ color: '#64748b', fontSize: 10 }}>Variables dinámicas:</Text>
                                    <Text style={{ color: '#38bdf8', fontSize: 10, fontWeight: 'bold' }}>[nombre]</Text>
                                    <Text style={{ color: '#38bdf8', fontSize: 10, fontWeight: 'bold' }}>[precio]</Text>
                                    <Text style={{ color: '#38bdf8', fontSize: 10, fontWeight: 'bold' }}>[link]</Text>
                                    <Text style={{ color: '#38bdf8', fontSize: 10, fontWeight: 'bold' }}>[dias]</Text>
                                </View>

                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 15 }}>
                                    {editingTemplate.id && (
                                        <Pressable
                                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: '#334155' }}
                                            onPress={() => setEditingTemplate({ name: '', text: '' })}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Cancelar Edición</Text>
                                        </Pressable>
                                    )}
                                    <Pressable
                                        style={{ paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6, backgroundColor: '#25D366' }}
                                        onPress={handleSaveTemplate}
                                    >
                                        <Text style={{ color: '#000', fontSize: 11, fontWeight: 'bold' }}>Guardar Plantilla</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Modal de Edición Manual de Lead */}
            <Modal
                visible={isEditLeadModalOpen}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setIsEditLeadModalOpen(false)}
            >
                <View style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 16
                }}>
                    <View style={{
                        width: '100%',
                        maxWidth: 550,
                        backgroundColor: '#1e293b',
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: '#334155',
                        padding: 16
                    }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 10 }}>
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>✏️ Modificar Prospecto / Lead</Text>
                            <Pressable onPress={() => setIsEditLeadModalOpen(false)}>
                                <FontAwesome name="times" size={16} color="#94a3b8" />
                            </Pressable>
                        </View>

                        {editingLead && (
                            <View style={{ gap: 10 }}>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <View style={{ flex: 1.2 }}>
                                        <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Nombre Negocio:</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                            value={editingLead.businessName || editingLead.name}
                                            onChangeText={(txt) => setEditingLead({ ...editingLead, businessName: txt, name: txt })}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Nombre Persona / Contacto:</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                            placeholder="ej: Juan Pérez"
                                            placeholderTextColor="#64748b"
                                            value={editingLead.contactName || ''}
                                            onChangeText={(contactName) => setEditingLead({ ...editingLead, contactName })}
                                        />
                                    </View>
                                </View>

                                <View>
                                    <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Número de WhatsApp (con cód. país, ej: 54911...):</Text>
                                    <TextInput
                                        style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                        value={editingLead.phone}
                                        onChangeText={(phone) => setEditingLead({ ...editingLead, phone })}
                                        keyboardType="phone-pad"
                                    />
                                </View>

                                <View>
                                    <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Colaborador / Responsable Asignado:</Text>
                                    <TextInput
                                        style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                        placeholder="ej: colaborador@gmail.com"
                                        placeholderTextColor="#64748b"
                                        value={editingLead.assignedTo || ''}
                                        onChangeText={(assignedTo) => setEditingLead({ ...editingLead, assignedTo })}
                                        autoCapitalize="none"
                                    />
                                </View>

                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Instagram (ej: @negocio):</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                            placeholder="@instagram"
                                            placeholderTextColor="#64748b"
                                            value={editingLead.instagram || ''}
                                            onChangeText={(instagram) => setEditingLead({ ...editingLead, instagram })}
                                            autoCapitalize="none"
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Página Web (ej: www.negocio.com):</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                            placeholder="www.sitio.com"
                                            placeholderTextColor="#64748b"
                                            value={editingLead.website || ''}
                                            onChangeText={(website) => setEditingLead({ ...editingLead, website })}
                                            autoCapitalize="none"
                                        />
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Tarifa Fijada ($):</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                            value={(editingLead.planPrice || 9000).toString()}
                                            onChangeText={(p) => setEditingLead({ ...editingLead, planPrice: parseInt(p.replace(/[^0-9]/g, ''), 10) || 0 })}
                                            keyboardType="numeric"
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Email Dueño (opcional):</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                            value={editingLead.email || ''}
                                            onChangeText={(email) => setEditingLead({ ...editingLead, email })}
                                            autoCapitalize="none"
                                        />
                                    </View>
                                </View>

                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Provincia:</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                            value={editingLead.province || ''}
                                            onChangeText={(province) => setEditingLead({ ...editingLead, province })}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Zona / Localidad:</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                            value={editingLead.zone || ''}
                                            onChangeText={(zone) => setEditingLead({ ...editingLead, zone })}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>País:</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                            value={editingLead.country || ''}
                                            onChangeText={(country) => setEditingLead({ ...editingLead, country })}
                                        />
                                    </View>
                                </View>

                                <View>
                                    <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Dirección:</Text>
                                    <TextInput
                                        style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 13 }}
                                        value={editingLead.address || ''}
                                        onChangeText={(address) => setEditingLead({ ...editingLead, address })}
                                    />
                                </View>

                                <View>
                                    <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>Notas internas:</Text>
                                    <TextInput
                                        style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#475569', padding: 8, fontSize: 12, height: 60, textAlignVertical: 'top' }}
                                        multiline={true}
                                        value={editingLead.notes || ''}
                                        onChangeText={(notes) => setEditingLead({ ...editingLead, notes })}
                                    />
                                </View>

                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                                    <Pressable
                                        style={{ backgroundColor: '#334155', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 }}
                                        onPress={() => setIsEditLeadModalOpen(false)}
                                    >
                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Cancelar</Text>
                                    </Pressable>
                                    <Pressable
                                        style={{ backgroundColor: '#10b981', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 }}
                                        onPress={handleSaveEditedLead}
                                    >
                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Guardar Cambios</Text>
                                    </Pressable>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 80,
    },
    horizontalScroll: {
        width: '100%',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0f172a',
    },
    loadingText: {
        marginTop: 15,
        color: '#94a3b8',
        fontSize: 16,
        fontWeight: '500'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
        flexWrap: 'wrap',
        gap: 15
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: '#fff',
    },
    subtitle: {
        fontSize: 15,
        color: '#94a3b8',
        marginTop: 4
    },
    refreshBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2563eb',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 10,
        shadowColor: '#2563eb',
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 3
    },
    refreshBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 20,
        marginBottom: 35
    },
    statCard: {
        flex: 1,
        minWidth: 220,
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderLeftWidth: 5,
        borderWidth: 1,
        borderColor: '#334155',
    },
    statInfo: {
        flex: 1
    },
    statLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: 0.5,
        marginBottom: 8
    },
    statValue: {
        fontSize: 24,
        fontWeight: '900',
        color: '#fff'
    },
    statIconContainer: {
        width: 46,
        height: 46,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center'
    },
    sectionCard: {
        backgroundColor: '#1e293b',
        borderRadius: 20,
        padding: 25,
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 35
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 8
    },
    sectionSubtitle: {
        fontSize: 13,
        color: '#94a3b8',
        marginBottom: 20
    },
    requestsList: {
        gap: 15
    },
    requestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        padding: 15,
        flexWrap: 'wrap',
        gap: 15
    },
    requestRowCompleted: {
        opacity: 0.6,
        borderColor: '#1e293b'
    },
    reqBadgeContainer: {
        minWidth: 100
    },
    reqBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    reqBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold'
    },
    reqDetails: {
        flex: 3,
        minWidth: 200
    },
    reqBusinessName: {
        fontSize: 16,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 2
    },
    reqBusinessInfo: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 4
    },
    reqDate: {
        fontSize: 11,
        color: '#64748b'
    },
    reqActions: {
        flexDirection: 'row',
        gap: 10,
        minWidth: 140,
        justifyContent: 'flex-end'
    },
    reqActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 8,
    },
    reqActionBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold'
    },
    tableContainer: {
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#0f172a'
    },
    tableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        paddingVertical: 14,
        paddingHorizontal: 15,
        borderBottomWidth: 1.5,
        borderBottomColor: '#334155'
    },
    th: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    thText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: 0.5
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#334155'
    },
    tdBusinessName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff'
    },
    tdBusinessId: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2
    },
    tdText: {
        fontSize: 14,
        color: '#cbd5e1'
    },
    emptyTable: {
        paddingVertical: 40,
        alignItems: 'center'
    },
    emptyTableText: {
        color: '#64748b',
        fontSize: 15,
        fontWeight: '500'
    }
});
