import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { PIPELINE_STATUSES, getStatusInfo } from '../utils/constants';

export default function Pipeline() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState({});

  useEffect(() => { loadLeads(); }, []);

  const loadLeads = async () => {
    try {
      const data = await api.get('/leads?limit=500');
      setLeads(data.leads || data || []);
      // Open sections that have leads
      const open = {};
      PIPELINE_STATUSES.forEach(s => { open[s.key] = true; });
      setOpenSections(open);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const toggle = (key) => setOpenSections(o => ({ ...o, [key]: !o[key] }));

  const grouped = PIPELINE_STATUSES.map(s => ({
    ...s,
    leads: leads.filter(l => l.pipeline_status === s.key)
  }));

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;

  return (
    <div className="p-4 space-y-2">
      <h1 className="text-lg font-bold text-gray-900 mb-3">Pipeline de Ventas</h1>

      {grouped.map(group => (
        <div key={group.key} className="card p-0 overflow-hidden">
          {/* Section header */}
          <button onClick={() => toggle(group.key)}
            className="w-full flex items-center justify-between p-3 active:bg-gray-50">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${group.dotColor}`} />
              <span className="font-medium text-sm">{group.icon} {group.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                {group.leads.length}
              </span>
              <span className="text-gray-400 text-xs">{openSections[group.key] ? '▲' : '▼'}</span>
            </div>
          </button>

          {/* Section content */}
          {openSections[group.key] && group.leads.length > 0 && (
            <div className="border-t divide-y">
              {group.leads.map(lead => (
                <button key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 active:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{lead.full_name}</p>
                    <p className="text-xs text-gray-500">{lead.phone_primary} · {lead.operator_name || ''}</p>
                  </div>
                  {lead.claro_plan_name && (
                    <span className="text-[10px] text-claro-red flex-shrink-0">{lead.claro_plan_name}</span>
                  )}
                  <span className="text-gray-300">›</span>
                </button>
              ))}
            </div>
          )}

          {openSections[group.key] && group.leads.length === 0 && (
            <p className="text-xs text-gray-300 text-center py-3 border-t">Sin leads</p>
          )}
        </div>
      ))}
    </div>
  );
}
