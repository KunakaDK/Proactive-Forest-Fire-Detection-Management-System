#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ==================== CONFIGURATION WiFi ====================
const char* ssid = "Redmi Note 11 Pro";
const char* password = "1234567890";

// ==================== CONFIGURATION API ====================
const char* serverUrl = "http://10.55.112.100:5000/api/mesures";
const char* apiKey = "esp32_test_key_ABC123XYZ";

// ==================== CONFIGURATION CAPTEURS ====================
#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

#define FLAME_DIGITAL_PIN 15
#define FLAME_ANALOG_PIN 5
#define MQ2_PIN 35

// IDs des capteurs
const int CAPTEUR_TEMPERATURE_ID = 10;
const int CAPTEUR_HUMIDITE_ID = 11;
const int CAPTEUR_FUMEE_ID = 13;
const int CAPTEUR_FLAMME_ID = 12;

// Variables
int compteur = 0;
bool flammeDetecteeAvant = false;
bool mq2Prechauffe = false;
unsigned long mq2StartTime = 0;
int MQ2_BASE_VALUE = 0;  // Valeur de base du MQ-2

// ==================== CALIBRATION MQ-2 ====================
int calibrerMQ2() {
  Serial.println("\n🔧 Calibration MQ-2...");
  Serial.println("   Pas de fumée pendant la calibration !");
  
  int total = 0;
  int nb_lectures = 20;
  
  for (int i = 0; i < nb_lectures; i++) {
    int valeur = analogRead(MQ2_PIN);
    total += valeur;
    Serial.print(".");
    delay(500);
  }
  
  int valeur_base = total / nb_lectures;
  Serial.println();
  Serial.print("✓ Valeur de base (air propre): ");
  Serial.print(valeur_base);
  Serial.print(" / 4095 (");
  Serial.print((valeur_base * 100.0) / 4095.0, 1);
  Serial.println("%)");
  
  return valeur_base;
}

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // Initialiser DHT11 a
  pinMode(DHTPIN, INPUT);
  delay(2000);
  dht.begin();
  
  pinMode(FLAME_DIGITAL_PIN, INPUT);
  pinMode(MQ2_PIN, INPUT);
  
  Serial.println("✓ Capteurs initialisés");
  
  mq2StartTime = millis();
  
  // Afficher MAC
  Serial.print("\nAdresse MAC: ");
  Serial.println(WiFi.macAddress());
  
  // Connexion WiFi
  Serial.print("\nConnexion au WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int tentatives = 0;
  while (WiFi.status() != WL_CONNECTED && tentatives < 30) {
    delay(500);
    Serial.print(".");
    tentatives++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi connecté !");
    Serial.print("Adresse IP ESP32: ");
    Serial.println(WiFi.localIP());
    Serial.print("Force signal (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm\n");
  } else {
    Serial.println("\n✗ Échec WiFi !");
  }
}

// ==================== LOOP ====================
void loop() {
  // Préchauffage MQ-2
  if (!mq2Prechauffe) {
    unsigned long elapsed = (millis() - mq2StartTime) / 1000;
    if (elapsed < 30) {
      Serial.print("\r MQ-2 préchauffage: ");
      Serial.print(30 - elapsed);
      Serial.print("s     ");
      delay(5000);
      return;
    } else {
      mq2Prechauffe = true;
      Serial.println("\n✓ MQ-2 prêt !");
      
      // CALIBRATION
      MQ2_BASE_VALUE = calibrerMQ2();
      Serial.println("\n Démarrage des mesures...\n");
      delay(2000);
    }
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("✗ WiFi déconnecté");
    WiFi.reconnect();
    delay(5000);
    return;
  }
  
  compteur++;
  Serial.println("\n========================================");
  Serial.println("Mesure #" + String(compteur));
  Serial.println("========================================");
  
  // ===== LECTURE CAPTEURS =====
  
  // 1. DHT11
  float temperature = dht.readTemperature();
  float humidite = dht.readHumidity();
  
  // 2. KY-026
  int flammeDigital = digitalRead(FLAME_DIGITAL_PIN);
  
  // 3. MQ-2 CALIBRÉ
  int rawGas = analogRead(MQ2_PIN);
  int rawGas_calibre = max(0, rawGas - MQ2_BASE_VALUE);
  float gasCalibrated = map(rawGas_calibre, 0, max(1, 4095 - MQ2_BASE_VALUE), 0, 1000);
  
  // Vérifier DHT11
  if (isnan(temperature) || isnan(humidite)) {
    Serial.println("✗ Erreur DHT11 !");
    delay(5000);
    return;
  }
  
  // ===== AFFICHAGE =====
  
  Serial.println("\n--- Température ---");
  Serial.print("  ");
  Serial.print(temperature, 1);
  Serial.println();
  
  Serial.println("\n--- Humidité ---");
  Serial.print("  ");
  Serial.print(humidite, 1);
  Serial.println();
  
  Serial.println("\n--- MQ-2 Fumée/Gaz ---");
  Serial.print("  Raw: ");
  Serial.print(rawGas);
  Serial.print(" | Base: ");
  Serial.print(MQ2_BASE_VALUE);
  Serial.print(" | Calibré: ");
  Serial.print(rawGas_calibre);
  Serial.print(" | ppm: ");
  Serial.println(gasCalibrated, 0);
  
  Serial.println("\n--- KY-026 Flamme ---");
  Serial.print("  ");
  Serial.println(flammeDigital == LOW ? " FLAMME !" : "✓ Pas de flamme");
  
 
  // ===== ENVOI =====
  Serial.println("\n--- Envoi ---");
  
  bool ok = true;
  ok &= envoyerMesure(CAPTEUR_TEMPERATURE_ID, temperature);
  delay(500);
  ok &= envoyerMesure(CAPTEUR_HUMIDITE_ID, humidite);
  delay(500);
  ok &= envoyerMesure(CAPTEUR_FUMEE_ID, gasCalibrated);
  delay(500);
  ok &= envoyerMesure(CAPTEUR_FLAMME_ID, flammeDigital == LOW ? 1.0 : 0.0);
  
  if (ok) {
    Serial.println("\n✅ Toutes les données envoyées");
  }
  
  Serial.println("\nProchaine mesure dans 10s...");
  delay(10000);
}

// ==================== ENVOI ====================
bool envoyerMesure(int capteurId, float valeur) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }
  
  HTTPClient http;
  StaticJsonDocument<256> doc;
  doc["capteur_id"] = capteurId;
  doc["valeur"] = valeur;
  
  String jsonData;
  serializeJson(doc, jsonData);
  
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", apiKey);
  http.setTimeout(10000);
  
  int httpCode = http.POST(jsonData);
  
  bool succes = (httpCode == 201);
  if (succes) {
    Serial.print("✓ ");
  } else {
    Serial.print("✗ ");
    Serial.print("HTTP ");
    Serial.print(httpCode);
    Serial.print(" ");
  }
  
  http.end();
  return succes;
}