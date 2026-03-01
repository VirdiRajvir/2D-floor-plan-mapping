import serial
import os
import time
import csv
import sys
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler
import joblib
import pandas as pd

# ==========================================
# CONFIGURATION
# ==========================================
# CHANGE THIS to your ESP32-C3 port from the Arduino IDE!!
SERIAL_PORT = '/dev/cu.usbmodem101' 
BAUD_RATE = 115200

# The 10 Metric States (3x3 Grid + Baseline)
CLASSES = {
    0: "ROOM CLEAR (Baseline)",
    1: "Position (-1.0, 1.0)",
    2: "Position ( 0.0, 1.0)",
    3: "Position ( 1.0, 1.0)",
    4: "Position (-1.0, 0.0)",
    5: "Position ( 0.0, 0.0)",
    6: "Position ( 1.0, 0.0)",
    7: "Position (-1.0, -1.0)",
    8: "Position ( 0.0, -1.0)",
    9: "Position ( 1.0, -1.0)"
}

# Coordinate Mapping (X, Y)
GRID_MAP = {
    0: (0.0, 0.0),
    1: (-1.0, 1.0),
    2: (0.0, 1.0),
    3: (1.0, 1.0),
    4: (-1.0, 0.0),
    5: (0.0, 0.0),
    6: (1.0, 0.0),
    7: (-1.0, -1.0),
    8: (0.0, -1.0),
    9: (1.0, -1.0)
}

# The threshold for "Environmental Instability" (Debris Falling)
# Increase this if the dashboard triggers warnings too easily.
STABILITY_THRESHOLD = 45.0

# ==========================================
# PHASE 1: DATA COLLECTION
# ==========================================
def collect_data(class_id, samples_needed=500):
    print(f"\n--- COLLECTING DATA FOR: {CLASSES[class_id]} ---")
    print(f"Please setup the room for this state.")
    input("Press ENTER when ready...")
    
    # 10-Second "Move into Position" Countdown
    print("\nStarting in:")
    for i in range(10, 0, -1):
        sys.stdout.write(f"\r  >>> {i} SECONDS (Move to position and STAY STILL!) ")
        sys.stdout.flush()
        time.sleep(1)
    print("\n\n--- RECORDING STARTED ---")
    
    try:
        # Robust Serial Open: Reset the ESP32 to ensure clean state
        ser = serial.Serial(None, BAUD_RATE, timeout=0.1)
        ser.port = SERIAL_PORT
        ser.open()
        
        # Toggle DTR/RTS to force reboot
        ser.setDTR(False)
        ser.setRTS(False)
        time.sleep(1)
        ser.setDTR(True)
        ser.setRTS(True)
        time.sleep(1) # Wait for reboot
        ser.flushInput()
        
        print("Connected to ESP32-C3. Syncing...")
        
        # Sync Loop: Wait for "READY" signal
        sync_start = time.time()
        while time.time() - sync_start < 10:
            line = ser.readline().decode('utf-8', errors='replace').strip()
            if "READY" in line or "RSSI" in line:
                print(">>> [SYNC]: ESP32 is ALIVE and Streaming.")
                break
            sys.stdout.write(".")
            sys.stdout.flush()
            time.sleep(0.1)
            
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    filename = f"csi_data_class_{class_id}.csv"
    
    with open(filename, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['RSSI', 'Energy', 'ActivityScore', 'Label'])
        
        count = 0
        last_receive_time = time.time()
        
        while count < samples_needed:
            try:
                line = ser.readline().decode('utf-8', errors='replace').strip()
                
                if line:
                    last_receive_time = time.time()
                
                if "RSSI:" in line and "ActivityScore:" in line:
                    parts = line.split(',')
                    try:
                        rssi = float(parts[0].split(':')[1])
                        energy = float(parts[1].split(':')[1])
                        activity = float(parts[2].split(':')[1])
                    except:
                        continue # Skip malformed lines
                        
                    writer.writerow([rssi, energy, activity, class_id])
                    count += 1
                    
                    sys.stdout.write(f"\rRecording: {count}/{samples_needed} ")
                    sys.stdout.flush()
                elif "READY" in line:
                    # Heartbeat received but no CSI data yet
                    if count == 0:
                        sys.stdout.write("\r[SIGNAL]: Waiting for CSI Packets from Sender...   ")
                        sys.stdout.flush()
                elif line:
                    # If we get a line that's NOT CSI data, show it once in a while
                    # to help the user diagnose connection issues.
                    if count == 0 or time.time() - last_receive_time < 0.5:
                        sys.stdout.write(f"\r[ESP]: {line:<60}\r")
                        sys.stdout.flush()
                
                # If we've heard NOTHING for 5 seconds, warn the user
                if time.time() - last_receive_time > 5:
                    sys.stdout.write(f"\r[WAITING]: No serial data received from {SERIAL_PORT}...    ")
                    sys.stdout.flush()
                    
                time.sleep(0.01) # Save CPU
            except Exception as e:
                pass
                
    ser.close()
    print(f"\nFinished saving {filename}")

