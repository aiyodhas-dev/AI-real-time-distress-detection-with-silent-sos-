export interface Settings {
  user_name: string;
  guardian_name: string;
  guardian_contact: string;
  emergency_contact: string;
  alert_interval: number;
}

export interface DistressLog {
  id: number;
  timestamp: string;
  type: string;
  severity: string;
  summary: string;
  location: string;
  status: 'pending' | 'verified' | 'escalated' | 'closed';
}

export interface DistressResult {
  distressDetected: boolean;
  type: 'emotional' | 'physical' | 'panic' | 'none';
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  confidence: number;
}
