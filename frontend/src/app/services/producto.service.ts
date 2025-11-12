import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Producto {
  id?: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  cantidad: number;
  precio: number;
  categoria?: string;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

export interface ValidacionExcel {
  valido: boolean;
  errores: string[];
  advertencias: string[];
  total_filas: number;
  datos_previos: Producto[];
}

export interface ResultadoCarga {
  success: boolean;
  mensaje: string;
  exitosos: number;
  fallidos: number;
  errores: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ProductoService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getProductos(): Observable<Producto[]> {
    return this.http.get<Producto[]>(`${this.apiUrl}/productos`);
  }

  obtenerProductos(): Observable<Producto[]> {
    return this.getProductos();
  }

  getProducto(id: number): Observable<Producto> {
    return this.http.get<Producto>(`${this.apiUrl}/productos/${id}`);
  }

  createProducto(producto: Producto): Observable<Producto> {
    return this.http.post<Producto>(`${this.apiUrl}/productos`, producto);
  }

  crearProducto(producto: Producto): Observable<Producto> {
    return this.createProducto(producto);
  }

  updateProducto(id: number, producto: Producto): Observable<Producto> {
    return this.http.put<Producto>(`${this.apiUrl}/productos/${id}`, producto);
  }

  actualizarProducto(id: number, producto: Producto): Observable<Producto> {
    return this.updateProducto(id, producto);
  }

  deleteProducto(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/productos/${id}`);
  }

  eliminarProducto(id: number): Observable<any> {
    return this.deleteProducto(id);
  }

  validarExcel(archivo: File): Observable<ValidacionExcel> {
    const formData = new FormData();
    formData.append('archivo', archivo);
    return this.http.post<ValidacionExcel>(`${this.apiUrl}/productos/validar-excel`, formData);
  }

  cargarExcel(archivo: File): Observable<ResultadoCarga> {
    const formData = new FormData();
    formData.append('archivo', archivo);
    return this.http.post<ResultadoCarga>(`${this.apiUrl}/productos/cargar-excel`, formData);
  }
}