# ==========================================
# PHASE 2: TRAIN AI MODEL
# ==========================================
def train_model():
    print("\n--- TRAINING AI MODEL ---")
    all_data = []
    
    # Get the directory of the script to load CSVs correctly regardless of launch path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"\n>>> [PATH DEBUG]: Looking for data in: {script_dir}")
    
    # Load all 10 CSV files
    for i in range(10):
        try:
            file_path = os.path.join(script_dir, f"csi_data_class_{i}.csv")
            df = pd.read_csv(file_path)
            
            # --- ROBUST CLEANING ---
            # 1. Skip the first 100 samples (stabilization period for EMA and Median)
            if len(df) > 150: 
                df = df.iloc[100:].reset_index(drop=True)
            
            # 2. Remove uninitialized or impossible RSSI values (e.g., 0.0 or -100)
            df = df[df['RSSI'] < 0]
            # -----------------------

            all_data.append(df)
        except Exception as e:
            print(f"Error: Could not find or process csi_data_class_{i}.csv. {e}")
            return
            
    # Feature Engineering Loop
    processed_dfs = []
    window_size = 20 
    
    # 1. Calculate Baseline (Class 0) Mean for Normalization
    baseline_df = all_data[0]
    b_rssi = baseline_df['RSSI'].mean()
    b_energy = baseline_df['Energy'].mean()
    print(f">>> [CALIBRATION]: Baseline RSSI: {b_rssi:.2f}, Energy: {b_energy:.2f}")

    for df in all_data:
        # Create Delta Features (Relative to Empty Room)
        df['RSSI_d'] = df['RSSI'] - b_rssi
        df['Energy_d'] = df['Energy'] - b_energy
        
        cols = ['RSSI_d', 'Energy_d', 'ActivityScore']
        
        # Calculate 18 Windowed Features
        df_mean = df[cols].rolling(window=window_size).mean()
        df_std = df[cols].rolling(window=window_size).std()
        df_min = df[cols].rolling(window=window_size).min()
        df_max = df[cols].rolling(window=window_size).max()
        df_skew = df[cols].rolling(window=window_size).skew() # NEW: Distribution Shape
        
        df_features = pd.concat([df_mean, df_std, df_min, df_max, df_skew], axis=1)
        df_features.columns = [
            'R_m', 'E_m', 'A_m', 
            'R_s', 'E_s', 'A_s',
            'R_min', 'E_min', 'A_min',
            'R_max', 'E_max', 'A_max',
            'R_sk', 'E_sk', 'A_sk' # Skewness (is the signal asymmetrical?)
        ]
        
        # --- NEW: INTERACTION FEATURES ---
        df_features['R_rng'] = df_features['R_max'] - df_features['R_min']
        df_features['R_A_int'] = df_features['R_m'] * df_features['A_m']
        
        df_features['Label'] = df['Label']
        processed_dfs.append(df_features.dropna())
        
    combined_df = pd.concat(processed_dfs)
    
    # 2. Split data: Non-random segment split
    feature_cols = ['R_m','E_m','A_m','R_s','E_s','A_s','R_min','E_min','A_min','R_max','E_max','A_max', 'R_sk', 'E_sk', 'A_sk', 'R_rng', 'R_A_int']
    X_train_list, X_test_list, y_train_list, y_test_list = [], [], [], []
    
    for label in combined_df['Label'].unique():
        df_label = combined_df[combined_df['Label'] == label]
        split_idx = int(len(df_label) * 0.8)
        
        X_train_list.append(df_label.iloc[:split_idx][feature_cols])
        X_test_list.append(df_label.iloc[split_idx:][feature_cols])
        y_train_list.append(df_label.iloc[:split_idx]['Label'])
        y_test_list.append(df_label.iloc[split_idx:]['Label'])

    X_train = pd.concat(X_train_list)
    X_test = pd.concat(X_test_list)
    y_train = pd.concat(y_train_list)
    y_test = pd.concat(y_test_list)

    # 3. Data Augmentation: Add "Synthetic Noise" (Jitter)
    # This forces the AI to learn patterns, not exact numbers.
    noise = np.random.normal(0, 0.05, X_train.shape)
    X_train_augmented = X_train + noise
    
    # 4. STANDARDIZATION: The Secret Sauce for "Quiet Zones"
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train_augmented.values)
    X_test_scaled = scaler.transform(X_test.values)

    # High-Robustness Forest
    print(f"Training ROBUST Forest on {len(X_train_augmented)} samples...")
    model = RandomForestClassifier(
        n_estimators=200, 
        max_depth=10, 
        min_samples_leaf=3,
        random_state=42
    )
    model.fit(X_train_scaled, y_train.values)
    
    # Save the Baseline Calibration and Scaler
    model.baseline_rssi = b_rssi
    model.baseline_energy = b_energy
    model.scaler = scaler
    
    # Test Accuracy
    predictions = model.predict(X_test_scaled)
    acc = accuracy_score(y_test, predictions)
    print(f"Model Accuracy: {acc * 100:.2f}%")
    
    # Save the trained brain
    model_path = os.path.join(script_dir, 'rf_tomography_model.pkl')
    joblib.dump(model, model_path)
    print("\n" + "="*40)
    print(f"✅ SUCCESS: Model saved to {model_path}")
    print("The Radar is now synchronized with 17 features.")
    print("="*40)

