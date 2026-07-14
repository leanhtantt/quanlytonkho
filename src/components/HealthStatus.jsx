import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { IconDatabase as Database, IconServer as Server } from '@tabler/icons-react';

export default function HealthStatus() {
  const [status, setStatus] = useState({ api: null, db: null });

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const res = await api.checkHealth();
      if (mounted) {
        setStatus({ api: res.api, db: res.db });
      }
    };

    check();
    const interval = setInterval(check, 30000); // Poll every 30 seconds

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (status.api === null) return null; // initial load

  return (
    <div className="health-status-container" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <div 
        className="health-indicator" 
        title={status.api ? "API Server: Connected" : "API Server: Disconnected"}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: status.api ? '#10b981' : '#ef4444' }}
      >
        <Server size={14} />
        <span>API</span>
      </div>
      <div 
        className="health-indicator" 
        title={status.db ? "Database: Connected" : "Database: Disconnected"}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: status.db ? '#10b981' : '#ef4444' }}
      >
        <Database size={14} />
        <span>DB</span>
      </div>
    </div>
  );
}
