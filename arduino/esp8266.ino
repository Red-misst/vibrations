#include <Wire.h>
#include <MPU9250_asukiaaa.h>
#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>

// WiFi Configuration
const char* ssid = "Galaxy";
const char* password = "Barake2023";


// WebSocket Server Configuration - Updated for secure connection
const char* host = "vibrations.onrender.com";
const int port = 443;  // HTTPS port for secure connection
const char* url = "/esp8266";  // Changed to specific ESP8266 path for improved routing

// Sensor Configuration
MPU9250_asukiaaa mySensor;
WebSocketsClient webSocket;

// Z-axis Vibration Detection (vertical movement only)
const float vibrationThreshold = 0.2;
float prevAccelZ = 0;
unsigned long lastDetectionTime = 0;
const unsigned long debounceDelay = 100;  // Faster sampling for frequency analysis

// Z-axis frequency calculation buffers
const int BUFFER_SIZE = 64;  // Increased for better frequency resolution
float zAxisBuffer[BUFFER_SIZE];
int bufferIndex = 0;
unsigned long lastSampleTime = 0;
const unsigned long sampleInterval = 50; // 20Hz sampling for frequency analysis

// Device identification
String deviceId = "ESP8266_" + String(ESP.getChipId(), HEX);

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket Disconnected");
      digitalWrite(LED_BUILTIN, HIGH);
      break;
    case WStype_CONNECTED:
      {
        Serial.printf("WebSocket Connected to: %s\n", payload);
        digitalWrite(LED_BUILTIN, LOW);
        
        // Send connection message with device info for frequency analysis
        String connectMsg = "{\"type\":\"device_connected\",\"deviceId\":\"" + deviceId + "\"}";
        webSocket.sendTXT(connectMsg);
        
        // Send a second time after a short delay to ensure it's received
        delay(500);
        webSocket.sendTXT(connectMsg);
        break;
      }
    case WStype_TEXT:
      Serial.printf("Received: %s\n", payload);
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(4, 5); // SDA = GPIO4, SCL = GPIO5

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH);

  // Initialize sensor
  mySensor.setWire(&Wire);
  mySensor.beginAccel();

  // Connect to WiFi
  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
  }
  
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("\nWiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  // Setup secure WebSocket connection
  webSocket.beginSSL(host, port, url);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  
  Serial.println("Z-Axis Natural Frequency Monitor Ready - Device ID: " + deviceId);
}

void loop() {
  webSocket.loop();

  // Sample at regular intervals for frequency analysis
  if (millis() - lastSampleTime >= sampleInterval) {
    mySensor.accelUpdate();

    // Only read Z-axis (vertical) acceleration for frequency analysis
    float az = mySensor.accelZ();

    // Calculate delta for Z-axis only
    float deltaZ = abs(az - prevAccelZ);

    // Store Z-axis data for frequency analysis
    zAxisBuffer[bufferIndex] = az;
    bufferIndex = (bufferIndex + 1) % BUFFER_SIZE;

    // Detect significant Z-axis vibration for frequency analysis
    bool isVibration = (deltaZ > vibrationThreshold);

    if (isVibration && millis() - lastDetectionTime > debounceDelay) {
      // Z-axis focused data packet for natural frequency analysis
      StaticJsonDocument<150> doc;
      doc["type"] = "vibration_data";
      doc["deviceId"] = deviceId;
      doc["timestamp"] = millis();
      doc["deltaZ"] = round(deltaZ * 1000) / 1000.0; // 3 decimal places
      doc["rawZ"] = round(az * 1000) / 1000.0;
      doc["magnitude"] = deltaZ; // For Z-axis only, magnitude equals deltaZ

      String payload;
      serializeJson(doc, payload);

      Serial.println("Z-AXIS FREQUENCY DATA: " + payload);
      webSocket.sendTXT(payload);
      lastDetectionTime = millis();
    }

    prevAccelZ = az;
    lastSampleTime = millis();
  }

  delay(10); // Small delay to prevent overwhelming the frequency analysis
}
