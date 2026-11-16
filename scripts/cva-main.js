import { browser } from 'k6/browser';
import { Rate, Trend } from 'k6/metrics';
import { buildConsoleSummary, buildHtmlReport } from './buildHtmlReport.js';
import { buildRouteUrl } from './buildRouteUrl.js';
import {
  applyRfTableColumnFilter,
  clickChoiceByLabel,
  clickByText,
  clickIfExists,
  clickRfTableColumnText,
  createRouteMetrics,
  measure,
  selectRfMultiOption,
  selectRfOption,
  selectRfOptionByFieldLabel,
  scrollPositionPercent,
  selectRfTableColumnCheckbox,
  selectRfTableFirstRows,
  selectRfTableHeaderCheckbox,
  selectDatepicker,
  waitForExpectedTexts,
} from './share.js';
import {
  BASE_URL,
  COUNTRY,
  GRAFANA_VISUALIZATION,
  LOAD_TEST_PERFORMANCE,
  PROJECT,
  ROUTE_BASE,
  ROUTES,
  SAVE_SCREENSHOTS,
  STAGE_BY_STAGE,
  USERNAME,
  stepMetrics,
} from './routeConfig.js';

const totalJourneyMs = new Trend('cva_total_journey_ms', true);
const totalJourneyErrorRate = new Rate('cva_total_journey_error_rate');
const routeMetrics = createRouteMetrics(ROUTES);
const DEFAULT_TIMEOUT_MS = 90000;
const MAX_DURATION = __ENV.CVA_MAX_DURATION || '30m';
const VUS = Number(__ENV.CVA_VUS || 1);
const ITERATIONS = Number(__ENV.CVA_ITERATIONS || VUS);

const cvaBrowserScenario = {
  executor: 'shared-iterations',
  vus: VUS,
  iterations: ITERATIONS,
  maxDuration: MAX_DURATION,
  // executor: 'ramping-vus',
  // startVUs: 0,
  // stages: [
  //   { duration: '2m', target: 50 },   // Ramp up to 50 users
  //   { duration: '2m', target: 100 },  // Ramp up to 100 users
  //   { duration: '2m', target: 200 },  // Ramp up to 200 users
  //   { duration: '2m', target: 500 },  // Ramp up to 500 users
  //   { duration: '2m', target: 0 },    // Ramp down to 0 users
  // ],
  // gracefulRampDown: '30s',
  options: {
    browser: {
      type: 'chromium',
    },
  },
};

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    checks: ['rate>0.99'],            // 99% checks must pass
    http_req_failed: ['rate<0.01'],   // <1% request failures
    http_req_duration: ['p(95)<5000'] // P95 under 5 seconds
  },
  scenarios: {
    cva_browser_user: cvaBrowserScenario,
  },
};

export default async function () {
  const page = await browser.newPage({
    viewport: {
      width: 1366,
      height: 768,
    },
  });

  const journeyStart = Date.now();
  let journeyFailed = false;
  const runtimeState = {};
  const screenshotLabel = createScreenshotLabeler();

  try {
    await page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

    for (const route of ROUTES) {
      await runRoute(page, route, runtimeState, screenshotLabel);
    }

    if (SAVE_SCREENSHOTS) {
      await page.screenshot({ path: 'artifacts/final-page.png' }).catch(() => {});
    }
  } catch (error) {
    journeyFailed = true;
    if (SAVE_SCREENSHOTS) {
      await page.screenshot({ path: `artifacts/error-${Date.now()}.png` }).catch(() => {});
    }
    throw error;
  } finally {
    totalJourneyMs.add(Date.now() - journeyStart);
    totalJourneyErrorRate.add(journeyFailed);
    await page.close();
  }
}

async function runRoute(page, route, runtimeState, screenshotLabel) {
  await measure(routeMetrics[route.metricName], async () => {
    await openRoute(page, route, runtimeState);
    await waitForExpectedTexts(page, route.expectedTexts, route.timeoutMs);
  }, measureOptions(page, routeMetrics[route.sizeMetricName], routeMetrics[route.errorMetricName], screenshotLabel(`Open ${route.label}`)));

  for (const action of route.actions) {
    await measure(routeMetrics[action.metricName], async () => {
      await runPageAction(page, action, runtimeState);
    }, measureOptions(page, routeMetrics[action.sizeMetricName], routeMetrics[action.errorMetricName], screenshotLabel(action.label)));
  }
}

