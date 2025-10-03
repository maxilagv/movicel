# Movicel / Tecnocel – Tienda E‑commerce (Frontend + Backend)

Proyecto completo de tienda online con catálogo por categorías, carrito de compras y checkout simple, compuesto por:
- Backend Node.js + Express + PostgreSQL y medidas de seguridad integradas
- Frontend estático moderno (Tailwind) servido por el backend en producción o ejecutable por separado en desarrollo
- Panel de administración con login protegido por 2FA (correo) y JWT

Este README describe la arquitectura, cómo correrlo localmente, variables de entorno, API, esquema de base de datos, despliegue en Render y detalles de seguridad.


## Arquitectura

- Backend: `backend/server`
  - Express 4, PostgreSQL (pg), Helmet, CORS, Rate limiting, XSS‐clean, HPP, compresión, CSP
  - Autenticación JWT (access + refresh), blacklist de tokens, 2FA por email
  - Endpoints REST bajo `/api` para categorías, productos, pedidos, autenticación y checkout público
  - Migraciones SQL simples vía script (`npm run migrate`)
  - Sirve el frontend estático desde `backend/server/public`
- Base de datos: `backend/database`
  - Migraciones en `database/migrations` y esquema completo en `database/schema.sql`
  - Tablas principales: `Categories`, `Products`, `Orders`, `OrderItems` (más soporte de soft delete y timestamps)
- Frontend: `frontend`
  - Páginas: `index.html` (catálogo), `contact.html`, `admin.html` (panel), `login.html`
  - Lógica: `main.js` (tienda), `admin.js` (panel), `login.js`, `config.js` (base URL)
  - En producción, el backend copia todo `frontend/` a `backend/server/public/` y fuerza `config.js` a apuntar al mismo origen (ver render.yaml)


## Flujo de funcionamiento

- Cliente (público)
  - Carga categorías y productos desde `/api/categorias` y `/api/productos`
  - Muestra tarjetas de categorías y cuadrículas de productos por categoría
  - Modal de detalle de producto con “Productos relacionados” (misma categoría)
  - Carrito local (LocalStorage) y checkout público vía `/api/checkout`
  - Filtro por categoría desde la URL con `?categoria=<slug>`; oculta las demás secciones y muestra banner con botón “Ver todas”
- Panel admin
  - Login con email y contraseña del administrador + 2FA por email (en dos pasos)
  - Tras autenticación, el panel usa JWT (header `Authorization: Bearer <token>`) para crear/editar/eliminar categorías y productos
  - Endpoints de pedidos para listar y generar PDF (requieren auth)
- Servidor
  - Aplica CSP, CORS, compresión, XSS clean, HPP, rate limiting, logging, protección path traversal y (opcional) forzar HTTPS
  - Sirve estáticos (`backend/server/public`) con caching controlado


## Requisitos

- Node.js 18+
- PostgreSQL 13+


## Configuración de entorno (Backend)

Variables principales (archivo `.env` en `backend/server`):

- Conexión a DB
  - `DATABASE_URL` (recomendado) o variables sueltas `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
  - `PGSSL=true` si usas SSL (Render/Postgres gestionado)
- Seguridad / JWT
  - `JWT_SECRET` (obligatorio)
  - `REFRESH_TOKEN_SECRET` (obligatorio)
  - `JWT_ALG` (por defecto `HS256`), `JWT_ISSUER`, `JWT_AUDIENCE` (opcionales)
- Admin (login + 2FA)
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD_HASH` (bcrypt)
  - 2FA por email con SendGrid: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`
    - Alternativa SMTP (para modo dev del controlador): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`
- CORS / CSP / estáticos
  - `CORS_ALLOWED_ORIGINS` (lista separada por comas o `*`)
  - `CORS_ALLOW_ALL=true` (modo laxo)
  - `PUBLIC_ORIGIN` (para CSP adicional)
  - `STATIC_MAX_AGE` (ej. `7d`)
- Proxy / HTTPS
  - `TRUST_PROXY=true` y `FORCE_HTTPS=true` para entornos detrás de proxy/CDN
- Otros
  - `REQUEST_LOGGING=off` para silenciar logs de peticiones
  - `ALERT_PHONE` para simular alertas SMS de seguridad
  - `KEEP_ALIVE_TIMEOUT_MS`, `HEADERS_TIMEOUT_MS`
  - `DB_MIGRATIONS_DIR` (custom path de migraciones)

Ejemplo rápido de `.env` (no subir a git):

