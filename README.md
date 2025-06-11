# Z-Axis Vibration Monitor

A real-time vibration monitoring system focused on vertical (Z-axis) motion analysis using ESP8266 and MPU9250 sensors.

## Features

- **Z-Axis Focus**: Monitors vertical vibrations only for precise structural analysis
- **Real-time Data**: WebSocket-based live data streaming
- **Resonance Analysis**: Automatic calculation of natural frequency and damping ratios
- **Secure Connection**: HTTPS/WSS support for cloud deployment
- **Data Export**: CSV export functionality for further analysis
- **Session Management**: Organized test sessions with timestamps
- **NEW - AI Assistant**: DeepSeek-powered chat interface for vibration analysis assistance
- **NEW - Report Generation**: AI-generated PDF reports with insights and visualizations

## Architecture

### Hardware
- **ESP8266**: WiFi-enabled microcontroller
- **MPU9250**: 9-axis motion sensor (using Z-axis only)
- **Power Supply**: 3.3V for ESP8266

### Software Stack
- **Backend**: Node.js with Express and WebSocket
- **Database**: MongoDB for session and data storage
- **Frontend**: Vanilla JavaScript with Chart.js
- **AI Integration**: DeepSeek API for analysis assistance and report generation
- **Deployment**: Render.com cloud platform

## Installation

### Prerequisites
- Node.js 14+
- MongoDB (local or cloud)
- Arduino IDE for ESP8266 programming
- DeepSeek API key

### Server Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository>
   cd vibration
   npm install
   ```

2. **Environment Configuration**:
   ```bash
   cp .env.example .env
   # Edit .env with your MongoDB URI and DeepSeek API key
   ```

3. **Start the server**:
   ```bash
   npm start
   # For development:
   npm run dev
   ```

### ESP8266 Setup

1. **Install Libraries**:
   - MPU9250_asukiaaa
   - ArduinoJson
   - WebSocketsClient

2. **Configure WiFi**:
   ```cpp
   const char* ssid = "YOUR_SSID";
   const char* password = "YOUR_PASSWORD";
   ```

3. **Upload the sketch** to your ESP8266

## Z-Axis Data Structure

### Sensor Data
```javascript
{
  type: "vibration_data",
  deviceId: "ESP8266_XXXXXX",
  timestamp: 12345678,
  deltaZ: 0.123,        // Z-axis vibration delta
  rawZ: 9.856,          // Raw Z-axis acceleration
  magnitude: 0.123      // Vibration magnitude (same as deltaZ)
}
```

### Session Data
```javascript
{
  name: "Building Test 1",
  startTime: "2024-01-01T10:00:00Z",
  endTime: "2024-01-01T10:15:00Z",
  isActive: false,
  zAxisData: [
    {
      timestamp: "12345678",
      deltaZ: 0.123,
      rawZ: 9.856,
      receivedAt: "2024-01-01T10:00:01Z"
    }
  ],
  // Resonance Analysis Results
  naturalFrequency: 2.5,      // Hz
  dampingRatios: [0.05],      // Damping ratio
  peakAmplitude: 0.456,       // Maximum amplitude
  resonanceAnalysisComplete: true
}
```

## API Endpoints

### Chat & Report API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/:sessionId` | GET | Get chat history for a session |
| `/api/chat/message` | POST | Send message to AI assistant |
| `/api/reports/generate` | POST | Generate a new PDF report |
| `/api/reports` | GET | List all reports |
| `/api/reports/:reportId` | GET | Get report details |
| `/api/reports/:reportId/download` | GET | Download report PDF |

### GET /api/sessions
Returns all test sessions with metadata.

### GET /api/export/:sessionId?format=csv
Exports session data in CSV format.

### DELETE /api/sessions/:id
Deletes the specified session and its vibration data.

### WebSocket Events

#### Client → Server
- `start_test`: Begin new test session
- `stop_test`: End current session
- `delete_session`: Delete a session
- `chat_message`: Send a message to the AI assistant
- `get_chat_history`: Request chat history for a session
- `generate_report`: Request a new report generation
- `get_reports`: Get list of available reports

