export const PIPELINE_STATUSES = [
  { key: 'lead_nuevo', label: 'Lead Nuevo', color: 'bg-blue-100 text-blue-800', dotColor: 'bg-blue-500', icon: '🆕' },
  { key: 'contactado', label: 'Contactado', color: 'bg-yellow-100 text-yellow-800', dotColor: 'bg-yellow-500', icon: '📞' },
  { key: 'interesado', label: 'Interesado', color: 'bg-purple-100 text-purple-800', dotColor: 'bg-purple-500', icon: '💜' },
  { key: 'documentacion', label: 'Documentación', color: 'bg-orange-100 text-orange-800', dotColor: 'bg-orange-500', icon: '📄' },
  { key: 'solicitud_enviada', label: 'Solicitud Enviada', color: 'bg-cyan-100 text-cyan-800', dotColor: 'bg-cyan-500', icon: '📤' },
  { key: 'portabilidad_exitosa', label: 'Venta Exitosa', color: 'bg-green-100 text-green-800', dotColor: 'bg-green-500', icon: '✅' },
  { key: 'rechazado_perdido', label: 'Rechazado/Perdido', color: 'bg-red-100 text-red-800', dotColor: 'bg-red-500', icon: '❌' }
];

export const ACTIVITY_TYPES = [
  { key: 'llamada_saliente', label: 'Llamada Saliente', icon: '📱' },
  { key: 'llamada_entrante', label: 'Llamada Entrante', icon: '📲' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'visita', label: 'Visita', icon: '🏠' },
  { key: 'email', label: 'Email', icon: '📧' }
];

export const ACTIVITY_RESULTS = [
  { key: 'contacto_efectivo', label: 'Contacto Efectivo' },
  { key: 'no_contesta', label: 'No Contesta' },
  { key: 'buzon', label: 'Buzón' },
  { key: 'numero_equivocado', label: 'Número Equivocado' },
  { key: 'agendo_callback', label: 'Agendó Callback' },
  { key: 'cerro_venta', label: 'Cerró Venta' }
];

export function getStatusInfo(status) {
  return PIPELINE_STATUSES.find(s => s.key === status) || PIPELINE_STATUSES[0];
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