```
PORT=3000
DATABASE_URL=postgres://user:pass@localhost:5432/tecnocel
PGSSL=false
JWT_SECRET=supersecret_access
REFRESH_TOKEN_SECRET=supersecret_refresh
ADMIN_EMAIL=admin@midominio.com
ADMIN_PASSWORD_HASH=$2a$10$...
CORS_ALLOWED_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
TRUST_PROXY=false
FORCE_HTTPS=false
```

Para generar un hash bcrypt:
- `cd backend/server`
- `npm ci`
- `node scripts/gen-hash.js "MiContraseñaSegura"` → pega el hash en `ADMIN_PASSWORD_HASH`
- Alternativa (edita `.env` automáticamente): `node scripts/set-admin-password.js "MiContraseñaSegura" admin@midominio.com`


## Puesta en marcha local

1) Backend
- `cd backend/server`
- `npm ci`
- Configura `.env`
- Levanta PostgreSQL y asegura la DB creada
- Ejecuta migraciones: `npm run migrate`
- Inicia dev: `npm run dev` (o `npm start`)
- Servirá API en `http://localhost:3000/api` y estáticos en `http://localhost:3000/`

2) Frontend
- Desarrollo “estático” (Live Server 5500/5501): abre `frontend/index.html`
  - `frontend/config.js` usa `window.API_BASE_URL` o, si detecta 5500/5501, apunta a `http://localhost:3000`
- Producción local (servido por backend): copia `frontend/*` a `backend/server/public/` o usa el pipeline de `render.yaml`


## Endpoints de API

Base: ``/api``

- Públicos
  - `GET /categorias`
    - Respuesta: lista `[ { id, name, image_url, description } ]` (solo activas)
  - `GET /productos`
    - Respuesta: lista `[ { id, category_id, name, description, price, image_url, category_name, stock_quantity, specifications } ]`
  - `POST /checkout`
    - Body: `{ buyer: { name, email?, phone? }, items: [ { productId, quantity } ] }`
    - Valida stock, descuenta inventario y crea orden con `order_number` (`ORD-YYYYMMDD-ID`)
    - Respuesta: `{ orderId, orderNumber }`

- Autenticación (Admin)
  - `POST /login` o `POST /login-step1`
    - Body: `{ email, password }`
    - Verifica email/contraseña de admin y envía OTP por email (SendGrid); retorna `{ txId, otpSent: true }`
  - `POST /login-step2`
    - Body: `{ txId, code }`
    - Emite `{ accessToken, refreshToken }`
  - `POST /refresh-token`
    - Body: `{ refreshToken }` → `{ accessToken }`
  - `POST /logout` (requiere `Authorization: Bearer <accessToken>`)
    - Blacklist del token de acceso actual

- Categorías
  - `GET /categorias` (público)
  - `POST /categorias` (admin)
    - Body: `{ name, image_url, description? }` (acepta URL http(s) o ruta de archivo)
  - `PUT /categorias/:id` (admin)
    - Body parcial para actualizar; conserva/normaliza `image_url`
  - `DELETE /categorias/:id` (admin)
    - Soft delete; también marca productos de esa categoría como eliminados (`deleted_at`)

- Productos
  - `GET /productos` (público)
  - `POST /productos` (admin)
    - Body: `{ name, description, price, image_url, category_id, stock_quantity?, specifications? }`
  - `PUT /productos/:id` (admin)
  - `DELETE /productos/:id` (admin, soft delete)

- Pedidos (Admin)
  - `GET /pedidos` (admin) → lista de pedidos recientes
  - `GET /pedidos/:id/pdf` (admin) → genera PDF del comprobante

Notas
- Validaciones exhaustivas con `express-validator`. Errores de validación responden `{ errors: [...] }`.
- Las operaciones de escritura usan transacciones cuando corresponde.


## Esquema de datos (resumen)

- `Categories`
  - `id`, `name` (único activo), `image_url`/`image_file_path`, `description`, timestamps, `deleted_at`
- `Products`
  - `id`, `category_id` (FK), `name`, `description`, `image_url`/`image_file_path`, `price`, `stock_quantity`, `specifications`, timestamps, `deleted_at`
- `Orders`
  - `id`, `order_number`, `buyer_name/email/phone`, `total_amount`, `status`, `order_date`, timestamps, `deleted_at`
- `OrderItems`
  - `order_id`, `product_id`, `quantity`, `unit_price`

Ver detalles en `backend/database/schema.sql` y migraciones en `backend/database/migrations`.


## Frontend (tienda)

