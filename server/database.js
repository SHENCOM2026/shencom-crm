const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'shencom.db');
const db = new Database(dbPath);

// Export the path for backup endpoint
db.dbPath = dbPath;

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL CHECK(role IN ('gerente', 'supervisor', 'vendedor')),
    supervisor_id INTEGER REFERENCES users(id),
    monthly_portability_goal INTEGER DEFAULT 30,
    daily_call_goal INTEGER DEFAULT 40,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS claro_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    commission REAL NOT NULL,
    description TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS origin_operators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS lead_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS rejection_reasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    cedula TEXT,
    phone_primary TEXT NOT NULL,
    phone_secondary TEXT,
    email TEXT,
    operator_origin_id INTEGER REFERENCES origin_operators(id),
    current_plan TEXT,
    claro_plan_id INTEGER REFERENCES claro_plans(id),
    vendor_id INTEGER NOT NULL REFERENCES users(id),
    supervisor_id INTEGER REFERENCES users(id),
    source_id INTEGER REFERENCES lead_sources(id),
    pipeline_status TEXT NOT NULL DEFAULT 'lead_nuevo' CHECK(pipeline_status IN (
      'lead_nuevo', 'contactado', 'interesado', 'documentacion',
      'solicitud_enviada', 'portabilidad_exitosa', 'rechazado_perdido'
    )),
    claro_request_number TEXT,
    activation_date TEXT,
    rejection_reason_id INTEGER REFERENCES rejection_reasons(id),
    next_followup TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lead_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    activity_type TEXT NOT NULL CHECK(activity_type IN (
      'llamada_saliente', 'llamada_entrante', 'whatsapp', 'visita', 'email', 'nota', 'cambio_estado'
    )),
    duration_minutes INTEGER,
    result TEXT CHECK(result IN (
      'contacto_efectivo', 'no_contesta', 'buzon', 'numero_equivocado',
      'agendo_callback', 'cerro_venta', NULL
    )),
    notes TEXT,
    next_action TEXT,
    next_action_date TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS commission_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_type TEXT NOT NULL DEFAULT 'mensual' CHECK(period_type IN ('quincenal', 'mensual')),
    overcommission_threshold_pct REAL DEFAULT 120,
    overcommission_multiplier REAL DEFAULT 1.5,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    lead_id INTEGER REFERENCES leads(id),
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lead_prospect_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    plan_name TEXT NOT NULL,
    plan_price REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_leads_vendor ON leads(vendor_id);
  CREATE INDEX IF NOT EXISTS idx_leads_supervisor ON leads(supervisor_id);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(pipeline_status);
  CREATE INDEX IF NOT EXISTS idx_leads_cedula ON leads(cedula);
  CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_primary);
  CREATE INDEX IF NOT EXISTS idx_activities_lead ON lead_activities(lead_id);
  CREATE INDEX IF NOT EXISTS idx_activities_user ON lead_activities(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_prospect_plans_lead ON lead_prospect_plans(lead_id);

  CREATE TABLE IF NOT EXISTS lead_change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_change_log_lead ON lead_change_log(lead_id);

  CREATE TABLE IF NOT EXISTS app_config (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS import_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    file_name TEXT NOT NULL,
    campaign_id INTEGER REFERENCES campaigns(id),
    total_records INTEGER DEFAULT 0,
    new_records INTEGER DEFAULT 0,
    replaced_records INTEGER DEFAULT 0,
    merged_records INTEGER DEFAULT 0,
    skipped_records INTEGER DEFAULT 0,
    error_records INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_import_history_user ON import_history(user_id);

  CREATE TABLE IF NOT EXISTS lead_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_lead_documents_lead ON lead_documents(lead_id);

  CREATE TABLE IF NOT EXISTS lead_sale_forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
    form_data TEXT NOT NULL DEFAULT '{}',
    updated_by INTEGER REFERENCES users(id),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migration: add new columns if they don't exist
try { db.exec("ALTER TABLE leads ADD COLUMN lines_to_port INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE leads ADD COLUMN prospect_total REAL DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE leads ADD COLUMN city TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE leads ADD COLUMN import_id INTEGER REFERENCES import_history(id)"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN phone TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN modified_by INTEGER"); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN modified_at TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE lead_documents ADD COLUMN drive_file_id TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE lead_documents ADD COLUMN drive_link TEXT"); } catch(e) {}

// Seed default WhatsApp config if not exists
const insertDefault = db.prepare('INSERT OR IGNORE INTO app_config (config_key, config_value) VALUES (?, ?)');
insertDefault.run('whatsapp_country_code', '593');
insertDefault.run('whatsapp_message_template', 'Hola {nombre}, le saluda {vendedor} de Claro Ecuador.');

module.exports = db;
