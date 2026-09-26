PRAGMA foreign_keys = ON;

-- Internal staff users table
CREATE TABLE IF NOT EXISTS aep_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    username_normalized TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_algo TEXT NOT NULL DEFAULT 'pbkdf2-sha256',
    password_hash TEXT NOT NULL,
    password_salt TEXT,
    password_iterations INTEGER,
    must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    locked_until TEXT,
    last_login_at TEXT,
    totp_secret_enc TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK (totp_enabled IN (0, 1)),
    recovery_codes_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_active ON aep_users(active);

-- Roles table
CREATE TABLE IF NOT EXISTS aep_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- System permissions dictionary table
CREATE TABLE IF NOT EXISTS aep_permissions (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
);

-- User roles mapping
CREATE TABLE IF NOT EXISTS aep_user_roles (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES aep_users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES aep_roles(id) ON DELETE CASCADE
);

-- Role permissions mapping
CREATE TABLE IF NOT EXISTS aep_role_permissions (
    role_id INTEGER NOT NULL,
    permission_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_key),
    FOREIGN KEY (role_id) REFERENCES aep_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_key) REFERENCES aep_permissions(key) ON DELETE CASCADE
);

-- Seed permissions
INSERT OR IGNORE INTO aep_permissions (key, name, description) VALUES
    ('dashboard.read', 'Ver Dashboard', 'Permite ver el panel principal y estadísticas general'),
    ('pos.access', 'Acceso al POS', 'Permite acceder a la interfaz de punto de venta'),
    ('pos.redeem', 'Procesar Ventas POS', 'Permite validar premios y realizar ventas'),
    ('sales.read', 'Ver Ventas', 'Permite consultar el listado general de ventas'),
    ('sales.read_own', 'Ver Mis Ventas', 'Permite consultar únicamente las ventas propias'),
    ('sales.export', 'Exportar Ventas', 'Permite exportar reportes de ventas'),
    ('products.read', 'Ver Productos', 'Permite consultar el catálogo de productos'),
    ('products.manage', 'Gestionar Productos', 'Permite crear, editar y cambiar estado de productos'),
    ('inventory.read', 'Ver Inventario', 'Permite consultar el stock y movimientos de inventario'),
    ('inventory.manage', 'Gestionar Inventario', 'Permite realizar entradas y reajustes de stock'),
    ('qr.read', 'Ver Códigos QR', 'Permite consultar los códigos QR generados'),
    ('qr.generate', 'Generar Códigos QR', 'Permite generar nuevos lotes de códigos QR'),
    ('qr.manage', 'Gestionar Códigos QR', 'Permite deshabilitar o administrar códigos QR'),
    ('print.use', 'Usar Print Center', 'Permite generar impresiones PDF de lotes QR'),
    ('print.manage_profiles', 'Gestionar Perfiles Impresión', 'Permite crear y ajustar perfiles de impresión'),
    ('rewards.read', 'Ver Premios', 'Permite consultar el listado de premios y claims'),
    ('rewards.manage', 'Gestionar Premios', 'Permite cancelar o administrar premios'),
    ('customers.read', 'Ver Clientes', 'Permite ver el historial de clientes'),
    ('customers.manage', 'Gestionar Clientes', 'Permite modificar perfiles de clientes'),
    ('users.read', 'Ver Usuarios', 'Permite consultar la lista de usuarios internos'),
    ('users.manage', 'Gestionar Usuarios', 'Permite crear, editar y bloquear usuarios internos'),
    ('roles.read', 'Ver Roles', 'Permite consultar roles y sus permisos'),
    ('roles.manage', 'Gestionar Roles', 'Permite crear y modificar roles personalizados'),
    ('sessions.read', 'Ver Sesiones', 'Permite ver sesiones activas de usuarios'),
    ('sessions.revoke', 'Revocar Sesiones', 'Permite cerrar sesiones de usuarios'),
    ('shifts.use', 'Operar Turnos', 'Permite iniciar y cerrar turno de trabajo propio'),
    ('shifts.manage', 'Gestionar Turnos', 'Permite ver y administrar turnos de otros usuarios'),
    ('audit.read', 'Ver Auditoría', 'Permite ver el registro de eventos de auditoría'),
    ('audit.export', 'Exportar Auditoría', 'Permite exportar registros de auditoría'),
    ('settings.read', 'Ver Configuración', 'Permite consultar parámetros del sistema'),
    ('settings.manage', 'Gestionar Configuración', 'Permite editar parámetros del evento'),
    ('system.read', 'Ver Estado del Sistema', 'Permite ver información técnica del sistema'),
    ('system.manage', 'Administrar Sistema', 'Permite funciones avanzadas de mantenimiento'),
    ('reports.read', 'Ver Reportes', 'Permite ver reportes ejecutivos del evento'),
    ('reports.export', 'Exportar Reportes', 'Permite descargar reportes en CSV/PDF'),
    ('event.manage', 'Gestionar Evento', 'Permite abrir o cerrar el evento'),
    ('purchase.void', 'Anular Ventas', 'Permite realizar anulación administrativa de ventas'),
    ('security.mfa.manage', 'Gestionar MFA', 'Permite configurar o resetear 2FA/TOTP');

