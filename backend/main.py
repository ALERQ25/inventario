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
    version="1.0.0"
)

# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200",
                    "http://localhost:46451",
                    "*"
                    ],
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
        self.active_connections.remove(websocket)

    async def send_progress(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# Modelos Pydantic con validaciones
class ProductoBase(BaseModel):
    codigo: str = Field(..., min_length=1, max_length=50, description="Código único del producto")
    nombre: str = Field(..., min_length=1, max_length=200, description="Nombre del producto")
    descripcion: Optional[str] = Field(None, description="Descripción del producto")
    cantidad: int = Field(0, ge=0, description="Cantidad en stock")
    precio: float = Field(..., gt=0, description="Precio del producto")
    categoria: Optional[str] = Field(None, max_length=100, description="Categoría del producto")
    
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
    codigo: Optional[str] = Field(None, min_length=1, max_length=50)
    nombre: Optional[str] = Field(None, min_length=1, max_length=200)
    descripcion: Optional[str] = None
    cantidad: Optional[int] = Field(None, ge=0)
    precio: Optional[float] = Field(None, gt=0)
    categoria: Optional[str] = Field(None, max_length=100)

class ProductoResponse(ProductoBase):
    id: int
    fecha_creacion: datetime
    fecha_actualizacion: datetime

class ErrorResponse(BaseModel):
    detail: str
    errores: Optional[list[str]] = None

class ValidacionExcel(BaseModel):
    valido: bool
    errores: List[str] = []
    advertencias: List[str] = []
    total_filas: int = 0
    datos_previos: List[dict] = []

# Endpoints
@app.get("/", tags=["Root"])
def read_root():
    """Información de la API"""
    return {
        "message": "API de Sistema de Inventario con FastAPI",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "productos": "/api/productos",
            "cargar_excel": "/api/productos/cargar-excel"
        }
    }

@app.get("/api/productos", response_model=list[ProductoResponse], tags=["Productos"])
def obtener_productos():
    """Obtiene todos los productos del inventario ordenados por ID descendente"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM productos ORDER BY id DESC")
        productos = cursor.fetchall()
        return productos
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al obtener productos: {str(e)}"
        )
    finally:
        conn.close()

@app.get("/api/productos/{producto_id}", response_model=ProductoResponse, tags=["Productos"])
def obtener_producto(producto_id: int):
    """Obtiene un producto específico por su ID"""
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
    """Crea un nuevo producto en el inventario"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Verificar si el código ya existe
        cursor.execute("SELECT id FROM productos WHERE codigo = %s", (producto.codigo,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El código del producto ya existe"
            )
        
        # Insertar nuevo producto
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
    except psycopg2.IntegrityError as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error de integridad en los datos"
        )
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al crear producto: {str(e)}"
        )
    finally:
        conn.close()

