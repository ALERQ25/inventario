# backend/models.py
from sqlalchemy import Column, Integer, String, Numeric, Text, DateTime
from datetime import datetime
from database import Base


class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    codigo = Column(String(50), unique=True, index=True, nullable=False)
    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    cantidad = Column(Integer, default=0, nullable=False)
    precio = Column(Numeric(10, 2), nullable=False)
    categoria = Column(String(100), nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    fecha_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Producto(codigo='{self.codigo}', nombre='{self.nombre}')>"