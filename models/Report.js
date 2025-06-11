import mongoose from 'mongoose';

const ReportSchema = new mongoose.Schema({
  sessionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'TestSession', 
    required: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  fileName: { 
    type: String, 
    required: true 
  },
  fileData: { 
    type: Buffer, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  insights: {
    type: String
  },
  metadata: {
    naturalFrequency: Number,
    peakAmplitude: Number,
    qFactor: Number,
    dataPoints: Number,
    duration: String
  }
});

export default mongoose.model('Report', ReportSchema);
