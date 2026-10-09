// PoolsEye alarm node — ESP32 + DFPlayer Mini + speaker (0001.mp3 on the microSD card).
// Polls the backend's GET /api/alarm/device and sounds a siren while it returns "alarm": true
// (an unresolved drowning alert, or the manual alarm switched on from the admin dashboard).

#include <WiFi.h>
#include <HTTPClient.h>
#include <DFRobotDFPlayerMini.h>

const int DF_RX = 16;     // ESP32 RX2 ← DFPlayer TX
const int DF_TX = 17;     // ESP32 TX2 → DFPlayer RX
const int DF_VOLUME = 28; // 0–30
const int ALARM_TRACK = 1; // 0001.mp3 on the SD card

HardwareSerial dfSerial(2);
DFRobotDFPlayerMini dfPlayer;
bool dfReady = false;
// ---- Edit these ------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_NAME";      // 2.4 GHz network; the ESP32 has no 5 GHz radio
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
// IPv4 of the PC running the backend (ipconfig → Wi-Fi adapter). Never "localhost".
const char* ALARM_URL = "http://192.168.0.107:4000/api/alarm/device";
// Must equal ALARM_DEVICE_KEY in backend/.env
const char* DEVICE_KEY    = "YOUR_ALARM_DEVICE_KEY";
// ---------------------------------------------------------------------------

const int SPEAKER_PIN = 25;  // to the amplifier's audio input
const int LED_PIN     = 2;   // on-board LED blinks with the siren
const unsigned long POLL_MS = 1000;
const unsigned long WIFI_RETRY_MS = 15000;

bool alarmOn = false;
unsigned long lastPoll = 0;
unsigned long lastWifiAttempt = 0;

void startWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttempt = millis();
  Serial.printf("Connecting to WiFi \"%s\"...\n", WIFI_SSID);
}

bool wifiReady() {
  wl_status_t status = WiFi.status();
  if (status == WL_CONNECTED) return true;
  if (millis() - lastWifiAttempt >= WIFI_RETRY_MS) {
    Serial.printf("WiFi failed, status=%d (1=network not found, 4=wrong password, 6=no reply)\n", status);
    WiFi.disconnect();
    startWifi();
  }
  return false;
}

void pollBackend() {
  static bool wasConnected = false;
  if (!wifiReady()) {
    wasConnected = false;
    return;
  }
  if (!wasConnected) {
  wasConnected = true;
  Serial.printf("WiFi connected, ESP32 IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Signal: %d dBm\n", WiFi.RSSI());
  Serial.printf("ESP32 MAC: %s\n", WiFi.macAddress().c_str());
}

  HTTPClient http;
  http.setConnectTimeout(4000);
  http.setTimeout(4000);
  http.begin(ALARM_URL);
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    bool next = body.indexOf("\"alarm\":true") >= 0;
    if (next != alarmOn) Serial.printf("Alarm %s  %s\n", next ? "ON " : "OFF", body.c_str());
    alarmOn = next;
  } else if (code == 401) {
    Serial.println("401 Unauthorized: DEVICE_KEY does not match ALARM_DEVICE_KEY in backend/.env");
  } else {
  Serial.printf("Poll failed (%d: %s) URL=%s\n", code, http.errorToString(code).c_str(), ALARM_URL);
}
  http.end();
}

// Plays the alarm MP3 over and over while the alarm is on.
// Many DFPlayer clones ignore the loop command, so a finished track is restarted here.
void updateSiren() {
  static bool playing = false;

  if (alarmOn != playing) {
    playing = alarmOn;
    digitalWrite(LED_PIN, playing ? HIGH : LOW);
    if (dfReady) {
      if (playing) {
        dfPlayer.play(ALARM_TRACK);
        dfPlayer.enableLoop();
      } else {
        dfPlayer.stop();
      }
    }
  }

  if (!dfReady || !dfPlayer.available()) return;
  if (dfPlayer.readType() == DFPlayerPlayFinished && playing) {
    dfPlayer.play(ALARM_TRACK);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);

  dfSerial.begin(9600, SERIAL_8N1, DF_RX, DF_TX);
  delay(1000);
  dfReady = dfPlayer.begin(dfSerial);
  if (dfReady) {
    dfPlayer.volume(DF_VOLUME);
    Serial.println("DFPlayer ready");
  } else {
    Serial.println("DFPlayer not found: check TX/RX wiring (try swapping) and that the SD card is inserted");
  }

  startWifi();
}
void loop() {
  if (millis() - lastPoll >= POLL_MS) {
    lastPoll = millis();
    pollBackend();
  }
  updateSiren();
}
