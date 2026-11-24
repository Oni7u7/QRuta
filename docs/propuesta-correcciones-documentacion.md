# Propuesta de correcciones a la documentación

La sección "Documentación del proyecto" del README (Funcionamiento del Frontend y Decisiones Técnicas) se escribió antes de agregar el contrato, la wallet y el panel de administración. Estas son las partes que ya no coinciden con lo que está implementado. No se modificó el texto original: queda a criterio de quien la escribió.

## Funcionamiento del Frontend

| Sección | Dice | Hoy |
| --- | --- | --- |
| 2.1 Aplicación web del taller | "sin exigir que el taller gestione directamente llaves privadas, frases semilla o XLM" | El taller **firma con su wallet en Freighter** y guarda su frase de recuperación. Los XLM de prueba los consigue QRuta (Friendbot) y el taller paga la comisión de cada registro en testnet. |
| 2.1 | Registro "desde un dispositivo móvil" | La firma con Freighter se hace **desde computadora** (extensión de navegador). La verificación pública sí funciona en cualquier celular. |
| 2.2 Panel del socio propietario | Panel con alertas y exportación del expediente | **No implementado** (roadmap). Sí existen el panel de administración (`/admin`) y el historial por placa para talleres. |
| 5 Relación con la blockchain | "La comunicación con la blockchain se centraliza en el backend" | El backend prepara, valida y envía las transacciones, pero **la firma ocurre en el navegador del taller** con Freighter. |
| 6 Alcance del MVP | Panel del socio y exportación | Agregar lo que sí hay: solicitud de alta (`/registro-taller`), revisión KYB en `/admin`, invitación por correo, suspensión de talleres. |

## Decisiones Técnicas

| Sección | Dice | Hoy |
| --- | --- | --- |
| 3.2 Stellar | "`manage_data` o un memo hash" | Se usa el **contrato Soroban `qruta-registry`**. Los primeros registros usaron memo hash; `manage_data` se descartó porque crea subentradas en la cuenta. |
| 3.6 QR dinámico | "se renueva cada 10–15 segundos" | Cada **15 s** (TOTP), aceptando el token anterior y el siguiente; una foto de más de ~30 s da "Código expirado". |
| 3.8 | "No utilizar Soroban en la primera versión" | **Obsoleto:** el bootcamp pidió contrato y wallet. El contrato guarda el KYB on-chain (talleres aprobados) y los registros firmados por cada taller. |
| 4.1 Identidades y firmas | "La solución debe establecer cómo se generan, protegen, utilizan y revocan las llaves" | Definido: cada taller genera su llave en Freighter (QRuta nunca la ve); la aprobación vive en el contrato; revocar = **Suspender** desde `/admin`. |
| 4.2 Patrocinio | La plataforma absorbe los costos | **No implementado:** el taller paga la comisión (~0.56 XLM por registro en testnet, por la renta de almacenamiento). Patrocinar con *fee-bump* queda en el roadmap. |
| 4.4 Errores y confirmaciones | Distinguir registros pendientes de confirmados | Implementado así: el expediente **solo se guarda si la red confirma** la transacción; si no, no queda nada a medias. |
| 5 Flujo técnico | Firma (paso 4) antes del hash (paso 5) | Orden real: se valida → se calcula el hash → QRuta prepara la transacción → **el taller la firma** → QRuta comprueba la firma y la envía → el contrato la valida → se guarda el expediente. |
| 6 Alcance del MVP | "Consulta de solo lectura para aseguradoras" y "Alertas de vencimiento" | La verificación pública sí existe; la **API para aseguradoras y las alertas no** (roadmap). |
| 8 Estado de implementación | Componentes por verificar | Se puede reemplazar por una tabla de lo implementado: ver la sección "Cómo funciona" y "Limitaciones conocidas" del README. |
