from fastapi import FastAPI, HTTPException, status, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import time
import pandas as pd
import io
import asyncio

app = FastAPI(
    title="Sistema de Inventario API",
    description="API REST para gestión de inventario con validaciones completas",
    version="2.0.0"
)

# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración de base de datos
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'db'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'inventario'),
    'user': os.getenv('DB_USER', 'admin'),
    'password': os.getenv('DB_PASSWORD', 'admin123')
}

def get_db_connection():
    """Obtiene conexión a la base de datos con reintentos"""
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
            return conn
        except psycopg2.OperationalError as e:
            if attempt < max_retries - 1:
                print(f"Intento {attempt + 1} fallido. Reintentando en {retry_delay} segundos...")
                time.sleep(retry_delay)
            else:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="No se pudo conectar a la base de datos"
                )

# Gestor de conexiones WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_progress(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Error enviando mensaje: {e}")
                disconnected.append(connection)
        
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

# Modelos Pydantic
class ProductoBase(BaseModel):
    codigo: str = Field(..., min_length=1, max_length=50)
    nombre: str = Field(..., min_length=1, max_length=200)
    descripcion: Optional[str] = None
    cantidad: int = Field(0, ge=0)
    precio: float = Field(..., gt=0)
    categoria: Optional[str] = Field(None, max_length=100)
    
    @validator('codigo')
    def codigo_no_vacio(cls, v):
        if not v or not v.strip():
            raise ValueError('El código no puede estar vacío')
        return v.strip()
    
    @validator('nombre')
    def nombre_no_vacio(cls, v):
        if not v or not v.strip():
            raise ValueError('El nombre no puede estar vacío')
        return v.strip()
    
    @validator('precio')
    def precio_valido(cls, v):
        if v <= 0:
            raise ValueError('El precio debe ser mayor a 0')
        return round(v, 2)

class ProductoCreate(ProductoBase):
    pass

class ProductoUpdate(BaseModel):
    codigo: Optional[str] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    cantidad: Optional[int] = None
    precio: Optional[float] = None
    categoria: Optional[str] = None

class ProductoResponse(ProductoBase):
    id: int
    fecha_creacion: datetime
    fecha_actualizacion: datetime

class ValidacionExcel(BaseModel):
    valido: bool
    mensaje: str
    errores: List[str] = []
    advertencias: List[str] = []
    total_filas: int = 0
    datos_previos: List[dict] = []

# ==================== ENDPOINTS BÁSICOS ====================

@app.get("/", tags=["Root"])
def read_root():
    return {
        "message": "API de Sistema de Inventario con FastAPI",
        "version": "2.0.0",
        "docs": "/docs"
    }

@app.get("/health", tags=["Health"])
def health_check():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        conn.close()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

# ==================== ENDPOINTS DE ESTADÍSTICAS (ANTES DE {producto_id}) ====================

