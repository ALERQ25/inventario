// src/app/services/producto.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

// Interfaces
export interface Producto {
  id?: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  cantidad: number;
  precio: number;
  categoria?: string;
}

export interface ValidacionExcel {
  valido: boolean;
  mensaje: string;
  errores: string[];
  total_filas: number;
  datos_previos: Producto[];
  advertencias?: string[];
}

export interface ResultadoCarga {
  success: boolean;
  mensaje: string;
  productos_creados: number;
  productos_actualizados: number;
  errores: string[];
  total_procesados: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProductoService {
  private apiUrl = 'http://localhost:8000/api';
  private wsUrl = 'ws://localhost:8000';

  constructor(private http: HttpClient) { }

  // ==================== ENDPOINTS BÁSICOS ====================

  obtenerProductos(): Observable<Producto[]> {
    return this.http.get<Producto[]>(`${this.apiUrl}/productos`).pipe(
      catchError(this.handleError)
    );
  }

  obtenerProductoPorId(id: number): Observable<Producto> {
    return this.http.get<Producto>(`${this.apiUrl}/productos/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  crearProducto(producto: Producto): Observable<Producto> {
    return this.http.post<Producto>(`${this.apiUrl}/productos`, producto).pipe(
      catchError(this.handleError)
    );
  }

  actualizarProducto(id: number, producto: Producto): Observable<Producto> {
    return this.http.put<Producto>(`${this.apiUrl}/productos/${id}`, producto).pipe(
      catchError(this.handleError)
    );
  }

  eliminarProducto(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/productos/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  // ==================== ENDPOINTS EXCEL ====================

  validarExcel(archivo: File): Observable<ValidacionExcel> {
    const formData = new FormData();
    formData.append('file', archivo);

    return this.http.post<ValidacionExcel>(
      `${this.apiUrl}/productos/validar-excel`,
      formData
    ).pipe(
      catchError(this.handleError)
    );
  }

  cargarExcel(archivo: File): Observable<ResultadoCarga> {
    const formData = new FormData();
    formData.append('file', archivo);

    return this.http.post<ResultadoCarga>(
      `${this.apiUrl}/productos/cargar-excel`,
      formData
    ).pipe(
      catchError(this.handleError)
    );
  }

  crearWebSocketProgreso(): WebSocket {
    const wsUrl = 'ws://localhost:8000/ws/productos/progreso';
    console.log('🔌 Creando WebSocket:', wsUrl);
    return new WebSocket(wsUrl);
  }

  // ==================== ENDPOINTS ESTADÍSTICAS Y GRÁFICAS ====================

  obtenerEstadisticas(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/productos/estadisticas`).pipe(
      catchError(this.handleError)
    );
  }

  obtenerGraficaCategorias(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/productos/graficas/categorias`).pipe(
      catchError(this.handleError)
    );
  }

  obtenerGraficaStockBajo(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/productos/graficas/stock-bajo`).pipe(
      catchError(this.handleError)
    );
  }

  obtenerGraficaTopProductos(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/productos/graficas/top-productos`).pipe(
      catchError(this.handleError)
    );
  }

  obtenerGraficaDistribucionPrecios(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/productos/graficas/distribucion-precios`).pipe(
      catchError(this.handleError)
    );
  }

  // ==================== MANEJO DE ERRORES ====================

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Ocurrió un error desconocido';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Error: ${error.error.message}`;
    } else {
      if (error.status === 0) {
        errorMessage = 'No se pudo conectar con el servidor. Verifica tu conexión.';
      } else if (error.error) {
        if (typeof error.error === 'string') {
          errorMessage = error.error;
        } else if (error.error.detail) {
          if (typeof error.error.detail === 'string') {
            errorMessage = error.error.detail;
          } else if (Array.isArray(error.error.detail)) {
            errorMessage = error.error.detail
              .map((err: any) => `${err.loc?.join('.')}: ${err.msg}`)
              .join(', ');
          } else {
            errorMessage = JSON.stringify(error.error.detail);
          }
        } else if (error.error.mensaje || error.error.message) {
          errorMessage = error.error.mensaje || error.error.message;
        } else {
          errorMessage = `Error ${error.status}: ${error.statusText}`;
        }
      } else {
        errorMessage = `Error ${error.status}: ${error.statusText}`;
      }
    }

    console.error('Error completo:', error);
    console.error('Mensaje de error:', errorMessage);

    return throwError(() => new Error(errorMessage));
  }
}