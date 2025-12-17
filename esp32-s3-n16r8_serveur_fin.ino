#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ==================== CONFIGURATION WiFi ====================
const char* ssid = "Redmi Note 11 Pro";
const char* password = "1234567890";

// ==================== CONFIGURATION API ====================
const char* serverUrl = "http://10.55.112.100:5000/api/mesures";
const char* apiKey = "noeud_api_key_eNQCYSNNSyamxxfmiOTOA9ZtBJZHC-7FqTis9epLr48";

// ==================== CONFIGURATION CAPTEURS ====================
// DHT11
#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// KY-026 Détecteur de flamme
#define FLAME_DIGITAL_PIN 15
#define FLAME_ANALOG_PIN 5

// MQ-3 Capteur de gaz
#define MQ3_PIN 6

// Seuils MQ-3
#define SMOKE_THRESHOLD_LOW 500
#define SMOKE_THRESHOLD_HIGH 700
#define SMOKE_THRESHOLD_CRITICAL 900

const int CAPTEUR_TEMPERATURE_ID = 116;
const int CAPTEUR_HUMIDITE_ID = 117;
const int CAPTEUR_FLAMME_ID = 118;
const int CAPTEUR_FUMEE_ID = 119;

// Variables
int compteur = 0;
bool mq3Prechauffe = false;
unsigned long mq3StartTime = 0;

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=== ESP32-S3 Node===");
  Serial.print("MAC: ");
  Serial.println(WiFi.macAddress());

  // Configuration pins
  pinMode(DHTPIN, INPUT);
  pinMode(FLAME_DIGITAL_PIN, INPUT);
  pinMode(FLAME_ANALOG_PIN, INPUT);
  pinMode(MQ3_PIN, INPUT);

  dht.begin();
  delay(2000);

  Serial.println("Capteurs: DHT11(4) KY-026(15,5) MQ-3(6)");

  // Préchauffage MQ-3
  Serial.println("MQ-3 prechauffage 120s...");
  mq3StartTime = millis();

  // WiFi
  Serial.print("WiFi: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\nConnecte - IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nEchec WiFi");
  }

  Serial.println("=== Initialisation terminee ===\n");
}

// ==================== LOOP ====================
void loop() {
  // Vérifier préchauffage MQ-3
  if (!mq3Prechauffe) {
    unsigned long elapsed = (millis() - mq3StartTime) / 1000;
    if (elapsed < 30) {
      if (elapsed % 10 == 0) {
        Serial.print("Prechauffage: ");
        Serial.print(30 - elapsed);
        Serial.println("s");
      }
      delay(1000);
      return;
    } else {
      mq3Prechauffe = true;
      Serial.println("MQ-3 pret\n");
    }
  }

  // Vérifier WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi perdu - reconnexion...");
    WiFi.reconnect();
    delay(5000);
    return;
  }

  compteur++;

  // === LECTURE CAPTEURS ===
  float temperature = dht.readTemperature();
  float humidite = dht.readHumidity();

  if (isnan(temperature) || isnan(humidite)) {
    Serial.println("Erreur DHT11");
    delay(5000);
    return;
  }

  int rawGas = analogRead(MQ3_PIN);
  float smokeLevel = map(rawGas, 0, 8191, 0, 1000) * 1.5;  // Calibration MQ-3

  int flammeDigital = digitalRead(FLAME_DIGITAL_PIN);

  // === AFFICHAGE ===
  Serial.print("[");
  Serial.print(compteur);
  Serial.print("] T:");
  Serial.print(temperature, 1);
  Serial.print("C H:");
  Serial.print(humidite, 1);
  Serial.print("% S:");
  Serial.print(smokeLevel, 0);
  Serial.print("ppm F:");

  // === ENVOI API ===
  int success = 0;

  if (envoyerMesure(CAPTEUR_TEMPERATURE_ID, temperature, rawGas)) success++;
  delay(200);

  if (envoyerMesure(CAPTEUR_HUMIDITE_ID, humidite, rawGas)) success++;
  delay(200);

  if (envoyerMesure(CAPTEUR_FUMEE_ID, smokeLevel, rawGas)) success++;
  delay(200);

  float flammeValeur = (flammeDigital == LOW) ? 0.0 : 1.0;
  if (envoyerMesure(CAPTEUR_FLAMME_ID, flammeValeur, rawGas)) success++;

  Serial.print("Envoye: ");
  Serial.print(success);
  Serial.println("/4\n");

  delay(10000);
}

// ==================== FONCTION ENVOI ====================
bool envoyerMesure(int capteurId, float valeur, int rawGas) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", apiKey);
  http.setTimeout(10000);

  StaticJsonDocument<512> doc;
  doc["capteur_id"] = capteurId;
  doc["valeur"] = valeur;

  JsonObject metadata = doc.createNestedObject("metadata");
  metadata["raw_gas"] = rawGas;
  metadata["rssi"] = WiFi.RSSI();

  String jsonData;
  serializeJson(doc, jsonData);

  int httpCode = http.POST(jsonData);
  http.end();

  return (httpCode == 201);
}