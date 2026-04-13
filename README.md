# SHENCOM CRM — Distribuidor Autorizado Claro Ecuador

CRM de ventas completo, local y funcional para gestión de portabilidades.

## Requisitos

- **Node.js** v18 o superior
- **npm** v9 o superior

## Instalación

```bash
# 1. Instalar dependencias del servidor
cd shencom-crm
npm install

# 2. Instalar dependencias del cliente
cd client
npm install
cd ..
```

## Ejecución

### Modo desarrollo (con hot-reload)
```bash
npm run dev
```
Esto inicia:
- **Servidor API** en `http://localhost:3000`
- **Cliente Vite** en `http://localhost:5173` (con proxy a la API)

### Modo producción
```bash
npm run build
npm start
```
Todo corre en `http://localhost:3000`.

## Credenciales iniciales

| Usuario | Contraseña    | Rol     |
|---------|---------------|---------|
| admin   | shencom2026   | Gerente |

## Estructura

```
shencom-crm/
├── client/              # React + Vite + Tailwind
│   └── src/
│       ├── components/  # Layout
│       ├── pages/       # Dashboard, Pipeline, Leads, etc.
│       ├── context/     # AuthContext
│       └── utils/       # API helper, constantes
├── server/
│   ├── routes/          # API REST (auth, leads, activities, etc.)
│   ├── middleware/       # JWT auth
│   ├── database.js      # SQLite schema
│   └── seed.js          # Datos iniciales
├── shencom.db           # Base de datos SQLite (se crea al iniciar)
└── package.json
```

## Módulos

1. **Dashboard Gerencial** — KPIs, gráficos, filtros
2. **Pipeline Kanban** — Drag & drop con 7 estados
3. **Gestión de Leads** — CRUD, importar/exportar CSV, asignación masiva
4. **Registro de Gestiones** — Llamadas, WhatsApp, visitas con timeline
5. **Comisiones** — Cálculo automático con sobre-comisión
6. **Reportes** — Diario, portabilidades, fuentes, aging, exportar Excel
7. **Administración** — Usuarios, equipos, metas
8. **Configuración** — Planes Claro, operadores, fuentes, backup DB
