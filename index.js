import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
// Import models properly - make sure to import them only once
import TestSession from './models/TestSession.js';
import ChatMessage from './models/ChatMessage.js';
import Report from './models/Report.js';
import DeepseekService from './utils/deepseekService.js';

// Import API routes
import aiRoutes from './routes/aiRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Initialize Deepseek AI service
const deepseek = new DeepseekService(process.env.DEEPSEEK_API_KEY);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Add AI routes
app.use('/api', aiRoutes);

// Define public directory path and check if it exists
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
  console.log(`Public directory not found at: ${publicPath}`);
  // Create the directory if it doesn't exist
  fs.mkdirSync(publicPath, { recursive: true });
}

// Add verbose logging for static file serving
app.use(express.static(publicPath));
console.log(`Serving static files from: ${publicPath}`);

// Ensure index.html exists before trying to serve it
app.get('/', (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    console.log(`Serving index.html from: ${indexPath}`);
    res.sendFile(indexPath);
  } else {
    console.log(`index.html not found at: ${indexPath}`);
    res.status(404).send('Welcome to Z-Axis Vibration Monitor API. Web interface is not available.');
  }
});

// Environment validation
if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI environment variable is required');
  process.exit(1);
}

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
  minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 5,
});

// Simplified VibrationData schema - Add FFT data fields
const VibrationDataSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSession', required: true },
  deviceId: { type: String, default: 'unknown' },
  timestamp: { type: Date, default: Date.now },
  deltaZ: { type: Number, required: true },
  frequency: { type: Number, default: 0 },
  amplitude: { type: Number, default: 0 },
  rawAcceleration: { type: Number, default: 0 },
  receivedAt: { type: Date, default: Date.now }
});

const VibrationData = mongoose.model('VibrationData', VibrationDataSchema);

let currentSession = null;
let webClients = new Set();
let espClients = new Map();
let saveTimeout = null;
let dataBuffer = [];

