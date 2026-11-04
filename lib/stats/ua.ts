/*
 * Minimal user-agent classification: device type, browser and OS family with major version only.
 * Deliberately coarse – no full UA string is stored.
 */

export type UaInfo = { device: "mobile" | "tablet" | "desktop"; browser: string; browserVersion: string | null; os: string; osVersion: string | null };

const BOT =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|preview|curl|wget|python|httpx|go-http|java\/|okhttp|axios|node-fetch|undici|headless|phantom|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|healthcheck|statuscake|datadog|zgrab|nmap|scan/i;

/** Known bots, crawlers, monitoring tools, scripts and headless browsers. Empty UA counts as bot. */
export function isBot(ua: string | null | undefined): boolean {
  return !ua || ua.length < 20 || BOT.test(ua);
}

function major(ua: string, re: RegExp): string | null {
  return re.exec(ua)?.[1] ?? null;
}

export function parseUA(ua: string): UaInfo {
  const isTablet = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua);
  const isMobile = !isTablet && /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua);

  let browser = "Andere";
  let browserVersion: string | null = null;
  if (/Edg(e|A|iOS)?\//.test(ua)) [browser, browserVersion] = ["Edge", major(ua, /Edg(?:e|A|iOS)?\/(\d+)/)];
  else if (/OPR\/|Opera/.test(ua)) [browser, browserVersion] = ["Opera", major(ua, /(?:OPR|Opera)\/(\d+)/)];
  else if (/SamsungBrowser\//.test(ua)) [browser, browserVersion] = ["Samsung Internet", major(ua, /SamsungBrowser\/(\d+)/)];
  else if (/Firefox\/|FxiOS\//.test(ua)) [browser, browserVersion] = ["Firefox", major(ua, /(?:Firefox|FxiOS)\/(\d+)/)];
  else if (/Chrome\/|CriOS\//.test(ua)) [browser, browserVersion] = ["Chrome", major(ua, /(?:Chrome|CriOS)\/(\d+)/)];
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) [browser, browserVersion] = ["Safari", major(ua, /Version\/(\d+)/)];

  let os = "Andere";
  let osVersion: string | null = null;
  if (/iPhone|iPad|iPod/.test(ua)) [os, osVersion] = ["iOS", major(ua, /OS (\d+)_/)];
  else if (/Android/.test(ua)) [os, osVersion] = ["Android", major(ua, /Android (\d+)/)];
  else if (/Windows NT/.test(ua)) [os, osVersion] = ["Windows", null]; // NT 10.0 covers 10 and 11
  else if (/CrOS/.test(ua)) [os, osVersion] = ["ChromeOS", null];
  else if (/Mac OS X/.test(ua)) [os, osVersion] = ["macOS", null]; // version frozen in UA strings
  else if (/Linux/.test(ua)) [os, osVersion] = ["Linux", null];

  return { device: isTablet ? "tablet" : isMobile ? "mobile" : "desktop", browser, browserVersion, os, osVersion };
}