-- Seed built-in roles
INSERT OR IGNORE INTO aep_roles (id, name, description, is_builtin) VALUES
    (1, 'Owner', 'Propietario / Superadministrador con control total', 1),
    (2, 'Desarrollador', 'Acceso técnico completo y monitoreo de sistema', 1),
    (3, 'Administrador', 'Administrador de operaciones del evento', 1),
    (4, 'Supervisor', 'Supervisión de piso, POS y ventas', 1),
    (5, 'Vendedor', 'Vendedor de punto de venta (POS) y turnos', 1),
    (6, 'Inventario', 'Gestión de productos y control de stock', 1),
    (7, 'Operador de impresión', 'Generación de QR y emisión de PDF de impresión', 1),
    (8, 'Auditor', 'Solo lectura general para control e inspección', 1);

-- Map permissions for built-in roles

-- 1. Owner & 3. Administrador: all permissions except system.manage/security.mfa.manage for admin
INSERT OR IGNORE INTO aep_role_permissions (role_id, permission_key)
SELECT 1, key FROM aep_permissions;

INSERT OR IGNORE INTO aep_role_permissions (role_id, permission_key)
SELECT 3, key FROM aep_permissions WHERE key NOT IN ('system.manage', 'security.mfa.manage');

-- 2. Desarrollador: technical + administrative read/manage
INSERT OR IGNORE INTO aep_role_permissions (role_id, permission_key)
SELECT 2, key FROM aep_permissions WHERE key IN (
    'dashboard.read', 'system.read', 'system.manage', 'audit.read', 'audit.export',
    'settings.read', 'settings.manage', 'qr.read', 'qr.generate', 'qr.manage',
    'print.use', 'print.manage_profiles', 'users.read', 'roles.read', 'sessions.read', 'sessions.revoke'
);

-- 4. Supervisor
INSERT OR IGNORE INTO aep_role_permissions (role_id, permission_key)
SELECT 4, key FROM aep_permissions WHERE key IN (
    'dashboard.read', 'pos.access', 'pos.redeem', 'sales.read', 'sales.read_own', 'sales.export',
    'products.read', 'inventory.read', 'inventory.manage', 'qr.read', 'rewards.read', 'rewards.manage',
    'customers.read', 'shifts.use', 'shifts.manage', 'reports.read'
);

-- 5. Vendedor
INSERT OR IGNORE INTO aep_role_permissions (role_id, permission_key)
SELECT 5, key FROM aep_permissions WHERE key IN (
    'pos.access', 'pos.redeem', 'sales.read_own', 'shifts.use', 'sessions.read'
);

-- 6. Inventario
INSERT OR IGNORE INTO aep_role_permissions (role_id, permission_key)
SELECT 6, key FROM aep_permissions WHERE key IN (
    'dashboard.read', 'products.read', 'products.manage', 'inventory.read', 'inventory.manage', 'qr.read'
);

-- 7. Operador de impresión
INSERT OR IGNORE INTO aep_role_permissions (role_id, permission_key)
SELECT 7, key FROM aep_permissions WHERE key IN (
    'dashboard.read', 'qr.read', 'qr.generate', 'print.use', 'print.manage_profiles'
);

-- 8. Auditor
INSERT OR IGNORE INTO aep_role_permissions (role_id, permission_key)
SELECT 8, key FROM aep_permissions WHERE key IN (
    'dashboard.read', 'sales.read', 'products.read', 'inventory.read', 'qr.read',
    'rewards.read', 'customers.read', 'audit.read', 'reports.read', 'settings.read', 'system.read'
);

-- Migrate existing sellers into aep_users and assign Vendedor role (role_id = 5)
INSERT INTO aep_users (
    username,
    username_normalized,
    display_name,
    password_algo,
    password_hash,
    active,
    created_at,
    last_login_at
)
SELECT
    COALESCE(username, 'seller_' || id),
    LOWER(COALESCE(username, 'seller_' || id)),
    display_name,
    'sha256',
    passcode_hash,
    active,
    created_at,
    last_login_at
FROM sellers;

INSERT OR IGNORE INTO aep_user_roles (user_id, role_id)
SELECT u.id, 5
FROM aep_users u
JOIN sellers s ON u.username_normalized = LOWER(COALESCE(s.username, 'seller_' || s.id))
              AND u.password_hash = s.passcode_hash;