@app.get("/api/productos/estadisticas", tags=["Estadísticas"])
def obtener_estadisticas():
    """Obtiene estadísticas generales del inventario"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) as total FROM productos")
        total_productos = cursor.fetchone()['total']
        
        cursor.execute("SELECT SUM(precio * cantidad) as valor_total FROM productos")
        valor_total = cursor.fetchone()['valor_total'] or 0
        
        cursor.execute("SELECT COUNT(*) as stock_bajo FROM productos WHERE cantidad < 10")
        stock_bajo = cursor.fetchone()['stock_bajo']
        
        cursor.execute("SELECT COUNT(*) as sin_stock FROM productos WHERE cantidad = 0")
        sin_stock = cursor.fetchone()['sin_stock']
        
        cursor.execute("SELECT SUM(cantidad) as cantidad_total FROM productos")
        cantidad_total = cursor.fetchone()['cantidad_total'] or 0
        
        cursor.execute("SELECT AVG(precio) as precio_promedio FROM productos")
        precio_promedio = cursor.fetchone()['precio_promedio'] or 0
        
        cursor.execute("SELECT COUNT(DISTINCT categoria) as total_categorias FROM productos WHERE categoria IS NOT NULL AND categoria != ''")
        total_categorias = cursor.fetchone()['total_categorias']
        
        return {
            'total_productos': total_productos,
            'valor_total_inventario': round(valor_total, 2),
            'stock_bajo': stock_bajo,
            'sin_stock': sin_stock,
            'cantidad_total_items': int(cantidad_total),
            'precio_promedio': round(precio_promedio, 2),
            'total_categorias': total_categorias
        }
    finally:
        conn.close()

@app.get("/api/productos/graficas/categorias", tags=["Estadísticas"])
def obtener_productos_por_categoria():
    """Obtiene cantidad de productos por categoría"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                COALESCE(NULLIF(categoria, ''), 'Sin categoría') as categoria,
                COUNT(*) as cantidad,
                SUM(precio * cantidad) as valor_total
            FROM productos
            GROUP BY categoria
            ORDER BY cantidad DESC
        """)
        resultados = cursor.fetchall()
        
        return {
            'categorias': [r['categoria'] for r in resultados],
            'cantidades': [r['cantidad'] for r in resultados],
            'valores': [float(r['valor_total'] or 0) for r in resultados]
        }
    finally:
        conn.close()

@app.get("/api/productos/graficas/stock-bajo", tags=["Estadísticas"])
def obtener_productos_stock_bajo():
    """Obtiene productos con stock bajo"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT codigo, nombre, cantidad, precio
            FROM productos
            WHERE cantidad < 10
            ORDER BY cantidad ASC
            LIMIT 10
        """)
        resultados = cursor.fetchall()
        
        return {
            'productos': [r['nombre'] for r in resultados],
            'cantidades': [r['cantidad'] for r in resultados],
            'codigos': [r['codigo'] for r in resultados]
        }
    finally:
        conn.close()

@app.get("/api/productos/graficas/top-productos", tags=["Estadísticas"])
def obtener_top_productos():
    """Obtiene los productos más valiosos"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                codigo, nombre, cantidad, precio,
                (precio * cantidad) as valor_total
            FROM productos
            ORDER BY valor_total DESC
            LIMIT 10
        """)
        resultados = cursor.fetchall()
        
        return {
            'productos': [r['nombre'] for r in resultados],
            'valores': [float(r['valor_total']) for r in resultados],
            'cantidades': [r['cantidad'] for r in resultados],
            'precios': [float(r['precio']) for r in resultados]
        }
    finally:
        conn.close()

@app.get("/api/productos/graficas/distribucion-precios", tags=["Estadísticas"])
def obtener_distribucion_precios():
    """Obtiene la distribución de productos por rangos de precio"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN precio < 50 THEN '< $50'
                    WHEN precio < 100 THEN '$50 - $100'
                    WHEN precio < 500 THEN '$100 - $500'
                    WHEN precio < 1000 THEN '$500 - $1000'
                    ELSE '> $1000'
                END as rango,
                COUNT(*) as cantidad
            FROM productos
            GROUP BY rango
            ORDER BY 
                CASE 
                    WHEN precio < 50 THEN 1
                    WHEN precio < 100 THEN 2
                    WHEN precio < 500 THEN 3
                    WHEN precio < 1000 THEN 4
                    ELSE 5
                END
        """)
        resultados = cursor.fetchall()
        
        return {
            'rangos': [r['rango'] for r in resultados],
            'cantidades': [r['cantidad'] for r in resultados]
        }
    finally:
        conn.close()

# ==================== ENDPOINTS EXCEL ====================

@app.post("/api/productos/validar-excel", response_model=ValidacionExcel, tags=["Productos"])
async def validar_excel(file: UploadFile = File(...)):
    MAX_SIZE = 10 * 1024 * 1024
    contents = await file.read()
    
    if len(contents) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El archivo excede el tamaño máximo de 10 MB"
        )
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un Excel (.xlsx o .xls)"
        )
    
    try:
        df = pd.read_excel(io.BytesIO(contents))
        df.columns = [str(col).lower().strip().replace('\xa0', '').replace(' ', '') for col in df.columns]
        
        errores = []
        advertencias = []
        
        columnas_requeridas = ['codigo', 'nombre', 'cantidad', 'precio']
        columnas_presentes = list(df.columns)
        
        for col in columnas_requeridas:
            if col not in columnas_presentes:
                errores.append(f"Falta la columna requerida: '{col}'")
        
        if errores:
            return ValidacionExcel(
                valido=False,
                mensaje="El archivo tiene errores de estructura",
                errores=errores,
                advertencias=[f"Columnas encontradas: {', '.join(columnas_presentes)}"],
                total_filas=len(df)
            )
        
        filas_vacias = df.isnull().all(axis=1).sum()
        if filas_vacias > 0:
            advertencias.append(f"Se encontraron {filas_vacias} filas vacías que serán ignoradas")
            df = df.dropna(how='all')
        
        for idx, row in df.iterrows():
            fila = idx + 2
            
            if pd.isna(row['codigo']) or str(row['codigo']).strip() == '':
                errores.append(f"Fila {fila}: El código no puede estar vacío")
            
            if pd.isna(row['nombre']) or str(row['nombre']).strip() == '':
                errores.append(f"Fila {fila}: El nombre no puede estar vacío")
            
            try:
                cantidad = float(row['cantidad'])
                if cantidad < 0:
                    errores.append(f"Fila {fila}: La cantidad no puede ser negativa")
            except:
                errores.append(f"Fila {fila}: La cantidad debe ser un número")
            
            try:
                precio = float(row['precio'])
                if precio <= 0:
                    errores.append(f"Fila {fila}: El precio debe ser mayor a 0")
            except:
                errores.append(f"Fila {fila}: El precio debe ser un número")
        
        if len(errores) > 10:
            errores = errores[:10] + [f"... y {len(errores) - 10} errores más"]
        
        datos_previos = []
        for _, row in df.head(5).iterrows():
            datos_previos.append({
                'codigo': str(row['codigo']),
                'nombre': str(row['nombre']),
                'descripcion': str(row.get('descripcion', '')),
                'cantidad': int(row['cantidad']) if pd.notna(row['cantidad']) else 0,
                'precio': float(row['precio']) if pd.notna(row['precio']) else 0,
                'categoria': str(row.get('categoria', ''))
            })
        
        return ValidacionExcel(
            valido=len(errores) == 0,
            mensaje="Validación exitosa" if len(errores) == 0 else "Se encontraron errores",
            errores=errores,
            advertencias=advertencias,
            total_filas=len(df),
            datos_previos=datos_previos
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al procesar el archivo: {str(e)}"
        )

@app.post("/api/productos/cargar-excel", tags=["Productos"])
async def cargar_excel(file: UploadFile = File(...)):
    contents = await file.read()
    
    try:
        df = pd.read_excel(io.BytesIO(contents))
        df.columns = [col.lower().strip().replace('\xa0', '').replace(' ', '') for col in df.columns]
        df = df.dropna(how='all')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        total = len(df)
        productos_creados = 0
        productos_actualizados = 0
        fallidos = 0
        errores_detalle = []
        
        BATCH_SIZE = 50
        
        for idx, row in df.iterrows():
            try:
                codigo = str(row['codigo']).strip()
                nombre = str(row['nombre']).strip()
                descripcion = str(row.get('descripcion', ''))
                cantidad = int(row['cantidad'])
                precio = float(row['precio'])
                categoria = str(row.get('categoria', ''))
                
                cursor.execute("SELECT id FROM productos WHERE codigo = %s", (codigo,))
                existe = cursor.fetchone()
                
                if existe:
                    cursor.execute(
                        """
                        UPDATE productos 
                        SET nombre = %s, descripcion = %s, cantidad = %s, precio = %s, categoria = %s
                        WHERE codigo = %s
                        """,
                        (nombre, descripcion, cantidad, precio, categoria, codigo)
                    )
                    productos_actualizados += 1
                else:
                    cursor.execute(
                        """
                        INSERT INTO productos (codigo, nombre, descripcion, cantidad, precio, categoria)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (codigo, nombre, descripcion, cantidad, precio, categoria)
                    )
                    productos_creados += 1
                
                if (idx + 1) % BATCH_SIZE == 0:
                    conn.commit()
                    progreso = int(((idx + 1) / total) * 100)
                    await manager.send_progress({
                        'progreso': progreso,
                        'procesados': idx + 1,
                        'total': total,
                        'exitosos': productos_creados + productos_actualizados,
                        'fallidos': fallidos,
                        'mensaje': f'Procesando: {idx + 1}/{total}'
                    })
                
            except Exception as e:
                fallidos += 1
                errores_detalle.append(f"Fila {idx + 2}: {str(e)}")
                if fallidos > 10:
                    break
        
        conn.commit()
        conn.close()
        
        await manager.send_progress({
            'progreso': 100,
            'procesados': total,
            'total': total,
            'exitosos': productos_creados + productos_actualizados,
            'fallidos': fallidos,
            'mensaje': 'Carga completada',
            'completado': True
        })
        
        return {
            'success': True,
            'mensaje': f'Carga completada',
            'productos_creados': productos_creados,
            'productos_actualizados': productos_actualizados,
            'total_procesados': productos_creados + productos_actualizados,
            'errores': errores_detalle[:10]
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al cargar el archivo: {str(e)}"
        )

