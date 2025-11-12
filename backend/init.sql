CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    cantidad INTEGER NOT NULL DEFAULT 0,
    precio DECIMAL(10, 2) NOT NULL,
    categoria VARCHAR(100),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_cantidad CHECK (cantidad >= 0),
    CONSTRAINT check_precio CHECK (precio >= 0),
    CONSTRAINT check_codigo_no_vacio CHECK (LENGTH(TRIM(codigo)) > 0),
    CONSTRAINT check_nombre_no_vacio CHECK (LENGTH(TRIM(nombre)) > 0)
);

CREATE INDEX idx_codigo ON productos(codigo);
CREATE INDEX idx_categoria ON productos(categoria);
CREATE INDEX idx_nombre ON productos(nombre);

CREATE OR REPLACE FUNCTION actualizar_fecha_modificacion()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_actualizacion = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_actualizar_fecha
    BEFORE UPDATE ON productos
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_fecha_modificacion();

INSERT INTO productos (codigo, nombre, descripcion, cantidad, precio, categoria) VALUES
('PROD001', 'Laptop Dell XPS 15', 'Laptop de alto rendimiento', 10, 1299.99, 'Electrónica'),
('PROD002', 'Mouse Logitech MX Master', 'Mouse ergonómico inalámbrico', 25, 99.99, 'Accesorios'),
('PROD003', 'Teclado Mecánico Keychron K2', 'Teclado mecánico retroiluminado', 15, 89.99, 'Accesorios'),
('PROD004', 'Monitor LG 27 4K', 'Monitor 4K UHD 27 pulgadas', 8, 449.99, 'Electrónica'),
('PROD005', 'Webcam Logitech C920', 'Webcam Full HD 1080p', 20, 79.99, 'Accesorios');
