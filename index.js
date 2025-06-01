import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

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

// Updated MongoDB schemas - Z-axis only vibration data
const TestSessionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  zAxisData: [{
    timestamp: String,
    deltaZ: Number,
    rawZ: Number,
    receivedAt: { type: Date, default: Date.now }
  }],
  // Resonance analysis fields
  resonanceFrequencies: [Number], // Hz
  dampingRatios: [Number],
  naturalFrequency: Number,       // Hz
  peakAmplitude: Number,
  resonanceAnalysisComplete: { type: Boolean, default: false },
  // New mechanical properties
  mechanicalProperties: {
    naturalPeriod: Number,        // seconds
    stiffness: Number,            // N/m
    dampingCoefficient: Number,   // Ns/m
    qFactor: Number,              // Quality factor
    rms: Number,                  // Root Mean Square
    crestFactor: Number,          // Crest Factor
    bandwidth: Number,            // Hz
    resonanceMagnification: Number // Magnification factor at resonance
  }
});

const TestSession = mongoose.model('TestSession', TestSessionSchema);

// Simplified VibrationData schema - Z-axis only
const VibrationDataSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSession', required: true },
  deviceId: { type: String, default: 'unknown' },
  timestamp: { type: Date, default: Date.now },
  deltaZ: { type: Number, required: true },
  rawZ: { type: Number, required: true },
  magnitude: { type: Number, default: 0 }, // Same as deltaZ for single axis
  receivedAt: { type: Date, default: Date.now }
});

const VibrationData = mongoose.model('VibrationData', VibrationDataSchema);