// Enhanced WebSocket handling
wss.on('connection', (ws, req) => {
  console.log(`WebSocket connection received from: ${req.url}`);
  
  // More robust path checking
  const clientType = req.url === '/web' || req.url.startsWith('/web?') ? 'web' : 'esp8266';
  
  console.log(`Client type identified as: ${clientType}`);
  
  if (clientType === 'web') {
    webClients.add(ws);
    console.log('Web client connected');
    
    // Send current session status
    ws.send(JSON.stringify({
      type: 'session_status',
      isActive: currentSession !== null,
      sessionId: currentSession?._id,
      connectedDevices: Array.from(espClients.keys())
    }));
    
    ws.on('close', () => {
      webClients.delete(ws);
      console.log('Web client disconnected');
    });
    
    ws.on('message', async (message) => {  
      try {
        const data = JSON.parse(message);
        console.log(`Web client message: ${data.type}`);
        
        // Add handler for device list request
        if (data.type === 'get_device_list') {
          ws.send(JSON.stringify({
            type: 'device_list',
            devices: Array.from(espClients.keys())
          }));
          
          // Also broadcast device_status for each device to ensure UI is updated
          for (const deviceId of espClients.keys()) {
            ws.send(JSON.stringify({
              type: 'device_status',
              deviceId: deviceId,
              status: 'connected'
            }));
          }
          return;
        }
        
        // Add handler for session deletion
        if (data.type === 'delete_session') {
          try {
            const deletedSession = await TestSession.findByIdAndDelete(data.sessionId);
            
            if (deletedSession) {
              // Also delete related vibration data
              await VibrationData.deleteMany({ sessionId: data.sessionId });
              
              ws.send(JSON.stringify({
                type: 'session_deleted',
                sessionId: data.sessionId,
                success: true
              }));
              
              // Broadcast to all web clients to refresh their session lists
              broadcastToWebClients({
                type: 'session_deleted',
                sessionId: data.sessionId
              });
              
              console.log(`Session ${data.sessionId} deleted successfully`);
            } else {
              ws.send(JSON.stringify({
                type: 'session_deleted',
                sessionId: data.sessionId,
                success: false,
                error: 'Session not found'
              }));
            }
          } catch (error) {
            console.error('Error deleting session:', error);
            ws.send(JSON.stringify({
              type: 'session_deleted',
              sessionId: data.sessionId,
              success: false,
              error: error.message
            }));
          }
          return;
        }
        
        if (data.type === 'start_test') {
          try {
            const sessionName = data.sessionName || `Z-Axis Test ${new Date().toLocaleTimeString()}`;
            const testMass = parseFloat(data.testMass) || 1.0; // Get the mass value with default of 1.0kg
            
            // Create a new session
            currentSession = new TestSession({
              name: sessionName,
              testMass: testMass, // Store the mass value
              startTime: new Date(),
              isActive: true,
              zAxisData: []
            });
            
            await currentSession.save();
            
            broadcastToWebClients({
              type: 'test_started',
              sessionId: currentSession._id,
              sessionName,
              testMass // Include mass in broadcast
            });
            
            ws.send(JSON.stringify({
              type: 'test_started',
              message: `Test "${sessionName}" started`,
              sessionId: currentSession._id
            }));
            
          } catch (error) {
            console.error('Error starting test:', error);
            ws.send(JSON.stringify({
              type: 'error',
              message: `Error starting test: ${error.message}`
            }));
          }
          return;
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
            broadcastToWebClients(JSON.parse(response));
            
            // IMPORTANT FIX: Save session ID before setting currentSession to null
            const completedSessionId = currentSession._id;
            currentSession = null;
            
            // After a short delay, send the frequency data to clients
            setTimeout(async () => {
              try {
                const sessionWithFrequency = await TestSession.findById(completedSessionId);
                if (sessionWithFrequency && sessionWithFrequency.frequencyAnalysisComplete) {
                  broadcastToWebClients({
                    type: 'frequency_data',
                    sessionId: sessionWithFrequency._id,
                    frequency: sessionWithFrequency.naturalFrequency,
                    amplitude: sessionWithFrequency.peakAmplitude,
                    qFactor: sessionWithFrequency.mechanicalProperties?.qFactor,
                    naturalPeriod: sessionWithFrequency.mechanicalProperties?.naturalPeriod,
                    stiffness: sessionWithFrequency.mechanicalProperties?.stiffness,
                    rms: sessionWithFrequency.mechanicalProperties?.rms,
                    crestFactor: sessionWithFrequency.mechanicalProperties?.crestFactor,
                    bandwidth: sessionWithFrequency.mechanicalProperties?.bandwidth,
                    naturalFrequencies: sessionWithFrequency.mechanicalProperties?.naturalFrequencies || []
                  });
                }
              } catch (error) {
                console.error('Error sending frequency data after session completion:', error);
              }
            }, 1500);
            
          }
        }
        
        if (data.type === 'get_sessions') {
          const sessions = await TestSession.find().sort({ createdAt: -1 });
          ws.send(JSON.stringify({
            type: 'sessions_list',
            sessions: sessions
          }));
        }
        
        // Enhanced session data retrieval
        if (data.type === 'get_session_data') {
          try {
            console.log(`Retrieving session data for: ${data.sessionId}`);
            // Get both session and vibration data
            const [session, vibrationData] = await Promise.all([
              TestSession.findById(data.sessionId),
              VibrationData.find({ sessionId: data.sessionId }).sort({ timestamp: 1 })
            ]);
            
            if (!session) {
              console.log(`Session not found: ${data.sessionId}`);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Session not found'
              }));
              return;
            }

            // Transform vibration data to include all necessary fields
            const zAxisData = vibrationData.map(v => ({
              timestamp: v.timestamp,
              deltaZ: v.deltaZ,
              frequency: v.frequency,
              amplitude: v.amplitude,
              rawAcceleration: v.rawAcceleration,
              _id: v._id,
              receivedAt: v.receivedAt
            }));
            
            const responseData = {
              type: 'session_data',
              sessionId: data.sessionId,
              data: zAxisData,
              frequencyData: {
                frequencies: zAxisData.map(d => d.frequency).filter(f => f !== undefined && f !== null),
                amplitudes: zAxisData.map(d => d.amplitude).filter(a => a !== undefined && a !== null),
                rawAccelerations: zAxisData.map(d => d.rawAcceleration).filter(r => r !== undefined && r !== null),
                naturalFrequency: session.naturalFrequency,
                peakAmplitude: session.peakAmplitude,
                qFactor: session.mechanicalProperties?.qFactor,
                bandwidth: session.mechanicalProperties?.bandwidth
              }
            };
            
            ws.send(JSON.stringify(responseData));
          } catch (error) {
            console.error('Error retrieving session data:', error);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Error retrieving session data'
            }));
          }
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
        const data = JSON.parse(message);
        
        if (data.type === 'device_connected') {
          espClients.set(data.deviceId, ws);
          console.log(`ESP8266 device connected: ${data.deviceId}`);
          
          // Notify web clients of device connection
          broadcastToWebClients({
            type: 'device_status',
            deviceId: data.deviceId,
            status: 'connected'
          });
          return;
        }
        
        // Handle FFT result from ESP8266
        if (data.type === 'fft_result') {
           
            
            // Only process and broadcast data if there's an active session
            if (!currentSession || !currentSession.isActive) {
               
                return;
            }

            try {
                // Store FFT data from ESP8266
                const vibrationData = new VibrationData({
                    sessionId: currentSession._id,
                    deviceId: data.deviceId || 'unknown',
                    timestamp: new Date(data.timestamp || Date.now()),
                    deltaZ: data.deltaZ || 0,
                    frequency: data.frequency || 0,
                    amplitude: data.amplitude || 0,
                    rawAcceleration: data.raw_acceleration || 0,
                    receivedAt: new Date()
                });

                await vibrationData.save();

                // Add data to buffer
                dataBuffer.push({
                    timestamp: vibrationData.timestamp,
                    deltaZ: vibrationData.deltaZ,
                    frequency: vibrationData.frequency,
                    amplitude: vibrationData.amplitude,
                    rawAcceleration: vibrationData.rawAcceleration
                });

                // Clear any existing timeout
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                }

                // Set new timeout for batch save
                saveTimeout = setTimeout(async () => {
                    try {
                        if (currentSession && currentSession.isActive && dataBuffer.length > 0) {
                            // Update session with buffered data
                            await TestSession.findByIdAndUpdate(
                                currentSession._id,
                                { 
                                    $push: { 
                                        zAxisData: { 
                                            $each: dataBuffer,
                                            $slice: -100 // Keep only last 100 samples
                                        }
                                    }
                                },
                                { new: true }
                            );
                            // Clear buffer after successful save
                            dataBuffer = [];
                        }
                    } catch (error) {
                        console.error('Error saving buffered data:', error);
                    }
                }, 1000);

                // Format data for broadcast with session status
                const broadcastData = {
                    type: 'vibration_data',
                    sessionId: currentSession._id,
                    deviceId: data.deviceId,
                    timestamp: vibrationData.timestamp.getTime(),
                    deltaZ: vibrationData.deltaZ,
                    frequency: vibrationData.frequency,
                    amplitude: vibrationData.amplitude,
                    rawAcceleration: vibrationData.rawAcceleration,
                    receivedAt: vibrationData.receivedAt.toISOString(),
                    isActive: true
                };

                // Broadcast only if session is still active
                if (currentSession.isActive) {
                    broadcastToWebClients(broadcastData);
                }

            } catch (error) {
                console.error('Error processing vibration data:', error);
            }
        }
      } catch (error) {
        console.error('Error processing ESP8266 data:', error);
      }
    });
    
    ws.on('close', () => {
      // Find and remove device from espClients
      for (const [deviceId, client] of espClients.entries()) {
        if (client === ws) {
          espClients.delete(deviceId);
          console.log(`ESP8266 disconnected: ${deviceId}`);
          
          // Notify web clients
          broadcastToWebClients({
            type: 'device_status',
            deviceId: deviceId,
            status: 'disconnected'
          });
          break;
        }
      }
    });
  }
});

