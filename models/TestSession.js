import mongoose from 'mongoose';

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

export default mongoose.model('TestSession', TestSessionSchema);
