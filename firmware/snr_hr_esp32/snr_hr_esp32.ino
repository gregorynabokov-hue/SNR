// СНР OS: прошивка ESP32 — пульс с Pulse Sensor по Bluetooth LE (стандартный сервис Heart Rate 0x180D).
// Плата: классический ESP32 (WROOM). Датчик: питание 3,3 В, сигнал на GPIO34.
// Arduino IDE: плата «ESP32 Dev Module», пакет esp32 от Espressif.
// Статус: НЕ СОБРАНО И НЕ ПРОВЕРЕНО на железе. Проверить при первом запуске.

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <string.h>

static const int      PIN_SIGNAL = 34;
static const uint32_t SAMPLE_MS  = 10;     // ~100 Гц
static const uint32_t REPORT_MS  = 1000;   // отправка раз в секунду
static const uint32_t REFRACT_MS = 300;    // не чаще ~200 ударов в минуту
static const float    MIN_AMP    = 15.0f;  // меньше — палец не на датчике

BLECharacteristic *hrChar = nullptr;
bool connected = false;

const int WIN = 8;
float buf[WIN];
int   bi = 0;
float baseline = 0;
float peakAmp  = 0;
bool  above = false;
uint32_t lastPeak = 0;
uint32_t lastReport = 0;
uint32_t lastSample = 0;

uint32_t ib[5];
int ibCount = 0;
int bpm = 0;

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer *) override {
    connected = true;
    Serial.println("BLE: подключено");
  }
  void onDisconnect(BLEServer *) override {
    connected = false;
    Serial.println("BLE: отключено, снова ищем");
    BLEDevice::startAdvertising();
  }
};

void setupBLE() {
  BLEDevice::init("SNR-HR");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  BLEService *svc = server->createService(BLEUUID((uint16_t)0x180D));
  hrChar = svc->createCharacteristic(BLEUUID((uint16_t)0x2A37), BLECharacteristic::PROPERTY_NOTIFY);
  hrChar->addDescriptor(new BLE2902());
  svc->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(BLEUUID((uint16_t)0x180D));
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void pushInterval(uint32_t d) {
  if (ibCount < 5) {
    ib[ibCount++] = d;
  } else {
    memmove(ib, ib + 1, 4 * sizeof(uint32_t));
    ib[4] = d;
  }
}

// Один отсчёт АЦП: сглаживание, убираем медленный дрейф, ищем подъём над порогом.
void processSample(int raw) {
  buf[bi] = raw;
  bi = (bi + 1) % WIN;
  float s = 0;
  for (int i = 0; i < WIN; i++) s += buf[i];
  float sm = s / WIN;

  baseline = baseline * 0.995f + sm * 0.005f;
  float x = sm - baseline;
  peakAmp = max(peakAmp * 0.995f, x);

  uint32_t now = millis();
  float th = peakAmp * 0.5f;
  if (!above && peakAmp > MIN_AMP && x > th && now - lastPeak > REFRACT_MS) {
    above = true;
    if (lastPeak > 0) {
      uint32_t d = now - lastPeak;
      if (d > 300 && d < 2000) pushInterval(d);  // 30–200 уд/мин
    }
    lastPeak = now;
  } else if (above && x < th * 0.6f) {
    above = false;
  }
}

void computeBpm() {
  if (peakAmp < MIN_AMP || ibCount < 3) {
    bpm = 0;
    return;
  }
  uint32_t sum = 0;
  for (int i = 0; i < ibCount; i++) sum += ib[i];
  float avg = (float)sum / ibCount;
  bpm = (int)(60000.0f / avg + 0.5f);
  if (bpm < 40 || bpm > 200) bpm = 0;
}

void setup() {
  Serial.begin(115200);
  analogSetPinAttenuation(PIN_SIGNAL, ADC_11db);  // диапазон до 3,3 В
  pinMode(PIN_SIGNAL, INPUT);
  setupBLE();
  Serial.println("SNR-HR запущен");
}

void loop() {
  uint32_t now = millis();

  if (now - lastSample >= SAMPLE_MS) {
    lastSample = now;
    processSample(analogRead(PIN_SIGNAL));
  }

  if (now - lastReport >= REPORT_MS) {
    lastReport = now;
    computeBpm();
    Serial.printf("bpm=%d amp=%.1f ble=%d\n", bpm, peakAmp, connected ? 1 : 0);
    if (connected && bpm > 0) {
      // Формат Heart Rate Measurement: флаги 0x00 (uint8 без контакта), затем значение.
      uint8_t payload[2] = {0x00, (uint8_t)bpm};
      hrChar->setValue(payload, 2);
      hrChar->notify();
    }
  }
}
