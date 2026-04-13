export const PIPELINE_STATUSES = [
  { key: 'lead_nuevo', label: 'Lead Nuevo', color: 'bg-blue-100 text-blue-800', dotColor: 'bg-blue-500' },
  { key: 'contactado', label: 'Contactado', color: 'bg-yellow-100 text-yellow-800', dotColor: 'bg-yellow-500' },
  { key: 'interesado', label: 'Interesado', color: 'bg-purple-100 text-purple-800', dotColor: 'bg-purple-500' },
  { key: 'documentacion', label: 'Documentación', color: 'bg-orange-100 text-orange-800', dotColor: 'bg-orange-500' },
  { key: 'solicitud_enviada', label: 'Solicitud Enviada', color: 'bg-cyan-100 text-cyan-800', dotColor: 'bg-cyan-500' },
  { key: 'portabilidad_exitosa', label: 'Portabilidad Exitosa', color: 'bg-green-100 text-green-800', dotColor: 'bg-green-500' },
  { key: 'rechazado_perdido', label: 'Rechazado/Perdido', color: 'bg-red-100 text-red-800', dotColor: 'bg-red-500' }
];

export const ACTIVITY_TYPES = [
  { key: 'llamada_saliente', label: 'Llamada Saliente' },
  { key: 'llamada_entrante', label: 'Llamada Entrante' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'visita', label: 'Visita' },
  { key: 'email', label: 'Email' }
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
