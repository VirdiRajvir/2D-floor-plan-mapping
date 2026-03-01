# WiFi Radar for Disaster Rescue 🚀

## What This Project Does

Imagine being able to "see through walls" using nothing but regular WiFi signals. This project transforms your WiFi-enabled devices into a powerful radar system that can detect and locate people or objects in a room – **without cameras, without privacy concerns, and without expensive equipment.**

Think of it like echolocation that dolphins use, but with WiFi signals instead of sound waves. When WiFi signals bounce off objects and people, they create unique "fingerprints" that our AI system learns to recognize and locate.

## The Real-World Problem It Solves

**Search and Rescue in Disaster Zones**

When buildings collapse during earthquakes, fires, or other disasters, rescue teams face a critical challenge: they can't see who's trapped inside, where they are, or whether they're alive. Traditional methods like thermal cameras are expensive and require line-of-sight. Our system uses something that's already everywhere: WiFi.

### Key Capabilities:

1. **Detect Survivors**: Identify if someone is present in a collapsed building
2. **Pinpoint Location**: Determine their precise coordinates on a 3x3 grid (covering a ~2m x 2m area)
3. **Detect Breathing**: Use sophisticated signal analysis to identify living humans versus static objects
4. **Monitor Movement**: Detect when debris shifts or when someone is trying to move
5. **Real-time Alerts**: Instant notifications when structural instability is detected

## How It Works (Simple Version)

### The Three Components:

1. **The Sender** (Broadcasting Device)
   - A small ESP32 microcontroller that continuously broadcasts WiFi signals
   - Think of it as a "WiFi lighthouse" that sends out pulses 50 times per second
   - Can be positioned outside or at the edge of a disaster zone

2. **The Receiver** (Sensing Device)
   - Another ESP32 that "listens" to how those WiFi signals change after bouncing off objects
   - Like a WiFi ear that can detect the tiniest changes in signal patterns
   - Captures what's called "Channel State Information" (CSI) – the DNA of WiFi signals

3. **The AI Brain** (Python Dashboard)
   - A smart computer program that learns to interpret the WiFi signal patterns
   - Trained to recognize 10 different scenarios (empty room + 9 positions in a 3x3 grid)
   - Makes real-time predictions about what's happening in the monitored space

### The Magic Behind The Scenes:

When a person stands in a room with WiFi signals bouncing around, they affect those signals in very specific ways:
- Their body absorbs and reflects signals differently than furniture or walls
- When they breathe, it creates tiny rhythmic changes in the signals
- Their exact position creates a unique "signal fingerprint"

Our AI system learns these fingerprints during a training phase, then uses that knowledge to instantly recognize and locate people in real-time.

## The Complete Workflow

### Phase 1: Training the System
1. Place the WiFi sender and receiver at opposite ends of a room
2. Record data for 10 different scenarios:
   - Empty room (baseline)
   - Person standing at 9 different grid positions
3. For each position, collect 500 data points (about 25 seconds of recording)
4. The AI learns the unique WiFi pattern for each position

### Phase 2: The AI Learning Process
- The system analyzes 17 different features from the WiFi signals:
  - Signal strength variations
  - Energy levels
  - Activity patterns
  - Statistical properties (mean, standard deviation, min, max, shape)
- A Random Forest classifier (a type of AI) is trained on this data
- The AI achieves high accuracy (typically >90%) in distinguishing positions

### Phase 3: Live Detection
- The system continuously monitors WiFi signals in real-time
- Every 50 milliseconds, it analyzes the current signal pattern
- It compares this pattern against its trained knowledge
- It outputs:
  - Current coordinates if someone is detected
  - Whether they're moving or stationary
  - Whether breathing is detected (life signs!)
  - Alerts if major structural changes occur

## Key Innovation: Breathing Detection

One of the most remarkable features is the ability to detect human breathing through walls. Here's how:

- Human breathing causes periodic chest movements (12-20 breaths per minute)
- These movements create tiny, rhythmic changes in WiFi signals
- We use a mathematical technique called Fast Fourier Transform (FFT) to identify these periodic patterns
- The system filters out noise and looks specifically for the frequency range of human breathing (0.15-0.6 Hz)
- When detected, it displays a "🫁 SURVIVOR" indicator

This single feature can make the difference between life and death in rescue operations.

## Use Cases Beyond Disaster Rescue

While built for emergency response, this technology has many applications:

- **Elderly Care**: Monitor whether someone has fallen and needs help
- **Home Security**: Detect intruders without cameras (privacy-friendly)
- **Smart Buildings**: Occupancy detection for energy management
- **Healthcare**: Non-contact vital signs monitoring
- **Smart Homes**: Gesture recognition through walls for controlling devices

## Why This Matters

**Cost**: Uses ~$20 worth of ESP32 microcontrollers instead of $10,000+ specialized equipment

**Privacy**: No cameras, no images – just signal patterns that can't identify individuals

**Accessibility**: Works through walls, in darkness, through smoke – anywhere WiFi signals reach

**Speed**: Real-time detection with updates 20 times per second

**Portability**: The entire system fits in a backpack and runs on battery power

## The Grid System

The monitored area is divided into a 3x3 grid (like a tic-tac-toe board):

```
    -1m     0m      +1m
     |       |       |
1m  [1]----[2]----[3]     TOP ROW
     |       |       |
0m  [4]----[5]----[6]     MIDDLE ROW
     |       |       |
-1m [7]----[8]----[9]     BOTTOM ROW
```

Position 5 (0,0) is the center. Position 0 represents an empty room (baseline).

## System Requirements

- **Hardware**: 
  - 2x ESP32-C3 microcontrollers (or similar ESP32 variants)
  - USB cables for power and programming
  - A WiFi hotspot or router

- **Software**:
  - Arduino IDE (for programming the ESP32 devices)
  - Python 3.7+ (for running the AI dashboard)
  - Basic Python libraries (all installable via pip)

## Quick Start Guide

1. **Setup Hardware**:
   - Program one ESP32 with the Sender code
   - Program the other ESP32 with the Receiver code
   - Place them 2-3 meters apart, facing each other

2. **Collect Training Data**:
   - Run the Python dashboard
   - Record data for each of the 10 positions
   - Stand still for 25 seconds at each position

3. **Train the AI**:
   - Select "Train AI Model" from the menu
   - Wait 30-60 seconds for training to complete

4. **Start Detection**:
   - Select "Run Live Demo"
   - Watch as the system tracks your position in real-time!

## Safety and Limitations

- **Range**: Works best within 2-5 meters
- **Accuracy**: Position accuracy is approximately ±0.5m
- **Interference**: Metal walls or water significantly block signals
- **Calibration**: Requires retraining if the room layout changes significantly
- **Safety**: Uses standard WiFi power levels – completely safe for humans

## Future Enhancements

- Multi-room tracking
- Tracking multiple people simultaneously
- 3D positioning (adding height detection)
- Integration with drone systems for autonomous rescue operations
- Machine learning improvements for better accuracy through various materials

## The Bottom Line

This project proves that revolutionary technology doesn't always require expensive equipment. With creative thinking, affordable components, and smart algorithms, we can build systems that save lives. WiFi signals are everywhere – we've just learned to use them in a completely new way.

---

**Project Status**: Fully functional prototype
**Last Updated**: March 2026
**License**: Educational/Research Use

For technical details, see TECHNICAL_README.md
