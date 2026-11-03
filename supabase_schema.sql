-- ==============================================================================
-- iBioO Wallet (Mi Billetera Pro) - Esquema de Base de Datos para Supabase (PostgreSQL)
-- Diseñado siguiendo las mejores prácticas de Supabase y PostgreSQL:
-- - Multi-usuario aislado con Row Level Security (RLS)
-- - Tipos exactos DECIMAL/NUMERIC para finanzas
-- - Índices optimizados en claves foráneas y búsquedas por fecha
-- - Inicialización automática de categorías y billetera para nuevos usuarios
-- ==============================================================================

-- 1. TABLA: config_billetera (Saldo Base por Usuario)
CREATE TABLE IF NOT EXISTS public.config_billetera (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    monto_base NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    creado_el TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    actualizado_el TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_config_billetera_user UNIQUE (user_id)
);

-- 2. TABLA: categorias
CREATE TABLE IF NOT EXISTS public.categorias (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#7f8c8d',
    icono TEXT NOT NULL DEFAULT 'fa-folder',
    creado_el TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. TABLA: sueldos_mes (Configuración de Sueldos: Quincena y Fin de Mes)
CREATE TABLE IF NOT EXISTS public.sueldos_mes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    anio INT NOT NULL,
    mes INT NOT NULL CHECK (mes >= 0 AND mes <= 11),
    sueldo_15 NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    sueldo_30 NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    creado_el TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_sueldos_mes_periodo UNIQUE (user_id, anio, mes)
);

-- 4. TABLA: movimientos_recurrentes (Plantillas de Compromisos Fijos)
CREATE TABLE IF NOT EXISTS public.movimientos_recurrentes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('gasto', 'ingreso')),
    descripcion TEXT NOT NULL,
    monto NUMERIC(10,2) NOT NULL CHECK (monto >= 0),
    dia_pago INT NOT NULL,
    categoria_id BIGINT REFERENCES public.categorias(id) ON DELETE SET NULL,
    periodos TEXT,
    tipo_recurrencia TEXT NOT NULL DEFAULT 'mensual' CHECK (tipo_recurrencia IN ('mensual', 'semanal')),
    creado_el TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. TABLA: movimientos_agenda (Movimientos Realizados y Ocurrencias Programadas)
CREATE TABLE IF NOT EXISTS public.movimientos_agenda (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('gasto', 'ingreso')),
    descripcion TEXT NOT NULL,
    monto NUMERIC(10,2) NOT NULL CHECK (monto >= 0),
    fecha DATE NOT NULL,
    categoria_id BIGINT REFERENCES public.categorias(id) ON DELETE SET NULL,
    es_recurrente BOOLEAN NOT NULL DEFAULT FALSE,
    recurrente_id BIGINT REFERENCES public.movimientos_recurrentes(id) ON DELETE SET NULL,
    pago_confirmado BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_pago DATE,
    creado_el TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. TABLA: deudas (Cronogramas de Préstamos o Compras en Cuotas)
CREATE TABLE IF NOT EXISTS public.deudas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    monto_recibido NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    categoria_id BIGINT REFERENCES public.categorias(id) ON DELETE SET NULL,
    creado_el TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. TABLA: deuda_cuotas (Cuotas Individuales de cada Cronograma)
CREATE TABLE IF NOT EXISTS public.deuda_cuotas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    deuda_id BIGINT NOT NULL REFERENCES public.deudas(id) ON DELETE CASCADE,
    numero INT NOT NULL,
    monto NUMERIC(10,2) NOT NULL CHECK (monto >= 0),
    fecha DATE NOT NULL,
    creado_el TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. TABLA: deuda_pagos (Abonos Parciales o Totales Vinculados a Movimientos)
