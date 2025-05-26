const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration from environment variables
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vibration_monitoring';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.static('public'));

// MongoDB connection with improved error handling
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
  minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 5,
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// Enhanced MongoDB schemas
const TestSessionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  isActive: { type: Boolean, default: true },
  deviceId: { type: String, default: 'ESP8266_DEFAULT' },
  samplingRate: { type: Number, default: 5 }, // Hz
  threshold: { type: Number, default: 0.3 }, // g-force
  createdAt: { type: Date, default: Date.now }
});

// Add indexes for better performance
TestSessionSchema.index({ createdAt: -1 });
TestSessionSchema.index({ isActive: 1 });

const VibrationDataSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSession', required: true, index: true },
  timestamp: { type: String, required: true },
  deltaX: { type: Number, required: true },
  deltaY: { type: Number, required: true },
  deltaZ: { type: Number, required: true },
  magnitude: { type: Number }, // Calculated vibration magnitude
  receivedAt: { type: Date, default: Date.now },
  processed: { type: Boolean, default: false }
});

// Add compound indexes for efficient querying
VibrationDataSchema.index({ sessionId: 1, receivedAt: 1 });
VibrationDataSchema.index({ receivedAt: -1 });
  deltaZ: { type: Number, required: true },
  receivedAt: { type: Date, default: Date.now }
});

const TestSession = mongoose.model('TestSession', TestSessionSchema);
const VibrationData = mongoose.model('VibrationData', VibrationDataSchema);

let currentSession = null;
let webClients = new Set();

// WebSocket handling
wss.on('connection', (ws, req) => {
  const clientType = req.url.includes('client') ? 'web' : 'esp8266';
  
  if (clientType === 'web') {
    webClients.add(ws);
    console.log('Web client connected');
    
    ws.on('close', () => {
      webClients.delete(ws);
      console.log('Web client disconnected');
    });
    
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        
        if (data.type === 'start_test') {
          currentSession = new TestSession({ name: data.sessionName });
          await currentSession.save();
          
          // Broadcast to all web clients
          const response = JSON.stringify({
            type: 'test_started',
            sessionId: currentSession._id,
            sessionName: currentSession.name
          });
          webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(response);
            }
          });
        }
        
        if (data.type === 'stop_test') {
          if (currentSession) {
            currentSession.endTime = new Date();
            currentSession.isActive = false;
            await currentSession.save();
            
            // Broadcast to all web clients
            const response = JSON.stringify({
              type: 'test_stopped',
              sessionId: currentSession._id
            });
            webClients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(response);
              }
            });
            
            currentSession = null;
          }
        }
        
        if (data.type === 'get_sessions') {
          const sessions = await TestSession.find().sort({ createdAt: -1 });
          ws.send(JSON.stringify({
            type: 'sessions_list',
            sessions: sessions
          }));
        }
        
        if (data.type === 'get_session_data') {
          const sessionData = await VibrationData.find({ sessionId: data.sessionId }).sort({ receivedAt: 1 });
          ws.send(JSON.stringify({
            type: 'session_data',
            sessionId: data.sessionId,
            data: sessionData
          }));
        }
        
      } catch (error) {
        console.error('Error processing web client message:', error);
      }
    });
  } else {
    // ESP8266 connection
    console.log('ESP8266 connected');
    
    ws.on('message', async (message) => {
      try {
        if (currentSession && currentSession.isActive) {
          const vibrationData = JSON.parse(message);
          
          const newData = new VibrationData({
            sessionId: currentSession._id,
            timestamp: vibrationData.timestamp,
            deltaX: vibrationData.deltaX,
            deltaY: vibrationData.deltaY,
            deltaZ: vibrationData.deltaZ
          });
          
          await newData.save();
          
          // Broadcast to all web clients
          const response = JSON.stringify({
            type: 'vibration_data',
            sessionId: currentSession._id,
            data: vibrationData,
            receivedAt: newData.receivedAt
          });
          
          webClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(response);
            }
          });
          
          console.log('Vibration data saved:', vibrationData);
        }
      } catch (error) {
        console.error('Error processing ESP8266 data:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('ESP8266 disconnected');
    });
  }
});

// REST API endpoints
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await TestSession.find().sort({ createdAt: -1 });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:id/data', async (req, res) => {
  try {
    const sessionData = await VibrationData.find({ sessionId: req.params.id }).sort({ receivedAt: 1 });
    res.json(sessionData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('WebSocket server ready for ESP8266 and web client connections');
});

mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});