import Papa from 'papaparse';
import { SensorReading } from './types';

export interface CSVParseResult {
  linearAccelerometer: SensorReading[];
  gyroscope: SensorReading[];
  accelerometer: SensorReading[];
  gravity: SensorReading[];
}

function parseSensorCSV(csvText: string): SensorReading[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  const readings: SensorReading[] = [];
  for (const row of result.data as Record<string, unknown>[]) {
    const keys = Object.keys(row);
    if (keys.length < 4) continue;

    const time = parseFloat(String(row[keys[0]] ?? '0'));
    const x = parseFloat(String(row[keys[1]] ?? '0'));
    const y = parseFloat(String(row[keys[2]] ?? '0'));
    const z = parseFloat(String(row[keys[3]] ?? '0'));

    if (!isNaN(time) && !isNaN(x) && !isNaN(y) && !isNaN(z)) {
      readings.push({ time, x, y, z });
    }
  }

  return readings;
}

export async function parseCSVFile(file: File): Promise<SensorReading[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        resolve(parseSensorCSV(text));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function parseCSVText(csvText: string): SensorReading[] {
  return parseSensorCSV(csvText);
}

/**
 * Detect which type of sensor data a CSV file contains based on headers
 */
export function detectCSVType(csvText: string): 'linearAccelerometer' | 'gyroscope' | 'accelerometer' | 'gravity' | 'barometer' | 'unknown' {
  const firstLine = csvText.split('\n')[0]?.toLowerCase() ?? '';
  
  if (firstLine.includes('rad/s')) return 'gyroscope';
  if (firstLine.includes('gravity')) return 'gravity';
  if (firstLine.includes('hpa')) return 'barometer';
  // Linear accelerometer and regular accelerometer both have m/s^2
  // but we differentiate by filename or context
  if (firstLine.includes('m/s^2')) return 'accelerometer';
  
  return 'unknown';
}
