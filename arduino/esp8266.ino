#include <Wire.h>
#include <MPU9250_asukiaaa.h>
#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <arduinoFFT.h>

// WiFi Configuration
const char* ssid = "Tenda_5C30C8";
const char* password = "op898989..";

// WebSocket Configuration
const char* host = "192.168.0.105";
const int port = 3000;
const char* url = "/esp8266";

// FFT Config
#define SAMPLES 64
#define SAMPLING_FREQUENCY 250  // Increased from 200Hz
#define INITIAL_THRESHOLD 0.01
#define BUFFER_SIZE 128  // Circular buffer size

// New globals for optimization
double circularBuffer[BUFFER_SIZE];
int bufferIndex = 0;
double movingAverage = 0;
double dynamicThreshold = INITIAL_THRESHOLD;
const double ALPHA = 0.1;  // EMA factor

MPU9250_asukiaaa mySensor;
WebSocketsClient webSocket;

double vReal[SAMPLES];
double vImag[SAMPLES];
ArduinoFFT<double> FFT(vReal, vImag, SAMPLES, SAMPLING_FREQUENCY);

String deviceId = "ESP8266_" + String(ESP.getChipId(), HEX);
bool initialized = false;
double baseline = 0;
double prevZ = 0;

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("❌ WebSocket Disconnected");
      digitalWrite(LED_BUILTIN, HIGH);
      break;
    case WStype_CONNECTED:
      Serial.printf("✅ WebSocket Connected: %s\n", payload);
      digitalWrite(LED_BUILTIN, LOW);
      {
        String msg = "{\"type\":\"device_connected\",\"deviceId\":\"" + deviceId + "\"}";
        webSocket.sendTXT(msg);
        delay(500);
        webSocket.sendTXT(msg);
      }
      break;
    case WStype_TEXT:
      Serial.printf("📩 Received: %s\n", payload);
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(4, 5); // SDA, SCL
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH);

  mySensor.setWire(&Wire);
  mySensor.beginAccel();

  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
  }
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("\n✅ WiFi Connected");

  webSocket.begin(host, port, url);  // Plain ws://
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);

  Serial.println("🔧 Ready: Sampling at 200Hz");
}

void loop() {
  webSocket.loop();

  mySensor.accelUpdate();
  double z = mySensor.accelZ();

  if (!initialized) {
    baseline = z;
    prevZ = z;
    movingAverage = z;
    initialized = true;
    return;
  }

  // Update moving average
  movingAverage = (ALPHA * z) + ((1.0 - ALPHA) * movingAverage);
  
  // Store in circular buffer
  circularBuffer[bufferIndex] = z;
  bufferIndex = (bufferIndex + 1) % BUFFER_SIZE;

  // Calculate dynamic threshold
  double variance = 0;
  for (int i = 0; i < BUFFER_SIZE; i++) {
    variance += sq(circularBuffer[i] - movingAverage);
  }
  variance /= BUFFER_SIZE;
  dynamicThreshold = max(INITIAL_THRESHOLD, sqrt(variance) * 1.5);

  double deltaZ = abs(z - movingAverage);

  if (deltaZ > dynamicThreshold) {
    Serial.println("⚠ Motion Detected");

    // Faster sampling
    for (int i = 0; i < SAMPLES; i++) {
      mySensor.accelUpdate();
      vReal[i] = mySensor.accelZ() - movingAverage;  // Remove DC offset
      vImag[i] = 0;
      delayMicroseconds(4000);  // 250 Hz
    }

    // Optimize FFT processing
    FFT.windowing(FFTWindow::Hamming, FFTDirection::Forward);
    FFT.compute(FFTDirection::Forward);
    FFT.complexToMagnitude();

    // Quick peak finding
    double peakFreq = 0;
    double peakAmp = 0;
    for (int i = 1; i < SAMPLES/2; i++) {
      if (vReal[i] > peakAmp) {
        peakAmp = vReal[i];
        peakFreq = (i * SAMPLING_FREQUENCY) / SAMPLES;
      }
    }

    // Efficient JSON creation
    StaticJsonDocument<200> doc;  // Reduced size
StaticJsonDocument<300> doc;
    doc["type"] = "fft_result";
    doc["deviceId"] = deviceId;
    doc["frequency"] = round(peakFreq * 1000) / 1000.0;
    doc["amplitude"] = round(peakAmp * 1000) / 1000.0;
    doc["raw_acceleration"] = round(rawAccel * 1000) / 1000.0;
    doc["deltaZ"] = round(deltaZ * 1000) / 1000.0;
    doc["timestamp"] = millis();

    String jsonPayload;
    serializeJson(doc, jsonPayload);
    webSocket.sendTXT(jsonPayload);

    delay(500);  // Reduced recovery time
  }

  prevZ = z;
  delay(4);  // Shorter pacing delay
}
