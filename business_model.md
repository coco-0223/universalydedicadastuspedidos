# MODELO DE NEGOCIO Y OPERACIÓN: TUSPEDIDOS (UNIVERSAL Y DEDICADAS)

## 1. Onboarding y Período de Prueba (100% Automático)
- El cliente nuevo ingresa a la Web Universal (ej. `tuspedidos.vercel.app/iniciar-demo`).
- Completa nombre de su negocio, usuario/email y contraseña.
- Se crea automáticamente en Firebase (`universalydedicadastuspedidos`) con:
  - `status: 'trial'`
  - Período de prueba gratuito por 7 días.
  - Tienda activa inmediatamente en la Web Universal: `/?store=nombre-negocio`.
- El dueño accede de inmediato a su panel para cargar productos y operar sin intervención manual.

## 2. Pagos y Extensión de Suscripción (Sin Pasarela Automática)
- Los cobros se realizan **por fuera de la app** (transferencia bancaria / efectivo).
- Al vencer el período de prueba o al recibir el pago:
  - El SuperAdmin (`cocobustos.93@gmail.com`) ingresa al panel SuperAdmin (`/dashboard`).
  - Desde el panel ve los negocios, el estado de su prueba y con botones gestiona/extiende el acceso (ej. +30 días o Activo).

## 3. Oferta Comercial (Planes)
- **Plan Universal (Económico / Onboarding directo):**
  - La tienda funciona dentro del dominio de TusPedidos (`tuspedidos.vercel.app/?store=slug`).
  - Ideal para arrancar sin costos de infraestructura.
- **Plan Dedicado (Mayor valor / Marca exclusiva):**
  - Despliegue propio en Vercel con subdominio exclusivo sin costo extra (ej. `carniceriapedro.vercel.app`).
  - Cero menciones a TusPedidos, estética y branding 100% del negocio.
  - No requiere compra de dominio `.com` ni tarjetas de crédito de los clientes.

## 4. Roles y Seguridad
- **SuperAdmin:** `cocobustos.93@gmail.com`.
- Acceso exclusivo al Dashboard de control global desde la Web Universal.