let currentSession = null;
let webClients = new Set();
let espClients = new Map();

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
          currentSession = new TestSession({ 
            name: data.sessionName,
            zAxisData: []  // Initialize empty array
          });
          await currentSession.save();
          
          // Broadcast to all web clients
          const response = JSON.stringify({
            type: 'test_started',
            sessionId: currentSession._id,
            sessionName: currentSession.name
          });
          broadcastToWebClients(JSON.parse(response));
        }
        
        if (data.type === 'stop_test') {
          if (currentSession) {
            currentSession.endTime = new Date();
            currentSession.isActive = false;
            
            await currentSession.save();
            
            // Calculate resonance after saving session data
            console.log(`Calculating resonance for session ${currentSession._id}`);
            await calculateResonance(currentSession._id);
            
            // Broadcast to all web clients
            const response = JSON.stringify({
              type: 'test_stopped',
              sessionId: currentSession._id
            });
            broadcastToWebClients(JSON.parse(response));
            
            // IMPORTANT FIX: Save session ID before setting currentSession to null
            const completedSessionId = currentSession._id;
            currentSession = null;
            
            // After a short delay, send the resonance data to clients
            setTimeout(async () => {
              try {
                const sessionWithResonance = await TestSession.findById(completedSessionId);
                if (sessionWithResonance && sessionWithResonance.resonanceAnalysisComplete) {
                  broadcastToWebClients({
                    type: 'resonance_data',
                    sessionId: sessionWithResonance._id,
                    frequency: sessionWithResonance.naturalFrequency,
                    damping: sessionWithResonance.dampingRatios && sessionWithResonance.dampingRatios.length > 0 ? 
                              sessionWithResonance.dampingRatios[0] : 0,
                    amplitude: sessionWithResonance.peakAmplitude,
                    qFactor: sessionWithResonance.mechanicalProperties?.qFactor,
                    naturalPeriod: sessionWithResonance.mechanicalProperties?.naturalPeriod,
                    stiffness: sessionWithResonance.mechanicalProperties?.stiffness,
                    dampingCoefficient: sessionWithResonance.mechanicalProperties?.dampingCoefficient,
                    rms: sessionWithResonance.mechanicalProperties?.rms,
                    crestFactor: sessionWithResonance.mechanicalProperties?.crestFactor,
                    bandwidth: sessionWithResonance.mechanicalProperties?.bandwidth,
                    resonanceMagnification: sessionWithResonance.mechanicalProperties?.resonanceMagnification
                  });
                }
              } catch (error) {
                console.error('Error sending resonance data after session completion:', error);
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
            const session = await TestSession.findById(data.sessionId);
            
            if (!session) {
              console.log(`Session not found: ${data.sessionId}`);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Session not found'
              }));
              return;
            }
            
            // If resonance analysis isn't complete and the test is done, calculate it
            if (!session.resonanceAnalysisComplete && !session.isActive) {
              console.log(`Calculating resonance for historical session: ${data.sessionId}`);
              await calculateResonance(session._id);
            }
            
            // Get the updated session with resonance data
            const updatedSession = await TestSession.findById(data.sessionId);
            
            console.log(`Sending session data with ${updatedSession.zAxisData?.length || 0} data points`);
            
            // Enhanced response that includes both data and resonance analysis
            const responseData = {
              type: 'session_data',
              sessionId: data.sessionId,
              data: updatedSession.zAxisData || [],
              resonanceData: {
                resonanceFrequencies: updatedSession.resonanceFrequencies || [],
                dampingRatios: updatedSession.dampingRatios || [],
                naturalFrequency: updatedSession.naturalFrequency || 0,
                peakAmplitude: updatedSession.peakAmplitude || 0
              }
            };
            
            // Include FFT data for frequency visualization if available
            if (updatedSession.zAxisData && updatedSession.zAxisData.length >= 32) {
              const zAxisRawData = updatedSession.zAxisData.map(d => d.rawZ || d.deltaZ || 0);
              const timestamps = updatedSession.zAxisData.map(d => parseInt(d.timestamp) || Date.now());
              
              // Calculate sampling frequency
              const avgSampleInterval = timestamps.length > 1 
                ? (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1)
                : 50; 
              const samplingFreq = 1000 / avgSampleInterval;
              
              // Calculate FFT data
              const fftResult = performSimpleFFT(zAxisRawData, samplingFreq);
              
              // Add to response
              responseData.resonanceData.frequencies = fftResult.frequencies;
              responseData.resonanceData.magnitudes = fftResult.magnitudes;
            }
            
            // Also include mechanical properties if they exist
            if (updatedSession.mechanicalProperties) {
              responseData.resonanceData.mechanicalProperties = updatedSession.mechanicalProperties;
            }
            
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
        
        if (data.type === 'vibration_data' && currentSession) {
          // Z-axis only data storage
          const vibrationData = new VibrationData({
            sessionId: currentSession._id,
            deviceId: data.deviceId || 'unknown',
            timestamp: new Date(data.timestamp || Date.now()),
            deltaZ: data.deltaZ || 0,
            rawZ: data.rawZ || 0,
            magnitude: data.magnitude || data.deltaZ || 0,
            receivedAt: new Date()
          });

          await vibrationData.save();

          // Update session with latest Z-axis data for real-time analysis
          if (!currentSession.zAxisData) currentSession.zAxisData = [];
          if (!currentSession.timestamps) currentSession.timestamps = [];
          
          // Store both raw and delta values for comprehensive analysis
          currentSession.zAxisData.push({
            timestamp: data.timestamp,
            deltaZ: data.deltaZ,
            rawZ: data.rawZ,
            receivedAt: new Date()
          });
          
          // Keep only last 100 samples for real-time analysis
          if (currentSession.zAxisData.length > 100) {
            currentSession.zAxisData = currentSession.zAxisData.slice(-100);
          }

          // Perform real-time analysis on every data point to ensure we don't miss key information
          if (currentSession.zAxisData.length >= 32) {
            const resonanceData = await calculateResonance(currentSession._id, true);
            
            // Broadcast enhanced Z-axis data to web clients with real-time analysis
            broadcastToWebClients({
              type: 'vibration_data',
              sessionId: currentSession._id,
              deviceId: data.deviceId,
              timestamp: data.timestamp,
              deltaZ: data.deltaZ,
              rawZ: data.rawZ,
              magnitude: data.magnitude,
              receivedAt: new Date().toISOString(),
              // Real-time calculations
              frequency: resonanceData.frequency,
              damping: resonanceData.damping,
              amplitude: resonanceData.amplitude,
              qFactor: resonanceData.qFactor,
              naturalPeriod: resonanceData.naturalPeriod,
              bandwidth: resonanceData.bandwidth
            });
            
            // Also send real-time resonance data update every 10 points
            if (currentSession.zAxisData.length % 10 === 0) {
              broadcastToWebClients({
                type: 'resonance_data',
                sessionId: currentSession._id,
                frequency: resonanceData.frequency,
                damping: resonanceData.damping,
                amplitude: resonanceData.amplitude,
                qFactor: resonanceData.qFactor,
                naturalPeriod: resonanceData.naturalPeriod,
                stiffness: resonanceData.stiffness,
                dampingCoefficient: resonanceData.dampingCoefficient,
                rms: resonanceData.rms,
                crestFactor: resonanceData.crestFactor,
                bandwidth: resonanceData.bandwidth,
                resonanceMagnification: resonanceData.resonanceMagnification
              });
            }
          } else {
            // Broadcast basic Z-axis data without calculations
            broadcastToWebClients({
              type: 'vibration_data',
              sessionId: currentSession._id,
              deviceId: data.deviceId,
              timestamp: data.timestamp,
              deltaZ: data.deltaZ,
              rawZ: data.rawZ,
              magnitude: data.magnitude,
              receivedAt: new Date().toISOString()
            });
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

/**
 * Calculate resonance for a test session using Z-axis data only
 * This analyzes the Z-axis vibration data to find natural frequencies and damping
 * @param {string} sessionId - The MongoDB ID of the session
 * @param {boolean} isRealtime - Whether this is a real-time calculation (don't save to DB)
 */
async function calculateResonance(sessionId, isRealtime = false) {
  try {
    console.log(`Beginning resonance calculation for session ${sessionId}, realtime=${isRealtime}`);
    
    const session = await TestSession.findById(sessionId);
    if (!session || !session.zAxisData || session.zAxisData.length < 10) {
      console.log('Not enough Z-axis data for resonance analysis');
      return { frequency: 0, damping: 0, amplitude: 0 };
    }
    
    const dataPoints = session.zAxisData.length;
    console.log(`Processing ${dataPoints} data points for resonance analysis`);
    
    // Extract Z-axis raw values for frequency analysis
    const zAxisRawData = session.zAxisData.map(d => d.rawZ || d.deltaZ || 0);
    const timestamps = session.zAxisData.map(d => parseInt(d.timestamp) || Date.now());
    
    if (zAxisRawData.length < 32) {
      console.log('Insufficient Z-axis data for FFT analysis');
      return { frequency: 0, damping: 0, amplitude: 0 };
    }

    // Calculate sampling frequency from timestamps
    const avgSampleInterval = timestamps.length > 1 
      ? (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1)
      : 50; // Default 50ms interval
    const samplingFreq = 1000 / avgSampleInterval; // Convert to Hz

    console.log(`Sampling frequency: ${samplingFreq.toFixed(2)} Hz, Average interval: ${avgSampleInterval.toFixed(2)} ms`);

    // Perform FFT on Z-axis data
    const fftResult = performSimpleFFT(zAxisRawData, samplingFreq);
    
    // Calculate damping ratio using logarithmic decrement
    const dampingRatio = calculateDampingRatio(zAxisRawData);
    
    // Calculate natural period and stiffness
    const naturalFrequency = fftResult.dominantFreq;
    const naturalPeriod = naturalFrequency > 0 ? 1 / naturalFrequency : 0;
    
    // Estimate mass-spring-damper parameters
    // Assuming unit mass for simplification
    const unitMass = 1.0;  // kg
    const stiffness = unitMass * Math.pow(2 * Math.PI * naturalFrequency, 2); // N/m
    const dampingCoefficient = dampingRatio * 2 * Math.sqrt(unitMass * stiffness); // Ns/m
    
    // Calculate Q factor (quality factor)
    const qFactor = dampingRatio > 0 ? 1 / (2 * dampingRatio) : 0;
    
    // Calculate time domain characteristics
    const peakAmplitude = Math.max(...zAxisRawData.map(Math.abs));
    const rms = Math.sqrt(zAxisRawData.reduce((sum, val) => sum + val * val, 0) / zAxisRawData.length);
    const crestFactor = peakAmplitude / (rms > 0 ? rms : 1);
    
    // Calculate frequency spectrum characteristics
    const bandwidth = 2 * dampingRatio * naturalFrequency;
    const resonanceMagnification = qFactor;
    
    // Only update the database if this is not a real-time calculation
    if (!isRealtime) {
      // Update session with calculated values
      session.naturalFrequency = naturalFrequency;
      session.resonanceFrequencies = [naturalFrequency];
      session.dampingRatios = [dampingRatio];
      session.peakAmplitude = peakAmplitude;
      session.resonanceAnalysisComplete = true;
      
      // Add new mechanical properties
      session.mechanicalProperties = {
        naturalPeriod,
        stiffness,
        dampingCoefficient,
        qFactor,
        rms,
        crestFactor,
        bandwidth,
        resonanceMagnification
      };
      
      await session.save();
      
      console.log(`Z-axis resonance calculated - Freq: ${naturalFrequency.toFixed(2)}Hz, Damping: ${dampingRatio.toFixed(4)}`);
    }
    
    return {
      frequency: naturalFrequency,
      damping: dampingRatio,
      amplitude: peakAmplitude,
      qFactor: qFactor,
      naturalPeriod: naturalPeriod,
      stiffness: stiffness,
      dampingCoefficient: dampingCoefficient,
      rms: rms,
      crestFactor: crestFactor,
      bandwidth: bandwidth,
      resonanceMagnification: resonanceMagnification,
      frequencies: fftResult.frequencies,
      magnitudes: fftResult.magnitudes
    };
    
  } catch (error) {
    console.error('Error calculating Z-axis resonance:', error);
    return { frequency: 0, damping: 0, amplitude: 0 };
  }
}

/**
 * Simple FFT implementation for frequency analysis
 */
function performSimpleFFT(data, samplingFreq) {
  const N = data.length;
  const frequencies = [];
  const magnitudes = [];
  
  // Calculate frequency bins
  for (let k = 0; k < N/2; k++) {
    frequencies[k] = k * samplingFreq / N;
  }
  
  // Simple DFT calculation for dominant frequency detection
  let maxMagnitude = 0;
  let dominantFreq = 0;
  
  for (let k = 1; k < N/2; k++) { // Skip DC component
    let real = 0;
    let imag = 0;
    
    for (let n = 0; n < N; n++) {
      const angle = -2 * Math.PI * k * n / N;
      real += data[n] * Math.cos(angle);
      imag += data[n] * Math.sin(angle);
    }
    
    const magnitude = Math.sqrt(real * real + imag * imag);
    magnitudes[k] = magnitude;
    
    if (magnitude > maxMagnitude && frequencies[k] > 0.5) { // Ignore very low frequencies
      maxMagnitude = magnitude;
      dominantFreq = frequencies[k];
    }
  }
  
  return { dominantFreq, magnitudes, frequencies };
}

/**
 * Calculate damping ratio using logarithmic decrement method
 */
function calculateDampingRatio(data) {
  // Find peaks in the signal
  const peaks = [];
  
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i] > data[i-1] && data[i] > data[i+1] && Math.abs(data[i]) > 0.1) {
      peaks.push({ index: i, value: Math.abs(data[i]) });
    }
  }
  
  if (peaks.length < 2) return 0;
  
  // Calculate logarithmic decrement
  let totalDecrement = 0;
  let validDecrements = 0;
  
  for (let i = 0; i < peaks.length - 1; i++) {
    if (peaks[i].value > 0 && peaks[i+1].value > 0) {
      totalDecrement += Math.log(peaks[i].value / peaks[i+1].value);
      validDecrements++;
    }
  }
  
  if (validDecrements === 0) return 0;
  
  const avgDecrement = totalDecrement / validDecrements;
  const dampingRatio = avgDecrement / Math.sqrt(4 * Math.PI * Math.PI + avgDecrement * avgDecrement);
  
  return Math.max(0, Math.min(1, dampingRatio)); // Clamp between 0 and 1
}

// Helper function to broadcast to web clients
function broadcastToWebClients(data) {
  const message = typeof data === 'string' ? data : JSON.stringify(data);
  console.log(`Broadcasting to ${webClients.size} clients: ${typeof data === 'string' ? data.substring(0, 50) : data.type}`);
  
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
        resonanceFrequencies: session.resonanceFrequencies,
        dampingRatios: session.dampingRatios,
        naturalFrequency: session.naturalFrequency,
        peakAmplitude: session.peakAmplitude,
        analysisComplete: session.resonanceAnalysisComplete
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/:sessionId', async (req, res) => {
  try {
    const session = await TestSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const format = req.query.format || 'json';
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="vibration-data-${session._id}.csv"`);
      
      let csv = 'Timestamp,DeltaZ,RawZ,ReceivedAt\n';
      session.zAxisData.forEach(data => {
        csv += `${data.timestamp},${data.deltaZ},${data.rawZ},${data.receivedAt}\n`;
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
          resonanceFrequencies: session.resonanceFrequencies,
          dampingRatios: session.dampingRatios,
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

// Add endpoint for resonance data
app.get('/api/sessions/:id/resonance', async (req, res) => {
  try {
    const session = await TestSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Calculate fresh resonance data
    const resonanceData = await calculateResonance(session._id);
    
    res.json(resonanceData);
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