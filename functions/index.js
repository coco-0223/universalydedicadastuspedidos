const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { Expo } = require("expo-server-sdk");

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

setGlobalOptions({ region: "us-central1" });

// 1. NOTIFICACIÓN AUTOMÁTICA POR CAMBIO DE ESTADO
exports.onOrderStatusChange = onDocumentUpdated(
  "businesses/{businessId}/orders/{orderId}",
  async (event) => {
    const newValue = event.data.after.data();
    const previousValue = event.data.before.data();
    const businessId = event.params.businessId;

    // Solo notificar si el estado cambió
    if (newValue.status === previousValue.status) return;

    const clientId = newValue.clientId;
    if (!clientId) return;

    // Buscar el token del cliente (asumimos que los tokens se guardan en businesses/{id}/push_tokens/{clientId})
    const tokenDoc = await db
      .doc(`businesses/${businessId}/push_tokens/${clientId}`)
      .get();

    if (!tokenDoc.exists) {
      console.log(`No se encontró push token para el cliente ${clientId}`);
      return;
    }

    let pushToken = tokenDoc.data().token;
    if (pushToken && typeof pushToken === "string") {
      pushToken = pushToken.replace(/\s/g, ""); // Limpiar espacios accidentales
    }

    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`Push token ${pushToken} no es un token válido de Expo`);
      return;
    }

    const statusMap = {
      confirmed: "ha sido recibido y confirmado. ✅",
      ready: "ya está listo para entregar! 🥩",
      delivered: "ha sido entregado. ¡Gracias! 🏠",
      cancelled: "fue cancelado. ❌",
    };

    const statusText = statusMap[newValue.status] || "tiene actualizaciones recientes.";

    const message = {
      to: pushToken,
      sound: "default",
      title: "Actualización de tu pedido",
      body: `Tu pedido #${newValue.id} ${statusText}`,
      data: { orderId: newValue.id },
    };

    try {
      await expo.sendPushNotificationsAsync([message]);
      console.log(`Notificación enviada con éxito al cliente ${clientId}`);
    } catch (error) {
      console.error("Error enviando notificación:", error);
    }
  }
);

// 2. NOTIFICACIÓN MASIVA (BROADCAST / MARKETING)
exports.onNewBroadcast = onDocumentCreated(
  "businesses/{businessId}/broadcasts/{broadcastId}",
  async (event) => {
    const broadcast = event.data.data();
    const businessId = event.params.businessId;

    if (!broadcast.title || !broadcast.message) return;

    // Obtener todos los tokens del negocio
    const tokensSnap = await db
      .collection(`businesses/${businessId}/push_tokens`)
      .get();

    const messages = [];
    tokensSnap.forEach((doc) => {
      let pushToken = doc.data().token;
      if (pushToken && typeof pushToken === "string") {
        pushToken = pushToken.replace(/\s/g, ""); // Limpiar espacios accidentales
      }
      
      if (Expo.isExpoPushToken(pushToken)) {
        messages.push({
          to: pushToken,
          sound: "default",
          title: broadcast.title,
          body: broadcast.message,
          data: { broadcastId: event.params.broadcastId },
        });
      }
    });

    if (messages.length === 0) return;

    // Expo recomienda enviar en pedazos (chunks) de máximo 100
    const chunks = expo.chunkPushNotifications(messages);
    let ticketReceipts = [];
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        ticketReceipts.push(...ticketChunk);
      } catch (error) {
        console.error("Error enviando chunk de notificaciones:", error);
      }
    }

    // Comprobar errores en los receipts devueltos por Expo
    for (const ticket of ticketReceipts) {
      if (ticket.status === 'error') {
        console.error("🚨 Error de entrega por parte de Expo:", ticket.message);
        if (ticket.details && ticket.details.error) {
          console.error("  👉 Código de error de Expo:", ticket.details.error);
        }
      }
    }

    console.log(`Difusión enviada a ${messages.length} clientes del negocio ${businessId}`);
  }
);