@app.put("/api/productos/{producto_id}", response_model=ProductoResponse, tags=["Productos"])
def actualizar_producto(producto_id: int, producto: ProductoUpdate):
    """Actualiza un producto existente"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Verificar que el producto existe
        cursor.execute("SELECT * FROM productos WHERE id = %s", (producto_id,))
        producto_existente = cursor.fetchone()
        
        if not producto_existente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Producto con ID {producto_id} no encontrado"
            )
        
        # Verificar código duplicado si se está actualizando
        if producto.codigo:
            cursor.execute(
                "SELECT id FROM productos WHERE codigo = %s AND id != %s",
                (producto.codigo, producto_id)
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="El código ya existe en otro producto"
                )
        
        # Construir query de actualización dinámicamente
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
            return producto_existente
        
        valores.append(producto_id)
        query = f"UPDATE productos SET {', '.join(campos_actualizar)} WHERE id = %s RETURNING *"
        
        cursor.execute(query, valores)
        producto_actualizado = cursor.fetchone()
        conn.commit()
        
        return producto_actualizado
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al actualizar producto: {str(e)}"
        )
    finally:
        conn.close()

@app.delete("/api/productos/{producto_id}", tags=["Productos"])
def eliminar_producto(producto_id: int):
    """Elimina un producto del inventario"""
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
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al eliminar producto: {str(e)}"
        )
    finally:
        conn.close()

# ==================== ENDPOINTS PARA CARGA DE EXCEL ====================

@app.post("/api/productos/validar-excel", response_model=ValidacionExcel, tags=["Productos"])
async def validar_excel(file: UploadFile = File(...)):
    """
    Valida la estructura del archivo Excel antes de cargarlo.
    Columnas requeridas: codigo, nombre, cantidad, precio
    Columnas opcionales: descripcion, categoria
    """
    
    # Validar tamaño del archivo (10 MB)
    MAX_SIZE = 10 * 1024 * 1024  # 10 MB en bytes
    contents = await file.read()
    
    if len(contents) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"El archivo excede el tamaño máximo de 10 MB"
        )
    
    # Validar que sea un archivo Excel
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un Excel (.xlsx o .xls)"
        )
    
    try:
        # Leer el Excel
        df = pd.read_excel(io.BytesIO(contents))
        
        errores = []
        advertencias = []
        
        # Validar columnas requeridas
        columnas_requeridas = ['codigo', 'nombre', 'cantidad', 'precio']
        columnas_presentes = [col.lower().strip() for col in df.columns]
        
        for col in columnas_requeridas:
            if col not in columnas_presentes:
                errores.append(f"Falta la columna requerida: '{col}'")
        
        if errores:
            return ValidacionExcel(
                valido=False,
                errores=errores,
                total_filas=len(df)
            )
        
        # Normalizar nombres de columnas
        df.columns = [col.lower().strip() for col in df.columns]
        
        # Validar filas vacías
        filas_vacias = df.isnull().all(axis=1).sum()
        if filas_vacias > 0:
            advertencias.append(f"Se encontraron {filas_vacias} filas completamente vacías que serán ignoradas")
            df = df.dropna(how='all')
        
        # Validar datos por fila
        for idx, row in df.iterrows():
            fila = idx + 2  # +2 porque Excel empieza en 1 y tiene header
            
            # Código vacío
            if pd.isna(row['codigo']) or str(row['codigo']).strip() == '':
                errores.append(f"Fila {fila}: El código no puede estar vacío")
            
            # Nombre vacío
            if pd.isna(row['nombre']) or str(row['nombre']).strip() == '':
                errores.append(f"Fila {fila}: El nombre no puede estar vacío")
            
            # Cantidad negativa
            try:
                cantidad = float(row['cantidad'])
                if cantidad < 0:
                    errores.append(f"Fila {fila}: La cantidad no puede ser negativa")
            except:
                errores.append(f"Fila {fila}: La cantidad debe ser un número")
            
            # Precio inválido
            try:
                precio = float(row['precio'])
                if precio <= 0:
                    errores.append(f"Fila {fila}: El precio debe ser mayor a 0")
            except:
                errores.append(f"Fila {fila}: El precio debe ser un número")
        
        # Limitar errores mostrados
        if len(errores) > 10:
            errores_mostrar = errores[:10]
            errores_mostrar.append(f"... y {len(errores) - 10} errores más")
            errores = errores_mostrar
        
        # Preparar vista previa (primeras 5 filas)
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
    """
    Carga productos desde un archivo Excel a la base de datos.
    Procesa en lotes y envía progreso por WebSocket.
    """
    
    contents = await file.read()
    
    try:
        df = pd.read_excel(io.BytesIO(contents))
        df.columns = [col.lower().strip() for col in df.columns]
        df = df.dropna(how='all')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        total = len(df)
        exitosos = 0
        fallidos = 0
        errores_detalle = []
        
        # Procesar en lotes de 100
        BATCH_SIZE = 100
        
        for idx, row in df.iterrows():
            try:
                # Verificar si el código ya existe
                cursor.execute("SELECT id FROM productos WHERE codigo = %s", (str(row['codigo']),))
                if cursor.fetchone():
                    # Actualizar producto existente
                    cursor.execute(
                        """
                        UPDATE productos 
                        SET nombre = %s, descripcion = %s, cantidad = %s, precio = %s, categoria = %s
                        WHERE codigo = %s
                        """,
                        (
                            str(row['nombre']),
                            str(row.get('descripcion', '')),
                            int(row['cantidad']),
                            float(row['precio']),
                            str(row.get('categoria', '')),
                            str(row['codigo'])
                        )
                    )
                else:
                    # Insertar nuevo producto
                    cursor.execute(
                        """
                        INSERT INTO productos (codigo, nombre, descripcion, cantidad, precio, categoria)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            str(row['codigo']),
                            str(row['nombre']),
                            str(row.get('descripcion', '')),
                            int(row['cantidad']),
                            float(row['precio']),
                            str(row.get('categoria', ''))
                        )
                    )
                
                exitosos += 1
                
                # Commit cada batch
                if (idx + 1) % BATCH_SIZE == 0:
                    conn.commit()
                    # Enviar progreso
                    progreso = int(((idx + 1) / total) * 100)
                    await manager.send_progress({
                        'progreso': progreso,
                        'procesados': idx + 1,
                        'total': total,
                        'exitosos': exitosos,
                        'fallidos': fallidos
                    })
                
            except Exception as e:
                fallidos += 1
                errores_detalle.append(f"Fila {idx + 2}: {str(e)}")
        
        conn.commit()
        conn.close()
        
        # Enviar progreso final
        await manager.send_progress({
            'progreso': 100,
            'procesados': total,
            'total': total,
            'exitosos': exitosos,
            'fallidos': fallidos,
            'completado': True
        })
        
        return {
            'success': True,
            'mensaje': f'Carga completada: {exitosos} exitosos, {fallidos} fallidos',
            'exitosos': exitosos,
            'fallidos': fallidos,
            'errores': errores_detalle[:10]  # Solo primeros 10
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al cargar el archivo: {str(e)}"
        )

@app.websocket("/ws/productos/progreso")
async def websocket_progreso(websocket: WebSocket):
    """WebSocket para enviar progreso de carga en tiempo real"""
    await manager.connect(websocket)
    try:
        while True:
            # Mantener conexión activa
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ==================== FIN ENDPOINTS EXCEL ====================

@app.get("/health", tags=["Health"])
def health_check():
    """Verifica el estado de la API y la conexión a la base de datos"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        conn.close()
        return {
            "status": "healthy",
            "database": "connected"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }