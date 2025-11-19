// src/app/components/carga-excel/carga-excel.component.ts
import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProductoService, ValidacionExcel, ResultadoCarga } from '../../services/producto.service';

@Component({
  selector: 'app-carga-excel',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './carga-excel.component.html',
  styleUrls: ['./carga-excel.component.css']
})
export class CargaExcelComponent implements OnDestroy {
  archivoSeleccionado: File | null = null;
  nombreArchivo = '';
  validacion: ValidacionExcel | null = null;
  resultado: ResultadoCarga | null = null;
  validando = false;
  cargando = false;
  mostrarVistaPrevia = false;
  mensajeError = '';
  mensajeExito = '';
  mensajeAdvertencia = '';
  progreso = 0;
  progresoMensaje = '';
  websocket: WebSocket | null = null;
  intervaloSimulacion: any = null;

  constructor(private productoService: ProductoService) {}

  onFileSelected(event: any): void {
    this.limpiarMensajes();
    const file: File = event.target?.files?.[0];
    
    if (!file) {
      this.mensajeAdvertencia = 'No se seleccionó ningún archivo';
      return;
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      this.mensajeError = 'El archivo excede el tamaño máximo de 10 MB';
      this.archivoSeleccionado = null;
      this.nombreArchivo = '';
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(extension || '')) {
      this.mensajeError = 'Solo se permiten archivos Excel (.xlsx o .xls)';
      this.archivoSeleccionado = null;
      this.nombreArchivo = '';
      return;
    }

    this.archivoSeleccionado = file;
    this.nombreArchivo = file.name;
    this.validacion = null;
    this.resultado = null;
    this.mostrarVistaPrevia = false;
    this.validarArchivo();
  }

  validarArchivo(): void {
    if (!this.archivoSeleccionado) {
      this.mensajeAdvertencia = 'Por favor selecciona un archivo';
      return;
    }

    this.validando = true;
    this.limpiarMensajes();
    this.validacion = null;

    this.productoService.validarExcel(this.archivoSeleccionado).subscribe({
      next: (validacion) => {
        this.validacion = validacion;
        this.validando = false;
        
        if (validacion.valido) {
          this.mensajeExito = validacion.mensaje;
          this.mostrarVistaPrevia = validacion.datos_previos.length > 0;
          
          if (validacion.advertencias && validacion.advertencias.length > 0) {
            this.mensajeAdvertencia = validacion.advertencias.join(', ');
          }
        } else {
          this.mensajeError = validacion.mensaje;
          
          if (validacion.errores.length > 0) {
            const erroresTexto = validacion.errores.slice(0, 3).join('; ');
            this.mensajeError += ` - ${erroresTexto}`;
            
            if (validacion.errores.length > 3) {
              this.mensajeError += ` (y ${validacion.errores.length - 3} errores más)`;
            }
          }
        }
      },
      error: (error: Error) => {
        this.mensajeError = error.message || 'Error desconocido al validar el archivo';
        this.validando = false;
        console.error('Error de validación:', error);
      }
    });
  }

  cargarArchivo(): void {
    console.log('🚀 INICIANDO CARGA');
    console.log('Archivo:', this.archivoSeleccionado?.name);
    console.log('Validación válida:', this.validacion?.valido);
    
    if (!this.archivoSeleccionado) {
      this.mensajeAdvertencia = 'Por favor selecciona un archivo';
      return;
    }

    if (!this.validacion?.valido) {
      this.mensajeAdvertencia = 'Primero valida el archivo';
      return;
    }

    const confirmar = confirm(
      `¿Confirmas cargar ${this.validacion.total_filas} productos a la base de datos?\n\n` +
      `Los códigos existentes serán actualizados.`
    );
    
    if (!confirmar) {
      console.log('❌ Usuario canceló');
      return;
    }

    console.log('✅ ACTIVANDO BARRA DE CARGA');
    this.cargando = true;
    this.progreso = 0;
    this.limpiarMensajes();
    this.resultado = null;

    console.log('Estado cargando:', this.cargando);
    console.log('Progreso inicial:', this.progreso);

    // ✅ FORZAR ACTUALIZACIÓN DE LA VISTA
    setTimeout(() => {
      console.log('🎬 Iniciando simulación y carga');
      
      // Iniciar simulación
      this.simularProgresoGradual();

      // Intentar WebSocket (opcional)
      this.conectarWebSocket();

      // Llamar al servicio DESPUÉS del delay
      this.ejecutarCarga();
    }, 100);
  }

  // ✅ NUEVO MÉTODO: Ejecutar la carga
  ejecutarCarga(): void {
    if (!this.archivoSeleccionado) return;

    this.productoService.cargarExcel(this.archivoSeleccionado).subscribe({
      next: (resultado) => {
        console.log('✅ Respuesta recibida:', resultado);
        
        // ✅ MOSTRAR 100% POR 2 SEGUNDOS ANTES DE CERRAR
        this.progreso = 100;
        this.progresoMensaje = '✅ Carga completada!';
        
        setTimeout(() => {
          this.detenerSimulacion();
          this.resultado = resultado;
          this.cargando = false;
          
          if (resultado.success) {
            this.mensajeExito = resultado.mensaje;
            
            const resumen = `Creados: ${resultado.productos_creados}, ` +
                           `Actualizados: ${resultado.productos_actualizados}, ` +
                           `Total: ${resultado.total_procesados}`;
            this.progresoMensaje = resumen;
            
            if (resultado.errores && resultado.errores.length > 0) {
              const erroresTexto = resultado.errores.slice(0, 3).join('; ');
              this.mensajeAdvertencia = `Algunos productos tuvieron errores: ${erroresTexto}`;
              
              if (resultado.errores.length > 3) {
                this.mensajeAdvertencia += ` (y ${resultado.errores.length - 3} más)`;
              }
            }
          } else {
            this.mensajeError = resultado.mensaje;
          }
          
          this.desconectarWebSocket();
        }, 2000); // Esperar 2 segundos mostrando 100%
      },
      error: (error: Error) => {
        console.error('❌ Error en carga:', error);
        this.detenerSimulacion();
        this.mensajeError = error.message || 'Error desconocido al cargar el archivo';
        this.cargando = false;
        this.desconectarWebSocket();
      }
    });
  }