#### Server → Client
- `vibration_data`: Real-time Z-axis data
- `session_status`: Session state updates
- `device_status`: Device connection updates
- `session_deleted`: Confirms session deletion
- `chat_response`: AI assistant response
- `chat_history`: Complete chat history for a session
- `report_status`: Report generation status updates
- `reports_list`: List of available reports

## Deployment

### Render.com Deployment

1. **Create Render Web Service**:
   - Connect your GitHub repository
   - Set build command: `npm install`
   - Set start command: `npm start`

2. **Environment Variables**:
   ```
   MONGODB_URI=mongodb+srv://...
   NODE_ENV=production
   PORT=10000
   ```

3. **Domain**: Your app will be available at `https://yourapp.onrender.com`

### MongoDB Atlas Setup

1. Create MongoDB Atlas cluster
2. Configure network access (0.0.0.0/0 for Render)
3. Create database user
4. Copy connection string to MONGODB_URI

## Usage

### Web Interface

1. **Access**: Open `https://yourapp.onrender.com`
2. **Start Test**: Enter session name and click "Start Test"
3. **Monitor**: View real-time Z-axis vibration data
4. **Export**: Download session data as CSV
5. **Delete**: Remove unwanted test sessions

### AI Assistant

1. Click the chat icon in the bottom right corner
2. Enter your question about vibration data
3. Receive expert analysis and explanations
4. Chat history is saved per session

### Report Generation

1. Navigate to the Reports section
2. Click "Generate Report" button
3. Select the session to analyze
4. Wait for AI to process and generate the PDF
5. Download or view the report directly in the browser

### Z-Axis Metrics

- **Frequency**: Dominant vibration frequency (Hz)
- **Damping Ratio**: System damping coefficient
- **Amplitude**: Peak Z-axis acceleration (g)
- **Current Z-Delta**: Live vertical vibration intensity

### Resonance Analysis

The system automatically calculates:
- Natural frequency using FFT analysis
- Damping ratio via logarithmic decrement
- Q factor for resonance sharpness
- Frequency response curves

## Data Analysis

### Exported CSV Format
```csv
Timestamp,DeltaZ,RawZ,ReceivedAt
12345678,0.123,9.856,2024-01-01T10:00:01Z
```

### Exported PDF Reports Include

- Session metadata (name, duration, date)
- Key metrics summary (natural frequency, amplitude, Q factor)
- Time-domain analysis of vibration patterns
- Frequency-domain analysis with resonance peaks
- AI-generated insights and recommendations
- Data visualizations

### Resonance Analysis
The system performs automatic frequency domain analysis:
- **FFT**: Fast Fourier Transform for frequency content
- **Peak Detection**: Identifies dominant frequencies
- **Damping Calculation**: Logarithmic decrement method
- **Q Factor**: Quality factor calculation

## Troubleshooting

### Common Issues

1. **ESP8266 Won't Connect**:
   - Check WiFi credentials
   - Verify server URL and port
   - Monitor serial output for errors

2. **No Data Received**:
   - Confirm WebSocket connection
   - Check sensor wiring (SDA=GPIO4, SCL=GPIO5)
   - Verify MPU9250 initialization

3. **Deployment Issues**:
   - Ensure all files are committed
   - Check environment variables
   - Verify MongoDB connection string

### Common Issues with AI Features

1. **AI assistant not responding**
   - Check your DeepSeek API key in .env file
   - Verify internet connectivity
   - Check server logs for API rate limiting

2. **Report generation fails**
   - Ensure session has sufficient data points
   - Check for MongoDB connection issues
   - Verify PDF generation dependencies

### Debug Commands

```bash
# Check MongoDB connection
mongo "your_connection_string"

# View logs in development
npm run dev

# Check WebSocket connections
# Browser DevTools → Network → WS
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes focusing on Z-axis improvements
4. Test with actual hardware
5. Submit pull request

## License

MIT License - see LICENSE file for details.

## Support

For technical support:
1. Check the troubleshooting section
2. Review MongoDB and WebSocket logs
3. Verify ESP8266 serial output
4. Open GitHub issue with detailed information
