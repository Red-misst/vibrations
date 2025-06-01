import mongoose from 'mongoose';

const VibrationDataSchema = new mongoose.Schema({
  sessionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'TestSession', 
    required: true 
  },
  deviceId: { type: String, default: 'unknown' },
  timestamp: { type: Date, default: Date.now },
  deltaZ: { type: Number, required: true },
  rawZ: { type: Number, required: true },
  magnitude: { type: Number, default: 0 }, // Same as deltaZ for single axis
  receivedAt: { type: Date, default: Date.now }
});

export default mongoose.model('VibrationData', VibrationDataSchema);
