import fs from "fs";
import path from "path";
import { OracleLocationConfig } from "../../config/env";
import { OracleWeatherReading, WeatherProvider } from "./weatherProvider";

export class MockWeatherProvider implements WeatherProvider {
  private readonly fixtures: OracleWeatherReading[];

  constructor() {
    const filePath = path.resolve(__dirname, "../../../data/sample-weather-updates.json");
    const raw = fs.readFileSync(filePath, "utf8");
    this.fixtures = JSON.parse(raw) as OracleWeatherReading[];
  }

  async fetchCurrent(location: OracleLocationConfig): Promise<OracleWeatherReading> {
    const matched = this.fixtures.find((fixture) => fixture.locationId === location.locationId);
    if (!matched) {
      return {
        locationId: location.locationId,
        timestamp: new Date().toISOString(),
        rain1h: 0,
        windSpeed: 0,
        temperature: 20,
        humidity: 50,
        weatherType: "clear",
        source: "mock",
      };
    }

    return {
      ...matched,
      source: "mock",
    };
  }
}
