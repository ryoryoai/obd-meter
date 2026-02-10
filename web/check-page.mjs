import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[error] ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });

  try {
    await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('Navigation error:', e.message);
  }

  await page.waitForTimeout(3000);

  // Screenshot Dashboard (default tab)
  await page.screenshot({ path: 'F:/projects/obd-meter/web/screenshot-dashboard.png' });
  console.log('Screenshot: dashboard');

  // Tab click via data-testid attribute (react-native-web renders testID as data-testid)
  const tabScreenshots = [
    { testId: 'tab-battery', file: 'screenshot-battery.png', name: 'Battery' },
    { testId: 'tab-hv-system', file: 'screenshot-hvsystem.png', name: 'HV System' },
    { testId: 'tab-climate', file: 'screenshot-climate.png', name: 'Climate' },
    { testId: 'tab-analysis', file: 'screenshot-analysis.png', name: 'Analysis' },
    { testId: 'tab-settings', file: 'screenshot-settings.png', name: 'Settings' },
  ];

  for (const tab of tabScreenshots) {
    try {
      const locator = page.locator(`[data-testid="${tab.testId}"]`);
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `F:/projects/obd-meter/web/${tab.file}` });
      console.log(`Screenshot: ${tab.name}`);
    } catch (e) {
      console.log(`${tab.name} error:`, e.message?.substring(0, 200));
    }
  }

  console.log('\n=== CONSOLE ERRORS ===');
  errors.forEach((e) => console.log(e));
  console.log(`\nTotal errors: ${errors.length}`);

  await browser.close();
})();