function createScreenshotLabeler() {
  let index = 0;
  return (label) => {
    index += 1;
    return `${String(index).padStart(2, '0')}_${label}`;
  };
}

function measureOptions(page, sizeMetric, errorMetric, screenshotLabel) {
  return {
    page,
    sizeMetric,
    errorMetric,
    screenshotLabel: SAVE_SCREENSHOTS ? screenshotLabel : '',
  };
}

async function runPageAction(page, action, runtimeState) {
  if (await shouldSkipAction(page, action)) {
    return;
  }

  if (action.type === 'fillInput') {
    await fillInputBySelector(page, action.selector, action.value, action.timeoutMs);
    if (action.submit !== false) {
      await page.keyboard.press(action.submitKey || 'Enter');
    }

    await waitForExpectedTexts(page, action.expectedTexts, action.timeoutMs);
    if (action.settleMs > 0) {
      await page.waitForTimeout(action.settleMs);
    }
    return;
  }

  if (action.type === 'clickText') {
    await captureActionTableRowValue(page, action, runtimeState);
    if (action.ifExists) {
      const text = action.text || action.buttonText || action.label;
      const clicked = await clickIfExists(page.getByText(text, { exact: true }));
      if (!clicked) {
        return;
      }
    } else {
      await clickByText(page, action);
    }
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'clickChoice') {
    await clickChoiceByLabel(page, action);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'rfTableColumnText') {
    await captureActionTableRowValue(page, action, runtimeState);
    await clickRfTableColumnText(page, action);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'scrollPositionPercent') {
    await scrollPositionPercent(page, action);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'selectRfOption') {
    await selectRfOption(page, action.selector, action.value, action.timeoutMs);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'selectRfOptionByFieldLabel') {
    await selectRfOptionByFieldLabel(page, action.fieldLabel, action.value, action.timeoutMs, {
      scopeSelector: action.scopeSelector,
      typeDelayMs: action.typeDelayMs,
    });
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'selectRfMultiOption') {
    await selectRfMultiOption(page, action.selector, action.value, action.timeoutMs, {
      selectionCount: action.selectionCount,
      selectorIndex: action.selectorIndex,
      typeDelayMs: action.typeDelayMs,
    });
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'datepicker') {
    await selectDatepicker(page, action);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'captureUrlParam') {
    await captureUrlParam(page, action, runtimeState);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'rfTableColumnCheckbox') {
    await selectRfTableColumnCheckbox(page, action);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'rfTableFirstRows') {
    await selectRfTableFirstRows(page, action);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'rfTableHeaderCheckbox') {
    await selectRfTableHeaderCheckbox(page, action);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'click') {
    await captureActionTableRowValue(page, action, runtimeState);
    await clickBySelector(page, action.selector, action.selectorIndex);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  if (action.type === 'rfTableColumnFilter') {
    await applyRfTableColumnFilter(page, action);
    await waitForExpectedTexts(page, action.expectedTexts, action.timeoutMs);
    if (action.settleMs > 0) {
      await page.waitForTimeout(action.settleMs);
    }
    return;
  }

  if (action.type === 'waitForText') {
    await waitForExpectedTexts(page, action.expectedTexts, action.timeoutMs);
    return;
  }

  if (action.type === 'waitForTableRowColumnText') {
    await waitForTableRowColumnText(page, action, runtimeState);
    await waitForActionExpectedTexts(page, action);
    return;
  }

  throw new Error(`Unsupported page action type: ${action.type}`);
}

async function shouldSkipAction(page, action) {
  if (!action.skipIfAnyTexts || !action.skipIfAnyTexts.length) {
    return false;
  }

  return page.evaluate((texts) => {
    const bodyText = String(document.body ? (document.body.innerText || document.body.textContent || '') : '');
    return texts.some((text) => text && bodyText.includes(text));
  }, action.skipIfAnyTexts).catch(() => false);
}

async function clickBySelector(page, selector, selectorIndex = 0) {
  const index = Number(selectorIndex || 0);
  if (index <= 0) {
    await page.locator(selector).click();
    return;
  }

  const clicked = await page.evaluate(({ selector, index }) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const target = [...document.querySelectorAll(selector)].filter(isVisible)[index];
    if (!target) {
      return false;
    }

    target.click();
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { selector, index }).catch(() => false);

  if (!clicked) {
    throw new Error(`Timed out waiting to click selector "${selector}" at index ${index}`);
  }
}

async function fillInputBySelector(page, selector, value, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate((targetSelector) => {
      const attr = 'data-k6-input-target';
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const isEditable = (element) => {
        if (!element || element.disabled || element.readOnly) {
          return false;
        }
        const tag = element.tagName.toLowerCase();
        const type = String(element.getAttribute('type') || '').toLowerCase();
        return tag === 'textarea' || (tag === 'input' && !['hidden', 'checkbox', 'radio', 'button', 'submit'].includes(type));
      };

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));
      const input = [...document.querySelectorAll(targetSelector)].find((element) => isVisible(element) && isEditable(element));
      if (!input) {
        return false;
      }

      input.setAttribute(attr, 'true');
      return true;
    }, selector).catch(() => false);

    if (found) {
      const locator = page.locator('[data-k6-input-target="true"]');
      await locator.fill(value);
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for editable input: ${selector}`);
}

async function openRoute(page, route, runtimeState) {
  const targetUrl = routeUrl(resolveRuntimeTemplate(route.path, runtimeState));
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!await isCurrentPageUrl(page, targetUrl)) {
      await navigateToRoute(page, targetUrl, route);
    }

    try {
      await waitForExpectedTexts(page, route.expectedTexts, route.timeoutMs);
      return;
    } catch (error) {
      const bodyText = await page.locator('body').textContent().catch(() => '');
      if (attempt >= maxAttempts - 1 || String(bodyText || '').trim()) {
        throw error;
      }

      await page.waitForTimeout(1000);
      await navigateToRoute(page, targetUrl, route);
    }
  }
}

async function navigateToRoute(page, targetUrl, route) {
  const timeoutMs = Number(route.navigationTimeoutMs || route.timeoutMs || DEFAULT_TIMEOUT_MS);
  let lastError = '';

  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastError = '';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      .catch((error) => {
        lastError = error && error.message ? error.message : String(error);
      });

    if (await waitForCurrentPageUrl(page, targetUrl, 5000)) {
      return;
    }

    await page.waitForTimeout(1000);
  }

  const currentUrl = await page.evaluate(() => location.href).catch(() => '');
  throw new Error(`Failed to navigate to ${targetUrl}. Current URL: ${currentUrl}${lastError ? `; last error: ${lastError}` : ''}`);
}

async function waitForCurrentPageUrl(page, targetUrl, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isCurrentPageUrl(page, targetUrl)) {
      return true;
    }

    await page.waitForTimeout(250);
  }

  return false;
}

async function isCurrentPageUrl(page, targetUrl) {
  const currentUrl = await page.evaluate(() => location.href).catch(() => '');
  return normalizeComparableUrl(currentUrl) === normalizeComparableUrl(targetUrl);
}

function normalizeComparableUrl(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.origin}${path}${url.search}`;
  } catch (error) {
    return String(value || '').replace(/\/+$/, '');
  }
}

