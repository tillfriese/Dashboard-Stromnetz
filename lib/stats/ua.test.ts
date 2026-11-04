import { describe, expect, it } from "vitest";
import { isBot, parseUA } from "./ua";

const UA = {
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  firefoxWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
};

describe("parseUA", () => {
  it("classifies browser, OS and device with major versions only", () => {
    expect(parseUA(UA.chromeMac)).toEqual({ device: "desktop", browser: "Chrome", browserVersion: "141", os: "macOS", osVersion: null });
    expect(parseUA(UA.safariIphone)).toEqual({ device: "mobile", browser: "Safari", browserVersion: "18", os: "iOS", osVersion: "18" });
    expect(parseUA(UA.firefoxWin)).toMatchObject({ browser: "Firefox", browserVersion: "139", os: "Windows", device: "desktop" });
    expect(parseUA(UA.edge)).toMatchObject({ browser: "Edge", browserVersion: "141" });
    expect(parseUA(UA.androidTablet).device).toBe("tablet");
    expect(parseUA(UA.androidPhone)).toMatchObject({ device: "mobile", os: "Android", osVersion: "14" });
  });
});

describe("isBot", () => {
  it("filters crawlers, scripts, monitors and headless browsers", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "curl/8.7.1",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
      "node-fetch",
      "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
      "",
    ]) {
      expect(isBot(ua), ua).toBe(true);
    }
    expect(isBot(UA.chromeMac)).toBe(false);
    expect(isBot(UA.safariIphone)).toBe(false);
  });
});
