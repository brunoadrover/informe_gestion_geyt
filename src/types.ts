export interface Categoria {
  id: string;
  categoria: string;
}

export interface Estado {
  id: string;
  estado: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  password?: string;
}

export interface Evento {
  id: string;
  fecha_inicio: string;
  categoria: string;
  titulo: string;
  descripcion: string;
  fecha_cierre: string | null;
  supervisor: string;
  estado: string;
  motivo_abandono: string | null;
  usuario_id: string;
}

export interface Seguimiento {
  id: string;
  id_eventos: string;
  responsable: string;
  fecha: string;
  descripcion_avance: string;
  fecha_finalizacion: string | null;
  recursos: string;
  estado: string;
  observaciones: string;
  image_url?: string | null;
}
