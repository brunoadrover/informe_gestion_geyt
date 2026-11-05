import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, FileText, Settings, History, LogOut, 
  ChevronRight, Calendar, User, Tag, CheckCircle2, 
  Trash2, Edit3, Save, X, ArrowLeft, Download, ShieldCheck,
  Menu, Image as ImageIcon, Camera, ImagePlus
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from './lib/supabase';
import type { Evento, Seguimiento, Tema, Avance, Usuario, Categoria, Estado } from './types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Global UI Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = 'button' }: any) => {
  const base = "px-4 py-2 rounded-md font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm shadow-sm";
  const variants: any = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95",
    secondary: "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "text-slate-500 hover:bg-slate-100",
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Input = ({ label, icon: Icon, ...props }: any) => (
  <div className="flex flex-col gap-1 w-full">
    {label && <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">{label}</label>}
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />}
      <input 
        {...props} 
        className={`w-full bg-slate-50 border border-slate-200 rounded-md py-2 ${Icon ? 'pl-10' : 'px-3'} text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300 text-slate-800`} 
      />
    </div>
  </div>
);

const Select = ({ label, options, ...props }: any) => (
  <div className="flex flex-col gap-1 w-full">
    {label && <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">{label}</label>}
    <select 
      {...props} 
      className="w-full bg-slate-50 border border-slate-200 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none cursor-pointer text-slate-800"
    >
      <option value="">Seleccionar...</option>
      {options.map((opt: any) => (
        <option key={opt.id} value={opt[label.toLowerCase()] || opt.estado || opt.categoria || opt.nombre}>
          {opt.categoria || opt.estado || opt.nombre || opt.value}
        </option>
      ))}
    </select>
  </div>
);

const ImportanciaBadge = ({ importancia }: { importancia?: string }) => {
  const imp = (importancia || 'MEDIA').toUpperCase();
  if (imp === 'URGENTE') {
    return (
      <span className="bg-red-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-xs inline-flex items-center gap-1 tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        URGENTE
      </span>
    );
  }
  if (imp === 'ALTA') {
    return (
      <span className="bg-rose-100 text-rose-700 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded">
        ALTA
      </span>
    );
  }
  if (imp === 'BAJA') {
    return (
      <span className="bg-slate-100 text-slate-600 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded">
        BAJA
      </span>
    );
  }
  return (
    <span className="bg-amber-100 text-amber-700 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded">
      MEDIA
    </span>
  );
};

// --- Utility Functions ---

const isUrgentReport = (s: Seguimiento | any) => {
  if (!s.fecha_finalizacion || s.estado === 'FINALIZADO') return false;
  const today = new Date();
  const diff = (new Date(s.fecha_finalizacion).getTime() - today.getTime()) / (1000 * 3600 * 24);
  return diff <= 3;
};

// --- Main Application ---

export default function App() {
  const [user, setUser] = useState<Usuario | null>(null);
  const [view, setView] = useState<'dashboard' | 'history' | 'config'>('dashboard');
  const [events, setEvents] = useState<Evento[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [states, setStates] = useState<Estado[]>([]);
  const [followUps, setFollowUps] = useState<Tema[]>([]); 
  const [avances, setAvances] = useState<Avance[]>([]); 
  const [reportIntro, setReportIntro] = useState<string>("Introducción: El presente documento muestra el progreso de las diversas líneas de gestión en las que participo. Los elementos han sido categorizados y sus avances ordenados por fecha estimada de finalización (de la más lejana a la más próxima), con el objetivo de optimizar el seguimiento mediante la generación alertas automáticas que garanticen la trazabilidad de cada proceso.");
  const [reportTitle, setReportTitle] = useState<string>("REPORTE ESTRATÉGICO DE GESTIÓN Y SEGUIMIENTO");
  const [reportLogoUrl, setReportLogoUrl] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('gest_user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  useEffect(() => {
    if (user) {
      fetchInitialData();
    }
  }, [user]);

  const fetchInitialData = async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      // 1. Cargamos datos que no dependen de la sesión de forma paralela
      const [{ data: cats }, { data: sts }, { data: configs }, { data: allUsers }] = await Promise.all([
        supabase.from('categorias').select('*'),
        supabase.from('estado').select('*'),
        supabase.from('configuracion').select('*').then(res => res, () => ({ data: null })),
        supabase.from('usuarios').select('id, nombre, correo').then(res => res, () => ({ data: null }))
      ]);
      
      setCategories(cats || []);
      setStates(sts || []);

      if (configs) {
        const intro = configs.find(c => c.id === 'report_intro');
        const title = configs.find(c => c.id === 'report_title');
        const logo = configs.find(c => c.id === 'report_logo_url');
        
        if (intro) setReportIntro(intro.valor);
        if (title) setReportTitle(title.valor);
        if (logo && logo.valor) setReportLogoUrl(logo.valor);
      }

      // 2. Determinamos los IDs de usuarios asociados
      // Jorge Zecchin y Martin Adrover comparten la visualización de los mismos registros
      const currentUserName = (user.nombre || '').toLowerCase();
      const currentUserEmail = (user.correo || '').toLowerCase();

      const isJorgeZecchin = 
        currentUserName.includes('zecchin') || 
        currentUserEmail.includes('jzecchin') || 
        user.id === 'e84ad633-03c7-48d9-9f3c-397c54277bf0';

      const isMartinAdrover = 
        currentUserName.includes('adrover') || 
        currentUserEmail.includes('madrover') || 
        user.id === 'ee3b9b6a-aaf2-41e6-8e89-2f05104883d0';

      let targetUserIds = [user.id];

      if (isJorgeZecchin || isMartinAdrover) {
        const martinUser = allUsers?.find(u => 
          u.nombre?.toLowerCase().includes('adrover') || 
          u.correo?.toLowerCase().includes('madrover')
        );
        const jorgeUser = allUsers?.find(u => 
          u.nombre?.toLowerCase().includes('zecchin') || 
          u.correo?.toLowerCase().includes('jzecchin')
        );

        const martinId = martinUser?.id || 'ee3b9b6a-aaf2-41e6-8e89-2f05104883d0';
        const jorgeId = jorgeUser?.id || 'e84ad633-03c7-48d9-9f3c-397c54277bf0';

        targetUserIds = Array.from(new Set([user.id, martinId, jorgeId]));
      }

      // 3. Cargamos los eventos de los usuarios correspondientes
      const { data: evs } = await supabase
        .from('eventos')
        .select('*')
        .in('usuario_id', targetUserIds)
        .order('fecha_inicio', { ascending: false });
      
      const userEvents = evs || [];
      setEvents(userEvents);

      if (userEvents.length > 0) {
        const eventIds = userEvents.map(e => e.id);
        const { data: temasData } = await supabase
          .from('temas')
          .select('*')
          .in('id_eventos', eventIds)
          .order('fecha', { ascending: false });
        
        const mappedTemas = (temasData || []).map(t => ({
          ...t,
          descripcion_avance: t.subtitulo
        }));
        setFollowUps(mappedTemas);

        const temaIds = mappedTemas.map(t => t.id);
        if (temaIds.length > 0) {
          const { data: avs } = await supabase
            .from('avances')
            .select('*')
            .in('id_temas', temaIds)
            .order('fecha', { ascending: false });
          setAvances(avs || []);
        } else {
          setAvances([]);
        }
      } else {
        setFollowUps([]);
        setAvances([]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setDataLoading(false);
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    const formData = new FormData(e.target as HTMLFormElement);
    const correo = (formData.get('correo') as string || '').trim();
    const password = (formData.get('password') as string || '').trim();

    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .ilike('correo', correo)
        .eq('password', password)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setUser(data);
        localStorage.setItem('gest_user', JSON.stringify(data));
        fetchInitialData();
      } else {
        alert("Credenciales inválidas. Por favor verifique el correo y la contraseña.");
      }
    } catch (err: any) {
      console.error("Login error:", err);
      alert("Error al conectar con la base de datos.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('gest_user');
    setView('dashboard');
  };

  const exportPDF = async (titleParam: string, data: Evento[]) => {
    const doc = new jsPDF();
    const today = format(new Date(), 'dd/MM/yyyy HH:mm');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // --- PÁGINA 1: PORTADA ---
    
    const logoWidth = 40;
    let logoHeight = 0;
    if (reportLogoUrl) {
      try {
        const imgData = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg'));
          };
          img.onerror = reject;
          img.src = reportLogoUrl;
        });
        const imgProps = (doc as any).getImageProperties(imgData);
        logoHeight = (imgProps.height * logoWidth) / imgProps.width;
        doc.addImage(imgData, 'JPEG', (pageWidth - logoWidth) / 2, 20, logoWidth, logoHeight);
      } catch (e) {
        console.error("No se pudo cargar el logo para el PDF", e);
      }
    }

    // 2. Título Centrado y Destacado
    doc.setFontSize(24);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont("helvetica", "bold");
    const fullTitle = reportTitle || titleParam;
    const splitTitle = doc.splitTextToSize(fullTitle, 160);
    const titleY = logoHeight > 0 ? 20 + logoHeight + 15 : 40;
    doc.text(splitTitle, pageWidth / 2, titleY, { align: 'center' });
    
    // 3. Introducción: Centrado Verticalmente, Alineado Izquierda, Fuente Mayor y Más Oscura
    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59); // slate-800 (más oscuro)
    const introText = reportIntro;
    const splitIntro = doc.splitTextToSize(introText, 150);
    const introLineHeight = 7;
    const totalIntroHeight = splitIntro.length * introLineHeight;
    const introY = (pageHeight - totalIntroHeight) / 2;
    
    doc.text(splitIntro, 30, introY);
    
    // 4. Generado por: Al final de la página a la derecha
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139); // slate-500
    const footerText = `Generado por: ${user?.nombre || 'Sistema'} | ${today}`;
    doc.text(footerText, pageWidth - 14, pageHeight - 20, { align: 'right' });

    // --- FIN PÁGINA 1 ---

    let currentY = 20;

    // Helper for page overflow management
    const ensureSpace = (neededHeight: number) => {
      if (currentY + neededHeight > 268) {
        doc.addPage();
        currentY = 20;
        return true;
      }
      return false;
    };

    // Helper for status colors in PDF
    const getStatusColors = (status: string) => {
      const s = (status || '').toUpperCase();
      if (s === 'FINALIZADO') return { fill: [209, 250, 229], text: [6, 78, 59], border: [16, 185, 129] }; // Green
      if (s === 'EN PROCESO') return { fill: [254, 243, 199], text: [146, 64, 14], border: [245, 158, 11] }; // Amber
      if (s === 'ABANDONADO') return { fill: [254, 226, 226], text: [153, 27, 27], border: [239, 68, 68] }; // Red
      return { fill: [224, 231, 255], text: [49, 46, 129], border: [99, 102, 241] }; // Indigo
    };

    // Helper to draw status badge in PDF
    const drawStatusBadge = (status: string, x: number, y: number): number => {
      const colors = getStatusColors(status);
      const text = (status || 'EN PROCESO').toUpperCase();
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      const textWidth = doc.getTextWidth(text);
      const badgeWidth = textWidth + 4;
      const badgeHeight = 4.2;

      doc.setFillColor(colors.fill[0], colors.fill[1], colors.fill[2]);
      doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y - 3.2, badgeWidth, badgeHeight, 1, 1, 'FD');

      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
      doc.text(text, x + badgeWidth / 2, y - 0.2, { align: 'center' });
      return badgeWidth;
    };

    // Helper for importance colors in PDF
    const getImportanceBadgeStyles = (importancia?: string) => {
      const imp = (importancia || 'MEDIA').toUpperCase();
      if (imp === 'URGENTE') {
        return {
          fill: [254, 226, 226],   // red-100
          border: [239, 68, 68],   // red-500
          text: [185, 28, 28],     // red-700
          label: 'URGENTE'
        };
      }
      if (imp === 'ALTA') {
        return {
          fill: [255, 228, 230],   // rose-100
          border: [244, 63, 94],   // rose-500
          text: [190, 18, 60],     // rose-700
          label: 'ALTA'
        };
      }
      if (imp === 'BAJA') {
        return {
          fill: [241, 245, 249],   // slate-100
          border: [203, 213, 225], // slate-300
          text: [71, 85, 105],     // slate-600
          label: 'BAJA'
        };
      }
      // MEDIA
      return {
        fill: [254, 243, 199],     // amber-100
        border: [245, 158, 11],    // amber-500
        text: [146, 64, 14],       // amber-800
        label: 'MEDIA'
      };
    };

    // Helper to draw importance badge in PDF
    const drawImportanceBadge = (importancia: string, x: number, y: number): number => {
      const badge = getImportanceBadgeStyles(importancia);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      const textWidth = doc.getTextWidth(badge.label);
      const badgeWidth = Math.max(textWidth + 4, 15);
      const badgeHeight = 4.2;

      doc.setFillColor(badge.fill[0], badge.fill[1], badge.fill[2]);
      doc.setDrawColor(badge.border[0], badge.border[1], badge.border[2]);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y - 3.2, badgeWidth, badgeHeight, 1, 1, 'FD');

      doc.setTextColor(badge.text[0], badge.text[1], badge.text[2]);
      doc.text(badge.label, x + badgeWidth / 2, y - 0.2, { align: 'center' });
      return badgeWidth;
    };

    // Prep data with completion dates
    const dataWithDates = data.map(ev => {
      const evSegs = followUps.filter(s => s.id_eventos === ev.id);
      const sortedSegs = [...evSegs].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      const latestEstimate = sortedSegs.find(s => s.fecha_finalizacion)?.fecha_finalizacion || null;
      return { ...ev, latestEstimate };
    });

    const groupedData: { [key: string]: typeof dataWithDates } = dataWithDates.reduce((acc: any, ev) => {
      if (!acc[ev.categoria]) acc[ev.categoria] = [];
      acc[ev.categoria].push(ev);
      return acc;
    }, {});

    for (const cat of Object.keys(groupedData).sort()) {
      const eventsInCat = groupedData[cat].sort((a, b) => {
        if (!a.latestEstimate && !b.latestEstimate) return 0;
        if (!a.latestEstimate) return 1;
        if (!b.latestEstimate) return -1;
        return new Date(b.latestEstimate).getTime() - new Date(a.latestEstimate).getTime();
      });

      // Cada categoría comienza en una página nueva
      doc.addPage(); 
      currentY = 20;

      // Encabezado estilizado de Categoría
      doc.setFillColor(238, 242, 255); // indigo-50
      doc.setDrawColor(199, 210, 254); // indigo-200
      doc.setLineWidth(0.3);
      doc.roundedRect(14, currentY, 182, 10, 1.5, 1.5, 'FD');

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(67, 56, 202); // indigo-700
      doc.text(`CATEGORÍA: ${cat.toUpperCase()}`, 18, currentY + 6.8);
      currentY += 16;

      for (let evIdx = 0; evIdx < eventsInCat.length; evIdx++) {
        const ev = eventsInCat[evIdx];
        ensureSpace(24);

        // Título del Evento
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42); // slate-900
        const splitEvTitle = doc.splitTextToSize(`EVENTO: ${ev.titulo.toUpperCase()}`, 180);
        doc.text(splitEvTitle, 14, currentY);
        currentY += (splitEvTitle.length * 4.8) + 1;

        // Metadatos continuos del Evento con badge de estado
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text("Estado:", 14, currentY);
        const evBadgeW = drawStatusBadge(ev.estado, 26, currentY);

        const evMetaX = 26 + evBadgeW + 4;
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        const estFin = ev.fecha_cierre ? format(new Date(ev.fecha_cierre), 'dd/MM/yyyy') : 'Sin definir';
        const evMeta = `|  Supervisor: ${ev.supervisor || 'No asignado'}  |  Inicio: ${format(new Date(ev.fecha_inicio), 'dd/MM/yyyy')}  |  Fin: ${estFin}`;
        doc.text(evMeta, evMetaX, currentY);
        currentY += 5.5;

        // Descripción del Evento
        if (ev.descripcion) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(71, 85, 105);
          const splitDesc = doc.splitTextToSize(ev.descripcion, 180);
          ensureSpace(splitDesc.length * 4);
          doc.text(splitDesc, 14, currentY);
          currentY += (splitDesc.length * 4) + 3;
        }

        // Temas y sus Avances
        const evSegs = followUps
          .filter(s => s.id_eventos === ev.id)
          .sort((a, b) => {
            if (!a.fecha_finalizacion && !b.fecha_finalizacion) return 0;
            if (!a.fecha_finalizacion) return 1;
            if (!b.fecha_finalizacion) return -1;
            return new Date(b.fecha_finalizacion).getTime() - new Date(a.fecha_finalizacion).getTime();
          });

        if (evSegs.length > 0) {
          for (const s of evSegs) {
            ensureSpace(20);

            // Barra de acento para el tema
            doc.setFillColor(99, 102, 241); // indigo-500
            doc.rect(14, currentY - 2.8, 2, 7.5, 'F');

            // Subtítulo del Tema
            doc.setFontSize(9.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59); // slate-800
            const temaTitle = `Tema: ${s.subtitulo || s.descripcion_avance || 'General'}`;
            const splitTema = doc.splitTextToSize(temaTitle, 172);
            doc.text(splitTema, 18, currentY);
            currentY += (splitTema.length * 4.4) + 1;

            // Datos del Tema: Responsable, Fecha, Fin Est. y Estado
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            doc.text("Responsable: ", 18, currentY);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(51, 65, 85);
            const rText = s.responsable || 'No asignado';
            doc.text(rText, 36, currentY);
            const rWidth = doc.getTextWidth(rText);

            const tMetaX = 36 + rWidth + 3;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            const tDates = `• Fecha: ${format(new Date(s.fecha), 'dd/MM/yyyy')}${s.fecha_finalizacion ? ` • Fin Est.: ${format(new Date(s.fecha_finalizacion), 'dd/MM/yyyy')}` : ''} • Estado: `;
            doc.text(tDates, tMetaX, currentY);
            const tDatesW = doc.getTextWidth(tDates);
            drawStatusBadge(s.estado, tMetaX + tDatesW, currentY);
            currentY += 5;

            // Recursos u Observaciones si existen
            if (s.recursos || s.observaciones) {
              doc.setFontSize(7.5);
              doc.setFont("helvetica", "italic");
              doc.setTextColor(100, 116, 139);
              if (s.recursos) {
                const splitRec = doc.splitTextToSize(`Recursos: ${s.recursos}`, 172);
                ensureSpace(splitRec.length * 3.8);
                doc.text(splitRec, 18, currentY);
                currentY += splitRec.length * 3.8;
              }
              if (s.observaciones) {
                const splitObs = doc.splitTextToSize(`Observaciones: ${s.observaciones}`, 172);
                ensureSpace(splitObs.length * 3.8);
                doc.text(splitObs, 18, currentY);
                currentY += splitObs.length * 3.8;
              }
              currentY += 1;
            }

            // Listado de Avances del Tema
            const temaAvances = avances
              .filter(a => a.id_temas === s.id)
              .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

            if (temaAvances.length > 0) {
              ensureSpace(8);
              doc.setFontSize(8);
              doc.setFont("helvetica", "bold");
              doc.setTextColor(71, 85, 105);
              doc.text("Avances registrados:", 18, currentY);
              currentY += 4.5;

              for (const a of temaAvances) {
                const splitAvDesc = doc.splitTextToSize(a.descripcion, 150);
                const blockH = 4.2 + (splitAvDesc.length * 3.8) + 2;
                ensureSpace(blockH);

                // Viñeta
                doc.setFontSize(8);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(148, 163, 184);
                doc.text("•", 20, currentY);

                // Badge de Importancia coloreado según su nivel
                const impW = drawImportanceBadge(a.importancia || 'MEDIA', 23, currentY);

                // Fecha y Responsable del avance
                doc.setFontSize(7.5);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(71, 85, 105);
                const aDate = format(new Date(a.fecha), 'dd/MM/yyyy');
                doc.text(aDate, 23 + impW + 2.5, currentY);

                if (a.responsable) {
                  doc.setFont("helvetica", "normal");
                  doc.setTextColor(100, 116, 139);
                  doc.text(`(${a.responsable})`, 23 + impW + 2.5 + doc.getTextWidth(aDate) + 2, currentY);
                }
                currentY += 3.8;

                // Texto del avance indentado
                doc.setFontSize(8);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(30, 41, 59); // slate-800
                doc.text(splitAvDesc, 26, currentY);
                currentY += (splitAvDesc.length * 3.8) + 2.2;
              }
            } else {
              doc.setFontSize(7.5);
              doc.setFont("helvetica", "italic");
              doc.setTextColor(148, 163, 184);
              doc.text("• Sin avances puntuales registrados para este tema.", 20, currentY);
              currentY += 4;
            }

            // Evidencia fotográfica asociada al tema
            if (s.image_url) {
              try {
                const imgData = await new Promise<string>((resolve, reject) => {
                  const img = new Image();
                  img.crossOrigin = "Anonymous";
                  img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext("2d");
                    ctx?.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL("image/jpeg"));
                  };
                  img.onerror = reject;
                  img.src = s.image_url!;
                });

                const imgProps = (doc as any).getImageProperties(imgData);
                const maxWidth = 160;
                // Reducido al 80% del tamaño previo
                const imgWidth = Math.min(maxWidth, (imgProps.width / 4) * 3) * 0.8;
                const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

                // Si excede el tamaño disponible en la página, se pasa a la siguiente
                if (currentY + imgHeight + 12 > 275) {
                  doc.addPage();
                  currentY = 20;
                }

                doc.setFontSize(7);
                doc.setFont("helvetica", "italic");
                doc.setTextColor(100, 116, 139);
                doc.text(`Evidencia fotográfica - ${s.subtitulo || 'Tema'} (${format(new Date(s.fecha), 'dd/MM/yyyy')}):`, 18, currentY);
                currentY += 3;

                doc.addImage(imgData, 'JPEG', 18, currentY, imgWidth, imgHeight);
                currentY += imgHeight + 5;
              } catch (e) {
                console.error("Error al renderizar imagen de tema en PDF", e);
              }
            }

            currentY += 3;
          }
        } else {
          doc.setFontSize(8);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(148, 163, 184);
          doc.text("Sin temas registrados para este evento.", 18, currentY);
          currentY += 5;
        }

        // Línea divisoria tenue entre eventos de la misma categoría
        if (evIdx < eventsInCat.length - 1) {
          ensureSpace(6);
          doc.setDrawColor(226, 232, 240); // slate-200
          doc.setLineWidth(0.3);
          doc.line(14, currentY, 196, currentY);
          currentY += 6;
        }
      }
      currentY += 4;
    }
    
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
    }
    
    doc.save(`${(reportTitle || titleParam).toLowerCase().replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const urgentCount = useMemo(() => {
    const today = new Date();
    return followUps.filter(s => {
      if (!s.fecha_finalizacion || s.estado === 'FINALIZADO') return false;
      const diff = (new Date(s.fecha_finalizacion).getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diff <= 3;
    }).length;
  }, [followUps]);

  const hasUrgentFollowUp = (eventId: string) => {
    const today = new Date();
    return followUps.some(s => {
      if (s.id_eventos !== eventId || !s.fecha_finalizacion || s.estado === 'FINALIZADO') return false;
      const diff = (new Date(s.fecha_finalizacion).getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diff <= 3;
    });
  };

  const getNearestUrgentDate = (eventId: string) => {
    const today = new Date();
    const urgentDates = followUps
      .filter(s => s.id_eventos === eventId && s.fecha_finalizacion && s.estado !== 'FINALIZADO')
      .map(s => {
        const d = new Date(s.fecha_finalizacion!);
        const diff = (d.getTime() - today.getTime()) / (1000 * 3600 * 24);
        return { date: d, diff };
      })
      .filter(item => item.diff <= 3);
    
    if (urgentDates.length === 0) return null;
    const sorted = urgentDates.sort((a, b) => a.date.getTime() - b.date.getTime());
    return format(sorted[0].date, 'dd/MM');
  };

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      const search = searchTerm.toLowerCase();
      
      const matchesSearch = ev.titulo.toLowerCase().includes(search) || 
                           ev.descripcion.toLowerCase().includes(search) ||
                           ev.categoria.toLowerCase().includes(search) ||
                           ev.supervisor.toLowerCase().includes(search);
      
      if (view === 'history') return matchesSearch && ev.estado === 'FINALIZADO';
      return matchesSearch && ev.estado !== 'FINALIZADO';
    });
  }, [events, searchTerm, view]);

  const groupedEvents = useMemo(() => {
    return filteredEvents.reduce((acc: { [key: string]: Evento[] }, event) => {
      const cat = event.categoria || 'Sin Categoría';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(event);
      return acc;
    }, {});
  }, [filteredEvents]);

  const deleteEvent = async (id: string) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este registro permanentemente? Esta acción no se puede deshacer y eliminará también toda su bitácora.")) return;
    
    try {
      // Delete associated avances first, then temas due to foreign key constraints
      const { data: evTemas } = await supabase.from('temas').select('id').eq('id_eventos', id);
      if (evTemas && evTemas.length > 0) {
        const tIds = evTemas.map(t => t.id);
        await supabase.from('avances').delete().in('id_temas', tIds);
      }
      await supabase.from('temas').delete().eq('id_eventos', id);
      const { error } = await supabase.from('eventos').delete().eq('id', id);
      
      if (error) throw error;
      
      fetchInitialData();
      alert("Registro eliminado con éxito.");
    } catch (err: any) {
      console.error("Delete error:", err);
      alert("Error al eliminar el registro.");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm bg-white p-10 rounded-2xl shadow-xl border border-slate-200"
        >
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Informe Gestión</h1>
            <p className="text-slate-500 font-medium mt-1">Acceso al Sistema</p>
          </div>
          
          <form onSubmit={login} className="flex flex-col gap-5">
            <div className="space-y-4">
              <Input name="correo" label="Usuario / Correo" type="email" required icon={User} placeholder="usuario@ejemplo.com" />
              <Input name="password" label="Contraseña" type="password" required icon={ShieldCheck} />
            </div>
            <Button type="submit" disabled={isLoggingIn} className="w-full h-11 text-base shadow-sm">
              {isLoggingIn ? 'Verificando...' : 'Entrar Ahora'}
            </Button>
            <p className="text-center text-[10px] text-slate-400 mt-6 uppercase tracking-widest font-bold">Gestión de Tareas Dashboard</p>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-800">
      {/* Mobile Header Overlay */}
      <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 text-white sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white shadow-sm">
            <FileText className="w-4 h-4" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">Informe Gestión</h1>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 hover:bg-slate-800 rounded-md transition-colors"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-0 z-30 transform md:relative md:translate-x-0 transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        w-full md:w-64 bg-slate-900 text-white flex flex-col h-screen md:sticky md:top-0
      `}>
        <div className="p-6 mb-4 hidden md:block">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white shadow-sm">
              <FileText className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Informe Gestión</h1>
          </div>
        </div>
        
        <nav className="flex-1 px-4 flex flex-col gap-1 pt-16 md:pt-0">
          <NavItem active={view === 'dashboard' && !selectedEventId} onClick={() => { setView('dashboard'); setSelectedEventId(null); setMobileMenuOpen(false); }} icon={FileText} label="Dashboard" />
          <NavItem active={view === 'history'} onClick={() => { setView('history'); setSelectedEventId(null); setMobileMenuOpen(false); }} icon={History} label="Historial / Finalizados" />
          <NavItem active={view === 'config'} onClick={() => { setView('config'); setSelectedEventId(null); setMobileMenuOpen(false); }} icon={Settings} label="Configuración" />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
              {user.nombre.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-xs font-semibold truncate">{user.nombre}</p>
              <p className="text-[10px] text-slate-500 truncate uppercase tracking-tighter">Administrador</p>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 w-full text-slate-400 hover:text-white transition-colors text-[10px] uppercase font-bold tracking-widest px-3 py-2">
            <LogOut className="w-3.5 h-3.5" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Workspace Area */}
      <main className="flex-1 flex flex-col min-w-0 relative h-[calc(100vh-64px)] md:h-screen overflow-hidden">
        <header className="h-auto md:h-16 bg-white border-b border-slate-200 flex flex-col md:flex-row items-center justify-between px-4 md:px-8 py-4 md:py-0 sticky top-0 z-20 shrink-0 shadow-sm gap-4">
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar por evento, supervisor o responsable..." 
              className="w-full bg-slate-50 border border-slate-200 rounded-md py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-800"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            {view !== 'config' && !selectedEventId && (
              <Button onClick={() => setIsExportModalOpen(true)} variant="secondary" className="flex-1 md:flex-none text-xs md:text-sm">
                <Download className="w-4 h-4" /> <span className="hidden sm:inline">Exportar PDF</span>
              </Button>
            )}
            {view === 'dashboard' && !selectedEventId && (
              <Button onClick={() => setIsModalOpen(true)} className="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-700 shadow-sm text-xs md:text-sm">
                + <span className="hidden sm:inline">Nuevo Evento</span><span className="sm:hidden">Nuevo</span>
              </Button>
            )}
          </div>
        </header>

        <div className="p-4 md:p-8 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {selectedEventId ? (
              <EventDetail 
                key="detail"
                id={selectedEventId} 
                onBack={() => { setSelectedEventId(null); fetchInitialData(); }} 
                categories={categories} 
                states={states}
                fetchInitialData={fetchInitialData}
                currentUser={user}
              />
            ) : view === 'config' ? (
              <ConfigView 
                key="config" 
                categories={categories} 
                fetchInitialData={fetchInitialData} 
                reportIntro={reportIntro}
                setReportIntro={setReportIntro}
                reportTitle={reportTitle}
                setReportTitle={setReportTitle}
                reportLogoUrl={reportLogoUrl}
                setReportLogoUrl={setReportLogoUrl}
              />
            ) : (
              <motion.div 
                key="list"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col gap-6"
              >
                {/* Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-2">
                  <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Proyectos Activos</p>
                    <p className="text-2xl md:text-3xl font-bold text-slate-900">{events.filter(e => e.estado !== 'FINALIZADO').length}</p>
                  </div>
                  <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Próximos a Vencer</p>
                    <p className={`text-2xl md:text-3xl font-bold ${urgentCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>{urgentCount}</p>
                  </div>
                  <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                    <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Finalizados</p>
                    <p className="text-2xl md:text-3xl font-bold text-indigo-600">{events.filter(e => e.estado === 'FINALIZADO').length}</p>
                  </div>
                </div>

                {/* Main List */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                   <div className="md:hidden divide-y divide-slate-100">
                     {Object.keys(groupedEvents).sort().map(cat => (
                       <div key={cat} className="flex flex-col">
                         <div className="bg-slate-50 px-4 py-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest border-y border-slate-100">
                           {cat}
                         </div>
                         {groupedEvents[cat].map((ev) => (
                           <div key={ev.id} className="p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors" onClick={() => setSelectedEventId(ev.id)}>
                             <div className="flex justify-between items-start mb-2">
                               <div className="flex items-center gap-2">
                                 {hasUrgentFollowUp(ev.id) && (
                                   <div className="flex items-center gap-1.5" title="Urgente">
                                     <div className="flex h-2 w-2 relative">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"></span>
                                     </div>
                                     <span className="text-[10px] font-black text-red-600 tracking-tighter">{getNearestUrgentDate(ev.id)}</span>
                                   </div>
                                 )}
                                 <h3 className="font-bold text-slate-900 line-clamp-1">{ev.titulo}</h3>
                               </div>
                               <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                 ev.estado === 'FINALIZADO' ? 'bg-emerald-100 text-emerald-800' : 
                                 ev.estado === 'EN PROCESO' ? 'bg-amber-100 text-amber-800' : 
                                 ev.estado === 'ABANDONADO' ? 'bg-rose-100 text-rose-800' : 
                                 'bg-indigo-100 text-indigo-800'
                               }`}>
                                 {ev.estado}
                               </span>
                             </div>
                             <div className="flex justify-between items-center text-[11px] text-slate-500">
                               <div className="flex items-center gap-2">
                                 <User className="w-3 h-3" />
                                 <span className="truncate max-w-[100px]">{ev.supervisor}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                 <Calendar className="w-3 h-3" />
                                 <span>{format(new Date(ev.fecha_inicio), 'dd/MM/yy')}</span>
                               </div>
                             </div>
                           </div>
                         ))}
                       </div>
                     ))}
                   </div>

                   <div className="hidden md:block overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                       <thead className="bg-slate-50 border-b border-slate-200">
                         <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                           <th className="px-6 py-4">Título del Evento</th>
                           <th className="px-6 py-4">Supervisor</th>
                           <th className="px-6 py-4">Estado</th>
                           <th className="px-6 py-4">Inicio</th>
                           <th className="px-6 py-4 text-right">Acciones</th>
                         </tr>
                       </thead>
                       {Object.keys(groupedEvents).sort().map(cat => (
                         <tbody key={cat} className="text-sm text-slate-600">
                           <tr className="bg-slate-50/50 border-y border-slate-200/50">
                             <td colSpan={5} className="px-6 py-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                               {cat}
                             </td>
                           </tr>
                           {groupedEvents[cat].map((ev, idx) => (
                             <tr key={ev.id} className={`${idx % 2 !== 0 ? 'bg-slate-50/50' : 'bg-white'} border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors`}>
                               <td className="px-6 py-4 font-medium text-slate-900 max-w-xs truncate">
                                 <div className="flex items-center gap-2">
                                   {hasUrgentFollowUp(ev.id) && (
                                     <div className="flex items-center gap-1.5" title="Este registro tiene temas con menos de 3 días para su finalización estimada">
                                       <div className="flex h-2 w-2 relative">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"></span>
                                       </div>
                                       <span className="text-[10px] font-black text-red-600 tracking-tighter">{getNearestUrgentDate(ev.id)}</span>
                                     </div>
                                   )}
                                   {ev.titulo}
                                 </div>
                               </td>
                               <td className="px-6 py-4">{ev.supervisor}</td>
                               <td className="px-6 py-4">
                                 <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                                   ev.estado === 'FINALIZADO' ? 'bg-emerald-100 text-emerald-800' : 
                                   ev.estado === 'EN PROCESO' ? 'bg-amber-100 text-amber-800' : 
                                   ev.estado === 'ABANDONADO' ? 'bg-rose-100 text-rose-800' : 
                                   'bg-indigo-100 text-indigo-800'
                                 }`}>
                                   {ev.estado}
                                 </span>
                               </td>
                               <td className="px-6 py-4 text-xs font-medium">{format(new Date(ev.fecha_inicio), 'yyyy-MM-dd')}</td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <button 
                                      onClick={() => setSelectedEventId(ev.id)} 
                                      className="text-indigo-600 font-bold hover:text-indigo-800 transition-colors text-xs uppercase tracking-tighter cursor-pointer"
                                    >
                                      {ev.estado === 'FINALIZADO' ? 'Ver Ficha' : 'Gestionar'}
                                    </button>
                                    {view === 'history' && (
                                      <button 
                                        onClick={() => deleteEvent(ev.id)}
                                        className="text-slate-300 hover:text-red-600 transition-colors p-1"
                                        title="Eliminar registro"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                             </tr>
                           ))}
                         </tbody>
                       ))}
                     </table>
                     {filteredEvents.length === 0 && (
                       <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                         <FileText className="w-10 h-10 mb-4 opacity-10" />
                         <p className="font-bold text-xs uppercase tracking-widest">No hay registros disponibles</p>
                       </div>
                     )}
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Creat Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <EventModal 
            onClose={() => setIsModalOpen(false)} 
            categories={categories} 
            states={states} 
            userId={user.id}
            onSuccess={() => { setIsModalOpen(false); fetchInitialData(); }}
          />
        )}
      </AnimatePresence>

      <ExportModal 
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        categories={categories}
        events={filteredEvents}
        onExport={(data) => exportPDF(view === 'dashboard' ? 'Informe de Estado de Gestión' : 'Eventos Finalizados', data)}
      />
    </div>
  );
}

