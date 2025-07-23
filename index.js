import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
// Add the import for our new FFT utility functions
import { performSimpleFFT, calculateQFactor } from './utils/fftUtils.js';
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
            
            // Calculate natural frequency after saving session data
            console.log(`Calculating natural frequency for session ${currentSession._id}`);
            await calculateNaturalFrequency(currentSession._id);
            
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
                    bandwidth: sessionWithFrequency.mechanicalProperties?.bandwidth
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
            const session = await TestSession.findById(data.sessionId);
            
            if (!session) {
              console.log(`Session not found: ${data.sessionId}`);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Session not found'
              }));
              return;
            }
            
            // If frequency analysis isn't complete and the test is done, calculate it
            if (!session.frequencyAnalysisComplete && !session.isActive) {
              console.log(`Calculating natural frequency for historical session: ${data.sessionId}`);
              await calculateNaturalFrequency(session._id);
            }
            
            // Get the updated session with frequency data
            const updatedSession = await TestSession.findById(data.sessionId);
            
            console.log(`Sending session data with ${updatedSession.zAxisData?.length || 0} data points`);
            
            // Enhanced response that includes both data and frequency analysis
            const responseData = {
              type: 'session_data',
              sessionId: data.sessionId,
              data: updatedSession.zAxisData || [],
              frequencyData: {
                resonanceFrequencies: updatedSession.resonanceFrequencies || [],
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
              responseData.frequencyData.frequencies = fftResult.frequencies;
              responseData.frequencyData.magnitudes = fftResult.magnitudes;
            }
            
            // Also include mechanical properties if they exist
            if (updatedSession.mechanicalProperties) {
              responseData.frequencyData.mechanicalProperties = updatedSession.mechanicalProperties;
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

          // Perform real-time analysis on EVERY data point - no minimum threshold
          if (currentSession.zAxisData.length >= 1) {
            const frequencyData = await calculateNaturalFrequency(currentSession._id, true);
            
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
              // Real-time frequency calculations for ANY vibration
              frequency: frequencyData.frequency,
              qFactor: frequencyData.qFactor,
              amplitude: frequencyData.amplitude,
              naturalPeriod: frequencyData.naturalPeriod,
              bandwidth: frequencyData.bandwidth
            });
            
            // Send frequency data update for every data point
            broadcastToWebClients({
              type: 'frequency_data',
              sessionId: currentSession._id,
              frequency: frequencyData.frequency,
              qFactor: frequencyData.qFactor,
              amplitude: frequencyData.amplitude,
              naturalPeriod: frequencyData.naturalPeriod,
              stiffness: frequencyData.stiffness,
              rms: frequencyData.rms,
              crestFactor: frequencyData.crestFactor,
              bandwidth: frequencyData.bandwidth
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
 * Calculate natural frequency for a test session using Z-axis data only
 * This analyzes the Z-axis vibration data to find natural frequencies
 * @param {string} sessionId - The MongoDB ID of the session
 * @param {boolean} isRealtime - Whether this is a real-time calculation (don't save to DB)
 */
async function calculateNaturalFrequency(sessionId, isRealtime = false) {
  try {
    console.log(`Beginning natural frequency calculation for session ${sessionId}, realtime=${isRealtime}`);
    
    const session = await TestSession.findById(sessionId);
    if (!session || !session.zAxisData || session.zAxisData.length < 1) {
      console.log('No Z-axis data available for frequency analysis');
      return { frequency: 0, qFactor: 0, amplitude: 0 };
    }
    
    const dataPoints = session.zAxisData.length;
    console.log(`Processing ${dataPoints} data points for frequency analysis`);
    
    // Get the mass value from the session (default to 1.0 kg if not specified)
    const testMass = session.testMass || 1.0;
    
    // Extract Z-axis raw values for frequency analysis
    const zAxisRawData = session.zAxisData.map(d => d.rawZ || d.deltaZ || 0);
    const timestamps = session.zAxisData.map(d => parseInt(d.timestamp) || Date.now());
    
    // Analyze even single data points for immediate response
    if (zAxisRawData.length === 1) {
      const amplitude = Math.abs(zAxisRawData[0]);
      return { 
        frequency: 0, 
        qFactor: 0, 
        amplitude: amplitude,
        naturalPeriod: 0,
        stiffness: 0,
        rms: amplitude,
        crestFactor: 1,
        bandwidth: 0,
        theoreticalFrequency: 0
      };
    }

    // Calculate sampling frequency from timestamps
    const avgSampleInterval = timestamps.length > 1 
      ? (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1)
      : 50; // Default 50ms interval
    const samplingFreq = 1000 / avgSampleInterval; // Convert to Hz

    console.log(`Sampling frequency: ${samplingFreq.toFixed(2)} Hz, Average interval: ${avgSampleInterval.toFixed(2)} ms`);

    // For very small datasets (2-7 points), use simple time-domain analysis
    let naturalFrequency = 0;
    let fftResult = null;
    
    if (zAxisRawData.length < 8) {
      // Simple peak detection for small datasets
      naturalFrequency = estimateFrequencyFromPeaks(zAxisRawData, samplingFreq);
    } else {
      // Perform FFT on Z-axis data for larger datasets
      fftResult = performSimpleFFT(zAxisRawData, samplingFreq);
      naturalFrequency = fftResult.dominantFreq;
    }

    // Calculate natural frequency characteristics
    const naturalPeriod = naturalFrequency > 0 ? 1 / naturalFrequency : 0;
    
    // Update to use the actual test mass for stiffness calculation
    const stiffness = testMass * Math.pow(2 * Math.PI * naturalFrequency, 2); // N/m
    
    // Calculate time domain characteristics
    const peakAmplitude = Math.max(...zAxisRawData.map(Math.abs));
    const rms = Math.sqrt(zAxisRawData.reduce((sum, val) => sum + val * val, 0) / zAxisRawData.length);
    
    // Calculate force from acceleration and mass (F = ma)
    const peakForce = peakAmplitude * testMass; // Force in Newtons
    
    // Calculate Q factor from frequency spectrum (if available)
    let qFactor = 0;
    if (fftResult) {
      qFactor = calculateQFactor(fftResult.magnitudes, fftResult.frequencies, naturalFrequency);
    }
    const crestFactor = peakAmplitude / (rms > 0 ? rms : 1);
    
    // Calculate frequency spectrum characteristics
    const bandwidth = qFactor > 0 ? naturalFrequency / qFactor : 0;

    // === THEORETICAL FREQUENCY CALCULATION START ===
    const E = 200e9; // Young's modulus for stainless steel in Pascals
    const b = 0.025; // Breadth in meters (2.5 cm)
    const d = 0.001; // Depth in meters (1 mm)
    const L = 0.25;  // Length in meters (25 cm)
    const rho = 8000; // Density of stainless steel in kg/m^3

    const I = (b * Math.pow(d, 3)) / 12;
    const k_theoretical = (3 * E * I) / Math.pow(L, 3);
    const volume_beam = b * d * L;
    const m_beam = rho * volume_beam;

    const m_tip = session.tipMass || 0;
    const m_sensor = session.sensorMass || 0;
    const m_eff = m_tip + m_sensor + (m_beam / 3);

    const naturalFrequencyTheoretical = m_eff > 0
      ? (1 / (2 * Math.PI)) * Math.sqrt(k_theoretical / m_eff)
      : 0;

    console.log(`Theoretical natural frequency: ${naturalFrequencyTheoretical.toFixed(2)} Hz`);
    // === THEORETICAL FREQUENCY CALCULATION END ===
    
    // Only update the database if this is not a real-time calculation
    if (!isRealtime) {
      // Update session with calculated values
      session.naturalFrequency = naturalFrequency;
      session.resonanceFrequencies = [naturalFrequency];
      session.peakAmplitude = peakAmplitude;
      session.frequencyAnalysisComplete = true;
      
      // Add frequency-focused mechanical properties
      session.mechanicalProperties = {
        naturalPeriod,
        stiffness,
        qFactor,
        rms,
        crestFactor,
        bandwidth,
        peakForce,
        theoreticalFrequency: naturalFrequencyTheoretical
      };
      
      await session.save();
      
      console.log(`Z-axis natural frequency calculated - Freq: ${naturalFrequency.toFixed(2)}Hz, Q: ${qFactor.toFixed(2)}, Force: ${peakForce.toFixed(2)}N`);
    }
    
    return {
      frequency: naturalFrequencyTheoretical,
      qFactor: qFactor,
      amplitude: peakAmplitude,
      naturalPeriod: naturalPeriod,
      stiffness: stiffness,
      rms: rms,
      crestFactor: crestFactor,
      bandwidth: bandwidth,
      peakForce: peakForce,
      frequencies: fftResult?.frequencies || [],
      magnitudes: fftResult?.magnitudes || [],
      testMass: testMass,

    };
    
  } catch (error) {
    console.error('Error calculating Z-axis natural frequency:', error);
    return { frequency: 0, qFactor: 0, amplitude: 0 };
  }
}

// Add new function for simple frequency estimation with small datasets
function estimateFrequencyFromPeaks(data, samplingFreq) {
  if (data.length < 2) return 0;
  
  // Find zero crossings or direction changes
  let crossings = 0;
  let lastDirection = 0;
  
  for (let i = 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff !== 0) {
      const direction = diff > 0 ? 1 : -1;
      if (lastDirection !== 0 && direction !== lastDirection) {
        crossings++;
      }
      lastDirection = direction;
    }
  } 
  
  if (crossings === 0) return 0;
  
  // Estimate frequency from direction changes
  const totalTime = (data.length - 1) / samplingFreq;
  const estimatedFreq = (crossings / 2) / totalTime; // Half-cycles to full cycles
  
  return estimatedFreq;
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
    const session = await TestSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const format = req.query.format || 'json';
    
    if (format === 'csv') {
      // Calculate FFT for amplitude vs frequency
      const zAxisRawData = session.zAxisData.map(d => d.rawZ || d.deltaZ || 0);
      const timestamps = session.zAxisData.map(d => parseInt(d.timestamp) || Date.now());
      const avgSampleInterval = timestamps.length > 1 
        ? (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1)
        : 50;
      const samplingFreq = 1000 / avgSampleInterval;
      // Use FFT utility
      const fftResult = performSimpleFFT(zAxisRawData, samplingFreq);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="frequency-amplitude-${session._id}.csv"`);

      let csv = 'Frequency (Hz),Amplitude\n';
      if (fftResult && fftResult.frequencies && fftResult.magnitudes) {
        for (let i = 0; i < fftResult.frequencies.length; i++) {
          csv += `${fftResult.frequencies[i]},${fftResult.magnitudes[i]}\n`;
        }
      }
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
    
    // Calculate fresh frequency data
    const frequencyData = await calculateNaturalFrequency(session._id);
    
    res.json(frequencyData);
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