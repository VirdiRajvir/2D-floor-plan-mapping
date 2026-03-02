import { NextRequest, NextResponse } from 'next/server';

interface SensorReading {
  time: number;
  x: number;
  y: number;
  z: number;
}

interface PathPoint {
  x: number;
  y: number;
  time: number;
}

function parseSensorCSV(csvText: string): SensorReading[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const readings: SensorReading[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((s) => s.replace(/"/g, '').trim());
    if (parts.length < 4) continue;

    const time = parseFloat(parts[0]);
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);

    if (!isNaN(time) && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
      readings.push({ time, x, y, z });
    }
  }

  return readings;
}

function smoothReadings(readings: SensorReading[], windowSize: number = 5): SensorReading[] {
  const half = Math.floor(windowSize / 2);
  return readings.map((r, i) => {
    let sx = 0, sy = 0, sz = 0, count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(readings.length - 1, i + half); j++) {
      sx += readings[j].x;
      sy += readings[j].y;
      sz += readings[j].z;
      count++;
    }
    return { time: r.time, x: sx / count, y: sy / count, z: sz / count };
  });
}

function interpolateReading(readings: SensorReading[], targetTime: number): SensorReading {
  if (readings.length === 0) return { time: targetTime, x: 0, y: 0, z: 0 };
  if (readings.length === 1) return readings[0];
  let i = 0;
  while (i < readings.length - 1 && readings[i + 1].time < targetTime) i++;
  if (i >= readings.length - 1) return readings[readings.length - 1];
  if (targetTime <= readings[0].time) return readings[0];

  const r0 = readings[i];
  const r1 = readings[i + 1];
  const dt = r1.time - r0.time;
  if (dt === 0) return r0;
  
  const t = (targetTime - r0.time) / dt;
  return {
    time: targetTime,
    x: r0.x + t * (r1.x - r0.x),
    y: r0.y + t * (r1.y - r0.y),
    z: r0.z + t * (r1.z - r0.z),
  };
}

function calculatePath(linearAccel: SensorReading[], gyroscope: SensorReading[]) {
  if (linearAccel.length < 2 || gyroscope.length < 2) {
    return { points: [{ x: 0, y: 0, time: 0 }], totalDistance: 0, duration: 0 };
  }

  const smoothedAccel = smoothReadings(linearAccel, 5);
  const smoothedGyro = smoothReadings(gyroscope, 3);

  let heading = 0;
  let vx = 0, vy = 0;
  let px = 0, py = 0;
  let totalDistance = 0;

  const path: PathPoint[] = [{ x: 0, y: 0, time: smoothedAccel[0].time }];

  for (let i = 1; i < smoothedAccel.length; i++) {
    const dt = smoothedAccel[i].time - smoothedAccel[i - 1].time;
    if (dt <= 0 || dt > 0.1) continue;

    const gyro = interpolateReading(smoothedGyro, smoothedAccel[i].time);
    heading += gyro.z * dt;

    const ax = smoothedAccel[i].x;
    const ay = smoothedAccel[i].y;
    const accelMag = Math.sqrt(ax * ax + ay * ay);

    const worldAx = ax * Math.cos(heading) - ay * Math.sin(heading);
    const worldAy = ax * Math.sin(heading) + ay * Math.cos(heading);

    vx += worldAx * dt;
    vy += worldAy * dt;

    // Simple ZUPT
    if (accelMag < 0.4) {
      vx = 0;
      vy = 0;
    }

    const prevPx = px;
    const prevPy = py;
    px += vx * dt;
    py += vy * dt;

    totalDistance += Math.sqrt((px - prevPx) ** 2 + (py - prevPy) ** 2);
    path.push({ x: px, y: py, time: smoothedAccel[i].time });
  }

  const duration = path.length > 1 ? path[path.length - 1].time - path[0].time : 0;

  return {
    points: path,
    totalDistance: Math.round(totalDistance * 100) / 100,
    duration: Math.round(duration * 100) / 100,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const linearAccelFile = formData.get('linearAccelerometer') as File | null;
    const gyroscopeFile = formData.get('gyroscope') as File | null;

    if (!linearAccelFile || !gyroscopeFile) {
      return NextResponse.json(
        { error: 'Both linearAccelerometer and gyroscope CSV files are required' },
        { status: 400 }
      );
    }

    const [linAccelText, gyroText] = await Promise.all([
      linearAccelFile.text(),
      gyroscopeFile.text(),
    ]);

    const linAccelData = parseSensorCSV(linAccelText);
    const gyroData = parseSensorCSV(gyroText);

    if (linAccelData.length === 0 || gyroData.length === 0) {
      return NextResponse.json(
        { error: 'CSV files appear to be empty or malformatted' },
        { status: 400 }
      );
    }

    const result = calculatePath(linAccelData, gyroData);

    return NextResponse.json({
      success: true,
      path: result,
      metadata: {
        linearAccelSamples: linAccelData.length,
        gyroscopeSamples: gyroData.length,
        timeRange: {
          start: linAccelData[0].time,
          end: linAccelData[linAccelData.length - 1].time,
        },
      },
    });
  } catch (error) {
    console.error('CSV processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process CSV data' },
      { status: 500 }
    );
  }
}
