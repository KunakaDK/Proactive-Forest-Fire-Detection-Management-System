import paho.mqtt.client as mqtt
import json
import joblib
import mysql.connector 
from datetime import datetime 


MQTT_BROKER = "localhost" 
MQTT_TOPIC = "building/lab/node_01/telemetry"

MODEL_FILE = "D:\\Desktop\\IoT_Project\\data_pipeline&ml\\random_forest_model\\fire_model.pkl" 

# --- DATABASE CONFIGURATION  ---

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',           
    'database': 'iot_project' 
}

# --- 2. LOAD THE BRAIN ---
print(f">>> Loading AI Model from {MODEL_FILE}...")
try:
    model = joblib.load(MODEL_FILE)
    print("Model loaded successfully!")
except FileNotFoundError:
    print("ERROR: 'fire_model.pkl' not found.")
    print("   Check the path in MODEL_FILE variable.")
    exit()

# --- 3. HELPER FUNCTIONS ---

def map_value(x, in_min, in_max, out_min, out_max):
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min

def save_to_database(node, temp, hum, smoke, risk, status):
    """
    Connects to MySQL and saves the sensor reading.
    """
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        sql = """INSERT INTO sensor_logs 
                 (node_id, temp_val, humidity_val, smoke_level, fire_risk, alert_status) 
                 VALUES (%s, %s, %s, %s, %s, %s)"""
        
        val = (node, temp, hum, smoke, risk, status)
        cursor.execute(sql, val)
        
        conn.commit()
        cursor.close()
        conn.close()
        print(f"   Data saved to Database (ID: {node})")
        
    except mysql.connector.Error as err:
        print(f"   Database Error: {err}")

# --- 4. MQTT LOGIC ---

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"Connected to MQTT Broker at {MQTT_BROKER}")
        client.subscribe(MQTT_TOPIC)
        print(f"Listening to {MQTT_TOPIC}...")
    else:
        print(f"Failed to connect. Error Code: {rc}")

def on_message(client, userdata, msg):
    try:
        # A. Receive Data
        payload_str = msg.payload.decode()
        data = json.loads(payload_str)
        
        # B. Extract Values
        # We also look for 'node_id' now to save it to the DB
        node_id = data.get('node_id', 'node_unknown') 
        raw_gas_esp32 = data.get('raw_gas', 0) 
        temp_esp32 = data.get('temp', 0)
        hum_esp32 = data.get('humidity', 50) 
        
        # C. CALIBRATION
        calibrated_gas = map_value(raw_gas_esp32, 0, 4095, 0, 1000)
        
        # D. PREDICT (AI)
        features = [[temp_esp32, hum_esp32, calibrated_gas]]
        
        prediction = model.predict(features)[0]      # 0 or 1
        probability = model.predict_proba(features)  # e.g., [0.1, 0.9]
        fire_risk_percent = probability[0][1] * 100

        # E. DETERMINE STATUS STRING (For Database)
        status_label = "SAFE"
        if prediction == 1:
            status_label = "CRITICAL"
        elif fire_risk_percent > 50:
            status_label = "WARNING"

        # F. DISPLAY & ACTION
        print("\n" + "="*40)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Node: {node_id}")
        print(f"Data -> Gas: {raw_gas_esp32} (Calib: {calibrated_gas:.0f}) | Temp: {temp_esp32}°C")
        
        if prediction == 1:
            print(f"STATUS: FIRE DETECTED! (Confidence: {fire_risk_percent:.1f}%)")
        else:
            print(f"STATUS : Normal Environment (Risk: {fire_risk_percent:.1f}%)")
            
        # G. SAVE TO SERVER (The New Part)
        save_to_database(node_id, temp_esp32, hum_esp32, calibrated_gas, fire_risk_percent, status_label)
            
    except Exception as e:
        print(f"Error processing message: {e}")

# --- 5. MAIN EXECUTION ---
client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message

print(">>> Starting Gateway...")
try:
    client.connect(MQTT_BROKER, 1883, 60)
    client.loop_forever() 
except ConnectionRefusedError:
    print("ERROR !!! Could not connect to Mosquitto Broker.")
    print(" Is Mosquitto running? (Try running 'mosquitto' in a terminal)")