CREATE TABLE IF NOT EXISTS public.deuda_pagos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cuota_id BIGINT NOT NULL REFERENCES public.deuda_cuotas(id) ON DELETE CASCADE,
    monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
    fecha DATE NOT NULL,
    movimiento_id BIGINT REFERENCES public.movimientos_agenda(id) ON DELETE CASCADE,
    solicitud TEXT,
    creado_el TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_deuda_pagos_solicitud UNIQUE (user_id, solicitud)
);

-- ==============================================================================
-- ÍNDICES DE RENDIMIENTO (Performance Best Practices)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_config_billetera_user ON public.config_billetera(user_id);
CREATE INDEX IF NOT EXISTS idx_categorias_user ON public.categorias(user_id);
CREATE INDEX IF NOT EXISTS idx_sueldos_mes_user ON public.sueldos_mes(user_id, anio);
CREATE INDEX IF NOT EXISTS idx_recurrentes_user ON public.movimientos_recurrentes(user_id);
CREATE INDEX IF NOT EXISTS idx_recurrentes_categoria ON public.movimientos_recurrentes(categoria_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_user_fecha ON public.movimientos_agenda(user_id, fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_recurrente ON public.movimientos_agenda(recurrente_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_categoria ON public.movimientos_agenda(categoria_id);
CREATE INDEX IF NOT EXISTS idx_deudas_user ON public.deudas(user_id);
CREATE INDEX IF NOT EXISTS idx_deudas_categoria ON public.deudas(categoria_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_deuda ON public.deuda_cuotas(deuda_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_user ON public.deuda_cuotas(user_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cuota ON public.deuda_pagos(cuota_id);
CREATE INDEX IF NOT EXISTS idx_pagos_movimiento ON public.deuda_pagos(movimiento_id);
CREATE INDEX IF NOT EXISTS idx_pagos_user ON public.deuda_pagos(user_id);

-- ==============================================================================
-- SEGURIDAD ROW LEVEL SECURITY (RLS) - Garantiza aislamiento estricto por usuario
-- ==============================================================================
ALTER TABLE public.config_billetera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sueldos_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_recurrentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deudas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deuda_cuotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deuda_pagos ENABLE ROW LEVEL SECURITY;

-- Políticas para config_billetera
CREATE POLICY "config_billetera_usuario" ON public.config_billetera
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Políticas para categorias
CREATE POLICY "categorias_usuario" ON public.categorias
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Políticas para sueldos_mes
CREATE POLICY "sueldos_mes_usuario" ON public.sueldos_mes
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Políticas para movimientos_recurrentes
CREATE POLICY "recurrentes_usuario" ON public.movimientos_recurrentes
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Políticas para movimientos_agenda
CREATE POLICY "movimientos_usuario" ON public.movimientos_agenda
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Políticas para deudas
CREATE POLICY "deudas_usuario" ON public.deudas
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Políticas para deuda_cuotas
CREATE POLICY "deuda_cuotas_usuario" ON public.deuda_cuotas
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Políticas para deuda_pagos
CREATE POLICY "deuda_pagos_usuario" ON public.deuda_pagos
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- TRIGGER AUTOMÁTICO: Inicialización de Usuario Nuevo
-- Crea automáticamente las categorías base y el saldo inicial al registrarse
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Crear configuración inicial de billetera con saldo 0.00
    INSERT INTO public.config_billetera (user_id, monto_base)
    VALUES (NEW.id, 0.00)
    ON CONFLICT (user_id) DO NOTHING;

    -- 2. Crear categorías iniciales sugeridas
    INSERT INTO public.categorias (user_id, nombre, color, icono)
    VALUES
        (NEW.id, 'Otros', '#7f8c8d', 'fa-folder'),
        (NEW.id, 'Alimentación', '#e67e22', 'fa-utensils'),
        (NEW.id, 'Servicios', '#3498db', 'fa-bolt'),
        (NEW.id, 'Transporte', '#9b59b6', 'fa-bus'),
        (NEW.id, 'Vivienda', '#1abc9c', 'fa-home'),
        (NEW.id, 'Salud', '#e74c3c', 'fa-heartbeat')
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();

-- Permisos para roles autenticados
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

