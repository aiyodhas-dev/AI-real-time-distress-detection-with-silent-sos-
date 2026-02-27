# AI Real-Time Distress Detection & Silent SOS System — Implementation Design

## 1) Full System Architecture (Text Diagram)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                          STREAMLIT FRONTEND (Python)                        │
│  - Live camera preview (OpenCV frames)                                      │
│  - Distress meter + real-time charts                                        │
│  - Panic / Health triggers                                                   │
│  - Admin analytics + logs                                                    │
│  - HTML/CSS cards + responsive layout                                        │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ HTTPS REST + WebSocket (token auth)
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                             FASTAPI BACKEND (Python)                        │
│                                                                              │
│  API Layer (REST):                                                           │
│   /register_user /start_monitoring /update_emotion /trigger_alert           │
│   /escalate_sos /call_emergency /get_logs                                    │
│                                                                              │
│  Real-Time Layer (WebSocket):                                                │
│   /ws/monitor/{user_id}  (emotion/stress stream + alert state broadcast)    │
│                                                                              │
│  Decision Engine:                                                            │
│   - emotion score                                                            │
│   - voice stress score                                                       │
│   - health trigger                                                           │
│   - panic button                                                             │
│   - TensorFlow/Keras classifier + risk formula                              │
│                                                                              │
│  Escalation Orchestrator:                                                    │
│   Alert-1 (Telegram) -> Alert-2 -> Alert-3 -> SOS escalation                │
│                                                                              │
│  Integrations:                                                               │
│   Telegram Bot API | Twilio SMS | Twilio Voice | Geolocation API            │
│                                                                              │
│  Persistence:                                                                │
│   SQLite (users, contacts, distress logs, alert logs, call logs)            │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                               EXTERNAL SERVICES                              │
│  Telegram Bot API     Twilio SMS      Twilio Voice       Geolocation API    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2) Folder Structure

```text
distress_sos_system/
├── app/
│   ├── main.py                          # FastAPI app bootstrap
│   ├── config.py                        # env + secrets + constants
│   ├── auth/
│   │   ├── token_auth.py                # token validation, role extraction
│   │   └── rbac.py                      # admin/user permission checks
│   ├── api/
│   │   ├── deps.py                      # common dependencies (db, auth)
│   │   ├── routes_users.py              # /register_user
│   │   ├── routes_monitoring.py         # /start_monitoring, /update_emotion
│   │   ├── routes_alerts.py             # /trigger_alert, /escalate_sos
│   │   ├── routes_calls.py              # /call_emergency
│   │   └── routes_logs.py               # /get_logs
│   ├── ws/
│   │   ├── manager.py                   # websocket session manager
│   │   └── monitor_ws.py                # /ws/monitor/{user_id}
│   ├── ai/
│   │   ├── emotion_pipeline.py          # OpenCV + FER inference
│   │   ├── voice_pipeline.py            # mic stream + librosa features
│   │   ├── distress_model.py            # TensorFlow/Keras classifier
│   │   ├── risk_engine.py               # weighted risk scoring logic
│   │   └── false_alarm_filter.py        # temporal smoothing + confidence gate
│   ├── services/
│   │   ├── telegram_service.py          # Telegram Bot API
│   │   ├── twilio_sms_service.py        # Twilio SMS sending
│   │   ├── twilio_voice_service.py      # Twilio voice call + TTS payload
│   │   ├── geolocation_service.py       # location resolver
│   │   └── escalation_service.py        # stage-driven escalation flow
│   ├── db/
│   │   ├── sqlite.py                    # sqlite connection, pragma setup
│   │   ├── schema.sql                   # DDL
│   │   ├── repositories.py              # CRUD and query methods
│   │   └── crypto.py                    # AES encryption/decryption for logs
│   └── models/
│       ├── request_models.py            # pydantic request schemas
│       └── response_models.py           # pydantic response schemas
├── streamlit_ui/
│   ├── dashboard.py                     # main monitoring dashboard
│   ├── admin_view.py                    # analytics + manual override
│   ├── components/
│   │   ├── cards.py                     # HTML/CSS card components
│   │   ├── charts.py                    # real-time stress/emotion charts
│   │   └── status_widgets.py            # distress meter + alert indicators
│   └── static/
│       └── styles.css                   # custom responsive styles
├── ml/
│   ├── training/
│   │   ├── train_distress_model.py      # training pipeline
│   │   └── feature_builder.py           # feature dataset build logic
│   ├── checkpoints/
│   │   └── distress_model.h5            # Keras model artifact
│   └── metadata/
│       └── label_map.json               # NORMAL/MODERATE/HIGH/CRITICAL mapping
├── tests/
│   ├── test_api.py
│   ├── test_risk_engine.py
│   ├── test_escalation.py
│   └── test_ws_stream.py
├── requirements.txt
├── .env.example
└── README.md
```