async function waitForActionExpectedTexts(page, action) {
  if (action.settleMs > 0) {
    await page.waitForTimeout(action.settleMs);
  }

  if (!action.expectedTexts.length) {
    return;
  }

  await waitForExpectedTexts(page, action.expectedTexts, action.timeoutMs);
}

async function captureActionTableRowValue(page, action, runtimeState) {
  if (!action.rowValueStateKey) {
    return;
  }

  const matchText = action.rowMatchText || action.text || action.value;
  const cellIndex = Number(action.rowCellIndex || 0);
  const started = Date.now();
  while (Date.now() - started < action.timeoutMs) {
    const value = await page.evaluate(({ matchText, cellIndex }) => {
      const normalize = (item) => String(item || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const cellText = (cell) => String(cell ? (cell.innerText || cell.textContent || '') : '').replace(/\s+/g, ' ').trim();
      const expected = normalize(matchText);
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      const rows = [...document.querySelectorAll('tbody tr, tr')]
        .filter((row) => row.querySelectorAll('td').length && isVisible(row));
      for (const row of rows) {
        const cells = [...row.querySelectorAll('td')];
        const hasMatch = normalize(row.innerText || row.textContent).includes(expected)
          || cells.some((cell) => normalize(cell.innerText || cell.textContent).includes(expected));
        if (!hasMatch) {
          continue;
        }

        return cellText(cells[cellIndex]);
      }

      return '';
    }, { matchText, cellIndex }).catch(() => '');

    if (value) {
      runtimeState[action.rowValueStateKey] = value;
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out capturing table row value for: ${matchText}`);
}

async function waitForTableRowColumnText(page, action, runtimeState) {
  const timeoutMs = Number(action.timeoutMs || 30000);
  const rowText = action.rowText || action.rowValue || runtimeState[action.rowValueStateKey] || '';
  const expectedText = action.cellText || action.text || action.value || '';
  let lastState = null;

  if (!rowText) {
    throw new Error(`Table row wait requires rowText, rowValue, or runtime state: ${action.rowValueStateKey}`);
  }

  if (!expectedText) {
    throw new Error('Table row wait requires text, value, or cellText.');
  }

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    lastState = await page.evaluate(({ rowText, columnLabel, expectedText, tableSelector, urlIncludes, exact }) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const expectedRow = normalize(rowText);
      const expectedCell = normalize(expectedText);
      const currentUrl = location.href;

      if (urlIncludes && !currentUrl.includes(urlIncludes)) {
        return { ready: false, reason: 'url', url: currentUrl };
      }

      const root = tableSelector ? document.querySelector(tableSelector) : document;
      if (!root) {
        return { ready: false, reason: 'table root missing', url: currentUrl };
      }

      let columnIndex = -1;
      if (columnLabel) {
        const expectedColumn = normalize(columnLabel);
        const headers = [...root.querySelectorAll('th, [role="columnheader"]')];
        const header = headers.find((item) => {
          const label = normalize(item.innerText || item.textContent);
          const field = normalize(item.getAttribute('filter-item') || item.getAttribute('data-field') || item.getAttribute('name'));
          return field === expectedColumn || label === expectedColumn || label.includes(expectedColumn);
        });

        if (!header || !header.parentElement) {
          return { ready: false, reason: 'column missing', url: currentUrl };
        }

        columnIndex = [...header.parentElement.children].indexOf(header);
        if (columnIndex < 0) {
          return { ready: false, reason: 'column index missing', url: currentUrl };
        }
      }

      const horizontalOverlap = (leftA, rightA, leftB, rightB) => Math.max(0, Math.min(rightA, rightB) - Math.max(leftA, leftB));
      const matchText = (value) => {
        const normalized = normalize(value);
        return exact ? normalized === expectedCell : normalized.includes(expectedCell);
      };
      const candidateCellsForRow = (row) => {
        const cells = [...row.querySelectorAll('td')];
        const candidates = [];
        if (columnIndex >= 0 && cells[columnIndex]) {
          candidates.push(cells[columnIndex]);
        }

        if (columnLabel) {
          const expectedColumn = normalize(columnLabel);
          const header = [...root.querySelectorAll('th, [role="columnheader"]')].find((item) => {
            const label = normalize(item.innerText || item.textContent);
            const field = normalize(item.getAttribute('filter-item') || item.getAttribute('data-field') || item.getAttribute('name'));
            return field === expectedColumn || label === expectedColumn || label.includes(expectedColumn);
          });

          if (header) {
            const headerRect = header.getBoundingClientRect();
            const overlapMatches = cells
              .map((cell) => {
                const rect = cell.getBoundingClientRect();
                return {
                  cell,
                  overlap: horizontalOverlap(headerRect.left, headerRect.right, rect.left, rect.right),
                  distance: Math.abs((headerRect.left + (headerRect.width / 2)) - (rect.left + (rect.width / 2))),
                };
              })
              .filter((item) => item.overlap > 0)
              .sort((a, b) => b.overlap - a.overlap || a.distance - b.distance)
              .map((item) => item.cell);
            for (const cell of overlapMatches) {
              if (!candidates.includes(cell)) {
                candidates.push(cell);
              }
            }
          }
        }

        return candidates.length ? candidates : cells;
      };

      const rows = [...root.querySelectorAll('tbody tr, tr')].filter((row) => row.querySelectorAll('td').length);
      for (const row of rows) {
        const rowLabel = normalize(row.innerText || row.textContent);
        if (!rowLabel.includes(expectedRow)) {
          continue;
        }

        const actualTexts = candidateCellsForRow(row)
          .map((cell) => normalize(cell.innerText || cell.textContent))
          .filter(Boolean);
        const matchingText = actualTexts.find(matchText);
        const rowTextMatches = rowLabel.includes(expectedCell);
        const ready = Boolean(matchingText) || rowTextMatches;
        return {
          ready,
          reason: matchingText ? 'matched column' : (rowTextMatches ? 'matched row text' : 'row found with different text'),
          actualText: matchingText || actualTexts.join(' | ') || rowLabel,
          rowText: rowLabel.slice(0, 300),
          url: currentUrl,
        };
      }

      return { ready: false, reason: 'row missing', url: currentUrl };
    }, {
      rowText,
      columnLabel: action.columnLabel || '',
      expectedText,
      tableSelector: action.tableSelector || '',
      urlIncludes: action.urlIncludes || '',
      exact: action.exact !== false,
    }).catch((error) => ({ ready: false, reason: error.message }));

    if (lastState.ready) {
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`Timed out waiting for row "${rowText}" column "${action.columnLabel || ''}" to equal "${expectedText}": ${JSON.stringify(lastState)}`);
}

async function captureUrlParam(page, action, runtimeState) {
  const paramName = action.urlParam || 'id';
  const stateKey = action.stateKey || paramName;
  let lastUrl = '';
  const started = Date.now();

  while (Date.now() - started < action.timeoutMs) {
    const currentUrl = await page.evaluate(() => location.href).catch(() => '');
    lastUrl = currentUrl || lastUrl;
    const value = parseUrlParam(currentUrl, paramName);
    const hasParam = Boolean(value);
    const urlMatches = !action.urlIncludes || currentUrl.includes(action.urlIncludes);
    const pathMatches = !action.urlPathIncludes || urlPathIncludes(currentUrl, action.urlPathIncludes);

    if (hasParam && urlMatches && pathMatches) {
      runtimeState[stateKey] = value;
      return value;
    }

    await page.waitForTimeout(250);
  }

  const target = action.urlIncludes || action.urlPathIncludes || 'current URL';
  throw new Error(`Timed out waiting for URL param "${paramName}" on ${target}. Last URL: ${lastUrl}`);
}

function parseUrlParam(value, paramName) {
  try {
    const url = new URL(value);
    const queryValue = parseQueryParam(url.search, paramName);
    if (queryValue) {
      return queryValue;
    }

    const hash = url.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex !== -1) {
      return parseQueryParam(hash.slice(queryIndex + 1), paramName);
    }

    return '';
  } catch (error) {
    const queryIndex = String(value || '').indexOf('?');
    if (queryIndex === -1) {
      return '';
    }

    return parseQueryParam(String(value).slice(queryIndex + 1), paramName);
  }
}

function parseQueryParam(query, paramName) {
  const expected = String(paramName || '');
  const pairs = String(query || '').replace(/^[?#]/, '').split('&');

  for (const pair of pairs) {
    if (!pair) {
      continue;
    }

    const separatorIndex = pair.indexOf('=');
    const rawKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1);
    if (decodeQueryComponent(rawKey) === expected) {
      return decodeQueryComponent(rawValue);
    }
  }

  return '';
}

function decodeQueryComponent(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
  } catch (error) {
    return String(value || '');
  }
}

function urlPathIncludes(value, expectedPath) {
  try {
    return new URL(value).pathname.includes(expectedPath);
  } catch (error) {
    return String(value || '').includes(expectedPath);
  }
}

function routeUrl(path) {
  return buildRouteUrl(path, BASE_URL, ROUTE_BASE);
}

function resolveRuntimeTemplate(value, runtimeState) {
  return String(value || '').replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, name) => {
    const resolved = runtimeState[name] || __ENV[name];
    if (!resolved) {
      throw new Error(`Runtime route value was not set: ${name}`);
    }
    return resolved;
  });
}

function reportContext() {
  return {
    baseUrl: BASE_URL,
    routeBase: ROUTE_BASE,
    username: USERNAME,
    country: COUNTRY,
    project: PROJECT,
    routes: ROUTES,
    scenario: cvaBrowserScenario,
    showGrafanaVisualization: GRAFANA_VISUALIZATION,
    showLoadTestPerformance: LOAD_TEST_PERFORMANCE,
    showStageByStage: STAGE_BY_STAGE,
    stepMetrics: stepMetrics(ROUTES),
  };
}

export function handleSummary(data) {
  const context = reportContext();
  return {
    stdout: buildConsoleSummary(data, context),
    'reports/k6-summary.json': JSON.stringify(data, null, 2),
    'reports/performance-report.html': buildHtmlReport(data, context),
  };
}
