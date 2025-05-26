# MongoDB Configuration for Vibration Monitor

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
   - Collections: testsessions, vibrationdatas

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
  createdAt: Date         // Record creation timestamp
}
```

### VibrationData Collection
```javascript
{
  _id: ObjectId,
  sessionId: ObjectId,    // Reference to TestSession
  timestamp: String,      // ESP8266 timestamp (millis)
  deltaX: Number,         // X-axis vibration delta
  deltaY: Number,         // Y-axis vibration delta
  deltaZ: Number,         // Z-axis vibration delta
  receivedAt: Date        // Server reception timestamp
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

### View vibration data for a specific session
```javascript
db.vibrationdatas.find({sessionId: ObjectId("your_session_id")}).pretty()
```

### Count total vibration readings
```javascript
db.vibrationdatas.count()
```

### Delete all data (for testing)
```javascript
db.testsessions.deleteMany({})
db.vibrationdatas.deleteMany({})
```
