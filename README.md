# 🌲 Proactive Forest Fire Detection & Management System

### End-to-End IoT, Machine Learning, and Web Monitoring Solution

An advanced full-stack IoT solution designed for early fire detection in forest or building environments. This system integrates Edge Computing for data acquisition, a Machine Learning Gateway for accurate risk prediction, and a secure **Backend-for-Frontend (BFF)** Web Application for real-time visualization and administration.

-----

## 🚀 Key Features

### 🔥 IoT & Machine Learning (Edge & Middleware)

  * **Multi-Sensor Data Acquisition:** Real-time monitoring of Temperature, Humidity, and Smoke/Gas levels using ESP32.
  * **Intelligent Processing:** Utilizes a **Random Forest Classifier** to distinguish between actual fires and false alarms (e.g., hot days vs. combustion).
  * **Auto-Calibration:** Software-based calibration mapping raw sensor values (ADC) to standardized datasets.
  * **Robust Communication:** MQTT protocol (Mosquitto) for reliable low-latency data transmission.
  * **Centralized Logging:** Logs raw data, risk probabilities, and alert statuses into a MySQL database.

### 🌐 Web Dashboard (Frontend & BFF)

  * **Secure Proxy Architecture:** Uses a Python/Flask **Backend-for-Frontend** pattern to handle JWT authentication and proxy requests to the backend API.
  * **Interactive Mapping:** **LeafletJS** integration to visualize sensor nodes and their status (Normal vs. Alert) on a map.
  * **Real-Time Analytics:** **Chart.js** visualization for historical temperature, humidity, and gas trends.
  * **Role-Based Administration:** Dedicated Admin panel for managing users and configuring sensor nodes.

-----

## 🛠️ System Architecture

The system operates on a modular Pub/Sub and Proxy architecture:

1.  **Edge Layer:** **ESP32** reads raw analog/digital data.
2.  **Transport Layer:** Data is serialized to JSON and sent via **MQTT**.
3.  **Processing Layer:** A **Python Gateway** loads a pre-trained `.pkl` model, normalizes data, predicts fire risk, and writes to **MySQL**.
4.  **API Layer:** A remote REST API exposes the data (running on a VM/Server).
5.  **Application Layer:** The **Flask BFF** connects the user's browser to the API securely.

-----

## 📦 Requirements

### Hardware

  * **Microcontroller:** ESP32 Dev Kit V1
  * **Sensors:** MQ-2/MQ-135 (Gas), DHT11/DHT22 (Temp/Hum), IR Flame Sensor (Optional)
  * **Connectivity:** Wi-Fi (2.4GHz)

### Software & Stack

  * **Embedded:** VS Code + PlatformIO (C++)
  * **ML/Gateway:** Python 3.9+, Scikit-learn, Pandas, Paho-MQTT
  * **Web App:** Python 3.11+ (Flask), HTML5, CSS3, JavaScript (Vanilla)
  * **Infrastructure:** Mosquitto MQTT Broker, MySQL (XAMPP)

-----

## 📂 Project Structure

```text
IoT-Fire-Detection/
├── 📂 ESP32_Firmware/          # Embedded C++ Code (PlatformIO)
│   ├── platformio.ini          # Library dependencies
│   └── src/main.cpp            # Sensor logic & MQTT publishing
│
├── 📂 Server_Side/             # ML Gateway & Processing
│   ├── fire_data.csv           # Training dataset
│   ├── train_model.py          # Script to generate .pkl model
│   ├── fire_model.pkl          # Compiled Random Forest Model
│   └── gateway.py              # Orchestrator (MQTT -> ML -> DB)
│
└── 📂 fire_monitor_app/        # Web Application (Flask BFF)
    ├── app.py                  # Server (Proxy, Auth, Routes)
    ├── static/                 # CSS & JS (Leaflet, Charts)
    └── templates/              # HTML Templates (Login, Dashboard, Admin)
```

-----

## ⚙️ Installation & Setup

### Phase 1: Database & Infrastructure

1.  Ensure **Mosquitto MQTT** is running.
2.  Start **MySQL** (via XAMPP or service).
3.  Create the database schema:
    ```sql
    CREATE DATABASE iot_project;
    USE iot_project;
    CREATE TABLE sensor_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        node_id VARCHAR(50),
        temp_val FLOAT,
        humidity_val FLOAT,
        smoke_level FLOAT,
        fire_risk FLOAT,
        alert_status VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ```

### Phase 2: The Gateway (ML Brain)

1.  Navigate to `Server_Side` and install dependencies:
    ```bash
    pip install pandas scikit-learn joblib paho-mqtt mysql-connector-python
    ```
2.  Train the AI model:
    ```bash
    python train_model.py
    # Output: fire_model.pkl created.
    ```
3.  Start the Gateway:
    ```bash
    python gateway.py
    # Output: 📡 Listening...
    ```

### Phase 3: The Edge (ESP32)

1.  Open `ESP32_Firmware` in PlatformIO.
2.  Edit `src/main.cpp`: Update `ssid`, `password`, and `mqtt_server`.
3.  Upload firmware to the ESP32.
      * *Verification:* The Python Gateway terminal should show incoming data and fire predictions.

### Phase 4: The Web Application

1.  Navigate to `fire_monitor_app`:
    ```bash
    cd fire_monitor_app
    pip install -r requirements.txt
    ```
    *(Requires Flask, requests)*
2.  Start the Web Server:
    ```bash
    python app.py
    ```
3.  Access the dashboard at **`http://127.0.0.1:5001`**.

-----

## 🏃‍♂️ Usage & Testing

### 1\. Monitoring

Once logged in, the **Dashboard** will display:

  * **Map:** Markers indicating sensor locations.
  * **Status:** Green (Normal) or Red (Fire Detected).
  * **Live Graphs:** Click on a node to see historical data for Gas, Temp, and Humidity.

### 2\. Default Credentials

To access the Admin panel or Login:

| Role | Username | Password |
| :--- | :--- | :--- |
| **Admin** | `admin` | `admin` |

### 3\. API Configuration

The Web App acts as a proxy. Ensure the remote API is reachable at the address defined in `app.py`:

> **Default Remote API:** `http://192.168.1.100:5000/api`


## 🛡️ Security Note

The Web App utilizes a **JWT Proxy** pattern.

  * The frontend **never** stores the JWT in LocalStorage.
  * The Flask server manages the session and injects the `Authorization: Bearer <token>` header into every request sent to the Remote API.
  * If the API returns `401 Unauthorized`, the user is automatically logged out.
