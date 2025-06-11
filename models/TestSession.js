import mongoose from 'mongoose';

const TestSessionSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    index: true,
    unique: true
  },
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
  naturalFrequency: Number,       // Primary natural frequency Hz
  peakAmplitude: Number,
  frequencyAnalysisComplete: { type: Boolean, default: false },
  // Time series frequency and amplitude data
  frequencyTimeSeries: [{
    timestamp: String,
    frequency: Number
  }],
  amplitudeTimeSeries: [{
    timestamp: String,
    amplitude: Number
  }],
  // Mechanical properties
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

// Use mongoose.models to check if the model exists before creating a new one
const TestSession = mongoose.models.TestSession || mongoose.model('TestSession', TestSessionSchema);

export default TestSession;
