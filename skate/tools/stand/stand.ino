// スケートラップ：自動で回る台（ESP32 + 270度サーボ）
// アプリ（skate/stand.js）から Bluetooth で「回る速さ（度/秒×10）」を受け取り、サーボの向きを少しずつ変える。
// 0.5 秒なにも届かなければ止まる。向きは 10〜260 度の間だけ（ケーブルが巻きつかないように）。
// 書きこみ：Arduino IDE ＋「esp32 by Espressif」ボード（3.x）。ボードは「ESP32 Dev Module」。
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>

#define SERVICE_UUID "6b1f0001-5c1e-4b8e-9a51-7a3e2c0d5ab1"
#define SPEED_UUID   "6b1f0002-5c1e-4b8e-9a51-7a3e2c0d5ab1"
#define ANGLE_UUID   "6b1f0003-5c1e-4b8e-9a51-7a3e2c0d5ab1"

const int SERVO_PIN = 18;           // サーボの信号線（黄色やオレンジ）
const float RANGE = 270.0;          // サーボの回る範囲（度）
const int PULSE_MIN = 500, PULSE_MAX = 2500; // パルスの長さ（マイクロ秒）
const float LIMIT_LO = 10, LIMIT_HI = 260;
const float MAX_ACCEL = 600;        // 度/秒² 急に動いてスマホが揺れないように

volatile float targetSpeed = 0;     // アプリから届いた速さ（度/秒）
volatile unsigned long lastCmd = 0;
float angle = RANGE / 2, speed = 0;
BLECharacteristic *angleCh;
bool connected = false;

void writeServo(float a) {
  float us = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (a / RANGE);
  ledcWrite(SERVO_PIN, (uint32_t)(us / 20000.0 * 65535));   // 50Hz・16ビット
}

class SpeedCb : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = c->getValue();
    if (v.length() >= 2) {
      int16_t x = (int16_t)((uint8_t)v[0] | ((uint8_t)v[1] << 8));
      targetSpeed = x / 10.0; lastCmd = millis();
    }
  }
};
class ServerCb : public BLEServerCallbacks {
  void onConnect(BLEServer *s) override { connected = true; }
  void onDisconnect(BLEServer *s) override { connected = false; targetSpeed = 0; BLEDevice::startAdvertising(); }
};

void setup() {
  ledcAttach(SERVO_PIN, 50, 16);
  writeServo(angle);
  BLEDevice::init("SkateStand");
  BLEServer *srv = BLEDevice::createServer();
  srv->setCallbacks(new ServerCb());
  BLEService *svc = srv->createService(SERVICE_UUID);
  BLECharacteristic *sp = svc->createCharacteristic(SPEED_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  sp->setCallbacks(new SpeedCb());
  angleCh = svc->createCharacteristic(ANGLE_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  angleCh->addDescriptor(new BLE2902());
  svc->start();
  BLEAdvertising *ad = BLEDevice::getAdvertising();
  ad->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();
}

void loop() {
  static unsigned long prev = millis(), lastNotify = 0;
  unsigned long now = millis();
  float dt = (now - prev) / 1000.0; prev = now;
  float want = (now - lastCmd > 500) ? 0 : targetSpeed;          // 届かなくなったら止まる
  float dv = want - speed, lim = MAX_ACCEL * dt;
  speed += dv > lim ? lim : (dv < -lim ? -lim : dv);
  angle += speed * dt;
  if (angle < LIMIT_LO) { angle = LIMIT_LO; speed = 0; }
  if (angle > LIMIT_HI) { angle = LIMIT_HI; speed = 0; }
  writeServo(angle);
  if (connected && now - lastNotify > 200) {
    int16_t a = (int16_t)(angle * 10); angleCh->setValue((uint8_t *)&a, 2); angleCh->notify(); lastNotify = now;
  }
  delay(10);
}