@app.websocket("/ws/productos/progreso")
async def websocket_progreso(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"Error en WebSocket: {e}")
        manager.disconnect(websocket)

# ==================== ENDPOINTS CRUD (DESPUÉS DE ESTADÍSTICAS) ====================

@app.get("/api/productos", response_model=list[ProductoResponse], tags=["Productos"])
def obtener_productos():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM productos ORDER BY id DESC")
        productos = cursor.fetchall()
        return productos
    finally:
        conn.close()

@app.get("/api/productos/{producto_id}", response_model=ProductoResponse, tags=["Productos"])
def obtener_producto(producto_id: int):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM productos WHERE id = %s", (producto_id,))
        producto = cursor.fetchone()
        
        if not producto:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Producto con ID {producto_id} no encontrado"
            )
        
        return producto
    finally:
        conn.close()

@app.post("/api/productos", response_model=ProductoResponse, status_code=status.HTTP_201_CREATED, tags=["Productos"])
def crear_producto(producto: ProductoCreate):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        cursor.execute("SELECT id FROM productos WHERE codigo = %s", (producto.codigo,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El código del producto ya existe"
            )
        
        cursor.execute(
            """
            INSERT INTO productos (codigo, nombre, descripcion, cantidad, precio, categoria)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (producto.codigo, producto.nombre, producto.descripcion, 
             producto.cantidad, producto.precio, producto.categoria)
        )
        
        nuevo_producto = cursor.fetchone()
        conn.commit()
        
        return nuevo_producto
    except psycopg2.IntegrityError:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error de integridad en los datos"
        )
    finally:
        conn.close()

@app.put("/api/productos/{producto_id}", response_model=ProductoResponse, tags=["Productos"])
def actualizar_producto(producto_id: int, producto: ProductoUpdate):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM productos WHERE id = %s", (producto_id,))
        if not cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Producto con ID {producto_id} no encontrado"
            )
        
        campos_actualizar = []
        valores = []
        
        if producto.codigo is not None:
            campos_actualizar.append("codigo = %s")
            valores.append(producto.codigo)
        if producto.nombre is not None:
            campos_actualizar.append("nombre = %s")
            valores.append(producto.nombre)
        if producto.descripcion is not None:
            campos_actualizar.append("descripcion = %s")
            valores.append(producto.descripcion)
        if producto.cantidad is not None:
            campos_actualizar.append("cantidad = %s")
            valores.append(producto.cantidad)
        if producto.precio is not None:
            campos_actualizar.append("precio = %s")
            valores.append(producto.precio)
        if producto.categoria is not None:
            campos_actualizar.append("categoria = %s")
            valores.append(producto.categoria)
        
        if not campos_actualizar:
            cursor.execute("SELECT * FROM productos WHERE id = %s", (producto_id,))
            return cursor.fetchone()
        
        valores.append(producto_id)
        query = f"UPDATE productos SET {', '.join(campos_actualizar)} WHERE id = %s RETURNING *"
        
        cursor.execute(query, valores)
        producto_actualizado = cursor.fetchone()
        conn.commit()
        
        return producto_actualizado
    finally:
        conn.close()

@app.delete("/api/productos/{producto_id}", tags=["Productos"])
def eliminar_producto(producto_id: int):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        cursor.execute("DELETE FROM productos WHERE id = %s RETURNING *", (producto_id,))
        producto_eliminado = cursor.fetchone()
        
        if not producto_eliminado:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Producto con ID {producto_id} no encontrado"
            )
        
        conn.commit()
        
        return {
            "message": "Producto eliminado correctamente",
            "producto": producto_eliminado
        }
    finally:
        conn.close()