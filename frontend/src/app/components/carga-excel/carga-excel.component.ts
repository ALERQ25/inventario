import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductoService, ValidacionExcel, ResultadoCarga } from '../../services/producto.service';

@Component({
  selector: 'app-carga-excel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './carga-excel.component.html',
  styleUrls: ['./carga-excel.component.css']
})
export class CargaExcelComponent {
  archivoSeleccionado: File | null = null;
  nombreArchivo = '';
  validacion: ValidacionExcel | null = null;
  resultado: ResultadoCarga | null = null;
  
  // Estados
  validando = false;
  cargando = false;
  mostrarVistaPrevia = false;
  
  // Progreso WebSocket
  progreso = 0;
  progresoMensaje = '';
  websocket: WebSocket | null = null;

  constructor(private productoService: ProductoService) {}

  onFileSelected(event: any) {
    const file = event.target.files[0];
    
    if (file) {
      // Validar tamaño (10 MB)
      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        alert('❌ El archivo excede el tamaño máximo de 10 MB');
        return;
      }

      // Validar extensión
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('❌ Solo se permiten archivos Excel (.xlsx o .xls)');
        return;
      }

      this.archivoSeleccionado = file;
      this.nombreArchivo = file.name;
      this.validacion = null;
      this.resultado = null;
      this.mostrarVistaPrevia = false;
    }
  }

  validarArchivo() {
    if (!this.archivoSeleccionado) {
      alert('⚠️ Por favor selecciona un archivo');
      return;
    }

    this.validando = true;
    this.validacion = null;

    this.productoService.validarExcel(this.archivoSeleccionado).subscribe({
      next: (validacion) => {
        this.validacion = validacion;
        this.validando = false;
        this.mostrarVistaPrevia = validacion.valido && validacion.datos_previos.length > 0;
      },
      error: (error) => {
        console.error('Error al validar:', error);
        alert(`❌ Error al validar el archivo: ${error.error?.detail || error.message}`);
        this.validando = false;
      }
    });
  }

  cargarArchivo() {
    if (!this.archivoSeleccionado || !this.validacion?.valido) {
      alert('⚠️ Primero valida el archivo');
      return;
    }

    if (!confirm('¿Estás seguro de cargar estos productos a la base de datos?')) {
      return;
    }

    this.cargando = true;
    this.progreso = 0;
    this.resultado = null;

    // Conectar WebSocket para progreso
    this.conectarWebSocket();

    this.productoService.cargarExcel(this.archivoSeleccionado).subscribe({
      next: (resultado) => {
        this.resultado = resultado;
        this.cargando = false;
        this.progreso = 100;
        
        if (resultado.success) {
          alert(`✅ ${resultado.mensaje}`);
          // Limpiar formulario
          this.limpiar();
        }
        
        this.desconectarWebSocket();
      },
      error: (error) => {
        console.error('Error al cargar:', error);
        alert(`❌ Error al cargar el archivo: ${error.error?.detail || error.message}`);
        this.cargando = false;
        this.desconectarWebSocket();
      }
    });
  }

  conectarWebSocket() {
    // Determinar protocolo (ws o wss)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/productos/progreso`;
    
    this.websocket = new WebSocket(wsUrl);

    this.websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.progreso = data.progreso || 0;
      this.progresoMensaje = `Procesados: ${data.procesados}/${data.total} (${data.exitosos} exitosos, ${data.fallidos} fallidos)`;
    };

    this.websocket.onerror = (error) => {
      console.error('Error en WebSocket:', error);
    };
  }

  desconectarWebSocket() {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }

  limpiar() {
    this.archivoSeleccionado = null;
    this.nombreArchivo = '';
    this.validacion = null;
    this.resultado = null;
    this.mostrarVistaPrevia = false;
    this.progreso = 0;
    this.progresoMensaje = '';
    
    // Limpiar input file
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  descargarPlantilla() {
    // Crear datos de ejemplo
    const ejemplos = [
      ['codigo', 'nombre', 'descripcion', 'cantidad', 'precio', 'categoria'],
      ['PROD001', 'Laptop Dell', 'Laptop Dell Inspiron 15', 10, 899.99, 'Electrónica'],
      ['PROD002', 'Mouse Logitech', 'Mouse inalámbrico', 50, 25.50, 'Accesorios'],
      ['PROD003', 'Teclado Mecánico', 'Teclado RGB', 30, 75.00, 'Accesorios']
    ];

    // Crear CSV
    const csv = ejemplos.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_productos.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  }

  ngOnDestroy() {
    this.desconectarWebSocket();
  }
}