  simularProgresoGradual(): void {
    console.log('🎬 Iniciando simulación de progreso');
    this.progreso = 0;
    this.progresoMensaje = 'Iniciando carga...';
    
    const totalFilas = this.validacion?.total_filas || 10;
    // ✅ HACER MÁS LENTO: Mínimo 8 segundos, máximo 30 segundos
    const tiempoEstimado = Math.max(8000, Math.min(totalFilas * 200, 30000));
    const intervaloTiempo = 200; // Actualizar cada 200ms
    const incrementoPorCiclo = (80 / (tiempoEstimado / intervaloTiempo));
    
    console.log(`⏱️ Tiempo estimado: ${tiempoEstimado}ms para ${totalFilas} productos`);
    
    this.intervaloSimulacion = setInterval(() => {
      if (this.progreso < 80) {
        this.progreso += incrementoPorCiclo;
        
        if (this.progreso < 20) {
          this.progresoMensaje = '📋 Preparando datos...';
        } else if (this.progreso < 40) {
          this.progresoMensaje = '🔍 Validando productos...';
        } else if (this.progreso < 60) {
          this.progresoMensaje = '💾 Insertando en base de datos...';
        } else if (this.progreso < 80) {
          this.progresoMensaje = '✏️ Actualizando registros...';
        }
        
        // Redondear para mostrar solo enteros
        this.progreso = Math.floor(this.progreso);
        
        console.log(`📊 Progreso: ${this.progreso}%`);
      } else {
        // Mantener en 80-85% hasta que termine realmente
        this.progreso = 85;
        this.progresoMensaje = '⏳ Completando proceso...';
      }
    }, intervaloTiempo);
  }

  detenerSimulacion(): void {
    if (this.intervaloSimulacion) {
      console.log('⏹️ Deteniendo simulación');
      clearInterval(this.intervaloSimulacion);
      this.intervaloSimulacion = null;
    }
  }

  conectarWebSocket(): void {
    try {
      this.websocket = this.productoService.crearWebSocketProgreso();

      this.websocket.onopen = () => {
        console.log('✅ WebSocket conectado - usando progreso real');
        this.detenerSimulacion();
      };

      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.progreso = data.progreso || 0;
          this.progresoMensaje = data.mensaje || 
            `Procesados: ${data.procesados}/${data.total}`;
          console.log('📨 WebSocket:', data);
        } catch (e) {
          console.error('Error al parsear WebSocket:', e);
        }
      };

      this.websocket.onerror = (error) => {
        console.log('⚠️ WebSocket no disponible - usando simulación');
      };

      this.websocket.onclose = () => {
        console.log('WebSocket cerrado');
      };
    } catch (error) {
      console.log('⚠️ WebSocket no disponible - usando simulación');
    }
  }

  desconectarWebSocket(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }

  limpiar(): void {
    this.archivoSeleccionado = null;
    this.nombreArchivo = '';
    this.validacion = null;
    this.resultado = null;
    this.mostrarVistaPrevia = false;
    this.progreso = 0;
    this.progresoMensaje = '';
    this.limpiarMensajes();
    
    const fileInput = document.getElementById('inputArchivo') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  limpiarMensajes(): void {
    this.mensajeError = '';
    this.mensajeExito = '';
    this.mensajeAdvertencia = '';
  }

  descargarPlantilla(): void {
    const plantilla = [
      {
        codigo: 'PROD001',
        nombre: 'Laptop Dell Inspiron 15',
        descripcion: 'Laptop con procesador Intel i5, 8GB RAM, 256GB SSD',
        cantidad: 10,
        precio: 899.99,
        categoria: 'Electrónica'
      },
      {
        codigo: 'PROD002',
        nombre: 'Mouse Logitech M185',
        descripcion: 'Mouse inalámbrico con receptor USB',
        cantidad: 50,
        precio: 25.50,
        categoria: 'Accesorios'
      },
      {
        codigo: 'PROD003',
        nombre: 'Teclado Mecánico RGB',
        descripcion: 'Teclado mecánico con retroiluminación RGB',
        cantidad: 30,
        precio: 75.00,
        categoria: 'Accesorios'
      }
    ];

    const headers = Object.keys(plantilla[0]);
    const csvContent = [
      headers.join(','),
      ...plantilla.map(item => 
        headers.map(header => {
          const value = (item as any)[header];
          return typeof value === 'string' && value.includes(',') 
            ? `"${value}"` 
            : value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_productos.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  }

  getBadgeClass(cantidad: number): string {
    if (cantidad === 0) return 'bg-danger';
    if (cantidad < 10) return 'bg-warning';
    if (cantidad < 50) return 'bg-info';
    return 'bg-success';
  }

  formatearPrecio(precio: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP'
    }).format(precio);
  }

  limpiarFormulario(): void {
    this.limpiar();
  }

  cargarDatos(): void {
    this.cargarArchivo();
  }

  get datosTemporales(): any[] | null {
    return this.validacion?.datos_previos || null;
  }

  ngOnDestroy(): void {
    this.desconectarWebSocket();
    this.detenerSimulacion();
  }
}