# ==========================================
# FFT BREATHING DETECTOR
# ==========================================
def detect_breathing(activity_buffer, sample_rate=20.0):
    """
    Uses FFT to detect periodic breathing signatures (0.15-0.6 Hz)
    in the ActivityScore stream.
    Returns: (is_breathing: bool, breath_rate_bpm: float, power: float)
    """
    if len(activity_buffer) < 60:
        return False, 0.0, 0.0
    
    signal = np.array(activity_buffer)
    signal = signal - np.mean(signal)
    
    window = np.hanning(len(signal))
    signal = signal * window
    
    fft_vals = np.abs(np.fft.rfft(signal))
    freqs = np.fft.rfftfreq(len(signal), d=1.0/sample_rate)
    
    breathing_mask = (freqs >= 0.15) & (freqs <= 0.6)
    
    if not np.any(breathing_mask):
        return False, 0.0, 0.0
    
    breathing_power = fft_vals[breathing_mask]
    breathing_freqs = freqs[breathing_mask]
    
    peak_idx = np.argmax(breathing_power)
    peak_power = breathing_power[peak_idx]
    peak_freq = breathing_freqs[peak_idx]
    breath_rate_bpm = peak_freq * 60.0
    
    total_power = np.sum(fft_vals[1:]) + 1e-9
    breathing_ratio = peak_power / total_power
    
    is_breathing = breathing_ratio > 0.12 and peak_power > 0.5
    
    return is_breathing, breath_rate_bpm, peak_power

# ==========================================
# Z-SCORE SPIKE DETECTOR (replaces hard threshold)
# ==========================================
def detect_spike(activity_history, current_activity, z_threshold=3.0):
    """
    Uses statistical Z-Score to adaptively detect activity spikes.
    A spike is flagged when the current value exceeds the rolling
    mean by more than z_threshold standard deviations.
    This adapts to the room's noise floor — no manual tuning needed.
    Returns: (is_spike: bool, z_score: float)
    """
    if len(activity_history) < 30:
        return False, 0.0
    
    arr = np.array(activity_history)
    mu = np.mean(arr)
    sigma = np.std(arr) + 1e-6  # Avoid division by zero
    
    z = (current_activity - mu) / sigma
    
    return z > z_threshold, z


