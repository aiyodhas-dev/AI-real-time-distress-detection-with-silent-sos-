import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  AlertTriangle, 
  Settings as SettingsIcon, 
  Activity, 
  MapPin, 
  Bell, 
  Phone, 
  CheckCircle2, 
  XCircle,
  Camera,
  Mic,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeDistress, generateSOSVoice } from './services/aiService';
import { Settings, DistressLog, DistressResult } from './types';

export default function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rateLimitError, setRateLimitError] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logs, setLogs] = useState<DistressLog[]>([]);
  const [currentDistress, setCurrentDistress] = useState<DistressResult | null>(null);
  const [alertStage, setAlertStage] = useState(0); // 0: None, 1: Guardian Alert 1, 2: Alert 2, 3: Alert 3, 4: SOS Escalated
  const [location, setLocation] = useState<string>("Locating...");
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const alertTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchLogs();
    updateLocation();
  }, []);

  const fetchSettings = async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    setSettings(data);
  };

  const fetchLogs = async () => {
    const res = await fetch('/api/logs');
    const data = await res.json();
    setLogs(data);
  };

  const updateLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        },
        () => setLocation("Location Access Denied")
      );
    }
  };

  const startMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsMonitoring(true);
      }
    } catch (err) {
      console.error("Error accessing media devices:", err);
      alert("Please allow camera and microphone access.");
    }
  };

  const stopMonitoring = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    setIsMonitoring(false);
    setCurrentDistress(null);
  };

  // Analysis Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isMonitoring) {
      interval = setInterval(async () => {
        if (isAnalyzing) return; // Skip if already analyzing
        if (Date.now() < cooldownUntil) return; // Respect cooldown

        if (videoRef.current && canvasRef.current) {
          const context = canvasRef.current.getContext('2d');
          if (context) {
            setIsAnalyzing(true);
            try {
              context.drawImage(videoRef.current, 0, 0, 640, 480);
              const imageData = canvasRef.current.toDataURL('image/jpeg');
              const result = await analyzeDistress(imageData);
              
              setRateLimitError(false);
              setCooldownUntil(0);
              if (result && result.distressDetected && result.confidence > 0.7) {
                handleDistressDetected(result);
              }
            } catch (err: any) {
              if (err.message === "RATE_LIMIT_EXCEEDED") {
                setRateLimitError(true);
                // Set a 60-second cooldown if rate limit is hit
                setCooldownUntil(Date.now() + 60000);
              } else {
                console.error("Analysis loop error:", err);
              }
            } finally {
              setIsAnalyzing(false);
            }
          }
        }
      }, 20000); // Increased to 20 seconds
    }
    return () => clearInterval(interval);
  }, [isMonitoring, isAnalyzing, cooldownUntil]);

  const handleDistressDetected = async (result: DistressResult) => {
    setCurrentDistress(result);
    if (alertStage === 0) {
      startAlertProtocol(result);
    }
  };

  const startAlertProtocol = async (result: DistressResult) => {
    setAlertStage(1);
    
    // Log the event
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: result.type,
        severity: result.severity,
        summary: result.summary,
        location: location
      })
    });
    const { id } = await res.json();

    // Start escalation timer
    const interval = (settings?.alert_interval || 30) * 1000;
    
    alertTimerRef.current = setTimeout(() => {
      setAlertStage(2);
      alertTimerRef.current = setTimeout(() => {
        setAlertStage(3);
        alertTimerRef.current = setTimeout(() => {
          escalateToSOS(id, result);
        }, interval);
      }, interval);
    }, interval);
  };

  const escalateToSOS = async (logId: number, result: DistressResult) => {
    setAlertStage(4);
    await fetch(`/api/logs/${logId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'escalated' })
    });
    
    // Generate and play AI SOS Voice
    const voiceData = await generateSOSVoice(result, location, settings?.user_name || "User");
    if (voiceData) {
      const audio = new Audio(`data:audio/wav;base64,${voiceData}`);
      audio.play();
    }
    
    fetchLogs();
  };

  const cancelAlert = () => {
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    setAlertStage(0);
    setCurrentDistress(null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="p-6 flex justify-between items-center glass sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Silent SOS</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-emerald-500 status-pulse' : 'bg-zinc-600'}`} />
              {isMonitoring ? 'System Active' : 'System Standby'}
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setShowLogs(!showLogs)}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <History className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monitoring View */}
        <div className="lg:col-span-2 space-y-6">
          <div className="relative aspect-video glass rounded-3xl overflow-hidden group">
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" width="640" height="480" />
            
            {!isMonitoring && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                <Camera className="w-12 h-12 text-zinc-600 mb-4" />
                <button 
                  onClick={startMonitoring}
                  className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-semibold transition-all shadow-lg shadow-emerald-500/20"
                >
                  Start Monitoring
                </button>
              </div>
            )}

            {isMonitoring && (
              <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                <div className="px-3 py-1 bg-black/50 backdrop-blur-md rounded-full text-xs font-medium flex items-center gap-2">
                  <Activity className={`w-3 h-3 ${isAnalyzing ? 'text-amber-400 animate-spin' : 'text-emerald-400'}`} />
                  {isAnalyzing ? 'Analyzing...' : 'Live Feed'}
                </div>
                <div className="px-3 py-1 bg-black/50 backdrop-blur-md rounded-full text-xs font-medium flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-blue-400" />
                  {location}
                </div>
                {rateLimitError && (
                  <div className="px-3 py-1 bg-red-500/80 backdrop-blur-md rounded-full text-xs font-bold flex items-center gap-2 text-white">
                    <AlertTriangle className="w-3 h-3" />
                    Quota Exceeded - Cooling down...
                  </div>
                )}
              </div>
            )}

            {currentDistress && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-4 left-4 right-4 p-4 glass rounded-2xl border-red-500/30"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-red-400 capitalize">{currentDistress.type} Distress Detected</h3>
                    <p className="text-sm text-zinc-300">{currentDistress.summary}</p>
                    <div className="mt-2 flex gap-2">
                      <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[10px] uppercase font-bold tracking-wider rounded border border-red-500/20">
                        Severity: {currentDistress.severity}
                      </span>
                      <span className="px-2 py-0.5 bg-zinc-500/10 text-zinc-400 text-[10px] uppercase font-bold tracking-wider rounded border border-zinc-500/20">
                        Confidence: {(currentDistress.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Alert Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass p-6 rounded-3xl">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Alert Protocol
              </h3>
              
              <div className="space-y-4">
                {[1, 2, 3].map((stage) => (
                  <div key={stage} className={`flex items-center gap-4 p-3 rounded-2xl border transition-all ${
                    alertStage >= stage ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-transparent opacity-50'
                  }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      alertStage >= stage ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {stage}
                    </div>
                    <div>
                      <p className="text-sm font-medium">Guardian Alert {stage}</p>
                      <p className="text-xs text-zinc-500">
                        {alertStage === stage ? 'Awaiting Response...' : alertStage > stage ? 'No Response' : 'Pending'}
                      </p>
                    </div>
                  </div>
                ))}

                <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                  alertStage === 4 ? 'bg-red-500/20 border-red-500/50 animate-pulse' : 'bg-white/5 border-transparent opacity-50'
                }`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    alertStage === 4 ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Silent SOS Escalated</p>
                    <p className="text-xs text-zinc-400">Emergency Services Notified via AI Agent</p>
                  </div>
                </div>
              </div>

              {alertStage > 0 && alertStage < 4 && (
                <div className="mt-6 flex gap-3">
                  <button 
                    onClick={cancelAlert}
                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-semibold transition-colors"
                  >
                    I am Safe
                  </button>
                  <button 
                    onClick={() => escalateToSOS(logs[0]?.id, currentDistress!)}
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl text-sm font-semibold transition-colors"
                  >
                    Escalate Now
                  </button>
                </div>
              )}
            </div>

            <div className="glass p-6 rounded-3xl">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Emergency Contacts
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-2xl">
                  <p className="text-xs text-zinc-500 mb-1">Primary Guardian</p>
                  <p className="font-semibold">{settings?.guardian_name}</p>
                  <p className="text-sm text-zinc-400">{settings?.guardian_contact}</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl">
                  <p className="text-xs text-zinc-500 mb-1">Emergency Service</p>
                  <p className="font-semibold">SOS Dispatch</p>
                  <p className="text-sm text-zinc-400">{settings?.emergency_contact}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar / Logs */}
        <div className="space-y-6">
          <div className="glass p-6 rounded-3xl h-full">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <History className="w-4 h-4" />
              Recent Activity
            </h3>
            <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
              {logs.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No recent alerts</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        log.status === 'escalated' ? 'bg-red-500/20 text-red-400' : 
                        log.status === 'verified' ? 'bg-emerald-500/20 text-emerald-400' : 
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {log.status}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm font-semibold capitalize">{log.type} Distress</p>
                    <p className="text-xs text-zinc-400 line-clamp-2 mt-1">{log.summary}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md glass p-8 rounded-[40px] shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-6">System Settings</h2>
              <form className="space-y-4" onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const data = Object.fromEntries(formData.entries());
                await fetch('/api/settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data)
                });
                fetchSettings();
                setShowSettings(false);
              }}>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Your Name</label>
                  <input name="user_name" defaultValue={settings?.user_name} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Guardian Name</label>
                  <input name="guardian_name" defaultValue={settings?.guardian_name} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Guardian Contact (Email/Phone)</label>
                  <input name="guardian_contact" defaultValue={settings?.guardian_contact} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Emergency Service Number</label>
                  <input name="emergency_contact" defaultValue={settings?.emergency_contact} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Alert Interval (seconds)</label>
                  <input name="alert_interval" type="number" defaultValue={settings?.alert_interval} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors" />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setShowSettings(false)} className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-bold transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 rounded-2xl font-bold transition-colors">Save Changes</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer / Emergency Trigger */}
      <footer className="p-6 glass border-t-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Voice Analysis Active
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Facial Recognition Active
            </div>
          </div>
          
          <button 
            onClick={() => handleDistressDetected({
              distressDetected: true,
              type: 'panic',
              severity: 'critical',
              summary: 'Manual Emergency Trigger Activated by User',
              confidence: 1.0
            })}
            className="w-full md:w-auto px-12 py-4 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold shadow-xl shadow-red-500/20 flex items-center justify-center gap-3 transition-all active:scale-95"
          >
            <AlertTriangle className="w-5 h-5" />
            MANUAL SOS TRIGGER
          </button>
        </div>
      </footer>
    </div>
  );
}
