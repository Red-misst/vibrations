#include <Wire.h>
#include <MPU9250_asukiaaa.h>
#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>  // Install: Library: ArduinoJson by Benoit Blanchon

// WiFi Configuration - Update with your network info
const char* ssid = "YOUR_SSID";
const char* password = "YOUR_PASSWORD";

// WebSocket Server Configuration - Update with your server IP address
const char* host = "192.168.1.100";  // Change to the IP address of your Node.js server
const int port = 3000;               // Default port of your Node.js server

// Sensor Configuration
MPU9250_asukiaaa mySensor;
WebSocketsClient webSocket;

// Vibration Detection Configuration
const float vibrationThreshold = 0.3;  // Adjust this value to increase/decrease sensitivity
float prevAccelX = 0, prevAccelY = 0, prevAccelZ = 0;
unsigned long lastDetectionTime = 0;
const unsigned long debounceDelay = 200;  // Minimum time between vibration detections (milliseconds)

// Status indicators
const int LED_WIFI = LED_BUILTIN;  // Built-in LED for WiFi status
const int LED_DATA = 2;            // GPIO2 (adjust as needed) for data transmission

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket Disconnected");
      break;
    case WStype_CONNECTED:
      Serial.printf("WebSocket Connected to: %s\n", payload);
      break;
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

  // Initialize status LEDs
  pinMode(LED_WIFI, OUTPUT);
  pinMode(LED_DATA, OUTPUT);
  
  // Initially set LEDs to indicate "not connected" state
  digitalWrite(LED_WIFI, HIGH); // Built-in LED is inverted (LOW = ON)
  digitalWrite(LED_DATA, LOW);

  // Initialize MPU9250 sensor
  mySensor.setWire(&Wire);
  mySensor.beginAccel();

  // Connect to WiFi
  delay(1000);
  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    // Blink the WiFi LED while connecting
    digitalWrite(LED_WIFI, !digitalRead(LED_WIFI));
  }
  
  // Connected to WiFi
  digitalWrite(LED_WIFI, LOW); // Turn LED on to indicate WiFi connected
  Serial.println("\nWiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  // Connect to WebSocket server
  webSocket.begin(host, port, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);

  Serial.println("MPU9250 Vibration WebSocket Logger Ready");
}

void loop() {
  webSocket.loop();

  mySensor.accelUpdate();

  float ax = mySensor.accelX();
  float ay = mySensor.accelY();
  float az = mySensor.accelZ();

  float deltaX = abs(ax - prevAccelX);
  float deltaY = abs(ay - prevAccelY);
  float deltaZ = abs(az - prevAccelZ);

  bool isVibration = (deltaX > vibrationThreshold || deltaY > vibrationThreshold || deltaZ > vibrationThreshold);

  if (isVibration && millis() - lastDetectionTime > debounceDelay) {
    String payload = "{";
    payload += "\"timestamp\":\"" + String(millis()) + "\",";
    payload += "\"deltaX\":" + String(deltaX, 3) + ",";
    payload += "\"deltaY\":" + String(deltaY, 3) + ",";
    payload += "\"deltaZ\":" + String(deltaZ, 3);
    payload += "}";

    Serial.println("VIBRATION DETECTED: " + payload);
    webSocket.sendTXT(payload);
    lastDetectionTime = millis();
    
    // Flash data LED to indicate transmission
    digitalWrite(LED_DATA, HIGH);
    delay(20);
    digitalWrite(LED_DATA, LOW);
  }

  prevAccelX = ax;
  prevAccelY = ay;
  prevAccelZ = az;

  delay(50);
}
