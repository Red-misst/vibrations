# Z-Axis Vibration Monitor

A real-time vibration monitoring system that analyzes vertical (Z-axis) vibrations using an ESP8266 microcontroller with MPU9250 accelerometer. The system provides frequency analysis, damping calculations, and real-time data visualization through a secure WebSocket connection.

## Features

- **Z-Axis Focus**: Specifically designed for vertical vibration analysis
- **Real-time Monitoring**: Live data streaming and visualization
- **Frequency Analysis**: FFT-based dominant frequency detection
- **Damping Calculation**: Logarithmic decrement method for damping ratio
- **Secure WebSocket**: HTTPS/WSS connection to deployed server
- **Data Export**: CSV and JSON export capabilities
- **Modern UI**: Responsive web interface with real-time charts

## System Architecture

```
ESP8266 (MPU9250) → WSS → Node.js Server → MongoDB → Web Dashboard
```

### Components

1. **ESP8266 Hardware**: Collects Z-axis acceleration data
2. **Node.js Server**: Processes data and performs analysis
3. **MongoDB**: Stores session data and vibration measurements
4. **Web Dashboard**: Real-time visualization and control

## Hardware Requirements

- ESP8266 (NodeMCU, Wemos D1, etc.)
- MPU9250 9-axis sensor (or compatible accelerometer)
- Jumper wires for connections

### Wiring

```
ESP8266  →  MPU9250
GPIO4    →  SDA
GPIO5    →  SCL
3.3V     →  VCC
GND      →  GND
```

## Software Requirements

- Arduino IDE with ESP8266 board package
- Node.js 16+
- MongoDB (local or cloud)

### Arduino Libraries

```cpp
#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <MPU9250_asukiaaa.h>
```

## Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd vibbration
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your MongoDB connection string
```

### 4. Upload Arduino Code

1. Open `arduino/esp8266.ino` in Arduino IDE
2. Update WiFi credentials and sensor configuration
3. Install required libraries
4. Upload to ESP8266

### 5. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

## Configuration

### Environment Variables

```bash
MONGODB_URI=mongodb://localhost:27017/vibration_monitor
PORT=3000
NODE_ENV=development
WS_HEARTBEAT_INTERVAL=30000
```

### Arduino Configuration

```cpp
// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// WebSocket Server
const char* host = "vibrations.onrender.com";
const int port = 443;

// Vibration Detection
const float vibrationThreshold = 0.2;  // Adjust sensitivity
const unsigned long sampleInterval = 50; // 20Hz sampling
```

## Usage

### Starting a Test Session

1. Ensure ESP8266 is connected (green indicator)
2. Click "Start Test" button
3. Apply vibrations to the Z-axis sensor
4. Monitor real-time metrics and charts
5. Click "Stop Test" when complete

### Real-time Metrics

- **Frequency**: Dominant frequency in Hz
- **Damping Ratio**: System damping (0-1)
- **Amplitude**: Peak Z-axis acceleration
- **Current Z-Delta**: Live vibration intensity

### Data Analysis

The system performs real-time analysis including:

- **FFT Analysis**: Identifies dominant frequencies
- **Damping Calculation**: Uses logarithmic decrement method
- **Peak Detection**: Finds local maxima in vibration data
- **Statistical Analysis**: Calculates amplitude and frequency statistics

### Data Export

Export options available:
- **CSV Format**: For Excel/data analysis tools
- **JSON Format**: For programmatic access
- **Real-time API**: REST endpoints for live data

## API Endpoints

```bash
GET /api/sessions                    # List all sessions
GET /api/sessions/:id/data          # Get session data
GET /api/export/:sessionId?format=csv # Export data
```

## Mathematical Background

### Frequency Analysis

The system uses a simplified DFT (Discrete Fourier Transform) to identify dominant frequencies:

```javascript
magnitude = √(real² + imag²)
frequency = k * samplingRate / N
```

### Damping Calculation

Logarithmic decrement method for damping ratio:

```javascript
δ = ln(x₁/x₂)  // Natural log of successive peaks
ζ = δ/√(4π² + δ²)  // Damping ratio
```

## Troubleshooting

### ESP8266 Connection Issues

1. Check WiFi credentials
2. Verify server URL and port
3. Ensure SSL certificate handling
4. Monitor serial output for debug info

### Sensor Reading Problems

1. Verify wiring connections
2. Check sensor power supply (3.3V)
3. Test I2C communication
4. Calibrate sensor if needed

### Server Issues

1. Check MongoDB connection
2. Verify environment variables
3. Monitor server logs
4. Test WebSocket connectivity

## Development

### Project Structure

```
vibbration/
├── arduino/
│   └── esp8266.ino          # ESP8266 firmware
├── public/
│   └── index.html           # Web dashboard
├── mongodb/
│   └── README.md            # Database documentation
├── models/                  # MongoDB schemas
├── index.js                 # Main server file
├── package.json             # Dependencies
└── .env                     # Environment config
```

### Adding Features

1. **New Sensor Support**: Modify Arduino code and data models
2. **Advanced Analysis**: Add signal processing functions
3. **UI Enhancements**: Update frontend components
4. **Export Formats**: Add new export endpoints

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check troubleshooting section
- Review MongoDB logs
- Monitor WebSocket connections
- Verify hardware connections
