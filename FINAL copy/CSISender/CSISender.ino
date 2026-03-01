#include <WiFi.h>
#include <esp_now.h>

// Broadcast MAC address (sends to all devices nearby)
uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  // 1. Set device as a Wi-Fi Station (but do not connect to a router)
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  // 2. Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return;
  }

  // 3. Register the broadcast peer
  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, broadcastAddress, 6);
  peerInfo.channel = 1;
  peerInfo.encrypt = false;
  
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add peer");
    return;
  }
  
  Serial.println("=== CSI SENDER READY ===");
  Serial.println("Broadcasting 50 packets per second on Channel 1...");
}

void loop() {
  static uint32_t packet_counter = 0;
  packet_counter++;
  
  esp_now_send(broadcastAddress, (uint8_t *) &packet_counter, sizeof(packet_counter));
  
  delay(20);
}