# ==========================================
# PHASE 3: LIVE PREDICTION DEMO
# ==========================================
def live_demo():
    print("\n--- STARTING LIVE HACKATHON DEMO ---")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(script_dir, 'rf_tomography_model.pkl')
    try:
        model = joblib.load(model_path)
    except:
        print("Error: Could not load model. Did you train it first?")
        return
        
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
    except:
        print("Failed to connect to ESP32.")
        return
        
    # Clear screen for a premium feel
    os.system('clear')
    print("\n" + "="*50)
    print("      🚀 DISASTER RESCUE: AI RADAR ACTIVATED")
    print("="*50)
    print("Monitoring LIVE WiFi CSI Stream... (Ctrl+C to Stop)\n")

    history = []
    raw_buffer = [] 
    window_size = 20
    
    # Restore Calibration and Scaler
    b_rssi = getattr(model, 'baseline_rssi', -60.0)
    b_energy = getattr(model, 'baseline_energy', 6.5)
    scaler = getattr(model, 'scaler', None)

    feature_cols = ['R_m','E_m','A_m','R_s','E_s','A_s','R_min','E_min','A_min','R_max','E_max','A_max', 'R_sk', 'E_sk', 'A_sk', 'R_rng', 'R_A_int']
    
    last_stable_prediction = 0
    consecutive_hits = 0
    
    # --- DYNAMIC BASELINE STATE ---
    stable_rssi_buffer = [] 
    stable_energy_buffer = []
    was_transient = False
    recalibrating = False
    
    # --- FFT BREATHING DETECTION ---
    breathing_buffer = []
    BREATHING_BUFFER_SIZE = 100
    
    # --- Z-SCORE SPIKE DETECTION ---
    activity_history = []  # Rolling baseline of activity levels
    ACTIVITY_HISTORY_SIZE = 200  # ~10 seconds of data


    try:
        while True:
            line = ser.readline().decode('utf-8', errors='replace').strip()
            if "RSSI:" in line and "ActivityScore:" in line:
                parts = line.split(',')
                try:
                    raw_rssi = float(parts[0].split(':')[1])
                    raw_energy = float(parts[1].split(':')[1])
                    rssi = raw_rssi - b_rssi # Delta
                    energy = raw_energy - b_energy # Delta
                    activity = float(parts[2].split(':')[1])
                except: continue
                
                # Feed the FFT breathing buffer
                breathing_buffer.append(activity)
                if len(breathing_buffer) > BREATHING_BUFFER_SIZE:
                    breathing_buffer.pop(0)
                
                # Update stable buffers for re-calibration
                if activity < 1.0:
                    stable_rssi_buffer.append(raw_rssi)
                    stable_energy_buffer.append(raw_energy)
                    if len(stable_rssi_buffer) > 15: stable_rssi_buffer.pop(0)
                
                raw_buffer.append([rssi, energy, activity])
                if len(raw_buffer) < window_size:
                    sys.stdout.write(f"\rStabilizing Radar... ({len(raw_buffer)}/{window_size})")
                    sys.stdout.flush()
                    continue
                
                if len(raw_buffer) > window_size: raw_buffer.pop(0)
                
                buffer_arr = np.array(raw_buffer)
                means = np.mean(buffer_arr, axis=0)
                stds = np.std(buffer_arr, axis=0)
                mins = np.min(buffer_arr, axis=0)
                maxs = np.max(buffer_arr, axis=0)
                
                # Manual Skewness calculation
                skews = []
                for i in range(3):
                    diff = buffer_arr[:, i] - means[i]
                    skews.append(np.mean(diff**3) / (stds[i]**3 + 1e-6))
                
                r_rng = maxs[0] - mins[0]
                r_a_int = means[0] * means[2]
                
                # Combine all 17 features
                input_vector = np.concatenate([means, stds, mins, maxs, skews, [r_rng, r_a_int]]).reshape(1, -1)
                
                # SCALE the input using the saved training scaler
                if scaler:
                    input_vector = scaler.transform(input_vector)
                
                prediction = model.predict(input_vector)[0]
                probs = model.predict_proba(input_vector)[0]
                confidence = max(probs) * 100
                
                # --- Z-SCORE SPIKE DETECTOR (adaptive, no manual threshold) ---
                is_transient, z_score = detect_spike(activity_history, activity, z_threshold=3.0)
                is_urgent = activity > STABILITY_THRESHOLD
                
                # Feed the activity history (only non-spike values to keep baseline clean)
                if not is_transient:
                    activity_history.append(activity)
                    if len(activity_history) > ACTIVITY_HISTORY_SIZE:
                        activity_history.pop(0)
                
                # Update stable buffers for re-calibration (only when not moving)
                if activity < 2.0 and not is_transient:
                    stable_rssi_buffer.append(raw_rssi)
                    stable_energy_buffer.append(raw_energy)
                    if len(stable_rssi_buffer) > 20: stable_rssi_buffer.pop(0)
                else:
                    if is_transient:
                        stable_rssi_buffer = []
                        stable_energy_buffer = []

                # Detect LANDING
                if not is_transient and was_transient:
                    recalibrating = True 
                
                if recalibrating and len(stable_rssi_buffer) >= 12:
                    new_b_rssi = np.mean(stable_rssi_buffer)
                    new_b_energy = np.mean(stable_energy_buffer)
                    rssi_shift = abs(new_b_rssi - b_rssi)
                    
                    if rssi_shift > 0.1:
                        # --- ONE-SHOT OBJECT LOCALIZATION ---
                        # Use the current input vector (which contains the shift) to tell where it landed
                        obj_prediction = prediction
                        pos_x, pos_y = GRID_MAP[obj_prediction]
                        radius = max(0.5, 3.5 / (rssi_shift + 0.1))
                        
                        sys.stdout.write(f"\n>>> [OBJECT LANDED]: Position [{pos_x:.1f}m, {pos_y:.1f}m] | Radius: ~{radius:.1f}m\n")
                        
                        b_rssi = new_b_rssi
                        b_energy = new_b_energy
                    
                    recalibrating = False 
                
                was_transient = is_transient

                # REFINED SMOOTHING
                if is_transient or is_urgent or recalibrating:
                    # Clear history during motion spikes to prevent "Coordinate Sticking"
                    history = [] 
                    smoothed_prediction = prediction
                    recalibrating = False 
                elif confidence > 85:
                    smoothed_prediction = prediction
                else:
                    history.append(prediction)
                    if len(history) > 10: history.pop(0)
                    smoothed_prediction = max(set(history), key=history.count)
                
                # High-Precision Display
                sys.stdout.write("\033[K") 
                
                if is_urgent:
                    sys.stdout.write(f"\r >>> [URGENT]: ⚠️ STRUCTURAL COLLAPSE / HEAVY IMPACT        | STRENGTH: {activity:>5.1f}")
                elif is_transient:
                    sys.stdout.write(f"\r >>> [MOTION]: ☄️ TRANSIENT OBJECT DETECTED             | ENERGY: {activity:>5.1f}")
                elif smoothed_prediction == 0:
                    sys.stdout.write(f"\r >>> [ANALYSIS]: {CLASSES[0]:<30} | CONFIDENCE: {confidence:>5.1f}%")
                else:
                    pos_x, pos_y = GRID_MAP[smoothed_prediction]
                    
                    # --- FFT BREATHING CHECK ---
                    is_breathing, _, _ = detect_breathing(breathing_buffer)
                    
                    if is_breathing:
                        sys.stdout.write(f"\r >>> [COORD]: [{pos_x:>4.1f}m, {pos_y:>4.1f}m] | TYPE: 🫁 SURVIVOR  | CONF: {confidence:>5.1f}%")
                    elif activity > 0.5:
                        sys.stdout.write(f"\r >>> [COORD]: [{pos_x:>4.1f}m, {pos_y:>4.1f}m] | TYPE: SURVIVOR   | CONF: {confidence:>5.1f}%")
                    else:
                        sys.stdout.write(f"\r >>> [COORD]: [{pos_x:>4.1f}m, {pos_y:>4.1f}m] | TYPE: STATIC OBJ | CONF: {confidence:>5.1f}%")
                
                sys.stdout.flush()
                
    except KeyboardInterrupt:
        print("\nDemo stopped by user.")
    except Exception as e:
        print(f"\n[ERROR]: Demo crashed: {e}")
            
    ser.close()

# ==========================================
# MENU
# ==========================================
if __name__ == "__main__":
    while True:
        print("\n" + "="*40)
        print("   MISSION CONTROL: METRIC RADAR DASHBOARD")
        print("="*40)
        print(" 0. BASELINE (Empty Room)")
        print("-" * 15 + " TREND LINE " + "-" * 15)
        print(" 1. (-1, 1) | 2. ( 0, 1) | 3. ( 1, 1) [TOP]")
        print(" 4. (-1, 0) | 5. ( 0, 0) | 6. ( 1, 0) [MID]")
        print(" 7. (-1,-1) | 8. ( 0,-1) | 9. ( 1,-1) [BOT]")
        print("-" * 40)
        print(" T. TRAIN AI MODEL")
        print(" D. RUN LIVE DEMO")
        print(" X. Exit")
        
        choice = input("\nSelect Grid Point to Record (0-9, T, D, X): ").upper()
        
        if choice in ['0','1','2','3','4','5','6','7','8','9']: 
            collect_data(int(choice))
        elif choice == 'T': train_model()
        elif choice == 'D': live_demo()
        elif choice == 'X': break
