import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, FileText, Settings, History, LogOut, 
  ChevronRight, Calendar, User, Tag, CheckCircle2, 
  Trash2, Edit3, Save, X, ArrowLeft, Download, ShieldCheck,
  Menu
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from './lib/supabase';
import type { Evento, Seguimiento, Usuario, Categoria, Estado } from './types';
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
  const [followUps, setFollowUps] = useState<Seguimiento[]>([]); // New global follow-ups state
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('gest_user');
    if (savedUser) setUser(JSON.parse(savedUser));
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setDataLoading(true);
    try {
      const [{ data: evs }, { data: cats }, { data: sts }, { data: segs }] = await Promise.all([
        supabase.from('eventos').select('*').order('fecha_inicio', { ascending: false }),
        supabase.from('categorias').select('*'),
        supabase.from('estado').select('*'),
        supabase.from('seguimiento').select('*').order('fecha', { ascending: false })
      ]);
      setEvents(evs || []);
      setCategories(cats || []);
      setStates(sts || []);
      setFollowUps(segs || []);
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

  const exportPDF = (title: string, data: Evento[]) => {
    const doc = new jsPDF();
    const today = format(new Date(), 'dd/MM/yyyy HH:mm');
    
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(title, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Generado por: ${user?.nombre || 'Sistema'} | ${today}`, 14, 28);
    
    let currentY = 35;

    // Helper for status colors in PDF
    const getStatusColors = (status: string) => {
      const s = status.toUpperCase();
      if (s === 'FINALIZADO') return { fill: [209, 250, 229], text: [6, 78, 59] }; // Green
      if (s === 'EN PROCESO') return { fill: [254, 243, 199], text: [146, 64, 14] }; // Yellow/Amber
      if (s === 'ABANDONADO') return { fill: [254, 226, 226], text: [153, 27, 27] }; // Red
      return { fill: [224, 231, 255], text: [49, 46, 129] }; // Blue/Default
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

    Object.keys(groupedData).sort().forEach(cat => {
      const eventsInCat = groupedData[cat].sort((a, b) => {
        if (!a.latestEstimate && !b.latestEstimate) return 0;
        if (!a.latestEstimate) return 1;
        if (!b.latestEstimate) return -1;
        return new Date(a.latestEstimate).getTime() - new Date(b.latestEstimate).getTime();
      });

      if (currentY > 260) { doc.addPage(); currentY = 20; }
      doc.setFontSize(12);
      doc.setTextColor(79, 70, 229); // indigo-600
      doc.setFont(undefined, 'bold');
      doc.text(`Categoría: ${cat}`, 14, currentY + 5);
      doc.setFont(undefined, 'normal');
      currentY += 10;

      eventsInCat.forEach((ev) => {
        if (currentY > 240) { doc.addPage(); currentY = 20; }
        
        // Event Title & Description
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(ev.titulo.toUpperCase(), 14, currentY + 5);
        currentY += 8;

        if (ev.descripcion) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(100, 116, 139);
          const splitDesc = doc.splitTextToSize(ev.descripcion, 180);
          doc.text(splitDesc, 14, currentY);
          currentY += (splitDesc.length * 4) + 4;
        }
        doc.setTextColor(15, 23, 42);

        // Define and sort follow-ups for this event
        const evSegs = followUps
          .filter(s => s.id_eventos === ev.id)
          .sort((a, b) => {
            if (!a.fecha_finalizacion && !b.fecha_finalizacion) return 0;
            if (!a.fecha_finalizacion) return 1;
            if (!b.fecha_finalizacion) return -1;
            return new Date(a.fecha_finalizacion).getTime() - new Date(b.fecha_finalizacion).getTime();
          });

        // Event Main Info Table
        const estFin = ev.fecha_cierre ? format(new Date(ev.fecha_cierre), 'dd/MM/yyyy') : 'Sin definir';
        autoTable(doc, {
          startY: currentY,
          head: [['Estado', 'Categoría', 'Supervisor', 'Inicio', 'Fin Est.']],
          body: [[
            ev.estado,
            ev.categoria,
            ev.supervisor,
            format(new Date(ev.fecha_inicio), 'dd/MM/yyyy'),
            estFin
          ]],
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229] },
          styles: { fontSize: 8, cellPadding: 2 },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 0) {
              const colors = getStatusColors(data.cell.raw as string);
              data.cell.styles.fillColor = colors.fill as any;
              data.cell.styles.textColor = colors.text as any;
              data.cell.styles.fontStyle = 'bold';
            }
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 1;

        if (evSegs.length > 0) {
          autoTable(doc, {
            startY: currentY,
            head: [['Fecha Reporte', 'Fin Est.', 'Responsable', 'Detalle del Avance', 'Estado']],
            body: evSegs.map(s => [
              format(new Date(s.fecha), 'dd/MM/yyyy'),
              s.fecha_finalizacion ? format(new Date(s.fecha_finalizacion), 'dd/MM/yyyy') : 'S/E',
              s.responsable,
              s.descripcion_avance,
              s.estado
            ]),
            theme: 'grid',
            headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105] },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: { 3: { cellWidth: 80 } },
            didParseCell: (data) => {
              if (data.section === 'body' && data.column.index === 4) {
                const colors = getStatusColors(data.cell.raw as string);
                data.cell.styles.fillColor = colors.fill as any;
                data.cell.styles.textColor = colors.text as any;
                data.cell.styles.fontStyle = 'bold';
              }
            }
          });
          currentY = (doc as any).lastAutoTable.finalY + 8;
        } else {
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text("Sin registros de seguimiento.", 18, currentY + 4);
          currentY += 10;
        }
      });
      currentY += 5;
    });
    
    doc.save(`${title.toLowerCase().replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
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
      // Delete associated follow-ups first due to potential foreign key constraints
      await supabase.from('seguimiento').delete().eq('id_eventos', id);
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
              <Button onClick={() => exportPDF(view === 'dashboard' ? 'Eventos Activos' : 'Eventos Finalizados', filteredEvents)} variant="secondary" className="flex-1 md:flex-none text-xs md:text-sm">
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
              />
            ) : view === 'config' ? (
              <ConfigView key="config" categories={categories} fetchInitialData={fetchInitialData} />
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
                                   <div className="flex h-2 w-2 relative" title="Urgente">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"></span>
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
                                     <div className="flex h-2 w-2 relative" title="Este registro tiene seguimientos con menos de 3 días para su finalización estimada">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"></span>
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

function EventDetail({ id, onBack, categories, states }: any) {
  const [event, setEvent] = useState<Evento | null>(null);
  const [followUps, setFollowUps] = useState<Seguimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingFollowUp, setIsAddingFollowUp] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState<Seguimiento | null>(null);

  const fetchDetail = async () => {
    setLoading(true);
    const { data: ev } = await supabase.from('eventos').select('*').eq('id', id).single();
    const { data: segs } = await supabase.from('seguimiento').select('*').eq('id_eventos', id).order('fecha', { ascending: false });
    if (ev) setEvent(ev);
    setFollowUps(segs || []);
    setLoading(false);
  };

  useEffect(() => { fetchDetail(); }, [id]);

  const removeFollowUp = async (sid: string) => {
    if (!confirm("Confirmas la eliminación definitiva de este registro?")) return;
    await supabase.from('seguimiento').delete().eq('id', sid);
    fetchDetail();
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
            <h3 className="text-xl md:text-2xl font-black text-slate-900 leading-tight">Bitácora de Seguimiento</h3>
            <Button onClick={() => setIsAddingFollowUp(true)} className="shrink-0 text-xs md:text-sm px-3 md:px-4">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuevo Avance</span><span className="sm:hidden">Nuevo</span>
            </Button>
          </div>

          <div className="space-y-6">
            {followUps.map((s, idx) => (
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
                        title="Editar"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => removeFollowUp(s.id)} 
                        className="w-7 h-7 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                
                <p className="text-slate-600 text-sm font-medium leading-relaxed mb-4">
                  {s.descripcion_avance}
                </p>

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
            ))}
            {followUps.length === 0 && (
              <div className="py-24 bg-white rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                <CheckCircle2 className="w-12 h-12 mb-4 opacity-10" />
                <p className="font-bold uppercase tracking-widest text-[10px]">Sin reportes registrados</p>
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
            onClose={() => { setIsAddingFollowUp(false); setEditingFollowUp(null); }} 
            onSuccess={() => { setIsAddingFollowUp(false); setEditingFollowUp(null); fetchDetail(); fetchInitialData(); }} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FollowUpModal({ eventId, states, onClose, onSuccess, followUp }: any) {
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.target);
    const payload = {
      id_eventos: eventId,
      responsable: fd.get('responsable'),
      fecha: fd.get('fecha'),
      descripcion_avance: fd.get('descripcion'),
      fecha_finalizacion: fd.get('fecha_finalizacion') || null,
      recursos: fd.get('recursos'),
      estado: fd.get('estado'),
      observaciones: fd.get('observaciones')
    };
    
    let error;
    if (followUp) {
      const { error: err } = await supabase.from('seguimiento').update(payload).eq('id', followUp.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('seguimiento').insert({ ...payload, id: crypto.randomUUID() });
      error = err;
    }
    
    if (error) alert(error.message); else onSuccess();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden overflow-y-auto max-h-[90vh]">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-xl tracking-tight text-slate-900">
            {followUp ? 'Editar Avance' : 'Nuevo Avance'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 hover:bg-white rounded-lg flex items-center justify-center text-slate-400 transition-colors cursor-pointer"><X /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input name="fecha" label="Fecha Reporte" type="date" required defaultValue={followUp?.fecha || format(new Date(), 'yyyy-MM-dd')} />
            <Input name="fecha_finalizacion" label="Fin Est." type="date" defaultValue={followUp?.fecha_finalizacion || ''} />
          </div>
          <Input name="responsable" label="Responsable del Avance" placeholder="Nombre completo" required icon={User} defaultValue={followUp?.responsable || ''} />
          <Select name="estado" label="Estado Actual" options={states} required defaultValue={followUp?.estado || ''} />
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Resumen de Actividades</label>
            <textarea name="descripcion" rows={4} className="w-full bg-slate-50 border border-slate-200 rounded-md p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800" required placeholder="Describe qué se avanzó en este periodo..." defaultValue={followUp?.descripcion_avance || ''} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input name="recursos" label="Recursos" placeholder="Ej. Licencias, API" defaultValue={followUp?.recursos || ''} />
            <Input name="observaciones" label="Observaciones" defaultValue={followUp?.observaciones || ''} />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={onClose} className="px-6 text-xs md:text-sm">Cancelar</Button>
            <Button type="submit" disabled={loading} className="px-8 text-xs md:text-sm">{loading ? 'Procesando...' : (followUp ? 'Actualizar' : 'Registrar')}</Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ConfigView({ categories, fetchInitialData }: any) {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    supabase.from('usuarios').select('*').then(({ data }) => setUsers(data || []));
  }, []);

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
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10 lg:max-w-6xl mx-auto">
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
