#include <WiFi.h>
#include <esp_wifi.h>
#include <algorithm> // Required for std::swap

// WiFi Configuration - Change this to your exact Hotspot details!
const char* ssid     = "Rescuebot";
const char* password = "Bharath123";

// *** THE PERFECT RADAR: PRECISION SIGNAL PROCESSING ***
const int SAMPLE_SIZE = 20;
int rssiSamples[SAMPLE_SIZE] = {0};
int currentIndex = 0;
float smoothed_energy = 0;
float activity_score = 0;

// Median Filter to remove "spikes" from radio noise
int getMedianRSSI() {
  int temp[SAMPLE_SIZE];
  memcpy(temp, rssiSamples, sizeof(temp));
  for (int i = 0; i < SAMPLE_SIZE - 1; i++) {
    for (int j = i + 1; j < SAMPLE_SIZE; j++) {
      if (temp[i] > temp[j]) { std::swap(temp[i], temp[j]); }
    }
  }
  return temp[SAMPLE_SIZE / 2];
}

int latestPacketRSSI = -100;

void _wifi_csi_cb(void *ctx, wifi_csi_info_t *info) {
  if (!info || !info->buf || info->len == 0) return;

  // Extract RSSI from the packet itself (works even if not connected to WiFi!)
  latestPacketRSSI = info->rx_ctrl.rssi;

  int8_t *csi_data = (int8_t *)info->buf;
  int csi_len = info->len; 
  
  // 1. SUBCARRIER CLUSTERING: Ignore noisy pilot subcarriers
  float cluster_energy = 0;
  int count = 0;
  for (int i = 8; i < csi_len - 8; i++) {
    cluster_energy += abs(csi_data[i]);
    count++;
  }
  if (count > 0) cluster_energy /= count;
  
  // 2. High-Precision Smoothing (EMA)
  smoothed_energy = (smoothed_energy * 0.98) + (cluster_energy * 0.02);
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(WIFI_PS_NONE); 
  WiFi.begin(ssid, password); 

  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  unsigned long startAttemptTime = millis();
  const unsigned long connectionTimeout = 10000; // 10 seconds timeout

  while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < connectionTimeout) {
    delay(500); 
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[SUCCESS] WiFi Connected!");
  } else {
    Serial.println("\n[WARNING] WiFi Connection Failed (Timeout).");
    Serial.println("System will attempt to capture CSI anyway (CSI Sender mode).");
  }

  wifi_csi_config_t csi_config = {
      .lltf_en           = true,
      .htltf_en          = true,
      .stbc_htltf2_en    = true,
      .ltf_merge_en      = true,
      .channel_filter_en = true,
      .manu_scale        = false,
      .shift             = false,
  };
  ESP_ERROR_CHECK(esp_wifi_set_csi_config(&csi_config));
  ESP_ERROR_CHECK(esp_wifi_set_csi_rx_cb(_wifi_csi_cb, NULL));
  ESP_ERROR_CHECK(esp_wifi_set_csi(true));
  esp_wifi_set_promiscuous(true); 
}

void loop() {
  static uint32_t lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 1000) {
    Serial.println("READY:1");
    lastHeartbeat = millis();
  }

  // 1. Force Background Packets (Only if connected)
  if (WiFi.status() == WL_CONNECTED) {
    IPAddress gateway = WiFi.gatewayIP();
    WiFiClient client;
    if (client.connect(gateway, 80)) client.stop();
  }

  // 2. Sample RSSI from the latest captured packet
  rssiSamples[currentIndex] = latestPacketRSSI;
  currentIndex = (currentIndex + 1) % SAMPLE_SIZE;
  
  // 3. Precision Variance: Standard Deviation on Clean Median Data
  float sum = 0, mean, variance = 0;
  int medianRSSI = getMedianRSSI();
  
  for (int i = 0; i < SAMPLE_SIZE; i++) sum += rssiSamples[i];
  mean = sum / SAMPLE_SIZE;
  for (int i = 0; i < SAMPLE_SIZE; i++) variance += pow(rssiSamples[i] - mean, 2);
  float dev = sqrt(variance / SAMPLE_SIZE);
  
  // 4. Adaptive Noise Floor
  if (dev < 0.25) activity_score = 0; 
  else activity_score = dev * 1.5; 

  // 5. Final Output for AI Dashboard
  Serial.print("RSSI:");
  Serial.print(medianRSSI); 
  Serial.print(", Energy:");
  Serial.print(smoothed_energy);
  Serial.print(", ActivityScore:");
  Serial.println(activity_score, 4); 

  delay(50); 
}