---

## 3) Database Schema (SQLite SQL Definitions)

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    telegram_chat_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('USER','ADMIN')) DEFAULT 'USER',
    auth_token_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS EmergencyContacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    contact_name TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    contact_telegram_chat_id TEXT,
    priority INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS DistressLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    emotion_label TEXT,
    emotion_score REAL NOT NULL,
    voice_stress_score REAL NOT NULL,
    health_trigger INTEGER NOT NULL DEFAULT 0,
    panic_trigger INTEGER NOT NULL DEFAULT 0,
    distress_score REAL NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('NORMAL','MODERATE','HIGH','CRITICAL')),
    confidence REAL NOT NULL,
    encrypted_summary BLOB NOT NULL,
    latitude REAL,
    longitude REAL,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS AlertLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    distress_log_id INTEGER NOT NULL,
    alert_stage INTEGER NOT NULL CHECK(alert_stage IN (1,2,3,4)),
    channel TEXT NOT NULL CHECK(channel IN ('TELEGRAM','TWILIO_SMS','TWILIO_VOICE')),
    recipient TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('SENT','DELIVERED','FAILED','ACKNOWLEDGED','TIMEOUT')),
    external_message_id TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (distress_log_id) REFERENCES DistressLogs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS CallLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    distress_log_id INTEGER NOT NULL,
    twilio_call_sid TEXT NOT NULL,
    call_to TEXT NOT NULL,
    call_status TEXT NOT NULL,
    call_started_at DATETIME,
    call_ended_at DATETIME,
    call_duration_seconds INTEGER,
    voice_message_text_encrypted BLOB NOT NULL,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (distress_log_id) REFERENCES DistressLogs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_distress_user_ts ON DistressLogs(user_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_alert_distress ON AlertLogs(distress_log_id, alert_stage);
CREATE INDEX IF NOT EXISTS idx_call_distress ON CallLogs(distress_log_id);
```

---

## 4) Backend API Definitions (FastAPI)

### Authentication
- Header: `Authorization: Bearer <token>`
- Token maps to `Users.auth_token_hash`
- Role extracted for RBAC (`USER`, `ADMIN`)

### `POST /register_user`
**Request**
```json
{
  "full_name": "string",
  "phone": "string",
  "telegram_chat_id": "string",
  "role": "USER",
  "emergency_contacts": [
    {
      "contact_name": "string",
      "contact_phone": "string",
      "contact_telegram_chat_id": "string",
      "priority": 1
    }
  ]
}
```
**Response**
```json
{
  "user_id": 1,
  "api_token": "generated_token",
  "status": "registered"
}
```

### `POST /start_monitoring`
Initializes monitoring session and WS channel.
**Request**
```json
{
  "user_id": 1,
  "session_id": "uuid",
  "device_info": "mobile|desktop|tablet"
}
```
**Response**
```json
{
  "status": "monitoring_started",
  "ws_url": "/ws/monitor/1"
}
```

### `POST /update_emotion`
Pushes latest fused signals from frontend/edge capture service.
**Request**
```json
{
  "user_id": 1,
  "emotion_label": "fear",
  "emotion_score": 0.79,
  "voice_stress_score": 0.64,
  "health_trigger": false,
  "panic_trigger": false,
  "timestamp": "2026-01-19T10:20:30Z"
}
```
**Response**
```json
{
  "distress_score": 0.72,
  "severity": "HIGH",
  "alert_required": true,
  "alert_stage": 1
}
```

### `POST /trigger_alert`
Manual/automatic trigger of stage-based alert workflow.
**Request**
```json
{
  "user_id": 1,
  "distress_log_id": 221,
  "stage": 1,
  "message": "High distress detected"
}
```
**Response**
```json
{
  "status": "alert_sent",
  "channel": "TELEGRAM",
  "stage": 1
}
```

### `POST /escalate_sos`
Escalates when no acknowledgement in SLA window.
**Request**
```json
{
  "user_id": 1,
  "distress_log_id": 221,
  "last_stage": 3
}
```
**Response**
```json
{
  "status": "escalated",
  "next_actions": ["SEND_SMS", "SEND_LOCATION", "CALL_EMERGENCY"]
}
```

### `POST /call_emergency`
Triggers Twilio voice call with structured emergency script.
**Request**
```json
{
  "user_id": 1,
  "distress_log_id": 221,
  "call_to": "+15555550000"
}
```
**Response**
```json
{
  "status": "call_placed",
  "twilio_call_sid": "CAxxxxxxxx"
}
```

### `GET /get_logs?user_id=1&type=distress&limit=100`
Returns logs based on role.
- USER: own logs
- ADMIN: all users + filters

---

## 5) AI Model Flow

### 5.1 Emotion Detection Pipeline (OpenCV + FER)
1. Capture frame from webcam at 12–15 FPS using OpenCV.
2. Face detection + alignment.
3. FER model inference -> emotion probabilities.
4. Map distress-sensitive emotions: fear, sadness, anger, surprise.
5. Compute `emotion_score` from weighted emotion probabilities.
6. Apply temporal smoothing over rolling 5-second window.

**Emotion score formula**
```text
emotion_score =
  0.40 * P(fear) +
  0.25 * P(sadness) +
  0.20 * P(anger) +
  0.15 * P(surprise)
```

### 5.2 Voice Stress Extraction (Librosa)
1. Record audio chunks (2.0 s window, 1.0 s stride).
2. Pre-emphasis + normalization.
3. Extract features using Librosa:
   - MFCC (13 coeff mean + std)
   - Spectral centroid
   - Zero crossing rate
   - RMS energy
   - Pitch contour variance
4. Feed features to TensorFlow/Keras stress head (binary/continuous).
5. Output normalized `voice_stress_score` [0,1].

### 5.3 TensorFlow/Keras Distress Classification
**Input feature vector (per decision step):**
- `emotion_score`
- `voice_stress_score`
- `health_trigger`
- `panic_trigger`
- `emotion_trend_10s`
- `voice_trend_10s`

**Model architecture (Keras Sequential):**
- Dense(64, relu)
- Dropout(0.3)
- Dense(32, relu)
- Dense(4, softmax) -> `[NORMAL, MODERATE, HIGH, CRITICAL]`

**Loss:** categorical crossentropy  
**Optimizer:** Adam  
**Export:** `distress_model.h5`

### 5.4 Risk Score Formula
```text
base_score =
  0.38 * emotion_score +
  0.32 * voice_stress_score +
  0.15 * health_trigger +
  0.15 * panic_trigger

trend_bonus = 0.10 * max(emotion_trend_10s, voice_trend_10s)

distress_score = min(1.0, base_score + trend_bonus)
```

### 5.5 Severity Mapping
```text
0.00 - 0.29 -> NORMAL
0.30 - 0.54 -> MODERATE
0.55 - 0.74 -> HIGH
0.75 - 1.00 -> CRITICAL
```

### 5.6 Escalation Rule Logic
- Stage 1: Telegram alert immediately when severity >= HIGH OR panic trigger true.
- Stage 2: If no acknowledgement in 30 sec -> Telegram + second contact.
- Stage 3: If no acknowledgement in 45 sec -> Twilio SMS with summary + location.
- Stage 4 (Escalation): If no acknowledgement in 60 sec OR severity CRITICAL:
  - Fetch Geolocation API coordinates.
  - Send SOS via Telegram and Twilio SMS to all contacts.
  - Place Twilio voice emergency call.
  - Persist incident in DistressLogs/AlertLogs/CallLogs.

### 5.7 False Alarm Reduction Logic
- Confidence gate: ignore model outputs with confidence < 0.60 unless panic/health trigger true.
- Temporal persistence: require HIGH for >= 5 consecutive seconds before Stage 1.
- Multi-signal agreement: if only one signal spikes, down-weight by 20%.
- Cooldown: after acknowledged event, suppress identical alerts for 120 sec.
- Manual cancel: authenticated user can cancel only if severity != CRITICAL.

---

## 6) WebSocket Communication Design

### Endpoint
- `ws://<host>/ws/monitor/{user_id}` (use `wss://` in production)

### Client -> Server Events
```json
{ "event": "emotion_update", "payload": { "emotion_score": 0.78, "label": "fear", "ts": "..." } }
{ "event": "voice_update", "payload": { "voice_stress_score": 0.66, "ts": "..." } }
{ "event": "manual_trigger", "payload": { "type": "panic|health", "value": true, "ts": "..." } }
{ "event": "ack_alert", "payload": { "alert_log_id": 91, "ts": "..." } }
```

### Server -> Client Events
```json
{ "event": "risk_state", "payload": { "distress_score": 0.74, "severity": "HIGH" } }
{ "event": "alert_stage", "payload": { "stage": 2, "status": "SENT" } }
{ "event": "sos_escalated", "payload": { "sms": true, "voice_call": true, "location": {"lat":0,"lng":0} } }
{ "event": "system_log", "payload": { "level": "INFO", "message": "Twilio SMS delivered" } }
```

### Reliability
- Ping/pong heartbeat every 10 seconds.
- Reconnect with exponential backoff (1s, 2s, 4s, max 30s).
- Sequence IDs to avoid duplicate processing.

---

## 7) UI Layout Structure (Streamlit + HTML/CSS)

### Responsive Grid
- Desktop: `Main Panel (8 cols) + Side Panel (4 cols)`
- Tablet: stacked `Main -> Side`
- Mobile: single-column cards with sticky panic/health actions

### Main Panel Components
1. **Live Camera Card**
   - OpenCV frame stream in `st.image`
   - FER label overlay badge
2. **Distress Meter Card**
   - Green (NORMAL), Yellow (MODERATE), Red (HIGH/CRITICAL)
   - Numeric distress score
3. **Real-Time Stress Graph Card**
   - Time-series (emotion_score, voice_stress_score, distress_score)
4. **Alert Stage Card**
   - Stage badges: 1/2/3/4
   - Countdown timer for next escalation
5. **Action Card**
   - Panic button (red)
   - Health trigger button (orange)

### Side Panel Components
1. User Profile Card
2. Emergency Contacts Card
3. Alert History Card
4. System Status/Log Card (WebSocket live feed)

### Admin View
- Distress analytics chart (daily severity distribution)
- Incident table from SQLite (`DistressLogs` join `Users`)
- Call log table (`CallLogs`)
- Manual override controls:
  - Force escalate
  - Mark false alarm
  - Close incident

### HTML/CSS Rules
- Card-based containers with rounded corners and shadow.
- CSS transitions (200ms) for severity color changes.
- Badge classes: `.normal`, `.moderate`, `.high`, `.critical`.
- Sticky emergency action bar on mobile.

---

## 8) Emergency Voice Script Template (Twilio Voice)

```text
This is an automated emergency alert from the AI Real-Time Distress Detection and Silent SOS System.

User Name: {{user_name}}.
Detected Condition: {{detected_condition}}.
Severity Level: {{severity_level}}.
Current Location: Latitude {{latitude}}, Longitude {{longitude}}.

System Summary:
{{system_generated_summary}}.

This alert was escalated after no response to prior notifications.
Please contact the user immediately and initiate emergency assistance.
```

**`system_generated_summary` template fields**
- dominant emotion
- voice stress trend
- trigger source (panic/health/automatic)
- last known timeline (first detection -> escalation)

---

## 9) End-to-End Data Flow

1. User opens Streamlit dashboard and authenticates with token.
2. `/start_monitoring` creates session and WebSocket channel.
3. OpenCV captures frames -> FER emotion inference.
4. Microphone chunks processed via Librosa -> voice stress score.
5. Signals streamed via WebSocket + periodic `/update_emotion` REST fallback.
6. Decision engine computes distress score + severity.
7. If threshold crossed:
   - Stage 1 Telegram alert logged in `AlertLogs`.
   - Await acknowledgement window.
8. If no acknowledgement:
   - Stage 2 and Stage 3 sequential alerts.
9. Escalation stage:
   - Geolocation API called.
   - Telegram + Twilio SMS with location.
   - Twilio voice call initiated using structured script.
   - `DistressLogs`, `AlertLogs`, `CallLogs` updated.
10. Admin dashboard reads SQLite analytics and enables manual override.

---

## 10) Deployment-Ready Structure

### Runtime Services
- `fastapi_service` (REST + WebSocket)
- `streamlit_service` (dashboard)
- single shared SQLite database file with WAL mode

### Environment Variables (`.env`)
```text
APP_ENV=production
API_HOST=0.0.0.0
API_PORT=8000
STREAMLIT_PORT=8501
SQLITE_PATH=./data/distress_sos.db
TOKEN_SIGNING_SECRET=replace_me
LOG_ENCRYPTION_KEY=replace_me_32_bytes
TELEGRAM_BOT_TOKEN=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_SMS_FROM=...
TWILIO_VOICE_FROM=...
GEOLOCATION_API_KEY=...
```

### Security Controls (Mandatory)
- Token-based auth on all REST/WS channels.
- RBAC enforcement (`ADMIN` endpoints restricted).
- TLS termination in deployment (HTTPS/WSS only).
- Encrypt incident summaries and voice scripts before SQLite insert.
- Hash tokens before storage.
- Audit trail in AlertLogs/CallLogs for every external communication.

### Health/Operational Endpoints
- `GET /health/live` (process alive)
- `GET /health/ready` (DB + external integrations check)

### Production Readiness Checklist
- Model artifact versioned (`distress_model.h5` + metadata).
- DB backup job for SQLite file and WAL.
- Log rotation for API and Streamlit logs.
- Alert retry policies for Telegram/Twilio failures.
- Incident replay script for failed escalation runs.