function ExportModal({ isOpen, onClose, categories, events, onExport }: any) {
  const [mode, setMode] = useState<'all' | 'category' | 'individual'>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleExport = () => {
    let filtered = events;
    if (mode === 'category') {
      filtered = events.filter((e: any) => selectedCategories.includes(e.categoria));
    } else if (mode === 'individual') {
      filtered = events.filter((e: any) => selectedEvents.includes(e.id));
    }
    
    if (filtered.length === 0) {
      alert("Por favor selecciona al menos un elemento para exportar.");
      return;
    }

    onExport(filtered);
    onClose();
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleEvent = (id: string) => {
    setSelectedEvents(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-black text-slate-900">Opciones de Exportación</h2>
          <button onClick={onClose} className="w-8 h-8 hover:bg-white rounded-lg flex items-center justify-center text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="grid grid-cols-3 gap-2">
            {(['all', 'category', 'individual'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`py-3 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border-2 transition-all ${
                  mode === m 
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                    : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'
                }`}
              >
                {m === 'all' ? 'Todos' : m === 'category' ? 'Categoría' : 'Individual'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {mode === 'category' && (
              <motion.div key="cat-selection" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase">Seleccionar Categorías</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {categories.map((cat: any) => (
                    <button
                      key={cat.id}
                      onClick={() => toggleCategory(cat.categoria)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left text-sm font-medium transition-all ${
                        selectedCategories.includes(cat.categoria)
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center text-white ${selectedCategories.includes(cat.categoria) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>
                        {selectedCategories.includes(cat.categoria) && <Plus className="w-3 h-3" />}
                      </div>
                      <span className="truncate">{cat.categoria}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {mode === 'individual' && (
              <motion.div key="ind-selection" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase">Seleccionar Eventos</label>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {events.map((ev: any) => (
                    <button
                      key={ev.id}
                      onClick={() => toggleEvent(ev.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left text-sm font-medium transition-all ${
                        selectedEvents.includes(ev.id)
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-white ${selectedEvents.includes(ev.id) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>
                        {selectedEvents.includes(ev.id) && <Plus className="w-3 h-3" />}
                      </div>
                      <span className="truncate">{ev.titulo}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-200 flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleExport} className="flex-1 shadow-lg shadow-indigo-600/20">Generar Reporte</Button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Internal Components ---

function NavItem({ active, onClick, icon: Icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all ${
        active 
          ? 'sidebar-active' 
          : 'text-slate-400 hover:text-white'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="tracking-tight">{label}</span>
    </button>
  );
}

function EventCard({ event, onClick, index }: { event: Evento, onClick: () => void, index: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0, transition: { delay: index * 0.05 } }}
      whileHover={{ y: -6, scale: 1.01 }}
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm hover:shadow-2xl hover:shadow-slate-200/50 transition-all cursor-pointer relative overflow-hidden group"
    >
      <div className="absolute top-0 right-0 p-8 flex gap-2">
         <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
           event.estado === 'FINALIZADO' ? 'bg-emerald-100 text-emerald-800' : 
            event.estado === 'EN PROCESO' ? 'bg-amber-100 text-amber-800' : 
            event.estado === 'ABANDONADO' ? 'bg-rose-100 text-rose-800' : 
            'bg-indigo-100 text-indigo-800'
         }`}>
           {event.estado}
         </span>
      </div>

      <div className="flex flex-col gap-6 h-full">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-slate-900 rounded-full" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mt-0.5">
              {event.categoria}
            </span>
          </div>
          <h3 className="text-xl font-black text-slate-900 group-hover:text-slate-600 leading-tight mb-3 transition-colors pr-20">
            {event.titulo}
          </h3>
          <p className="text-sm font-medium text-slate-400 line-clamp-2 leading-relaxed h-10">
            {event.descripcion}
          </p>
        </div>

        <div className="mt-auto pt-6 border-t border-slate-50 flex items-center justify-between text-[11px] font-bold">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              {format(new Date(event.fecha_inicio), 'dd MMM yyyy', { locale: es })}
            </div>
            <div className="flex items-center gap-1.5 text-slate-900">
              <User className="w-3.5 h-3.5" />
              {event.supervisor.split(' ')[0]}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-200 group-hover:translate-x-1 group-hover:text-slate-900 transition-all" />
        </div>
      </div>
    </motion.div>
  );
}

function EventModal({ onClose, categories, states, userId, onSuccess }: any) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.target);
    const payload = {
      id: crypto.randomUUID(),
      fecha_inicio: fd.get('fecha_inicio'),
      categoria: fd.get('categoria'),
      titulo: fd.get('titulo'),
      descripcion: fd.get('descripcion'),
      fecha_cierre: fd.get('fecha_cierre') || null,
      supervisor: fd.get('supervisor'),
      estado: fd.get('estado'),
      usuario_id: userId
    };

    const { error } = await supabase.from('eventos').insert(payload);
    if (error) {
      console.error(error);
      alert("Error al guardar: " + error.message);
    } else {
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-6 z-50">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="glass-modal w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Nuevo Evento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input name="titulo" label="Título del Evento" placeholder="Ej: Auditoría de Seguridad Anual" required />
          </div>
          <Select name="categoria" label="Categoría" options={categories} required />
          <Input name="supervisor" label="Supervisor" placeholder="Nombre del supervisor" required />
          <Input name="fecha_inicio" label="Fecha de Inicio" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} />
          <Input name="fecha_cierre" label="Fecha Estimada Cierre" type="date" />
          <div className="md:col-span-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Descripción</label>
              <textarea name="descripcion" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm h-20 resize-none outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Detalles generales del evento..." required></textarea>
            </div>
          </div>
          <Select name="estado" label="Estado Inicial" options={states} defaultValue="PENDIENTE" required />
          <div className="flex items-end">
            <Button type="submit" disabled={loading} className="w-full h-10 font-bold bg-indigo-600 text-white shadow-md">
              {loading ? 'Guardando...' : 'Guardar Evento'}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function EventDetail({ id, onBack, categories, states, fetchInitialData, currentUser }: any) {
  const [event, setEvent] = useState<Evento | null>(null);
  const [followUps, setFollowUps] = useState<Tema[]>([]);
  const [avances, setAvances] = useState<Avance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingFollowUp, setIsAddingFollowUp] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState<Tema | null>(null);
  const [addingAvanceTemaId, setAddingAvanceTemaId] = useState<string | null>(null);
  const [quickAvanceDesc, setQuickAvanceDesc] = useState('');
  const [quickAvanceResp, setQuickAvanceResp] = useState('');
  const [quickAvanceImp, setQuickAvanceImp] = useState('MEDIA');
  const [savingQuickAvance, setSavingQuickAvance] = useState(false);

  // State for inline editing of an existing advance in EventDetail
  const [editingAvance, setEditingAvance] = useState<Avance | null>(null);
  const [editAvanceFecha, setEditAvanceFecha] = useState('');
  const [editAvanceResp, setEditAvanceResp] = useState('');
  const [editAvanceImp, setEditAvanceImp] = useState('MEDIA');
  const [editAvanceDesc, setEditAvanceDesc] = useState('');
  const [savingEditAvance, setSavingEditAvance] = useState(false);

  const startEditingAvance = (av: Avance) => {
    setEditingAvance(av);
    setEditAvanceFecha(av.fecha);
    setEditAvanceResp(av.responsable || '');
    setEditAvanceImp(av.importancia || 'MEDIA');
    setEditAvanceDesc(av.descripcion);
  };

  const handleSaveEditAvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAvance || !editAvanceDesc.trim()) return;
    setSavingEditAvance(true);
    try {
      const { error } = await supabase.from('avances').update({
        fecha: editAvanceFecha,
        responsable: editAvanceResp.trim() || null,
        importancia: editAvanceImp,
        descripcion: editAvanceDesc.trim()
      }).eq('id', editingAvance.id);
      if (error) throw error;
      setEditingAvance(null);
      await fetchDetail();
      await fetchInitialData();
    } catch (err: any) {
      alert("Error al actualizar avance: " + err.message);
    } finally {
      setSavingEditAvance(false);
    }
  };

  const fetchDetail = async () => {
    setLoading(true);
    const { data: ev } = await supabase.from('eventos').select('*').eq('id', id).single();
    const { data: temasData } = await supabase.from('temas').select('*').eq('id_eventos', id).order('fecha', { ascending: false });
    if (ev) setEvent(ev);
    const loadedTemas = (temasData || []).map(t => ({
      ...t,
      descripcion_avance: t.subtitulo
    }));
    setFollowUps(loadedTemas);

    if (loadedTemas.length > 0) {
      const temaIds = loadedTemas.map(t => t.id);
      const { data: avs } = await supabase
        .from('avances')
        .select('*')
        .in('id_temas', temaIds)
        .order('fecha', { ascending: false });
      setAvances(avs || []);
    } else {
      setAvances([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchDetail(); }, [id]);

  const removeFollowUp = async (sid: string) => {
    if (!confirm("¿Confirmas la eliminación definitiva de este tema y todos sus avances?")) return;
    await supabase.from('avances').delete().eq('id_temas', sid);
    await supabase.from('temas').delete().eq('id', sid);
    fetchDetail();
    fetchInitialData();
  };

  const removeAvance = async (avanceId: string) => {
    if (!confirm("¿Confirmas la eliminación de este avance?")) return;
    await supabase.from('avances').delete().eq('id', avanceId);
    fetchDetail();
    fetchInitialData();
  };

  const handleQuickAddAvance = async (e: React.FormEvent, temaId: string) => {
    e.preventDefault();
    if (!quickAvanceDesc.trim()) return;
    setSavingQuickAvance(true);
    try {
      const payload = {
        id: crypto.randomUUID(),
        id_temas: temaId,
        fecha: format(new Date(), 'yyyy-MM-dd'),
        responsable: quickAvanceResp.trim() || currentUser?.nombre || null,
        importancia: quickAvanceImp || 'MEDIA',
        descripcion: quickAvanceDesc.trim()
      };
      const { error } = await supabase.from('avances').insert(payload);
      if (error) throw error;
      setQuickAvanceDesc('');
      setAddingAvanceTemaId(null);
      await fetchDetail();
      await fetchInitialData();
    } catch (err: any) {
      alert("Error al registrar avance: " + err.message);
    } finally {
      setSavingQuickAvance(false);
    }
  };

  const handleUpdate = async (e: any) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      titulo: fd.get('titulo'),
      descripcion: fd.get('descripcion'),
      estado: fd.get('estado'),
      supervisor: fd.get('supervisor'),
      fecha_inicio: fd.get('fecha_inicio'),
      fecha_cierre: fd.get('fecha_cierre') || null
    };
    await supabase.from('eventos').update(payload).eq('id', id);
    alert("Registro actualizado correctamente");
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
    </div>
  );
  
  if (!event) return (
    <div className="text-center py-20">
      <p className="text-slate-400 font-bold uppercase tracking-widest">Proyecto no encontrado</p>
      <Button onClick={onBack} variant="ghost" className="mt-4">Regresar</Button>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6 md:gap-10">
      <div className="flex items-center gap-4 md:gap-6">
        <button onClick={onBack} className="w-10 h-10 md:w-12 md:h-12 bg-white border border-slate-200 rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-slate-50 transition-colors shadow-sm shrink-0">
          <ArrowLeft className="w-5 h-5 md:w-6 md:h-6 text-slate-900" />
        </button>
        <div className="min-w-0">
          <h2 className="text-xl md:text-3xl font-black tracking-tight text-slate-900 leading-tight mb-1 md:mb-2 truncate">{event.titulo}</h2>
          <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">
            <div className="w-2 h-2 bg-indigo-500 rounded-full" /> {event.categoria}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
        <aside className="lg:col-span-4 flex flex-col gap-8 order-2 lg:order-1">
          <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
            <h3 className="text-base md:text-lg font-bold text-slate-900 mb-6 border-b border-slate-100 pb-3">Editar Datos</h3>
            <form onSubmit={handleUpdate} className="flex flex-col gap-4 relative z-10">
              <Input name="titulo" label="Título" defaultValue={event.titulo} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select name="estado" label="Estado" options={states} defaultValue={event.estado} />
                <Input name="supervisor" label="Supervisor" defaultValue={event.supervisor} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input name="fecha_inicio" label="Fecha Inicio" type="date" defaultValue={event.fecha_inicio} />
                <Input name="fecha_cierre" label="Fecha Est. Cierre" type="date" defaultValue={event.fecha_cierre || ''} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Resumen</label>
                <textarea name="descripcion" rows={4} className="w-full bg-slate-50 border border-slate-200 rounded-md p-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" defaultValue={event.descripcion} />
              </div>
              <Button type="submit" className="mt-2 text-xs md:text-sm"><Save className="w-4 h-4" /> Guardar Cambios</Button>
            </form>
          </div>
        </aside>

        <section className="lg:col-span-8 flex flex-col gap-6 md:gap-8 order-1 lg:order-2">
          <div className="flex items-center justify-between px-2 gap-4">
            <h3 className="text-xl md:text-2xl font-black text-slate-900 leading-tight">Bitácora de Temas</h3>
            <Button onClick={() => setIsAddingFollowUp(true)} className="shrink-0 text-xs md:text-sm px-3 md:px-4">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuevo Tema</span><span className="sm:hidden">Nuevo</span>
            </Button>
          </div>

          <div className="space-y-6">
            {followUps.map((s, idx) => {
              const temaAvances = avances.filter(a => a.id_temas === s.id);
              return (
                <motion.div 
                  key={s.id} 
                  initial={{ opacity: 0, x: -20 }} 
                  animate={{ opacity: 1, x: 0, transition: { delay: idx * 0.1 } }}
                  className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative group hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 font-bold text-sm">
                        {format(new Date(s.fecha), 'dd')}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 leading-none mb-1">{s.responsable}</h4>
                          {isUrgentReport(s) && (
                            <div className="flex h-2 w-2 relative" title="Restan 3 días o menos para la fecha de finalización estimada">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"></span>
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{format(new Date(s.fecha), 'MMMM yyyy', { locale: es })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-[9px] font-bold uppercase rounded tracking-widest mr-1 ${
                        s.estado === 'FINALIZADO' ? 'bg-emerald-100 text-emerald-800' : 
                        s.estado === 'EN PROCESO' ? 'bg-amber-100 text-amber-800' : 
                        s.estado === 'ABANDONADO' ? 'bg-rose-100 text-rose-800' : 
                        'bg-indigo-100 text-indigo-800'
                      }`}>
                        {s.estado}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setEditingFollowUp(s)} 
                          className="w-7 h-7 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-900 transition-colors cursor-pointer"
                          title="Editar Tema"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => removeFollowUp(s.id)} 
                          className="w-7 h-7 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                          title="Eliminar Tema"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Subtítulo del Tema */}
                  <div className="mb-4">
                    <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest block mb-0.5">Tema / Subtítulo</span>
                    <h4 className="text-base font-bold text-slate-900 leading-snug">
                      {s.subtitulo || s.descripcion_avance}
                    </h4>
                  </div>

                  {/* Sección de Avances */}
                  <div className="my-4 bg-slate-50/90 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Avances Registrados</span>
                        <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {temaAvances.length}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (addingAvanceTemaId === s.id) {
                            setAddingAvanceTemaId(null);
                          } else {
                            setAddingAvanceTemaId(s.id);
                            setQuickAvanceResp(currentUser?.nombre || s.responsable || '');
                            setQuickAvanceDesc('');
                          }
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Agregar Avance
                      </button>
                    </div>

                    {addingAvanceTemaId === s.id && (
                      <form onSubmit={(e) => handleQuickAddAvance(e, s.id)} className="bg-white p-3.5 rounded-xl border border-indigo-200 shadow-sm mb-3 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Nuevo Avance</span>
                          <button type="button" onClick={() => setAddingAvanceTemaId(null)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input 
                            type="text"
                            placeholder="Responsable del avance..."
                            value={quickAvanceResp}
                            onChange={(e) => setQuickAvanceResp(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <select
                            value={quickAvanceImp}
                            onChange={(e) => setQuickAvanceImp(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500 font-bold text-slate-700"
                          >
                            <option value="BAJA">Importancia: BAJA</option>
                            <option value="MEDIA">Importancia: MEDIA</option>
                            <option value="ALTA">Importancia: ALTA</option>
                            <option value="URGENTE">Importancia: URGENTE</option>
                          </select>
                        </div>
                        <textarea
                          rows={2}
                          required
                          placeholder="Descripción del avance..."
                          value={quickAvanceDesc}
                          onChange={(e) => setQuickAvanceDesc(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setAddingAvanceTemaId(null)}
                            className="px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={savingQuickAvance || !quickAvanceDesc.trim()}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded flex items-center gap-1 shadow-xs"
                          >
                            <Save className="w-3 h-3" /> {savingQuickAvance ? 'Guardando...' : 'Guardar Avance'}
                          </button>
                        </div>
                      </form>
                    )}

                    {temaAvances.length > 0 ? (
                      <div className="space-y-2">
                        {temaAvances.map(av => (
                          <div key={av.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                            {editingAvance?.id === av.id ? (
                              <form onSubmit={handleSaveEditAvance} className="flex flex-col gap-2.5">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                                    ✏️ Editando Avance
                                  </span>
                                  <button type="button" onClick={() => setEditingAvance(null)} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Fecha</label>
                                    <input 
                                      type="date"
                                      value={editAvanceFecha}
                                      onChange={(e) => setEditAvanceFecha(e.target.value)}
                                      className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Responsable</label>
                                    <input 
                                      type="text"
                                      placeholder="Responsable..."
                                      value={editAvanceResp}
                                      onChange={(e) => setEditAvanceResp(e.target.value)}
                                      className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Importancia</label>
                                    <select 
                                      value={editAvanceImp}
                                      onChange={(e) => setEditAvanceImp(e.target.value)}
                                      className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500 font-bold text-slate-700"
                                    >
                                      <option value="BAJA">BAJA</option>
                                      <option value="MEDIA">MEDIA</option>
                                      <option value="ALTA">ALTA</option>
                                      <option value="URGENTE">URGENTE</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Detalle del Avance</label>
                                  <textarea
                                    rows={2}
                                    required
                                    value={editAvanceDesc}
                                    onChange={(e) => setEditAvanceDesc(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                                  />
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingAvance(null)}
                                    className="px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded font-medium"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={savingEditAvance || !editAvanceDesc.trim()}
                                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded flex items-center gap-1 shadow-xs"
                                  >
                                    <Save className="w-3 h-3" /> {savingEditAvance ? 'Guardando...' : 'Guardar Cambios'}
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                      {format(new Date(av.fecha), 'dd/MM/yyyy')}
                                    </span>
                                    {av.responsable && (
                                      <span className="text-[11px] font-bold text-slate-800 truncate">
                                        {av.responsable}
                                      </span>
                                    )}
                                    <ImportanciaBadge importancia={av.importancia} />
                                  </div>
                                  <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                                    {av.descripcion}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => startEditingAvance(av)}
                                    className="text-slate-400 hover:text-indigo-600 transition-colors p-1 cursor-pointer"
                                    title="Editar avance"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeAvance(av.id)}
                                    className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                                    title="Eliminar avance"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">No hay avances registrados para este tema.</p>
                    )}
                  </div>

                  {s.image_url && (
                    <div className="mb-4 rounded-lg overflow-hidden border border-slate-100 max-w-sm">
                      <img 
                        src={s.image_url} 
                        alt="Evidencia" 
                        className="w-full h-auto object-cover hover:scale-105 transition-transform duration-500 cursor-pointer"
                        onClick={() => window.open(s.image_url!, '_blank')}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-slate-50">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Recursos</span>
                      <span className="text-xs font-bold text-slate-700 truncate block">{s.recursos || 'S/E'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Finalización</span>
                      <span className="text-xs font-bold text-slate-700 truncate block">
                        {s.fecha_finalizacion ? format(new Date(s.fecha_finalizacion), 'dd/MM/yyyy') : 'Pendiente'}
                      </span>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-1 border-t sm:border-t-0 sm:pt-0 pt-3 mt-3 sm:mt-0">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Observación</span>
                      <span className="text-xs font-bold text-slate-700 block italic leading-snug">{s.observaciones || '---'}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {followUps.length === 0 && (
              <div className="py-24 bg-white rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                <CheckCircle2 className="w-12 h-12 mb-4 opacity-10" />
                <p className="font-bold uppercase tracking-widest text-[10px]">Sin temas registrados</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {(isAddingFollowUp || editingFollowUp) && (
          <FollowUpModal 
            eventId={id} 
            states={states} 
            followUp={editingFollowUp}
            currentUser={currentUser}
            onClose={() => { setIsAddingFollowUp(false); setEditingFollowUp(null); }} 
            onSuccess={() => { setIsAddingFollowUp(false); setEditingFollowUp(null); fetchDetail(); fetchInitialData(); }} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FollowUpModal({ eventId, states, onClose, onSuccess, followUp, currentUser }: any) {
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(followUp?.image_url || null);

  // Avances state inside modal
  const [existingAvances, setExistingAvances] = useState<Avance[]>([]);
  const [pendingAvances, setPendingAvances] = useState<Array<{ id: string; fecha: string; responsable: string; descripcion: string; importancia: string }>>([]);
  
  // Inputs for adding or editing an avance inside the modal
  const [editingAvanceId, setEditingAvanceId] = useState<string | null>(null);
  const [newAvanceFecha, setNewAvanceFecha] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newAvanceResp, setNewAvanceResp] = useState(currentUser?.nombre || followUp?.responsable || '');
  const [newAvanceImp, setNewAvanceImp] = useState('MEDIA');
  const [newAvanceDesc, setNewAvanceDesc] = useState('');
  const [savingAvanceInModal, setSavingAvanceInModal] = useState(false);

  useEffect(() => {
    if (followUp?.id) {
      supabase
        .from('avances')
        .select('*')
        .eq('id_temas', followUp.id)
        .order('fecha', { ascending: false })
        .then(({ data }) => setExistingAvances(data || []));
    }
  }, [followUp?.id]);

  const handleStartEditAvanceInModal = (av: any) => {
    setEditingAvanceId(av.id);
    setNewAvanceFecha(av.fecha || format(new Date(), 'yyyy-MM-dd'));
    setNewAvanceResp(av.responsable || '');
    setNewAvanceImp(av.importancia || 'MEDIA');
    setNewAvanceDesc(av.descripcion || '');
  };

  const handleCancelEditAvanceInModal = () => {
    setEditingAvanceId(null);
    setNewAvanceFecha(format(new Date(), 'yyyy-MM-dd'));
    setNewAvanceResp(currentUser?.nombre || followUp?.responsable || '');
    setNewAvanceImp('MEDIA');
    setNewAvanceDesc('');
  };

  const handleSaveAvanceInModal = async () => {
    if (!newAvanceDesc.trim()) return;

    if (editingAvanceId) {
      // Editar avance existente
      if (followUp?.id) {
        setSavingAvanceInModal(true);
        const updatePayload = {
          fecha: newAvanceFecha,
          responsable: newAvanceResp.trim() || null,
          importancia: newAvanceImp,
          descripcion: newAvanceDesc.trim()
        };
        const { data, error } = await supabase
          .from('avances')
          .update(updatePayload)
          .eq('id', editingAvanceId)
          .select()
          .single();
        if (error) {
          alert("Error al actualizar avance: " + error.message);
        } else if (data) {
          setExistingAvances(prev => prev.map(a => a.id === editingAvanceId ? data : a));
          handleCancelEditAvanceInModal();
        }
        setSavingAvanceInModal(false);
      } else {
        setPendingAvances(prev => prev.map(a => a.id === editingAvanceId ? {
          ...a,
          fecha: newAvanceFecha,
          responsable: newAvanceResp.trim() || currentUser?.nombre || '',
          importancia: newAvanceImp,
          descripcion: newAvanceDesc.trim()
        } : a));
        handleCancelEditAvanceInModal();
      }
      return;
    }
    
    // Crear nuevo avance
    if (followUp?.id) {
      setSavingAvanceInModal(true);
      const newAv = {
        id: crypto.randomUUID(),
        id_temas: followUp.id,
        fecha: newAvanceFecha,
        responsable: newAvanceResp.trim() || currentUser?.nombre || null,
        importancia: newAvanceImp,
        descripcion: newAvanceDesc.trim()
      };
      const { data, error } = await supabase.from('avances').insert(newAv).select().single();
      if (error) {
        alert("Error al agregar avance: " + error.message);
      } else if (data) {
        setExistingAvances(prev => [data, ...prev]);
        setNewAvanceDesc('');
      }
      setSavingAvanceInModal(false);
    } else {
      const stagedAv = {
        id: crypto.randomUUID(),
        fecha: newAvanceFecha,
        responsable: newAvanceResp.trim() || currentUser?.nombre || '',
        importancia: newAvanceImp,
        descripcion: newAvanceDesc.trim()
      };
      setPendingAvances(prev => [stagedAv, ...prev]);
      setNewAvanceDesc('');
    }
  };

  const handleDeleteAvanceInModal = async (avanceId: string) => {
    if (editingAvanceId === avanceId) {
      handleCancelEditAvanceInModal();
    }
    if (followUp?.id) {
      if (!confirm("¿Deseas eliminar este avance?")) return;
      await supabase.from('avances').delete().eq('id', avanceId);
      setExistingAvances(prev => prev.filter(a => a.id !== avanceId));
    } else {
      setPendingAvances(prev => prev.filter(a => a.id !== avanceId));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Error al comprimir imagen'));
            },
            'image/jpeg',
            0.7 // Calidad 70%
          );
        };
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.target);
    
    let uploadedImageUrl = followUp?.image_url || null;

    if (!previewUrl) {
      if (followUp?.image_url) {
        try {
          const decodedUrl = decodeURIComponent(followUp.image_url);
          const bucketSearchStr = "/public/imagenes/";
          const bucketIndex = decodedUrl.indexOf(bucketSearchStr);
          if (bucketIndex !== -1) {
            const filePath = decodedUrl.substring(bucketIndex + bucketSearchStr.length);
            console.log("Eliminando archivo del bucket:", filePath);
            const { error: removeError } = await supabase.storage
              .from('imagenes')
              .remove([filePath]);
            if (removeError) {
              console.warn("No se pudo eliminar el archivo del bucket o ya no existía:", removeError);
            }
          }
        } catch (storageErr) {
          console.error("Error al intentar eliminar el archivo del bucket de almacenamiento:", storageErr);
        }
      }
      uploadedImageUrl = null;
    } else if (imageFile) {
      try {
        const fileExt = 'jpg'; // Forzamos jpg tras la compresión
        const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
        const filePath = `${eventId}/${fileName}`;

        console.log("Comprimiendo y subiendo imagen...", { bucket: 'imagenes', filePath });

        const compressedBlob = await compressImage(imageFile);

        const { error: uploadError } = await supabase.storage
          .from('imagenes')
          .upload(filePath, compressedBlob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error("Error detallado de subida:", uploadError);
          alert(`Error al subir la imagen: ${uploadError.message}`);
          setLoading(false);
          return; 
        } else {
          const { data } = supabase.storage
            .from('imagenes')
            .getPublicUrl(filePath);
          
          uploadedImageUrl = data.publicUrl;
        }
      } catch (err) {
        console.error("Error en el proceso de imagen:", err);
        alert("Error al procesar la imagen antes de subir.");
        setLoading(false);
        return;
      }
    }

    const payload = {
      id_eventos: eventId,
      responsable: fd.get('responsable'),
      fecha: fd.get('fecha'),
      subtitulo: fd.get('subtitulo'),
      fecha_finalizacion: fd.get('fecha_finalizacion') || null,
      recursos: fd.get('recursos'),
      estado: fd.get('estado'),
      observaciones: fd.get('observaciones'),
      image_url: uploadedImageUrl
    };
    
    let error;
    if (followUp) {
      const { error: err } = await supabase.from('temas').update(payload).eq('id', followUp.id);
      error = err;
    } else {
      const newTemaId = crypto.randomUUID();
      const { error: err } = await supabase.from('temas').insert({ ...payload, id: newTemaId });
      error = err;
      if (!err && pendingAvances.length > 0) {
        const toInsert = pendingAvances.map(a => ({
          id: a.id,
          id_temas: newTemaId,
          fecha: a.fecha,
          responsable: a.responsable || null,
          importancia: a.importancia,
          descripcion: a.descripcion
        }));
        await supabase.from('avances').insert(toInsert);
      }
    }
    
    if (error) alert(error.message); else onSuccess();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden overflow-y-auto max-h-[95vh]">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-xl tracking-tight text-slate-900">
            {followUp ? 'Editar Tema' : 'Nuevo Tema'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 hover:bg-white rounded-lg flex items-center justify-center text-slate-400 transition-colors cursor-pointer"><X /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input name="fecha" label="Fecha Reporte" type="date" required defaultValue={followUp?.fecha || format(new Date(), 'yyyy-MM-dd')} />
            <Input name="fecha_finalizacion" label="Fin Est." type="date" defaultValue={followUp?.fecha_finalizacion || ''} />
          </div>
          <Input name="responsable" label="Responsable del Tema" placeholder="Nombre completo" required icon={User} defaultValue={followUp?.responsable || currentUser?.nombre || ''} />
          <Select name="estado" label="Estado Actual" options={states} required defaultValue={followUp?.estado || 'EN PROCESO'} />
          
          {/* Subtítulo del Tema */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">
              Subtítulo del Tema
            </label>
            <input 
              name="subtitulo" 
              required 
              placeholder="Ej: Padrón de Equipos, Montaje de planta..." 
              defaultValue={followUp?.subtitulo || followUp?.descripcion_avance || ''} 
              className="w-full bg-slate-50 border border-slate-200 rounded-md p-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
            />
          </div>

          {/* En lugar del cuadro 'Resumen de Actividades': Registro de Avances según tabla 'avances' */}
          <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-widest leading-none">
                  Avances del Tema
                </label>
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {(followUp ? existingAvances : pendingAvances).length}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Tabla: avances</span>
            </div>

            {/* Listado de avances */}
            {((followUp ? existingAvances : pendingAvances).length > 0) ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {(followUp ? existingAvances : pendingAvances).map((av: any) => (
                  <div key={av.id} className={`p-2.5 rounded-lg border flex items-start justify-between gap-2 shadow-xs transition-colors ${
                    editingAvanceId === av.id ? 'bg-amber-50/60 border-amber-300' : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {format(new Date(av.fecha), 'dd/MM/yyyy')}
                        </span>
                        {av.responsable && (
                          <span className="text-[10px] font-bold text-slate-700 truncate">
                            {av.responsable}
                          </span>
                        )}
                        <ImportanciaBadge importancia={av.importancia} />
                      </div>
                      <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                        {av.descripcion}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEditAvanceInModal(av)}
                        className={`p-1 cursor-pointer transition-colors ${
                          editingAvanceId === av.id ? 'text-amber-600' : 'text-slate-400 hover:text-indigo-600'
                        }`}
                        title="Editar avance"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAvanceInModal(av.id)}
                        className="text-slate-300 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                        title="Eliminar avance"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-2 text-center bg-white rounded-lg border border-dashed border-slate-200">
                Sin avances registrados aún. Puedes ingresar avances a continuación:
              </p>
            )}

            {/* Formulario para ingresar / editar avance */}
            <div className={`p-3 rounded-lg border flex flex-col gap-2.5 transition-colors ${
              editingAvanceId ? 'bg-amber-50/40 border-amber-300' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  {editingAvanceId ? '✏️ Editar Avance' : '+ Ingresar Avance'}
                </span>
                {editingAvanceId && (
                  <button
                    type="button"
                    onClick={handleCancelEditAvanceInModal}
                    className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Fecha</label>
                  <input 
                    type="date"
                    value={newAvanceFecha}
                    onChange={(e) => setNewAvanceFecha(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Responsable</label>
                  <input 
                    type="text"
                    placeholder="Responsable..."
                    value={newAvanceResp}
                    onChange={(e) => setNewAvanceResp(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Importancia</label>
                  <select 
                    value={newAvanceImp}
                    onChange={(e) => setNewAvanceImp(e.target.value)}
                    className={`w-full bg-slate-50 border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500 font-bold ${
                      newAvanceImp === 'URGENTE' ? 'border-red-400 text-red-600' : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="BAJA">BAJA</option>
                    <option value="MEDIA">MEDIA</option>
                    <option value="ALTA">ALTA</option>
                    <option value="URGENTE">URGENTE</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Detalle del Avance</label>
                <textarea
                  rows={2}
                  placeholder="Describe qué se avanzó..."
                  value={newAvanceDesc}
                  onChange={(e) => setNewAvanceDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                />
              </div>
              <div className="flex justify-end gap-2">
                {editingAvanceId && (
                  <button
                    type="button"
                    onClick={handleCancelEditAvanceInModal}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-bold cursor-pointer transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveAvanceInModal}
                  disabled={savingAvanceInModal || !newAvanceDesc.trim()}
                  className={`px-3 py-1.5 ${
                    editingAvanceId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  } disabled:opacity-40 text-white rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors`}
                >
                  {editingAvanceId ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {savingAvanceInModal ? 'Guardando...' : (editingAvanceId ? 'Actualizar Avance' : 'Agregar Avance')}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Evidencia Fotográfica</label>
            <div className="flex items-center gap-4 p-3 border-2 border-dashed border-slate-200 rounded-xl hover:border-indigo-300 transition-colors bg-slate-50">
              <label className="cursor-pointer flex flex-col items-center justify-center w-24 h-24 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
                <Camera className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-[9px] font-bold text-slate-500 uppercase">Capturar</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
              
              {previewUrl ? (
                <div className="relative group w-24 h-24 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                  <img src={previewUrl} className="w-full h-full object-cover" alt="Vista previa" />
                  <button 
                    type="button" 
                    onClick={() => { setImageFile(null); setPreviewUrl(null); }}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex-1 text-center py-4">
                  <ImageIcon className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-[10px] text-slate-400 font-medium">No se ha seleccionado ninguna imagen</p>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input name="recursos" label="Recursos" placeholder="Ej. Licencias, API" defaultValue={followUp?.recursos || ''} />
            <Input name="observaciones" label="Observaciones" defaultValue={followUp?.observaciones || ''} />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={onClose} className="px-6 text-xs md:text-sm">Cancelar</Button>
            <Button type="submit" disabled={loading} className="px-8 text-xs md:text-sm">{loading ? 'Procesando...' : (followUp ? 'Actualizar Tema' : 'Registrar Tema')}</Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ConfigView({ categories, fetchInitialData, reportIntro, setReportIntro, reportTitle, setReportTitle, reportLogoUrl, setReportLogoUrl }: any) {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [introText, setIntroText] = useState(reportIntro);
  const [titleText, setTitleText] = useState(reportTitle);
  const [logoPreview, setLogoPreview] = useState(reportLogoUrl);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  
  useEffect(() => {
    supabase.from('usuarios').select('*').then(({ data }) => setUsers(data || []));
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const saveReportConfig = async () => {
    setSavingConfig(true);
    try {
      let finalLogoUrl = reportLogoUrl;

      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `logo-${Date.now()}.${fileExt}`;
        const filePath = `config/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('imagenes')
          .upload(filePath, logoFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('imagenes')
          .getPublicUrl(filePath);
        
        finalLogoUrl = publicUrlData.publicUrl;
      }

      const updates = [
        { id: 'report_intro', valor: introText },
        { id: 'report_title', valor: titleText },
        { id: 'report_logo_url', valor: finalLogoUrl || '' }
      ];

      const { error } = await supabase
        .from('configuracion')
        .upsert(updates);
      
      if (error) throw error;
      
      setReportIntro(introText);
      setReportTitle(titleText);
      setReportLogoUrl(finalLogoUrl);
      
      alert("Configuración de reporte actualizada correctamente.");
    } catch (err: any) {
      console.error("Error saving config:", err);
      alert("Error al guardar la configuración: " + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const addCategory = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const name = e.target.catName.value;
    await supabase.from('categorias').insert({ id: crypto.randomUUID(), categoria: name });
    e.target.reset();
    await fetchInitialData();
    setLoading(false);
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Confirmar eliminación de categoría?")) return;
    await supabase.from('categorias').delete().eq('id', id);
    fetchInitialData();
  };

  const addUser = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.target);
    await supabase.from('usuarios').insert({
      id: crypto.randomUUID(),
      nombre: fd.get('nombre'),
      correo: fd.get('correo'),
      password: fd.get('password')
    });
    e.target.reset();
    const { data } = await supabase.from('usuarios').select('*');
    setUsers(data || []);
    setLoading(false);
  };

  const deleteUser = async (uid: string) => {
    if (!confirm("Confirmar eliminación de usuario?")) return;
    await supabase.from('usuarios').delete().eq('id', uid);
    const { data } = await supabase.from('usuarios').select('*');
    setUsers(data || []);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10 lg:max-w-6xl mx-auto pb-10">
      <section className="flex flex-col gap-6 md:gap-10 lg:col-span-2">
        <div className="bg-white p-6 md:p-10 rounded-2xl md:rounded-[3rem] border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8 md:mb-10 border-b border-slate-50 pb-6">
            <div>
              <h3 className="text-xl md:text-2xl font-black">Personalización del Reporte PDF</h3>
              <p className="text-sm text-slate-500 mt-1">Ajusta la identidad visual y el contenido de tus informes exportados.</p>
            </div>
            <Button onClick={saveReportConfig} disabled={savingConfig} className="text-xs md:text-sm shadow-indigo-600/10">
              <Save className="w-4 h-4" /> {savingConfig ? 'Guardando...' : 'Guardar Todo'}
            </Button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">Título del Reporte</label>
                <input 
                  type="text"
                  value={titleText}
                  onChange={(e) => setTitleText(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-4 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="Ej. REPORTE MENSUAL DE ACTIVIDADES"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">Texto de Introducción</label>
                <textarea 
                  value={introText} 
                  onChange={(e) => setIntroText(e.target.value)}
                  rows={6} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-4 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all leading-relaxed"
                  placeholder="Escribe aquí la introducción para los reportes..."
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none">Logo Institucional</label>
              <div className="relative group">
                <div className="w-full aspect-[4/3] bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-6 transition-all group-hover:border-indigo-300">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="max-w-full max-h-full object-contain rounded-lg" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ImagePlus className="w-10 h-10 stroke-1" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Subir Logo</span>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleLogoChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                {logoPreview && (
                   <p className="text-[9px] text-slate-400 mt-2 text-center italic font-medium">Haz click para cambiar la imagen actual</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-6 md:gap-8">
        <div className="bg-white p-6 md:p-10 rounded-2xl md:rounded-[3rem] border border-slate-200 shadow-sm">
          <h3 className="text-xl md:text-2xl font-black mb-6 md:mb-8 border-b border-slate-50 pb-4">Gestión de Categorías</h3>
          <form onSubmit={addCategory} className="flex gap-3 mb-6 md:mb-8">
            <Input name="catName" placeholder="Nueva categoría..." required />
            <Button type="submit" className="shrink-0 rounded-xl md:rounded-2xl w-12 h-10 md:w-14 md:h-11"><Plus className="w-5 md:w-6 h-5 md:h-6" /></Button>
          </form>
          <div className="flex flex-wrap gap-2 md:gap-2.5">
            {categories.map((c: any) => (
              <div key={c.id} className="group flex items-center gap-2 md:gap-3 bg-slate-50 border border-slate-100 pl-4 md:pl-5 pr-1.5 md:pr-2 py-1.5 md:py-2 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-white hover:border-slate-300 transition-all">
                {c.categoria}
                <button onClick={() => deleteCategory(c.id)} className="w-5 h-5 md:w-6 md:h-6 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors text-slate-200 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-6 md:gap-8">
        <div className="bg-white p-6 md:p-10 rounded-2xl md:rounded-[3rem] border border-slate-200 shadow-sm">
          <h3 className="text-xl md:text-2xl font-black mb-6 md:mb-8 border-b border-slate-50 pb-4">Usuarios del Sistema</h3>
          <form onSubmit={addUser} className="grid grid-cols-1 gap-4 md:gap-5 mb-8 md:mb-10 pb-8 md:pb-10 border-b border-slate-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input name="nombre" label="Nombre" placeholder="Nombre completo" required />
              <Input name="correo" label="Correo" type="email" placeholder="example@mail.com" required />
            </div>
            <Input name="password" label="Contraseña de Acceso" type="password" required />
            <Button type="submit" disabled={loading} className="w-full h-11 md:h-12 rounded-xl mt-2 shadow-xl shadow-slate-900/5 text-xs md:text-sm">Registrar Nuevo Acceso</Button>
          </form>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 md:p-4 bg-slate-50 rounded-xl md:rounded-[1.5rem] border border-slate-50 hover:bg-white hover:border-slate-200 transition-all group">
                <div className="flex flex-col">
                  <span className="font-black text-slate-900 text-xs md:text-sm leading-none mb-1">{u.nombre}</span>
                  <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{u.correo}</span>
                </div>
                <button onClick={() => deleteUser(u.id)} className="w-8 h-8 md:w-10 md:h-10 bg-white border border-transparent rounded-lg md:rounded-xl flex items-center justify-center text-slate-200 hover:border-red-100 hover:text-red-500 transition-all md:opacity-0 md:group-hover:opacity-100">
                  <Trash2 className="w-3.5 md:w-4 h-3.5 md:h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </motion.div>
  );
}