- `frontend/main.js`
  - Carga categorías y productos desde `API_BASE_URL` (configurable en `frontend/config.js`)
  - Construye tarjetas de categorías (usa imagen de la categoría o del primer producto)
  - Renderiza secciones de productos por categoría
  - Tarjetas de producto con precio, stock, descripción corta y botones “Detalles/Agregar”
  - Modal de detalles con:
    - Descripción segura (sanitizada) y especificaciones en distintos formatos (string/array/objeto)
    - Estado de stock, botón “Agregar al carrito” y foto
    - Productos relacionados (misma categoría), hasta 6
  - Carrito:
    - Persistido en `localStorage` (`tecnocel_cart`)
    - Contador, totales, sumar/restar/eliminar items
    - Checkout público vía `POST /api/checkout`
  - Filtro por categoría en URL: `?categoria=<slug>`
    - Muestra solo la sección `#cat-<slug>` y oculta la grilla de tarjetas de categorías
    - Banner “Mostrando categoría: …” con botón “Ver todas” que limpia el filtro
  - Robustez:
    - Normalización de imágenes (corrige URLs con entidades y rutas relativas)
    - Manejo de errores de red con mensajes visibles

- `frontend/config.js`
  - En desarrollo (Live Server 5500/5501) apunta a `http://localhost:3000`
  - En producción (Render) se sobreescribe para usar `window.location.origin`

- `frontend/admin.js` y `frontend/login.js`
  - Flujo de login 2FA (dos pasos), almacenamiento de tokens y llamadas admin protegidas


## Seguridad (backend)

- Helmet + CSP con `connectSrc` dinámico según `CORS_ALLOWED_ORIGINS`/`PUBLIC_ORIGIN`
- CORS granular (orígenes exactos y comodines simples estilo `https://*.dominio.app`)
- `express-rate-limit`: limitador global y uno específico para login
- `xss-clean` y `hpp` para mitigar XSS y parameter pollution
- Forzar HTTPS opcional (útil detrás de proxy) + `trust proxy`
- Logging con redactado de Authorization y protección contra path traversal
- Invalidación de JWT en logout mediante blacklist en memoria (para producción, considerar Redis)
- Alertas SMS simuladas via `ALERT_PHONE` (integrables con Twilio si se desea)


## Despliegue (Render)

Archivo: `render.yaml`
- Servicio web Node en `backend/server`
- Build:
  - `npm ci`
  - Copia `frontend/*` a `backend/server/public/`
  - Fuerza `public/config.js` a `window.API_BASE_URL=window.location.origin;`
- Start:
  - `npm run migrate && npm start`
- DB Postgres administrada y enlazada por `DATABASE_URL`
- SSL (`PGSSL=true`), HTTPS forzado, proxy confiable, y ruta de migraciones vía `DB_MIGRATIONS_DIR`


## Snippets útiles

- Probar API local
  - `curl http://localhost:3000/api/categorias`
  - `curl http://localhost:3000/api/productos`
  - Checkout:
    ```bash
    curl -X POST http://localhost:3000/api/checkout \
      -H 'Content-Type: application/json' \
      -d '{
        "buyer": { "name": "Cliente Web", "email": "c@e.com" },
        "items": [ { "productId": 1, "quantity": 2 } ]
      }'
    ```
- Login admin (2 pasos)
  - Paso 1: `POST /api/login` con `{ email, password }` → `{ txId }`
  - Paso 2: `POST /api/login-step2` con `{ txId, code }` → `{ accessToken, refreshToken }`


## Consejos y resolución de problemas

- Si el frontend no “ve” cambios, forzar recarga sin caché (Ctrl+F5). Verifica en DevTools > Network que `main.js` se actualiza.
- Revisar que `API_BASE_URL` esté bien configurado (en dev suele ser `http://localhost:3000`).
- CORS: añade tus orígenes en `CORS_ALLOWED_ORIGINS` o usa `CORS_ALLOW_ALL=true` para pruebas (no recomendado en producción).
- The 2FA: en producción configura SendGrid (`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`).
- Migraciones: si falla una, revisa logs y el archivo en `database/migrations`. El runner crea `_migrations` para control de versiones.


## Estructura del repo (resumen)

- `backend/`
  - `server/` → código del servidor Express
  - `database/` → esquema y migraciones SQL
- `frontend/` → estáticos de la tienda y panel admin
- `render.yaml` → despliegue en Render (web + DB)


## Licencia

Este proyecto no especifica una licencia. Consulta con el autor antes de reutilizar el código en producción.

