import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'Sistema de Inventario';

  // Variables usadas en el HTML
  nombreArchivo: string | null = null;
  archivoSeleccionado: File | null = null;
  validacion: any = null;
  validando = false;
  cargando = false;
  progreso = 0;
  progresoMensaje = '';
  resultado: any = null;
  mostrarVistaPrevia = false;

  // Métodos referenciados en el HTML
  descargarPlantilla() {
    console.log('Descargar plantilla CSV');
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.archivoSeleccionado = file;
      this.nombreArchivo = file.name;
      console.log('Archivo seleccionado:', this.nombreArchivo);
    }
  }

  validarArchivo() {
    console.log('Validando archivo...');
    this.validando = true;
    setTimeout(() => {
      this.validando = false;
      this.validacion = { valido: true, total_filas: 10, advertencias: [] };
    }, 1000);
  }

  cargarArchivo() {
    console.log('Cargando archivo...');
    this.cargando = true;
    this.progreso = 0;
    const intervalo = setInterval(() => {
      this.progreso += 10;
      if (this.progreso >= 100) {
        clearInterval(intervalo);
        this.cargando = false;
        this.resultado = { success: true, mensaje: 'Carga exitosa', exitosos: 10, fallidos: 0 };
      }
    }, 200);
  }

  limpiar() {
    console.log('Limpiando...');
    this.nombreArchivo = null;
    this.archivoSeleccionado = null;
    this.validacion = null;
    this.resultado = null;
    this.progreso = 0;
    this.progresoMensaje = '';
  }
}
