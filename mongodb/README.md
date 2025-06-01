# MongoDB Configuration for Z-Axis Vibration Monitor

## Setup Instructions

1. **Install MongoDB Community Edition**
   - Download from: https://www.mongodb.com/try/download/community
   - Follow installation instructions for your operating system

2. **Start MongoDB Service**
   
   **Windows:**
   ```
   net start MongoDB
   ```
   
   **Linux/macOS:**
   ```
   sudo systemctl start mongod
   ```
   
   **Manual start:**
   ```
   mongod --dbpath /path/to/your/data/directory
   ```

3. **Default Configuration**
   - Host: localhost
   - Port: 27017
   - Database: vibration_monitor
   - Collections: testsessions

4. **Connection String**
   ```
   mongodb://localhost:27017/vibration_monitor
   ```

## Database Schema

### TestSession Collection
```javascript
{
  _id: ObjectId,
  name: String,           // User-defined session name
  startTime: Date,        // When the test started
  endTime: Date,          // When the test ended (null if active)
  isActive: Boolean,      // Whether the test is currently running
  createdAt: Date,        // Record creation timestamp
  
  // Z-axis data stored as an array within the session document
  zAxisData: [
    {
      timestamp: String,  // ESP8266 timestamp (millis)
      deltaZ: Number,     // Z-axis vibration delta (vertical movement change)
      rawZ: Number,       // Raw Z-axis acceleration value
      receivedAt: Date    // Server reception timestamp
    }
  ],
  
  // Resonance analysis results for Z-axis
  resonanceFrequencies: [Number], // Detected resonance frequencies (Hz)
  dampingRatios: [Number],        // Damping ratio for each resonance
  naturalFrequency: Number,       // Primary natural frequency (Hz)
  peakAmplitude: Number,          // Maximum Z-axis amplitude observed
  resonanceAnalysisComplete: Boolean // Whether analysis has been performed
}
```

### VibrationData Collection (Individual Records)
```javascript
{
  _id: ObjectId,
  sessionId: ObjectId,    // Reference to TestSession
  deviceId: String,       // ESP8266 device identifier
  timestamp: Date,        // Measurement timestamp
  deltaZ: Number,         // Z-axis vibration delta
  rawZ: Number,          // Raw Z-axis acceleration
  magnitude: Number,      // Vibration magnitude (same as deltaZ for single axis)
  receivedAt: Date       // Server reception timestamp
}
```

## Useful MongoDB Commands

### Access MongoDB Shell
```
mongo
```

### Switch to vibration_monitor database
```javascript
use vibration_monitor
```

### View all test sessions
```javascript
db.testsessions.find().pretty()
```

### View Z-axis data for a specific session
```javascript
db.testsessions.findOne(
  {_id: ObjectId("your_session_id")}, 
  {zAxisData: 1, resonanceFrequencies: 1, naturalFrequency: 1}
)
```

### Get sessions with completed resonance analysis
```javascript
db.testsessions.find({resonanceAnalysisComplete: true}).pretty()
```

### Count Z-axis data points in a session
```javascript
db.testsessions.aggregate([
  {$match: {_id: ObjectId("your_session_id")}},
  {$project: {dataPointCount: {$size: "$zAxisData"}}}
])
```

### Get vibration data by device
```javascript
db.vibrationdatas.find({deviceId: "ESP8266_XXXXXX"}).sort({timestamp: -1})
```

### Find sessions with high amplitude vibrations
```javascript
db.testsessions.find({peakAmplitude: {$gt: 1.0}}).sort({peakAmplitude: -1})
```

### Export Z-axis data to analyze frequency content
```javascript
db.testsessions.aggregate([
  {$match: {_id: ObjectId("your_session_id")}},
  {$unwind: "$zAxisData"},
  {$project: {
    timestamp: "$zAxisData.timestamp",
    rawZ: "$zAxisData.rawZ",
    deltaZ: "$zAxisData.deltaZ"
  }}
])
```

### Delete all data (for testing)
```javascript
db.testsessions.deleteMany({})
db.vibrationdatas.deleteMany({})
```

### Create index for better performance on Z-axis queries
```javascript
db.testsessions.createIndex({"zAxisData.timestamp": 1})
db.vibrationdatas.createIndex({sessionId: 1, timestamp: 1})
```