// Helper function to broadcast to web clients
function broadcastToWebClients(data) {
  const message = typeof data === 'string' ? data : JSON.stringify(data);
  
  // Log broadcast attempts for vibration data
  if (data.type === 'vibration_data') {
      console.log(`Broadcasting vibration data for session ${data.sessionId} (Active: ${data.isActive})`);
  }
  
  webClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN is 1
      client.send(message);
    }
  });
}

// Update API endpoints for Z-axis data
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
    const session = await TestSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({
      zAxisData: session.zAxisData,
      resonanceData: {
        naturalFrequency: session.naturalFrequency,
        peakAmplitude: session.peakAmplitude,
        analysisComplete: session.frequencyAnalysisComplete
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/:sessionId', async (req, res) => {
  try {
    const [session, vibrationData] = await Promise.all([
      TestSession.findById(req.params.sessionId),
      VibrationData.find({ sessionId: req.params.sessionId }).sort({ timestamp: 1 })
    ]);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const format = req.query.format || 'json';
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="vibration-data-${session._id}.csv"`);

      // Create CSV header
      let csv = 'Timestamp,Frequency (Hz),Amplitude,Raw Z-Axis (g),Delta Z (g)\n';
      
      // Add each data point
      vibrationData.forEach(point => {
        const timestamp = new Date(point.timestamp).toISOString();
        csv += `${timestamp},${point.frequency || 0},${point.amplitude || 0},${point.rawAcceleration || 0},${point.deltaZ || 0}\n`;
      });
      
      res.send(csv);
    } else {
      res.json({
        sessionInfo: {
          id: session._id,
          name: session.name,
          startTime: session.startTime,
          endTime: session.endTime,
          isActive: session.isActive
        },
        zAxisData: session.zAxisData,
        resonanceData: {
          naturalFrequency: session.naturalFrequency,
          peakAmplitude: session.peakAmplitude
        }
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new API endpoint for session management
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const session = await TestSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add endpoint to retrieve only recent sessions
app.get('/api/sessions/recent/:limit', async (req, res) => {
  try {
    const limit = parseInt(req.params.limit) || 5;
    const sessions = await TestSession.find()
      .sort({ createdAt: -1 })
      .limit(limit);
    
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add endpoint for session deletion via REST API as well
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const deletedSession = await TestSession.findByIdAndDelete(req.params.id);
    
    if (!deletedSession) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Delete related vibration data
    await VibrationData.deleteMany({ sessionId: req.params.id });
    
    res.json({ success: true, message: 'Session deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add endpoint for frequency data
app.get('/api/sessions/:id/frequency', async (req, res) => {
  try {
    const session = await TestSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({
      frequency: session.naturalFrequency,
      amplitude: session.peakAmplitude,
      qFactor: session.mechanicalProperties?.qFactor,
      naturalPeriod: session.mechanicalProperties?.naturalPeriod,
      stiffness: session.mechanicalProperties?.stiffness,
      rms: session.mechanicalProperties?.rms,
      crestFactor: session.mechanicalProperties?.crestFactor,
      bandwidth: session.mechanicalProperties?.bandwidth,
      naturalFrequencies: session.mechanicalProperties?.naturalFrequencies || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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