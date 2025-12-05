import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import confusion_matrix

# --- 1. CONFIGURATION ---
DATA_FILE = "D:\\Desktop\\IoT_Project\\data_pipeline&ml\\random_forest_model\\fire_data.csv"   # Your dataset
MODEL_FILE = "D:\\Desktop\\IoT_Project\\data_pipeline&ml\\random_forest_model\\fire_model.pkl" # The brain we will save

# --- 2. LOAD DATA ---
print(">>> Loading dataset...")
try:
    df = pd.read_csv(DATA_FILE)
except FileNotFoundError:
    print(f"ERROR: Could not find {DATA_FILE}. Make sure it is in the same folder!")
    exit()

# We only use features that match your ESP32: Temp, Humidity, and H2 (Gas)
# 'raw_h2' in the dataset is similar to your MQ-2 sensor
features = ['temperature', 'humidity', 'raw_h2']
target = 'fire_alarm'

X = df[features]
y = df[target]

# --- 3. SPLIT DATA ---
# 80% for training the brain, 20% for testing it
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# --- 4. TRAIN MODEL ---
print(">>> Training Random Forest Model...")
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# --- 5. EVALUATE ---
print(">>> Evaluating...")
accuracy = model.score(X_test, y_test) * 100
print(f"Model Accuracy: {accuracy:.2f}%")
print("\nConfusion Matrix (Errors vs Correct):")
print(confusion_matrix(y_test, model.predict(X_test)))

# --- 6. SAVE THE MODEL ---
print(f">>> Saving model to {MODEL_FILE}...")
joblib.dump(model, MODEL_FILE) 
print("DONE! You can now use 'fire_model.pkl' in your gateway.")