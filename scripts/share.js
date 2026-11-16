import { Rate, Trend } from 'k6/metrics';

let sampleScreenshotCount = 0;

export async function measure(metric, action, options = {}) {
  if (options.page && options.sizeMetric) {
    await resetStepTransferBytes(options.page);
  }

  const started = Date.now();
  let result;
  try {
    result = await action();
  } catch (error) {
    await recordStepMetrics(metric, Date.now() - started, options, true);
    if (options.page && options.screenshotLabel) {
      await saveSampleScreenshot(options.page, options.screenshotLabel, 'failed').catch(() => {});
    }
    throw error;
  }
  const duration = Date.now() - started;

  await recordStepMetrics(metric, duration, options, false);

  if (options.page && options.screenshotLabel) {
    await saveSampleScreenshot(options.page, options.screenshotLabel).catch(() => {});
  }

  return result;
}

export function sizeMetricName(metricName) {
  return String(metricName).replace(/_ms$/, '_bytes');
}

export function errorMetricName(metricName) {
  return String(metricName).replace(/_ms$/, '_error_rate');
}

async function recordStepMetrics(metric, duration, options, failed) {
  metric.add(duration);

  if (options.errorMetric) {
    options.errorMetric.add(failed);
  }

  if (options.page && options.sizeMetric) {
    const bytes = await readStepTransferBytes(options.page).catch(() => undefined);
    if (bytes !== undefined) {
      options.sizeMetric.add(bytes);
    }
  }
}

async function saveSampleScreenshot(page, label, status = 'passed') {
  sampleScreenshotCount += 1;

  const vu = typeof __VU === 'undefined' ? 0 : __VU;
  const iteration = typeof __ITER === 'undefined' ? 0 : __ITER;
  const sample = String(sampleScreenshotCount).padStart(3, '0');
  const slug = screenshotSlug(label);
  const suffix = status === 'failed' ? '-failed' : '';
  const path = `artifacts/sample-vu-${vu}-iter-${iteration}-${sample}-${slug}${suffix}.png`;

  await page.screenshot({ path });
}

function screenshotSlug(value) {
  return String(value || 'sample')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'sample';
}

export async function selectRfOption(page, selectSelector, optionText, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await clickElementByLocator(page, selectSelector);

    if (await findOpenRfSelectOption(page, optionText, 3000)) {
      await clickElementByLocator(page, '.select-rf-popper.True [data-k6-target-option="true"]');
      await waitForElementText(page, `${selectSelector} .select-rf-item-text`, optionText, Math.min(timeoutMs, 5000))
        .catch(() => waitForElementText(page, selectSelector, optionText, timeoutMs));
      return;
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
  }

  throw new Error(`Option was not visible in RF select: ${optionText}`);
}

export async function selectRfOptionByFieldLabel(page, fieldLabel, optionText, timeoutMs = 45000, options = {}) {
  const scopeSelector = options.scopeSelector || 'body';
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await markRfSelectByFieldLabel(page, scopeSelector, fieldLabel)) {
      await clickElementByLocator(page, '[data-k6-rf-field-select="true"]');

      if (await findOpenRfSelectOption(page, optionText, 4000, options)) {
        await clickElementByLocator(page, '.select-rf-popper.True [data-k6-target-option="true"]');
        await waitForElementTextLike(page, '[data-k6-rf-field-select="true"]', optionText, timeoutMs).catch(() => {});
        return;
      }

      await page.keyboard.press('Escape').catch(() => {});
    } else {
      const remainingMs = Math.max(250, timeoutMs - (Date.now() - started));
      const filled = await fillFieldByText(page, fieldLabel, optionText, scopeSelector, Math.min(remainingMs, 1000))
        .then(() => true)
        .catch(() => false);

      if (filled) {
        return;
      }
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Option or editable field was not available for field "${fieldLabel}": ${optionText}`);
}

export async function selectRfMultiOption(page, selectSelector, optionText, timeoutMs = 45000, options = {}) {
  const selectionCount = Math.max(1, Number(options.selectionCount || options.selectorIndex || 1));
  const selectedLabels = [];
  const started = Date.now();
  while (Date.now() - started < timeoutMs && selectedLabels.length < selectionCount) {
    if (!await hasVisibleRfPopper(page)) {
      await clickElementByLocator(page, selectSelector);
    }

    const selectedLabel = await findOpenRfMultiOption(page, optionText, 4000, {
      ...options,
      skipLabels: selectedLabels,
    });
    if (selectedLabel) {
      await clickElementByLocator(page, '[data-k6-target-multi-option="true"]');
      selectedLabels.push(selectedLabel);
      await page.waitForTimeout(250);
      continue;
    }

    await closeOpenRfPopper(page);
    await page.waitForTimeout(250);
  }

  if (selectedLabels.length < selectionCount) {
    throw new Error(`Only selected ${selectedLabels.length} of ${selectionCount} RF multiselect option(s): ${optionText}`);
  }

  await closeOpenRfPopper(page);
  await waitForElementText(page, selectSelector, optionText, timeoutMs);
}

async function closeOpenRfPopper(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!await hasVisibleRfPopper(page)) {
      return;
    }

    await page.keyboard.press('Escape').catch(() => {});

    const point = await page.evaluate(() => {
      const isVisible = (element) => {
        if (!element) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const target = [
        '.modal-rf-titlebar-title',
        '.modal-rf-titlebar',
        '.modal-rf',
        'body',
      ].map((selector) => document.querySelector(selector)).find(isVisible);

      if (!target) {
        return null;
      }

      const rect = target.getBoundingClientRect();
      return {
        x: rect.left + Math.min(20, Math.max(1, rect.width / 2)),
        y: rect.top + Math.min(20, Math.max(1, rect.height / 2)),
      };
    }).catch(() => null);

    if (point && page.mouse && typeof page.mouse.click === 'function') {
      await page.mouse.click(point.x, point.y).catch(() => {});
    } else {
      await page.evaluate(() => {
        const target = document.querySelector('.modal-rf-titlebar-title')
          || document.querySelector('.modal-rf-titlebar')
          || document.querySelector('.modal-rf')
          || document.body;
        if (!target) {
          return;
        }

        const eventInit = { bubbles: true, cancelable: true, view: window };
        target.dispatchEvent(new MouseEvent('mousedown', eventInit));
        target.dispatchEvent(new MouseEvent('mouseup', eventInit));
        target.click();
      }).catch(() => {});
    }

    await page.waitForTimeout(250);
  }
}

async function hasVisibleRfPopper(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    return [...document.querySelectorAll('.select-rf-popper, .multiselect-rf-popper')].some(isVisible);
  }).catch(() => false);
}

export async function applyRfTableColumnFilter(page, options) {
  const popupSelector = options.popupSelector || '.rf-filter-item';
  const timeoutMs = Number(options.timeoutMs || 30000);
  const popupSettleMs = Number(options.popupSettleMs || 0);

  await markRfTableFilterColumn(page, options, timeoutMs);

  if (options.columnSelectAll) {
    const clicked = await clickRfColumnCheckbox(page, Math.min(timeoutMs, 5000));
    if (!clicked && options.columnSelectAllRequired) {
      throw new Error('Timed out waiting for RF column checkbox');
    }
  }

  if (!await isVisibleSelector(page, popupSelector)) {
    await page.locator('[data-k6-rf-filter-column="true"] .rf-col-indicators').click()
      .catch(async () => {
        await page.locator('[data-k6-rf-filter-column="true"]').click();
      });

    await waitForVisibleSelector(page, popupSelector, timeoutMs);
  }

  if (popupSettleMs > 0) {
    await page.waitForTimeout(popupSettleMs);
  }

  if (options.selectAll) {
    await setRfCheckbox(page, popupSelector, options.selectAllText || 'All', true, timeoutMs);
  }

  if (options.condition) {
    if (await rfSelectAlreadyShows(page, popupSelector, options.condition)) {
      // The popup often opens with the requested condition already selected.
    } else if (options.conditionSelector) {
      await selectRfOption(page, options.conditionSelector, options.condition);
    } else {
      await selectRfOptionInScope(page, popupSelector, options.condition, timeoutMs);
    }
  }

  if (options.value) {
    await fillRfFilterValue(page, options.valueSelector, popupSelector, options.value, timeoutMs, options);
  }

  await clickVisibleText(page, popupSelector, options.applyText || 'Apply', timeoutMs);
  await waitForRfLoadingToSettle(page, Math.min(timeoutMs, 30000)).catch(() => {});

  if (options.value && options.verifyFilterState) {
    await waitForRfColumnFilterState(page, options, timeoutMs);
  }

  if (options.value && options.verifyVisibleRows) {
    await waitForRfTableColumnVisibleRows(page, options, timeoutMs);
  }
}

export async function clickByText(page, options) {
  await clickVisibleText(page, options.scopeSelector || 'body', options.text || options.buttonText || options.label, Number(options.timeoutMs || 30000));
}

export async function clickIfExists(locator) {
  if (await locator.count() > 0 && await locator.isVisible()) {
    await locator.click();
    return true;
  }

  return false;
}

export async function clickChoiceByLabel(page, options) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const choiceText = options.text || options.value || options.buttonText || '';
  const fieldLabel = options.fieldLabel || '';
  const scopeSelector = options.scopeSelector || '.modal-rf, body';

  if (!choiceText) {
    throw new Error('Choice click requires text, value, or buttonText.');
  }

  await waitForRfLoadingToSettle(page, Math.min(timeoutMs, 30000)).catch(() => {});

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const clicked = await page.evaluate(({ choiceText, fieldLabel, scopeSelector }) => {
      const normalize = (value) => String(value || '')
        .replace(/\*/g, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/:+$/g, '')
        .trim()
        .toLowerCase();
      const expectedChoice = normalize(choiceText);
      const expectedField = normalize(fieldLabel);
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const visibleText = (element) => String(element ? (element.innerText || element.textContent || '') : '')
        .replace(/\s+/g, ' ')
        .trim();
      const textMatches = (value, expected) => {
        const actual = normalize(value);
        return actual === expected || actual.includes(expected);
      };
      const textForIds = (ids) => String(ids || '')
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map(visibleText)
        .join(' ');
      const boundedAncestors = (element) => {
        const ancestors = [];
        let current = element;
        while (current && current !== document.body && ancestors.length < 6) {
          if (isVisible(current)) {
            const text = visibleText(current);
            if (text && text.length <= 500) {
              ancestors.push(current);
            }
          }
          current = current.parentElement;
        }
        return ancestors;
      };
      const controlLabelText = (control) => {
        const id = control.getAttribute('id');
        const labelFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        const explicitLabel = labelFor ? visibleText(labelFor) : '';
        const wrappingLabel = control.closest('label');
        const ancestorText = boundedAncestors(control).map(visibleText).join(' ');
        return [
          control.getAttribute('aria-label'),
          textForIds(control.getAttribute('aria-labelledby')),
          explicitLabel,
          wrappingLabel ? visibleText(wrappingLabel) : '',
          ancestorText,
        ].join(' ');
      };
      const labelsForField = () => {
        if (!expectedField) {
          return [];
        }

        return [...scope.querySelectorAll('label, .label-rf, [class*="label"], span, div')]
          .filter(isVisible)
          .filter((element) => {
            const text = visibleText(element);
            return text.length <= 150 && textMatches(text, expectedField);
          });
      };
      const fieldLabels = [];
      const fieldScore = (element) => {
        if (!expectedField) {
          return 1;
        }

        if (!fieldLabels.length) {
          fieldLabels.push(...labelsForField());
        }

        const ancestors = boundedAncestors(element);
        for (const ancestor of ancestors) {
          if (fieldLabels.some((label) => ancestor.contains(label))) {
            return 3;
          }
        }

        const elementRect = element.getBoundingClientRect();
        for (const label of fieldLabels) {
          const labelRect = label.getBoundingClientRect();
          const sameColumn = Math.abs(labelRect.left - elementRect.left) < 500;
          const belowLabel = elementRect.top >= labelRect.top - 8;
          const nearLabel = Math.abs(elementRect.top - labelRect.top) < 350;
          if (sameColumn && belowLabel && nearLabel) {
            return 2;
          }
        }

        return 0;
      };
      const clickTarget = (target) => {
        const control = target.matches('input[type="checkbox"], input[type="radio"]')
          ? target
          : target.querySelector('input[type="checkbox"], input[type="radio"]')
            || (target.htmlFor ? document.getElementById(target.htmlFor) : null);

        if (control && control.checked) {
          return true;
        }

        if (target.getAttribute('aria-checked') === 'true') {
          return true;
        }

        target.scrollIntoView({ block: 'center', inline: 'center' });
        target.click();

        if (control) {
          control.dispatchEvent(new Event('input', { bubbles: true }));
          control.dispatchEvent(new Event('change', { bubbles: true }));
        }

        return true;
      };

      const scope = document.querySelector(scopeSelector) || document;
      const controls = [...scope.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"]')]
        .filter((element) => !element.disabled);
      const controlMatches = controls
        .map((control) => ({ control, score: fieldScore(control), text: controlLabelText(control) }))
        .filter((item) => item.score > 0 && textMatches(item.text, expectedChoice))
        .sort((a, b) => b.score - a.score);

      if (controlMatches.length) {
        const control = controlMatches[0].control;
        const target = control.closest('label')
          || (control.getAttribute('id') ? document.querySelector(`label[for="${CSS.escape(control.getAttribute('id'))}"]`) : null)
          || control.closest('[role="checkbox"], [role="radio"]')
          || control;
        return clickTarget(target);
      }

      const textMatchesList = [...scope.querySelectorAll('label, span, div, p')]
        .filter(isVisible)
        .filter((element) => {
          const text = visibleText(element);
          return text.length <= 300 && textMatches(text, expectedChoice) && fieldScore(element) > 0;
        })
        .sort((a, b) => fieldScore(b) - fieldScore(a));

      if (textMatchesList.length) {
        const element = textMatchesList[0];
        const target = element.closest('label, [role="checkbox"], [role="radio"], button, a') || element;
        return clickTarget(target);
      }

      return false;
    }, { choiceText, fieldLabel, scopeSelector }).catch(() => false);

    if (clicked) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out selecting choice "${choiceText}"${fieldLabel ? ` for field "${fieldLabel}"` : ''}`);
}

export async function scrollPositionPercent(page, options) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const percent = Number(options.scrollPositionPercentage ?? 100);
  const horizontalPercent = Number(options.horizontalScrollPositionPercentage ?? 0);

  await waitForRfLoadingToSettle(page, Math.min(timeoutMs, 30000)).catch(() => {});

  await page.evaluate(({ selector, percent, horizontalPercent }) => {
    const clampPercent = (value) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    const verticalPercent = clampPercent(percent);
    const xPercent = clampPercent(horizontalPercent);

    const isVisible = (element) => {
      if (element === document.scrollingElement || element === document.documentElement || element === document.body) {
        return true;
      }

      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const scrollState = (element) => {
      const isDocument = element === document.scrollingElement || element === document.documentElement || element === document.body;
      const maxTop = isDocument
        ? Math.max(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight)
        : Math.max(0, element.scrollHeight - element.clientHeight);
      const maxLeft = isDocument
        ? Math.max(0, Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth)
        : Math.max(0, element.scrollWidth - element.clientWidth);
      return { isDocument, maxTop, maxLeft };
    };
    const scrollElement = (element) => {
      const state = scrollState(element);
      if (state.maxTop <= 0 && state.maxLeft <= 0) {
        return false;
      }

      const top = Math.round(state.maxTop * (verticalPercent / 100));
      const left = Math.round(state.maxLeft * (xPercent / 100));
      if (state.isDocument) {
        window.scrollTo(left, top);
      } else {
        element.scrollTo(left, top);
      }
      return true;
    };

    if (selector) {
      const target = document.querySelector(selector);
      if (target) {
        scrollElement(target);
      }
      return;
    }

    const documentElement = document.scrollingElement || document.documentElement;
    let scrolled = scrollElement(documentElement);
    const scrollableElements = [...document.querySelectorAll('main, section, article, aside, div, table, tbody')]
      .filter(isVisible)
      .filter((element) => {
        const state = scrollState(element);
        return state.maxTop > 0 || state.maxLeft > 0;
      })
      .sort((a, b) => {
        const stateA = scrollState(a);
        const stateB = scrollState(b);
        return (stateB.maxTop + stateB.maxLeft) - (stateA.maxTop + stateA.maxLeft);
      });

    for (const element of scrollableElements) {
      scrolled = scrollElement(element) || scrolled;
    }

    if (!scrolled) {
      window.scrollTo(0, Math.round(Math.max(0, document.body.scrollHeight - window.innerHeight) * (verticalPercent / 100)));
    }
  }, {
    selector: options.selector || '',
    percent,
    horizontalPercent,
  });
}

export async function selectDatepicker(page, options) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const scopeSelector = options.scopeSelector || 'body';
  const value = String(options.value || options.date || '').trim();

  if (!value) {
    throw new Error('Datepicker action requires a value.');
  }

  await waitForRfLoadingToSettle(page, Math.min(timeoutMs, 30000)).catch(() => {});

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const markedInput = await markDatepickerInput(page, {
      fieldLabel: options.fieldLabel || options.label || '',
      selector: options.selector || '',
      scopeSelector,
    });

    if (markedInput) {
      const inputPoint = await readElementCenter(page, '[data-k6-datepicker-input="true"]');
      if (inputPoint) {
        await clickPagePoint(page, inputPoint.x, inputPoint.y);
      } else {
        await clickElementByLocator(page, '[data-k6-datepicker-input="true"]');
      }
      await page.waitForTimeout(250);
    }

    const direction = await datepickerNavigationDirection(page, value).catch(() => 0);
    if (direction !== 0 && await clickDatepickerNavigation(page, direction)) {
      await page.waitForTimeout(250);
      continue;
    }

    const markedDay = await markDatepickerDay(page, value);
    if (markedDay) {
      const dayPoint = await readElementCenter(page, '[data-k6-datepicker-day="true"]');
      if (dayPoint) {
        await clickPagePoint(page, dayPoint.x, dayPoint.y);
      } else {
        await clickElementByLocator(page, '[data-k6-datepicker-day="true"]');
      }

      await page.waitForTimeout(250);
      if (await datepickerInputHasValue(page, value)) {
        return;
      }
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out selecting datepicker value: ${value}`);
}

export async function waitForRfLoadingToSettle(page, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const isLoading = await page.evaluate(() => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      return [...document.querySelectorAll('body *')].some((element) => {
        if (!isVisible(element)) {
          return false;
        }

        const text = normalize(element.innerText || element.textContent);
        return text === 'please wait'
          || text === 'loading...'
          || text === 'please wait loading...';
      });
    }).catch(() => false);

    if (!isLoading) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error('Timed out waiting for RF loading overlay to settle');
}

export async function selectRfTableHeaderCheckbox(page, options) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  await waitForRfLoadingToSettle(page, Math.min(timeoutMs, 30000)).catch(() => {});

  const clicked = await clickRfFirstHeaderCheckbox(page, options.tableSelector || '', timeoutMs);
  if (!clicked) {
    throw new Error('Timed out waiting for RF table header checkbox');
  }
}

export async function selectRfTableFirstRows(page, options) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const count = Number(options.rowCount || options.count || 1);

  await waitForRfLoadingToSettle(page, Math.min(timeoutMs, 30000)).catch(() => {});

  const selected = await clickRfFirstRowCheckboxes(page, options.tableSelector || '', count, timeoutMs);
  if (selected < count) {
    throw new Error(`Expected to select ${count} RF table rows, but only found ${selected}.`);
  }

  await settleRfColumnCheckboxSelection(page);
}

export async function clickRfTableColumnText(page, options) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const cellText = options.cellText || options.text || '';

  if (!options.columnLabel) {
    throw new Error('RF table column text click requires a columnLabel.');
  }

  if (!cellText) {
    throw new Error('RF table column text click requires text or cellText.');
  }

  await waitForRfLoadingToSettle(page, Math.min(timeoutMs, 30000)).catch(() => {});
  await markRfTableColumn(page, options, timeoutMs);
  await scrollMarkedRfTableColumnIntoView(page, timeoutMs);
  await markRfTableColumn(page, options, Math.min(timeoutMs, 5000));

  if (!await clickRfColumnCellText(page, { ...options, cellText }, timeoutMs)) {
    const rowContext = options.rowMatchText ? ` in row matching "${options.rowMatchText}"` : '';
    throw new Error(`Timed out waiting to click "${cellText}" in RF table column: ${options.columnLabel}${rowContext}`);
  }
}

export async function selectRfTableColumnCheckbox(page, options) {
  const timeoutMs = Number(options.timeoutMs || 30000);
  const cellText = options.cellText || '';

  await waitForRfLoadingToSettle(page, Math.min(timeoutMs, 30000)).catch(() => {});
  await markRfTableColumn(page, options, timeoutMs);
  await scrollMarkedRfTableColumnIntoView(page, timeoutMs);
  await markRfTableColumn(page, options, Math.min(timeoutMs, 5000));

  if (cellText) {
    if (await clickRfColumnCellText(page, options, timeoutMs)) {
      await settleRfColumnCheckboxSelection(page);
      return;
    }
  }

  if (await rfColumnSelectionSucceeded(page, options)) {
    await settleRfColumnCheckboxSelection(page);
    return;
  }

  const headerClicked = await clickRfColumnCheckbox(page, Math.min(timeoutMs, 5000), options);
  if (headerClicked) {
    await page.waitForTimeout(500);
    if (await rfColumnSelectionSucceeded(page, options)) {
      await settleRfColumnCheckboxSelection(page);
      return;
    }
  }

  await page.keyboard.press('Escape').catch(() => {});

  if (await clickRfColumnHeaderCheckboxByLabel(page, options, Math.min(timeoutMs, 10000))) {
    await page.waitForTimeout(500);
    if (await rfColumnSelectionSucceeded(page, options)) {
      await settleRfColumnCheckboxSelection(page);
      return;
    }
  }

  await page.keyboard.press('Escape').catch(() => {});

  const selectedCells = await clickRfColumnCellCheckboxes(page, timeoutMs);
  if (selectedCells) {
    await page.waitForTimeout(500);
    await waitForRfColumnCheckboxesSelected(page, options, Math.min(timeoutMs, 10000));
    await settleRfColumnCheckboxSelection(page);
    return;
  }

  const cellClicked = await clickRfColumnCellCheckbox(page, timeoutMs);
  if (cellClicked) {
    await waitForRfColumnCheckboxesSelected(page, options, Math.min(timeoutMs, 10000));
    await settleRfColumnCheckboxSelection(page);
    return;
  }

  throw new Error(`Timed out waiting for RF table checkbox column: ${options.columnLabel}`);
}

async function clickRfColumnHeaderCheckboxByLabel(page, options, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const point = await page.evaluate(({ columnLabel, tableSelector }) => {
      const expected = String(columnLabel || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const root = tableSelector ? document.querySelector(tableSelector) : document;
      if (!root || !expected) {
        return null;
      }

      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const candidates = [...root.querySelectorAll('th, th *, [role="columnheader"], [role="columnheader"] *, span, label, div')]
        .filter(isVisible)
        .filter((element) => normalize(element.innerText || element.textContent) === expected)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const header = element.closest('th, [role="columnheader"]') || element;
          const headerRect = header.getBoundingClientRect();
          return {
            element,
            area: rect.width * rect.height,
            x: headerRect.left + Math.min(24, Math.max(12, headerRect.width * 0.08)),
            y: headerRect.top + (headerRect.height / 2),
          };
        })
        .filter((item) => item.x >= 0 && item.y >= 0)
        .sort((a, b) => a.area - b.area);

      if (!candidates.length) {
        const header = [...root.querySelectorAll('th, [role="columnheader"]')]
          .filter(isVisible)
          .find((element) => normalize(element.innerText || element.textContent).startsWith(expected));
        if (!header) {
          return null;
        }

        const rect = header.getBoundingClientRect();
        return { x: rect.left + Math.min(24, Math.max(12, rect.width * 0.08)), y: rect.top + (rect.height / 2) };
      }

      return { x: candidates[0].x, y: candidates[0].y };
    }, {
      columnLabel: options.columnLabel || '',
      tableSelector: options.tableSelector || '',
    }).catch(() => null);

    if (point) {
      await clickPagePoint(page, point.x, point.y);
      return true;
    }

    await page.waitForTimeout(250);
  }

  return false;
}

export async function waitForExpectedTexts(page, expectedTexts, timeoutMs) {
  let bodyText = '';
  for (const expectedText of expectedTexts) {
    bodyText = await waitForBodyText(page, expectedText, timeoutMs);
  }
  return bodyText;
}

export async function waitForBodyText(page, expectedText, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await page.locator('body').textContent().catch(() => '');
    if ((text || '').includes(expectedText)) {
      return text;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out waiting for body text: ${expectedText}`);
}

export function createRouteMetrics(routes) {
  const metrics = {};
  for (const route of routes) {
    route.metricName = route.metricName || `cva_route_${route.key}_ms`;
    route.sizeMetricName = route.sizeMetricName || sizeMetricName(route.metricName);
    route.errorMetricName = route.errorMetricName || errorMetricName(route.metricName);
    metrics[route.metricName] = new Trend(route.metricName, true);
    metrics[route.sizeMetricName] = new Trend(route.sizeMetricName);
    metrics[route.errorMetricName] = new Rate(route.errorMetricName);

    for (const action of route.actions) {
      action.metricName = action.metricName || `cva_action_${route.key}_${action.key}_ms`;
      action.sizeMetricName = action.sizeMetricName || sizeMetricName(action.metricName);
      action.errorMetricName = action.errorMetricName || errorMetricName(action.metricName);
      metrics[action.metricName] = new Trend(action.metricName, true);
      metrics[action.sizeMetricName] = new Trend(action.sizeMetricName);
      metrics[action.errorMetricName] = new Rate(action.errorMetricName);
    }
  }
  return metrics;
}

async function resetStepTransferBytes(page) {
  await page.evaluate(() => {
    window.__cvaK6StepStartTime = performance.now();
    if (performance.setResourceTimingBufferSize) {
      performance.setResourceTimingBufferSize(10000);
    }
    if (performance.clearResourceTimings) {
      performance.clearResourceTimings();
    }
  }).catch(() => {});
}

async function readStepTransferBytes(page) {
  return page.evaluate(() => {
    const marker = typeof window.__cvaK6StepStartTime === 'number' ? window.__cvaK6StepStartTime : null;
    const entryBytes = (entry) => Math.max(
      Number(entry.transferSize || 0),
      Number(entry.encodedBodySize || 0),
      Number(entry.decodedBodySize || 0),
      0,
    );

    let bytes = 0;
    const resources = performance.getEntriesByType('resource') || [];
    for (const entry of resources) {
      if (marker === null || entry.startTime >= marker) {
        bytes += entryBytes(entry);
      }
    }

    if (marker === null) {
      const navigations = performance.getEntriesByType('navigation') || [];
      for (const entry of navigations) {
        bytes += entryBytes(entry);
      }
    }

    return Math.max(0, Math.round(bytes));
  }).catch(() => 0);
}

async function markVisibleOption(page, optionText, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate((text) => {
      const attr = 'data-k6-target-option';
      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));
      const items = [...document.querySelectorAll('.select-rf-popper.True .select-rf-popper-item-text')];
      const match = items.find((element) => (element.textContent || '').trim() === text);
      if (match) {
        match.setAttribute(attr, 'true');
        return true;
      }
      return false;
    }, optionText);

    if (found) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Option was not visible in RF select: ${optionText}`);
}

async function rfSelectAlreadyShows(page, scopeSelector, optionText) {
  return page.evaluate(({ scopeSelector, optionText }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const expected = normalize(optionText);
    const expectedAliases = expected === 'equal' ? ['equal', 'equals'] : [expected];
    const scope = document.querySelector(scopeSelector);
    if (!scope) {
      return false;
    }

    return [...scope.querySelectorAll('.select-rf')].some((select) => {
      const selected = normalize(select.innerText || select.textContent);
      return expectedAliases.some((alias) => selected === alias || selected.includes(alias));
    });
  }, { scopeSelector, optionText }).catch(() => false);
}

async function markRfTableFilterColumn(page, options, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate(({ columnLabel, tableSelector }) => {
      const attr = 'data-k6-rf-filter-column';
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

      const root = tableSelector ? document.querySelector(tableSelector) : document;
      if (!root) {
        return false;
      }

      const expected = normalize(columnLabel);
      const headers = [...root.querySelectorAll('th[filter-item]')].filter(isVisible);
      const match = headers.find((header) => {
        const label = normalize(header.innerText);
        const field = normalize(header.getAttribute('filter-item'));
        return field === expected || label === expected || label.includes(expected);
      });

      if (!match) {
        return false;
      }

      match.setAttribute(attr, 'true');
      return true;
    }, {
      columnLabel: options.columnLabel,
      tableSelector: options.tableSelector || '',
    });

    if (found) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for RF table column: ${options.columnLabel}`);
}

async function markRfTableColumn(page, options, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate(({ columnLabel, tableSelector }) => {
      const attr = 'data-k6-rf-filter-column';
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

      const root = tableSelector ? document.querySelector(tableSelector) : document;
      if (!root) {
        return false;
      }

      const expected = normalize(columnLabel);
      const headers = [...root.querySelectorAll('th, [role="columnheader"]')].filter(isVisible);
      const match = headers.find((header) => {
        const label = normalize(header.innerText || header.textContent);
        const field = normalize(header.getAttribute('filter-item') || header.getAttribute('data-field') || header.getAttribute('name'));
        return field === expected || label === expected || label.includes(expected);
      });

      if (!match) {
        return false;
      }

      match.setAttribute(attr, 'true');
      return true;
    }, {
      columnLabel: options.columnLabel,
      tableSelector: options.tableSelector || '',
    });

    if (found) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for RF table column: ${options.columnLabel}`);
}

async function scrollMarkedRfTableColumnIntoView(page, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate(() => {
      const header = document.querySelector('[data-k6-rf-filter-column="true"]');
      if (!header) {
        return { found: false, inViewport: false };
      }

      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const nearestHorizontalScroller = (element) => {
        let current = element.parentElement;
        while (current && current !== document.documentElement) {
          if (current.scrollWidth > current.clientWidth + 1) {
            return current;
          }
          current = current.parentElement;
        }
        return document.scrollingElement || document.documentElement;
      };

      if (!isVisible(header)) {
        return { found: true, inViewport: false };
      }

      header.scrollIntoView({ block: 'nearest', inline: 'center' });
      const scroller = nearestHorizontalScroller(header);
      if (scroller) {
        const headerRect = header.getBoundingClientRect();
        const scrollerRect = scroller === document.scrollingElement || scroller === document.documentElement
          ? { left: 0, width: window.innerWidth }
          : scroller.getBoundingClientRect();
        const delta = (headerRect.left + (headerRect.width / 2)) - (scrollerRect.left + (scrollerRect.width / 2));
        if (Math.abs(delta) > 2) {
          scroller.scrollLeft += delta;
        }
      }

      const rect = header.getBoundingClientRect();
      return {
        found: true,
        inViewport: rect.right > 0 && rect.left < window.innerWidth,
        left: rect.left,
        right: rect.right,
      };
    }).catch(() => ({ found: false, inViewport: false }));

    if (state.found && state.inViewport) {
      return true;
    }

    await page.waitForTimeout(250);
  }

  return false;
}

async function clickRfColumnCheckbox(page, timeoutMs, options = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate(({ columnLabel, tableSelector }) => {
      const attr = 'data-k6-rf-column-checkbox';
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const visibleControlFor = (input) => {
        const controls = [
          input.closest('label'),
          input.closest('.checkbox-rf'),
          input.closest('[class*="checkbox"]'),
          input.parentElement,
        ].filter(Boolean);
        return controls.find(isVisible) || input;
      };

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

      let column = document.querySelector('[data-k6-rf-filter-column="true"]');
      if (!column && columnLabel) {
        const root = tableSelector ? document.querySelector(tableSelector) : document;
        const expected = normalize(columnLabel);
        const headers = root ? [...root.querySelectorAll('th, [role="columnheader"]')].filter(isVisible) : [];
        column = headers.find((header) => {
          const label = normalize(header.innerText || header.textContent);
          const field = normalize(header.getAttribute('filter-item') || header.getAttribute('data-field') || header.getAttribute('name'));
          return field === expected || label === expected || label.includes(expected);
        });
      }

      if (!column) {
        return { found: false };
      }

      const rect = column.getBoundingClientRect();
      const headerPoint = {
        x: rect.left + Math.min(24, Math.max(12, rect.width * 0.08)),
        y: rect.top + (rect.height / 2),
      };
      const input = column.querySelector('input[type="checkbox"]');
      if (input) {
        visibleControlFor(input).setAttribute(attr, 'true');
        return {
          found: true,
          alreadySet: Boolean(input.checked),
          x: headerPoint.x,
          y: headerPoint.y,
        };
      }

      const candidates = [
        ...column.querySelectorAll('.checkbox-rf, [class*="checkbox"], [role="checkbox"]'),
      ].filter(isVisible);
      const checkbox = candidates[0];
      if (checkbox) {
        checkbox.setAttribute(attr, 'true');
        return {
          found: true,
          alreadySet: checkbox.getAttribute('aria-checked') === 'true',
          x: headerPoint.x,
          y: headerPoint.y,
        };
      }

      const probe = document.elementFromPoint(headerPoint.x, headerPoint.y);
      if (probe && column.contains(probe)) {
        return { found: true, x: headerPoint.x, y: headerPoint.y };
      }

      return { found: false };
    }, {
      columnLabel: options.columnLabel || '',
      tableSelector: options.tableSelector || '',
    });

    if (state.found) {
      if (state.alreadySet) {
        return true;
      }

      if (state.x !== undefined && state.y !== undefined) {
        await clickPagePoint(page, state.x, state.y);
        return true;
      }

      const clicked = await page.evaluate(() => {
        const target = document.querySelector('[data-k6-rf-column-checkbox="true"]');
        if (!target) {
          return false;
        }

        const input = target.matches('input[type="checkbox"]')
          ? target
          : target.querySelector('input[type="checkbox"]');
        if (input) {
          if (input.checked) {
            return true;
          }
          input.click();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }

        if (target.getAttribute('aria-checked') === 'true') {
          return true;
        }

        target.click();
        return true;
      }).catch(() => false);

      if (!clicked) {
        await page.locator('[data-k6-rf-column-checkbox="true"]').click();
      }
      return true;
    }

    await page.waitForTimeout(250);
  }

  return false;
}

async function markDatepickerInput(page, options) {
  return page.evaluate(({ fieldLabel, selector, scopeSelector }) => {
    const attr = 'data-k6-datepicker-input';
    const normalize = (value) => String(value || '')
      .replace(/\*/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const isDateInput = (element) => {
      if (!element || element.disabled || !isVisible(element)) {
        return false;
      }

      const tag = element.tagName.toLowerCase();
      const type = String(element.getAttribute('type') || '').toLowerCase();
      return tag === 'input' && !['hidden', 'checkbox', 'radio', 'button', 'submit'].includes(type);
    };
    const center = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2),
      };
    };
    const verticalOverlap = (left, right) => Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));

    document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

    const scope = document.querySelector(scopeSelector) || document;
    let input = null;

    if (selector) {
      input = [...scope.querySelectorAll(selector)].find(isDateInput);
    }

    const expected = normalize(fieldLabel);
    if (!input && expected) {
      const fields = [...scope.querySelectorAll('input')].filter(isDateInput);
      input = fields.find((element) => {
        const tokens = [
          element.getAttribute('placeholder'),
          element.getAttribute('aria-label'),
          element.getAttribute('name'),
          element.getAttribute('id'),
          element.getAttribute('data-field'),
        ].map(normalize);
        return tokens.some((token) => token === expected || token.includes(expected));
      });

      if (!input) {
        const labels = [...scope.querySelectorAll('label, .label-rf, [class*="label"], td, div, span')]
          .filter(isVisible)
          .filter((element) => normalize(element.innerText || element.textContent) === expected);
        const label = labels
          .map((element) => ({ element, length: String(element.innerText || element.textContent || '').length }))
          .sort((left, right) => left.length - right.length)[0]?.element;

        if (label?.getAttribute('for')) {
          input = scope.querySelector(`#${CSS.escape(label.getAttribute('for'))}`);
        }

        if (!input && label) {
          const labelRect = label.getBoundingClientRect();
          const labelCenter = center(label);
          input = fields
            .map((candidate) => {
              const rect = candidate.getBoundingClientRect();
              const candidateCenter = center(candidate);
              const rowOverlap = verticalOverlap(labelRect, rect);
              const rightOfLabel = rect.left >= labelRect.left;
              return {
                candidate,
                score: (rowOverlap > 0 ? 0 : Math.abs(candidateCenter.y - labelCenter.y) * 10)
                  + (rightOfLabel ? 0 : 1000)
                  + Math.abs(candidateCenter.x - labelCenter.x),
              };
            })
            .sort((left, right) => left.score - right.score)[0]?.candidate;
        }
      }
    }

    if (!input) {
      return false;
    }

    input.setAttribute(attr, 'true');
    return true;
  }, options).catch(() => false);
}

async function markDatepickerDay(page, dateValue) {
  return page.evaluate((value) => {
    const attr = 'data-k6-datepicker-day';
    const normalize = (candidate) => String(candidate || '').replace(/\s+/g, ' ').trim();
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const isDisabled = (element) => {
      const disabled = element.closest('[disabled], [aria-disabled="true"], .ant-picker-cell-disabled, .react-datepicker__day--disabled');
      return Boolean(disabled);
    };
    const mark = (element) => {
      const target = element.querySelector?.('.ant-picker-cell-inner, button, div, span') || element;
      target.setAttribute(attr, 'true');
      return true;
    };

    document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

    const titleCandidates = [...document.querySelectorAll('[title]')]
      .filter((element) => element.getAttribute('title') === value && isVisible(element) && !isDisabled(element));
    if (titleCandidates.length) {
      return mark(titleCandidates[0]);
    }

    const parts = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const day = parts ? String(Number(parts[3])) : '';
    if (!day) {
      return false;
    }

    const openPickers = [...document.querySelectorAll('.ant-picker-dropdown, .react-datepicker, [class*="datepicker"], [class*="calendar"]')]
      .filter(isVisible);
    for (const picker of openPickers) {
      const candidates = [...picker.querySelectorAll('td, button, div, span')]
        .filter((element) => isVisible(element) && !isDisabled(element) && normalize(element.innerText || element.textContent) === day);
      const exactTitleMatch = candidates.find((element) => element.closest('[title]')?.getAttribute('title') === value);
      if (exactTitleMatch) {
        return mark(exactTitleMatch);
      }

      const cell = candidates.find((element) => element.closest('td, button, [role="button"]'));
      if (cell) {
        return mark(cell);
      }
    }

    return false;
  }, dateValue).catch(() => false);
}

async function datepickerNavigationDirection(page, dateValue) {
  return page.evaluate((value) => {
    const parts = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) {
      return 0;
    }

    const targetYear = Number(parts[1]);
    const targetMonth = Number(parts[2]) - 1;
    const monthNames = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, sept: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11,
    };
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const picker = [...document.querySelectorAll('.ant-picker-dropdown, .react-datepicker, [class*="datepicker"], [class*="calendar"]')]
      .find(isVisible);
    if (!picker) {
      return 0;
    }

    const headerText = [
      picker.querySelector('.ant-picker-month-btn')?.innerText,
      picker.querySelector('.ant-picker-year-btn')?.innerText,
      picker.querySelector('.ant-picker-header-view')?.innerText,
      picker.querySelector('.react-datepicker__current-month')?.innerText,
      picker.innerText,
    ].filter(Boolean).join(' ');

    const lower = headerText.toLowerCase();
    const monthEntry = Object.entries(monthNames).find(([name]) => lower.includes(name));
    const yearMatch = lower.match(/\b(20\d{2}|19\d{2})\b/);
    if (!monthEntry || !yearMatch) {
      return 0;
    }

    const currentMonth = monthEntry[1];
    const currentYear = Number(yearMatch[1]);
    const diff = (targetYear - currentYear) * 12 + (targetMonth - currentMonth);
    return Math.max(-1, Math.min(1, diff));
  }, dateValue).catch(() => 0);
}

async function clickDatepickerNavigation(page, direction) {
  const selector = direction > 0
    ? '.ant-picker-header-next-btn, .react-datepicker__navigation--next, [aria-label="Next Month"], [aria-label="Next month"]'
    : '.ant-picker-header-prev-btn, .react-datepicker__navigation--previous, [aria-label="Previous Month"], [aria-label="Previous month"]';
  const attr = 'data-k6-datepicker-nav';
  const found = await page.evaluate(({ selector, attr }) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));
    const target = [...document.querySelectorAll(selector)].find(isVisible);
    if (!target) {
      return false;
    }

    target.setAttribute(attr, 'true');
    return true;
  }, { selector, attr }).catch(() => false);

  if (!found) {
    return false;
  }

  const point = await readElementCenter(page, `[${attr}="true"]`);
  if (point) {
    await clickPagePoint(page, point.x, point.y);
  } else {
    await clickElementByLocator(page, `[${attr}="true"]`);
  }
  return true;
}

async function datepickerInputHasValue(page, dateValue) {
  return page.evaluate((value) => {
    const input = document.querySelector('[data-k6-datepicker-input="true"]');
    if (!input) {
      return false;
    }

    const actual = String(input.value || input.getAttribute('value') || '').trim();
    if (!actual) {
      return false;
    }

    const parts = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) {
      return actual.includes(value);
    }

    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    const paddedMonth = String(month).padStart(2, '0');
    const paddedDay = String(day).padStart(2, '0');
    const compactActual = actual.toLowerCase().replace(/\s+/g, ' ');
    const accepted = [
      `${year}-${paddedMonth}-${paddedDay}`,
      `${paddedMonth}/${paddedDay}/${year}`,
      `${month}/${day}/${year}`,
      `${paddedDay}-${paddedMonth}-${year}`,
      `${day}-${month}-${year}`,
    ];

    if (accepted.some((candidate) => compactActual.includes(candidate.toLowerCase()))) {
      return true;
    }

    const parsed = new Date(actual);
    return !Number.isNaN(parsed.getTime())
      && parsed.getFullYear() === year
      && parsed.getMonth() + 1 === month
      && parsed.getDate() === day;
  }, dateValue).catch(() => false);
}

async function readElementCenter(page, selector) {
  return page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector);
    if (!target) {
      return null;
    }

    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    return {
      x: rect.left + (rect.width / 2),
      y: rect.top + (rect.height / 2),
    };
  }, selector).catch(() => null);
}

async function clickPagePoint(page, x, y) {
  if (page.mouse && page.mouse.click) {
    await page.mouse.click(x, y);
    return;
  }

  await page.evaluate(({ clientX, clientY }) => {
    const target = document.elementFromPoint(clientX, clientY);
    if (!target) {
      return;
    }

    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        view: window,
      }));
    }
  }, { clientX: x, clientY: y });
}

async function settleRfColumnCheckboxSelection(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(250);
  await waitForRfLoadingToSettle(page, 5000).catch(() => {});
}

// async function clickRfFirstHeaderCheckbox(page, tableSelector, timeoutMs) {
//   const started = Date.now();
//   while (Date.now() - started < timeoutMs) {
//     const state = await page.evaluate((selector) => {
//       const attr = 'data-k6-rf-header-checkbox';
//       const isVisible = (element) => {
//         const rect = element.getBoundingClientRect();
//         const style = getComputedStyle(element);
//         return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
//       };
//       const visibleControlFor = (input) => {
//         const controls = [
//           input.closest('label'),
//           input.closest('.checkbox-rf'),
//           input.closest('[class*="checkbox"]'),
//           input.parentElement,
//         ].filter(Boolean);
//         return controls.find(isVisible) || input;
//       };

//       document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

//       const root = selector ? document.querySelector(selector) : document;
//       if (!root) {
//         return { found: false };
//       }

//       const headers = [
//         ...root.querySelectorAll('thead th, thead td, th, [role="columnheader"]'),
//         ...root.querySelectorAll('table tr:first-child th, table tr:first-child td'),
//       ].filter((element, index, list) => isVisible(element) && list.indexOf(element) === index);
//       for (const header of headers) {
//         const input = header.querySelector('input[type="checkbox"]');
//         if (input) {
//           visibleControlFor(input).setAttribute(attr, 'true');
//           return { found: true, alreadySet: Boolean(input.checked) };
//         }

//         const control = [...header.querySelectorAll('.checkbox-rf, [class*="checkbox"], [role="checkbox"]')].find(isVisible);
//         if (control) {
//           const ariaChecked = control.getAttribute('aria-checked');
//           control.setAttribute(attr, 'true');
//           return { found: true, alreadySet: ariaChecked ? ariaChecked === 'true' : false };
//         }
//       }

//       const firstHeaderCell = headers.find((header) => header.getBoundingClientRect().width <= 80) || headers[0];
//       if (firstHeaderCell) {
//         firstHeaderCell.setAttribute(attr, 'true');
//         return { found: true, alreadySet: false };
//       }

//       return { found: false };
//     }, tableSelector);

//     if (state.found) {
//       if (!state.alreadySet) {
//         await page.locator('[data-k6-rf-header-checkbox="true"]').click();
//       }
//       return true;
//     }

//     await page.waitForTimeout(250);
//   }

//   return false;
// }

async function clickRfFirstHeaderCheckbox(page, tableSelector, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate((selector) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const isCheckedColor = (value) => {
        const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!match) {
          return false;
        }

        const red = Number(match[1]);
        const green = Number(match[2]);
        const blue = Number(match[3]);
        return red > 180 && green < 100 && blue < 100;
      };
      const hasCheckedClass = (element) => String(element ? element.className || '' : '')
        .split(/\s+/)
        .filter(Boolean)
        .some((className) => {
          const normalized = className.toLowerCase();
          return normalized === 'true'
            || (/(checked|selected)/.test(normalized) && !/(unchecked|unselected|not|false|disabled)/.test(normalized));
        });
      const isCheckedControl = (element) => {
        if (!element) {
          return false;
        }

        const style = getComputedStyle(element);
        return element.getAttribute('aria-checked') === 'true'
          || hasCheckedClass(element)
          || isCheckedColor(style.backgroundColor);
      };
      const visibleControlFor = (input) => {
        const controls = [
          input,
          input.closest('label'),
          input.closest('.table-rf-check-holder'),
          input.closest('.checkbox-rf'),
          input.closest('[class*="checkbox"]'),
          input.parentElement,
        ].filter(Boolean);
        return controls.find(isVisible) || input;
      };
      const clickPointFor = (element) => {
        if (!element) {
          return null;
        }

        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) {
          return null;
        }

        const isCheckboxSized = rect.width <= 32 && rect.height <= 32;
        const x = isCheckboxSized
          ? rect.left + (rect.width / 2)
          : rect.left + Math.min(52, Math.max(18, rect.width * 0.22));
        const y = rect.top + (rect.height / 2);

        return {
          x: Math.max(1, Math.min(window.innerWidth - 1, x)),
          y: Math.max(1, Math.min(window.innerHeight - 1, y)),
        };
      };
      const selectedRecordCount = () => {
        const text = document.body ? document.body.innerText || document.body.textContent || '' : '';
        const match = String(text).match(/Selected\s+Record\s*:\s*(\d+)/i);
        return match ? Number(match[1]) : null;
      };
      const rowCheckboxSelectedCount = (root) => {
        const rows = [...root.querySelectorAll('tbody tr, [role="row"], tr')]
          .filter((row, index, list) => list.indexOf(row) === index)
          .filter((row) => isVisible(row) && row.querySelectorAll('td, [role="cell"]').length);
        let selected = 0;
        for (const row of rows) {
          const input = [...row.querySelectorAll('input[type="checkbox"]')].find((candidate) => {
            const control = visibleControlFor(candidate);
            return isVisible(candidate) || (control && isVisible(control));
          });
          if (input && (input.checked || isCheckedControl(visibleControlFor(input)))) {
            selected += 1;
            continue;
          }

          const control = [...row.querySelectorAll('.table-rf-check-holder, .checkbox-rf, [class*="checkbox"], [role="checkbox"]')]
            .find(isVisible);
          if (control && isCheckedControl(control)) {
            selected += 1;
          }
        }

        return selected;
      };

      const root = selector ? document.querySelector(selector) : document;
      if (!root) {
        return { found: false, selected: false };
      }

      const headers = [
        ...root.querySelectorAll('thead th, thead td, th, [role="columnheader"]'),
        ...root.querySelectorAll('table tr:first-child th, table tr:first-child td'),
      ].filter((element, index, list) => isVisible(element) && list.indexOf(element) === index);

      const bannerSelected = selectedRecordCount();
      if ((bannerSelected !== null && bannerSelected > 0) || rowCheckboxSelectedCount(root) > 0) {
        return { found: true, selected: true };
      }

      for (const header of headers) {
        const input = header.querySelector('input[type="checkbox"]');
        if (input) {
          const control = visibleControlFor(input);
          if (input.checked || isCheckedControl(control)) {
            return { found: true, selected: true };
          }

          return { found: true, selected: false, point: clickPointFor(control || input) };
        }

        const control = [...header.querySelectorAll('.table-rf-check-holder, .checkbox-rf, [class*="checkbox"], [role="checkbox"]')].find(isVisible);
        if (control) {
          if (isCheckedControl(control)) {
            return { found: true, selected: true };
          }

          return { found: true, selected: false, point: clickPointFor(control) };
        }
      }

      const firstHeaderCell = headers.find((header) => header.getBoundingClientRect().width <= 80) || headers[0];
      if (firstHeaderCell) {
        return { found: true, selected: false, point: clickPointFor(firstHeaderCell) };
      }

      return { found: false, selected: false };
    }, tableSelector);

    if (state.found) {
      if (state.selected) {
        return true;
      }

      if (state.point) {
        await clickPagePoint(page, state.point.x, state.point.y);
        await page.waitForTimeout(350);
        await waitForRfLoadingToSettle(page, 5000).catch(() => {});
        continue;
      }
    }

    await page.waitForTimeout(250);
  }

  return false;
}

async function clickRfFirstRowCheckboxes(page, tableSelector, count, timeoutMs) {
  const started = Date.now();
  const clickedIndexes = [];
  let lastState = { selected: 0, total: 0, clicked: 0 };

  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate(({ selector, clickedIndexes }) => {
      const attr = 'data-k6-rf-row-checkbox';
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const isCheckedColor = (value) => {
        const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!match) {
          return false;
        }

        const red = Number(match[1]);
        const green = Number(match[2]);
        const blue = Number(match[3]);
        return red > 180 && green < 100 && blue < 100;
      };
      const isCheckedControl = (element) => {
        if (!element) {
          return false;
        }

        const style = getComputedStyle(element);
        const className = String(element.className || '').toLowerCase();
        const ariaChecked = element.getAttribute('aria-checked');
        return ariaChecked === 'true'
          || className.split(/\s+/).includes('true')
          || className.includes('checked')
          || className.includes('selected')
          || isCheckedColor(style.backgroundColor);
      };
      const visibleControlFor = (input) => {
        const controls = [
          input,
          input.closest('label'),
          input.closest('.table-rf-check-holder'),
          input.closest('.checkbox-rf'),
          input.closest('[class*="checkbox"]'),
          input.parentElement,
        ].filter(Boolean);
        return controls.find(isVisible) || input;
      };

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

      const selectedRecordCount = () => {
        const text = document.body ? document.body.innerText || document.body.textContent || '' : '';
        const match = String(text).match(/Selected\s+Record\s*:\s*(\d+)/i);
        return match ? Number(match[1]) : null;
      };
      const rowCheckboxState = (row) => {
        const input = [...row.querySelectorAll('input[type="checkbox"]')].find((candidate) => {
          const control = visibleControlFor(candidate);
          return isVisible(candidate) || (control && isVisible(control));
        });
        if (input) {
          const control = visibleControlFor(input);
          const rect = control.getBoundingClientRect();
          return {
            found: true,
            checked: Boolean(input.checked) || isCheckedControl(control),
            point: { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) },
            target: control,
          };
        }

        const control = [...row.querySelectorAll('.table-rf-check-holder, .checkbox-rf, [class*="checkbox"], [role="checkbox"]')]
          .find(isVisible);
        if (control) {
          const rect = control.getBoundingClientRect();
          return {
            found: true,
            checked: isCheckedControl(control),
            point: { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) },
            target: control,
          };
        }

        const firstCell = row.querySelector('td');
        if (!firstCell || !isVisible(firstCell)) {
          return { found: false, checked: false, point: null };
        }

        const rect = firstCell.getBoundingClientRect();
        return {
          found: true,
          checked: false,
          point: {
            x: rect.left + Math.min(52, Math.max(18, rect.width * 0.22)),
            y: rect.top + (rect.height / 2),
          },
          target: firstCell,
        };
      };

      const root = selector ? document.querySelector(selector) : document;
      if (!root) {
        return { selected: 0, total: 0, nextPoint: null };
      }

      const alreadyClicked = new Set(clickedIndexes);
      const rows = [...root.querySelectorAll('tbody tr, [role="row"], tr')]
        .filter((row, index, list) => list.indexOf(row) === index)
        .filter((row) => isVisible(row) && row.querySelectorAll('td, [role="cell"]').length);

      const bannerSelected = selectedRecordCount();
      let visualSelected = 0;
      let total = 0;
      let nextPoint = null;
      let nextIndex = -1;
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const checkbox = rowCheckboxState(row);
        if (!checkbox.found) {
          continue;
        }

        total += 1;
        if (checkbox.checked) {
          visualSelected += 1;
        }

        if (!nextPoint && !alreadyClicked.has(index)) {
          nextPoint = checkbox.point;
          nextIndex = index;
          checkbox.target.setAttribute(attr, 'true');
        }
      }

      return {
        selected: bannerSelected === null ? visualSelected : bannerSelected,
        total,
        nextPoint,
        nextIndex,
      };
    }, { selector: tableSelector, clickedIndexes }).catch(() => ({ selected: 0, total: 0, nextPoint: null, nextIndex: -1 }));

    lastState = {
      selected: Math.max(lastState.selected, state.selected),
      total: Math.max(lastState.total, state.total),
      clicked: Math.max(lastState.clicked, clickedIndexes.length),
    };

    if (state.selected >= count) {
      return state.selected;
    }

    if (state.nextPoint) {
      if (!await clickMarkedRfRowCheckbox(page)) {
        await clickPagePoint(page, state.nextPoint.x, state.nextPoint.y);
      }
      if (state.nextIndex >= 0) {
        clickedIndexes.push(state.nextIndex);
      }
      await page.waitForTimeout(350);
      await waitForRfLoadingToSettle(page, 5000).catch(() => {});
      continue;
    }

    await page.waitForTimeout(250);
  }

  return lastState.selected;
}

async function clickMarkedRfRowCheckbox(page) {
  return page.evaluate(() => {
    const target = document.querySelector('[data-k6-rf-row-checkbox="true"]');
    if (!target) {
      return false;
    }

    const input = target.matches('input[type="checkbox"]')
      ? target
      : target.querySelector('input[type="checkbox"]')
        || target.closest('label')?.querySelector('input[type="checkbox"]')
        || target.parentElement?.querySelector('input[type="checkbox"]');
    const wasChecked = input ? Boolean(input.checked) : null;
    const eventInit = { bubbles: true, cancelable: true, view: window };

    if (typeof PointerEvent === 'function') {
      target.dispatchEvent(new PointerEvent('pointerdown', eventInit));
      target.dispatchEvent(new PointerEvent('pointerup', eventInit));
    }
    target.dispatchEvent(new MouseEvent('mousedown', eventInit));
    target.dispatchEvent(new MouseEvent('mouseup', eventInit));
    target.click();

    if (input && Boolean(input.checked) === wasChecked) {
      input.click();
    }

    if (input && Boolean(input.checked) === wasChecked) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
      if (descriptor && typeof descriptor.set === 'function') {
        descriptor.set.call(input, !wasChecked);
      } else {
        input.checked = !wasChecked;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return true;
  }).catch(() => false);
}

async function rfColumnCheckboxesAreSelected(page, options) {
  const state = await page.evaluate(({ columnLabel, tableSelector }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const isCheckedColor = (value) => {
      const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!match) {
        return false;
      }

      const red = Number(match[1]);
      const green = Number(match[2]);
      const blue = Number(match[3]);
      return red > 180 && green < 90 && blue < 90;
    };
    const hasCheckedClass = (value) => String(value || '')
      .split(/\s+/)
      .filter(Boolean)
      .some((className) => {
        const normalized = className.toLowerCase();
        return /(checked|selected)/.test(normalized) && !/(unchecked|unselected|not|false|disabled)/.test(normalized);
      });
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const visualChecked = (element) => {
      if (!element || !isVisible(element)) {
        return false;
      }

      const style = getComputedStyle(element);
      const className = String(element.className || '');
      const text = normalize(element.innerText || element.textContent || element.getAttribute('aria-label'));
      return element.getAttribute('aria-checked') === 'true'
        || element.getAttribute('checked') !== null
        || hasCheckedClass(className)
        || text.includes('✓')
        || isCheckedColor(style.backgroundColor);
    };
    const visibleControlFor = (input) => {
      const controls = [
        input.closest('label'),
        input.closest('.checkbox-rf'),
        input.closest('[class*="checkbox"]'),
        input.closest('[class*="check"]'),
        input.parentElement,
      ].filter(Boolean);
      return controls.find(isVisible) || input;
    };
    const checkboxPointState = (scope) => {
      const rect = scope.getBoundingClientRect();
      const probes = [
        { x: rect.left + Math.min(52, Math.max(18, rect.width * 0.22)), y: rect.top + (rect.height / 2) },
        { x: rect.left + Math.min(24, Math.max(12, rect.width * 0.08)), y: rect.top + (rect.height / 2) },
      ];

      for (const probe of probes) {
        let element = document.elementFromPoint(probe.x, probe.y);
        while (element && element !== scope.parentElement) {
          if (element.matches && element.matches('input[type="checkbox"]')) {
            return { found: true, checked: Boolean(element.checked) };
          }

          if (visualChecked(element)) {
            return { found: true, checked: true };
          }

          if (element === scope) {
            break;
          }
          element = element.parentElement;
        }
      }

      return { found: false, checked: false };
    };
    const checkboxState = (scope) => {
      const inputs = [...scope.querySelectorAll('input[type="checkbox"]')];
      for (const input of inputs) {
        const control = visibleControlFor(input);
        if (isVisible(input) || (control && isVisible(control))) {
          return { found: true, checked: Boolean(input.checked) };
        }
      }

      const controls = [...scope.querySelectorAll('.checkbox-rf, [class*="checkbox"], [class*="check"], [role="checkbox"]')]
        .filter(isVisible);
      for (const control of controls) {
        if (control.getAttribute('aria-checked') !== null || hasCheckedClass(control.className) || visualChecked(control)) {
          return { found: true, checked: visualChecked(control) };
        }
      }

      return checkboxPointState(scope);
    };
    const findColumn = () => {
      const marked = document.querySelector('[data-k6-rf-filter-column="true"]');
      if (marked) {
        return marked;
      }

      const root = tableSelector ? document.querySelector(tableSelector) : document;
      if (!root) {
        return null;
      }

      const expected = normalize(columnLabel);
      const headers = [...root.querySelectorAll('th, [role="columnheader"]')].filter(isVisible);
      return headers.find((header) => {
        const label = normalize(header.innerText || header.textContent);
        const field = normalize(header.getAttribute('filter-item') || header.getAttribute('data-field') || header.getAttribute('name'));
        return field === expected || label === expected || label.includes(expected);
      }) || null;
    };

    const column = findColumn();
    if (!column) {
      return { foundColumn: false, headerChecked: false, cellTotal: 0, cellChecked: 0 };
    }

    const header = checkboxState(column);
    const table = column.closest('table');
    const index = column.parentElement ? [...column.parentElement.children].indexOf(column) : -1;
    if (!table || index < 0) {
      return {
        foundColumn: true,
        headerChecked: header.found && header.checked,
        cellTotal: 0,
        cellChecked: 0,
      };
    }

    let cellTotal = 0;
    let cellChecked = 0;
    const rows = [...table.querySelectorAll('tbody tr, tr')].filter((row) => isVisible(row) && row.querySelectorAll('td').length);
    for (const row of rows) {
      const cell = row.querySelectorAll('td')[index];
      if (!cell || !isVisible(cell)) {
        continue;
      }

      const state = checkboxState(cell);
      if (!state.found) {
        continue;
      }

      cellTotal += 1;
      if (state.checked) {
        cellChecked += 1;
      }
    }

    return {
      foundColumn: true,
      headerChecked: header.found && header.checked,
      cellTotal,
      cellChecked,
    };
  }, {
    columnLabel: options.columnLabel || '',
    tableSelector: options.tableSelector || '',
  }).catch(() => ({ foundColumn: false, headerChecked: false, cellTotal: 0, cellChecked: 0 }));

  return state.headerChecked || (state.cellTotal > 0 && state.cellChecked === state.cellTotal);
}

async function rfColumnSelectionSucceeded(page, options) {
  if (await rfColumnCheckboxesAreSelected(page, options)) {
    return true;
  }

  if (!options.enabledText) {
    return false;
  }

  return visibleActionTextIsEnabled(page, options.enabledText);
}

async function visibleActionTextIsEnabled(page, text) {
  return page.evaluate((expectedText) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const expected = normalize(expectedText);
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const isEnabled = (element) => {
      if (!element) {
        return false;
      }

      const control = element.closest('button, .button-rf, [role="button"], input[type="button"], input[type="submit"], a') || element;
      return !control.disabled && control.getAttribute('aria-disabled') !== 'true';
    };

    const candidates = [
      ...document.querySelectorAll('button, .button-rf, [role="button"], input[type="button"], input[type="submit"], a'),
    ].filter(isVisible);

    return candidates.some((element) => {
      const label = normalize(element.innerText || element.value || element.getAttribute('aria-label') || element.textContent);
      return label === expected && isEnabled(element);
    });
  }, text).catch(() => false);
}

async function waitForRfColumnCheckboxesSelected(page, options, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await rfColumnSelectionSucceeded(page, options)) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for RF table checkbox column to be selected: ${options.columnLabel}`);
}

async function clickRfColumnCellText(page, options, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate(({ cellText, columnLabel, rowMatchText, rowCellIndex, tableSelector }) => {
      const attr = 'data-k6-rf-column-cell-action';
      let header = document.querySelector('[data-k6-rf-filter-column="true"]');
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const configuredRowCellIndex = Number(rowCellIndex);
      const hasConfiguredRowCellIndex = Number.isInteger(configuredRowCellIndex) && configuredRowCellIndex >= 0;
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const horizontalOverlap = (leftA, rightA, leftB, rightB) => Math.max(0, Math.min(rightA, rightB) - Math.max(leftA, leftB));

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

      if (!header && columnLabel) {
        const root = tableSelector ? document.querySelector(tableSelector) : document;
        const expectedColumn = normalize(columnLabel);
        const headers = root ? [...root.querySelectorAll('th, [role="columnheader"]')].filter(isVisible) : [];
        header = headers.find((item) => {
          const label = normalize(item.innerText || item.textContent);
          const field = normalize(item.getAttribute('filter-item') || item.getAttribute('data-field') || item.getAttribute('name'));
          return field === expectedColumn || label === expectedColumn || label.includes(expectedColumn);
        }) || null;
        if (header) {
          header.setAttribute('data-k6-rf-filter-column', 'true');
        }
      }

      if (!header || !header.parentElement) {
        return { found: false };
      }

      const table = header.closest('table');
      if (!table) {
        return { found: false };
      }

      const index = [...header.parentElement.children].indexOf(header);
      if (index < 0) {
        return { found: false };
      }

      const expectedCell = normalize(cellText);
      const expectedRow = normalize(rowMatchText);
      const headerRect = header.getBoundingClientRect();
      const cellsForRow = (row) => {
        const cells = [...row.querySelectorAll('td')];
        const candidates = [];
        if (cells[index]) {
          candidates.push(cells[index]);
        }

        const overlapping = cells
          .map((cell) => {
            const rect = cell.getBoundingClientRect();
            return {
              cell,
              overlap: horizontalOverlap(headerRect.left, headerRect.right, rect.left, rect.right),
            };
          })
          .filter((item) => item.overlap > 0)
          .sort((a, b) => b.overlap - a.overlap)
          .map((item) => item.cell);

        for (const cell of overlapping) {
          if (!candidates.includes(cell)) {
            candidates.push(cell);
          }
        }

        return candidates;
      };
      const rowMatches = (row) => {
        if (!expectedRow) {
          return true;
        }

        const cells = [...row.querySelectorAll('td')];
        const rowText = normalize(row.innerText || row.textContent);
        return rowText.includes(expectedRow)
          || cells.some((cell) => normalize(cell.innerText || cell.textContent).includes(expectedRow));
      };
      const clickTargetForRow = (row, fallback) => {
        if (!hasConfiguredRowCellIndex) {
          return fallback;
        }

        const cells = [...row.querySelectorAll('td')];
        const actionCell = cells[configuredRowCellIndex];
        if (!actionCell || !isVisible(actionCell)) {
          return fallback;
        }

        const actionControls = [
          ...actionCell.querySelectorAll('a[href], button, [role="button"], input[type="button"], input[type="submit"]'),
        ].filter(isVisible);
        if (actionControls.length) {
          return actionControls[0];
        }

        const rowControls = [
          ...row.querySelectorAll('a[href], button, [role="button"], input[type="button"], input[type="submit"]'),
        ].filter(isVisible);
        return rowControls[0] || actionCell;
      };
      const rows = [...table.querySelectorAll('tbody tr, tr')]
        .filter((row) => row.querySelectorAll('td').length && isVisible(row));
      for (const row of rows) {
        if (!rowMatches(row)) {
          continue;
        }

        for (const cell of cellsForRow(row)) {
          if (!cell || !isVisible(cell)) {
            continue;
          }

          const controls = [
            ...cell.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"], span, div'),
            cell,
          ].filter(isVisible);
          const match = controls.find((element) => {
            const text = normalize(element.innerText || element.value || element.getAttribute('aria-label') || element.textContent);
            return text === expectedCell || text.includes(expectedCell);
          });

          if (match) {
            const matchedTarget = match.closest('button, a, [role="button"], input[type="button"], input[type="submit"]') || match;
            const target = clickTargetForRow(row, matchedTarget);
            target.scrollIntoView({ block: 'center', inline: 'center' });
            const rect = target.getBoundingClientRect();
            target.setAttribute(attr, 'true');
            const inViewport = rect.right > 0
              && rect.bottom > 0
              && rect.left < window.innerWidth
              && rect.top < window.innerHeight;
            return {
              found: true,
              inViewport,
              preferLocatorClick: target !== matchedTarget || target.matches('a[href], button, [role="button"], input[type="button"], input[type="submit"]'),
              x: rect.left + (rect.width / 2),
              y: rect.top + (rect.height / 2),
            };
          }
        }
      }

      return { found: false };
    }, {
      cellText: options.cellText || '',
      columnLabel: options.columnLabel || '',
      rowMatchText: options.rowMatchText || '',
      rowCellIndex: options.rowCellIndex,
      tableSelector: options.tableSelector || '',
    });

    if (state.found) {
      let clicked = false;
      if (state.preferLocatorClick) {
        clicked = await page.locator('[data-k6-rf-column-cell-action="true"]').click().then(() => true).catch(() => false);
      }

      if (!clicked && state.inViewport && Number.isFinite(state.x) && Number.isFinite(state.y)) {
        await clickPagePoint(page, state.x, state.y);
        clicked = true;
      }

      if (!clicked) {
        await clickElementByLocator(page, '[data-k6-rf-column-cell-action="true"]');
      }
      return true;
    }

    await page.waitForTimeout(250);
  }

  return false;
}

async function clickRfColumnCellCheckboxes(page, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const points = await page.evaluate(() => {
      const header = document.querySelector('[data-k6-rf-filter-column="true"]');
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const visibleControlFor = (input) => {
        const controls = [
          input.closest('label'),
          input.closest('.checkbox-rf'),
          input.closest('[class*="checkbox"]'),
          input.parentElement,
        ].filter(Boolean);
        return controls.find(isVisible) || input;
      };
      const checkboxTarget = (scope) => {
        const inputs = [...scope.querySelectorAll('input[type="checkbox"]')];
        for (const input of inputs) {
          const control = visibleControlFor(input);
          if ((isVisible(input) || (control && isVisible(control))) && !input.checked) {
            return control || input;
          }
        }

        const controls = [...scope.querySelectorAll('.checkbox-rf, [class*="checkbox"], [role="checkbox"]')].filter(isVisible);
        for (const control of controls) {
          const ariaChecked = control.getAttribute('aria-checked');
          const className = String(control.className || '').toLowerCase();
          const checked = ariaChecked === 'true' || className.includes('checked') || className.includes('selected');
          if (!checked) {
            return control;
          }
        }

        return null;
      };

      if (!header || !header.parentElement) {
        return [];
      }

      const table = header.closest('table');
      if (!table) {
        return [];
      }

      const index = [...header.parentElement.children].indexOf(header);
      if (index < 0) {
        return [];
      }

      const clickPoints = [];
      const rows = [...table.querySelectorAll('tbody tr, tr')].filter((row) => isVisible(row) && row.querySelectorAll('td').length);
      for (const row of rows) {
        const cell = row.querySelectorAll('td')[index];
        if (!cell || !isVisible(cell)) {
          continue;
        }

        const rect = cell.getBoundingClientRect();
        clickPoints.push({
          x: rect.left + Math.min(52, Math.max(18, rect.width * 0.22)),
          y: rect.top + (rect.height / 2),
        });
      }

      return clickPoints;
    }).catch(() => []);

    if (points.length > 0) {
      for (const point of points) {
        await clickPagePoint(page, point.x, point.y);
        await page.waitForTimeout(100);
      }
      return true;
    }

    await page.waitForTimeout(250);
  }

  return false;
}

async function clickRfColumnCellCheckbox(page, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate(() => {
      const attr = 'data-k6-rf-column-cell-checkbox';
      const header = document.querySelector('[data-k6-rf-filter-column="true"]');
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const visibleControlFor = (input) => {
        const controls = [
          input.closest('label'),
          input.closest('.checkbox-rf'),
          input.closest('[class*="checkbox"]'),
          input.parentElement,
        ].filter(Boolean);
        return controls.find(isVisible) || input;
      };

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

      if (!header || !header.parentElement) {
        return { found: false };
      }

      const table = header.closest('table');
      if (!table) {
        return { found: false };
      }

      const index = [...header.parentElement.children].indexOf(header);
      if (index < 0) {
        return { found: false };
      }

      const rows = [...table.querySelectorAll('tbody tr, tr')].filter((row) => row.querySelectorAll('td').length);
      for (const row of rows) {
        const cell = row.querySelectorAll('td')[index];
        if (!cell || !isVisible(cell)) {
          continue;
        }

        const input = cell.querySelector('input[type="checkbox"]');
        if (input) {
          visibleControlFor(input).setAttribute(attr, 'true');
          return { found: true };
        }

        const control = [...cell.querySelectorAll('.checkbox-rf, [class*="checkbox"], [role="checkbox"]')].find(isVisible);
        if (control) {
          control.setAttribute(attr, 'true');
          return { found: true };
        }

        const rect = cell.getBoundingClientRect();
        return {
          found: true,
          x: rect.left + Math.min(52, Math.max(18, rect.width * 0.22)),
          y: rect.top + (rect.height / 2),
        };
      }

      return { found: false };
    });

    if (state.found) {
      if (state.x !== undefined && state.y !== undefined) {
        await clickPagePoint(page, state.x, state.y);
      } else {
        await page.locator('[data-k6-rf-column-cell-checkbox="true"]').click();
      }
      return true;
    }

    await page.waitForTimeout(250);
  }

  return false;
}

async function setRfCheckbox(page, scopeSelector, labelText, checked, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await page.evaluate(({ scopeSelector, labelText, checked }) => {
      const attr = 'data-k6-rf-checkbox-target';
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const labelFor = (input) => {
        if (input.id) {
          const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
          if (label) {
            return label;
          }
        }
        return input.closest('label') || input.closest('.checkbox-rf') || input.parentElement;
      };

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

      const scope = document.querySelector(scopeSelector);
      if (!scope) {
        return { found: false };
      }

      const expected = normalize(labelText);
      const inputs = [...scope.querySelectorAll('input[type="checkbox"]')].filter((input) => {
        const control = labelFor(input);
        return isVisible(input) || (control && isVisible(control));
      });
      for (const input of inputs) {
        const control = labelFor(input) || input;
        if (normalize(control.innerText || input.value) === expected || normalize(control.innerText || input.value).includes(expected)) {
          control.setAttribute(attr, 'true');
          return { found: true, alreadySet: input.checked === checked };
        }
      }

      const controls = [...scope.querySelectorAll('.checkbox-rf, [role="checkbox"]')].filter(isVisible);
      for (const control of controls) {
        if (normalize(control.innerText || control.getAttribute('aria-label')) === expected || normalize(control.innerText || control.getAttribute('aria-label')).includes(expected)) {
          const ariaChecked = control.getAttribute('aria-checked');
          control.setAttribute(attr, 'true');
          return { found: true, alreadySet: ariaChecked ? (ariaChecked === 'true') === checked : false };
        }
      }

      return { found: false };
    }, { scopeSelector, labelText, checked });

    if (state.found) {
      if (!state.alreadySet) {
        await page.locator('[data-k6-rf-checkbox-target="true"]').click();
      }
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for RF checkbox: ${labelText}`);
}

async function selectRfOptionInScope(page, scopeSelector, optionText, timeoutMs, options = {}) {
  const selectCount = await markRfSelectCandidates(page, scopeSelector, timeoutMs);
  const indexes = [...Array(selectCount).keys()];
  if (options.reverse) {
    indexes.reverse();
  }

  for (const index of indexes) {
    await markRfSelectCandidate(page, index);
    await clickElementByLocator(page, '[data-k6-rf-filter-select="true"]');

    const found = await findOpenRfSelectOption(page, optionText, 4000, options);
    if (found) {
      await clickElementByLocator(page, '.select-rf-popper.True [data-k6-target-option="true"]');
      await waitForElementText(page, '[data-k6-rf-filter-select="true"]', optionText, timeoutMs).catch(() => {});
      return;
    }

    await page.keyboard.press('Escape').catch(() => {});
  }

  throw new Error(`Option was not visible in any RF select in ${scopeSelector}: ${optionText}`);
}

async function markRfSelectByFieldLabel(page, scopeSelector, fieldLabel) {
  return page.evaluate(({ scopeSelector, fieldLabel }) => {
    const attr = 'data-k6-rf-field-select';
    const normalize = (value) => String(value || '')
      .replace(/\*/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const textOf = (element) => normalize(element.innerText || element.textContent || element.getAttribute('aria-label'));
    const expected = normalize(fieldLabel);
    const scope = document.querySelector(scopeSelector) || document;

    document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

    const selects = [...scope.querySelectorAll('.select-rf')].filter(isVisible);
    if (!selects.length) {
      return false;
    }

    const labels = [...scope.querySelectorAll('label, div, span, p')]
      .filter((element) => {
        if (!isVisible(element) || element.closest('.select-rf')) {
          return false;
        }

        if ([...element.querySelectorAll('.select-rf')].some(isVisible)) {
          return false;
        }

        const text = textOf(element);
        return text && (text === expected || text.includes(expected) || expected.includes(text));
      })
      .sort((first, second) => {
        const firstText = textOf(first);
        const secondText = textOf(second);
        const firstExact = firstText === expected ? 0 : 1;
        const secondExact = secondText === expected ? 0 : 1;
        if (firstExact !== secondExact) {
          return firstExact - secondExact;
        }

        return firstText.length - secondText.length;
      });

    if (!labels.length) {
      if (selects.length === 1) {
        selects[0].setAttribute(attr, 'true');
        return true;
      }

      return false;
    }

    const exactLabels = labels.filter((label) => textOf(label) === expected);
    const candidateLabels = exactLabels.length ? exactLabels : labels;

    let best = null;
    for (const select of selects) {
      const selectRect = select.getBoundingClientRect();
      for (const label of candidateLabels) {
        if (label.contains(select)) {
          continue;
        }

        const labelRect = label.getBoundingClientRect();
        const verticalOverlap = Math.min(selectRect.bottom, labelRect.bottom) - Math.max(selectRect.top, labelRect.top);
        const sameRow = verticalOverlap > Math.min(selectRect.height, labelRect.height) * 0.4;
        if (sameRow && selectRect.right < labelRect.right - 5) {
          continue;
        }

        const horizontalOverlap = Math.min(selectRect.right, labelRect.right) - Math.max(selectRect.left, labelRect.left);
        if (!sameRow && horizontalOverlap <= 0 && Math.abs(selectRect.left - labelRect.left) > 80) {
          continue;
        }

        const verticalGap = selectRect.top >= labelRect.top
          ? Math.max(0, selectRect.top - labelRect.bottom)
          : Math.max(0, labelRect.top - selectRect.bottom);
        const horizontalGap = sameRow
          ? Math.max(0, selectRect.left - labelRect.right)
          : Math.abs(selectRect.left - labelRect.left);
        const labelIsNear = labelRect.bottom <= selectRect.bottom + 20
          && labelRect.top >= selectRect.top - 120
          && verticalGap <= 120;

        if (!labelIsNear) {
          continue;
        }

        const score = verticalGap + (horizontalGap / 100);
        if (!best || score < best.score) {
          best = { select, score };
        }
      }
    }

    if (!best) {
      return false;
    }

    best.select.setAttribute(attr, 'true');
    return true;
  }, { scopeSelector, fieldLabel }).catch(() => false);
}

async function findOpenRfSelectOption(page, optionText, timeoutMs, options = {}) {
  if (await markVisibleOptionIfPresent(page, optionText, timeoutMs)) {
    return true;
  }

  for (const searchText of rfSelectSearchTexts(optionText)) {
    if (!await fillOpenRfSelectSearch(page, searchText, options)) {
      return false;
    }

    if (await markVisibleOptionIfPresent(page, optionText, timeoutMs)) {
      return true;
    }
  }

  return false;
}

function rfSelectSearchTexts(optionText) {
  return [
    String(optionText || ''),
    String(optionText || '').replace(/[_-]+/g, ' '),
  ].map((item) => item.trim()).filter((item, index, all) => item && all.indexOf(item) === index);
}

async function markRfSelectCandidates(page, scopeSelector, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const count = await page.evaluate((selector) => {
      const indexAttr = 'data-k6-rf-filter-select-index';
      const targetAttr = 'data-k6-rf-filter-select';
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      document.querySelectorAll(`[${indexAttr}], [${targetAttr}]`).forEach((element) => {
        element.removeAttribute(indexAttr);
        element.removeAttribute(targetAttr);
      });

      const scope = document.querySelector(selector);
      if (!scope) {
        return 0;
      }

      const selects = [...scope.querySelectorAll('.select-rf')].filter(isVisible);
      selects.forEach((select, index) => select.setAttribute(indexAttr, String(index)));
      return selects.length;
    }, scopeSelector);

    if (count > 0) {
      return count;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for RF select in ${scopeSelector}`);
}

async function markRfSelectCandidate(page, index) {
  await page.evaluate((candidateIndex) => {
    const indexAttr = 'data-k6-rf-filter-select-index';
    const targetAttr = 'data-k6-rf-filter-select';
    document.querySelectorAll(`[${targetAttr}]`).forEach((element) => element.removeAttribute(targetAttr));
    const select = document.querySelector(`[${indexAttr}="${candidateIndex}"]`);
    if (select) {
      select.setAttribute(targetAttr, 'true');
    }
  }, String(index));
}

async function markVisibleOptionIfPresent(page, optionText, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate((text) => {
      const attr = 'data-k6-target-option';
      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const expected = normalize(text);
      const aliases = [
        expected,
        normalize(String(text || '').replace(/[_-]+/g, ' ')),
      ].filter((item, index, all) => item && all.indexOf(item) === index);
      const optionText = (element) => [
        element.innerText,
        element.textContent,
        element.getAttribute('value'),
        element.getAttribute('data-value'),
        element.getAttribute('data-key'),
        element.getAttribute('title'),
        element.getAttribute('aria-label'),
      ].filter(Boolean).join(' ');
      const matches = (label) => aliases.some((alias) => label === alias || label.includes(alias));
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const rows = [
        ...document.querySelectorAll('.select-rf-popper.True .select-rf-popper-item'),
        ...document.querySelectorAll('.select-rf-popper.True [role="option"], .select-rf-popper.True li'),
      ].filter(isVisible);
      const items = rows.map((element) => ({
        element,
        label: normalize(optionText(element)),
      })).filter((item) => item.label && item.label !== 'clear' && item.label !== 'no record available!');
      const match = items.find((item) => matches(item.label));
      if (match) {
        match.element.setAttribute(attr, 'true');
        return true;
      }
      return false;
    }, optionText);

    if (found) {
      return true;
    }

    await page.waitForTimeout(100);
  }

  return false;
}

async function fillOpenRfSelectSearch(page, optionText, options = {}) {
  const found = await page.evaluate(() => {
    const attr = 'data-k6-rf-select-search';
    document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const inputs = [...document.querySelectorAll('.select-rf-popper.True input, .select-rf-popper.True textarea')]
      .filter((element) => {
        const type = String(element.getAttribute('type') || '').toLowerCase();
        return isVisible(element) && !['checkbox', 'radio', 'hidden', 'button', 'submit'].includes(type);
      });
    const input = inputs[0];
    if (!input) {
      return false;
    }

    input.setAttribute(attr, 'true');
    return true;
  });

  if (!found) {
    return false;
  }

  const locator = page.locator('[data-k6-rf-select-search="true"]');
  const typeDelayMs = Number(options.typeDelayMs || 10);
  await locator.click().catch(() => {});
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});

  if (typeof locator.type === 'function') {
    await locator.type(optionText, { delay: typeDelayMs }).catch(async () => {
      await locator.fill(optionText);
    });
  } else if (typeof page.keyboard.type === 'function') {
    await page.keyboard.type(optionText, { delay: typeDelayMs }).catch(async () => {
      await locator.fill(optionText);
    });
  } else {
    await locator.fill(optionText);
  }

  await page.evaluate((value) => {
    const input = document.querySelector('[data-k6-rf-select-search="true"]');
    if (!input) {
      return;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, optionText).catch(() => {});
  await page.waitForTimeout(300);
  return true;
}

async function findOpenRfMultiOption(page, optionText, timeoutMs, options = {}) {
  const visibleOption = await markVisibleMultiOptionIfPresent(page, optionText, timeoutMs, options);
  if (visibleOption) {
    return visibleOption;
  }

  if (!await fillOpenRfMultiSearch(page, optionText, options)) {
    return '';
  }

  return markVisibleMultiOptionIfPresent(page, optionText, timeoutMs, options);
}

async function markVisibleMultiOptionIfPresent(page, optionText, timeoutMs, options = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate(({ text, skipLabels }) => {
      const attr = 'data-k6-target-multi-option';
      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const expected = normalize(text);
      const skipped = new Set((skipLabels || []).map(normalize));
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const isSelected = (element) => {
        const checkbox = element.querySelector('input[type="checkbox"], [role="checkbox"]');
        const className = String(element.className || '').toLowerCase();
        return Boolean((checkbox && (checkbox.checked || checkbox.getAttribute('aria-checked') === 'true'))
          || element.getAttribute('aria-selected') === 'true'
          || element.getAttribute('aria-checked') === 'true'
          || className.includes('selected')
          || className.includes('checked'));
      };
      const hasVisiblePopper = (element) => {
        const popper = element.closest('.multiselect-rf-popper');
        return popper && isVisible(popper);
      };
      const rows = [
        ...document.querySelectorAll('.multiselect-rf-popper.True .multiselect-rf-popper-item'),
        ...document.querySelectorAll('.multiselect-rf-popper.True [role="option"], .multiselect-rf-popper.True li'),
        ...document.querySelectorAll('.multiselect-rf-popper .multiselect-rf-popper-item'),
        ...document.querySelectorAll('.multiselect-rf-popper [role="option"], .multiselect-rf-popper li'),
      ].filter((element, index, all) => all.indexOf(element) === index && isVisible(element) && hasVisiblePopper(element));
      const items = rows.map((element) => ({
        element,
        displayLabel: String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
        label: normalize(element.innerText || element.textContent),
      })).filter((item) => item.label
        && item.label !== 'clear'
        && item.label !== 'select all'
        && item.label !== 'no record available!'
        && !skipped.has(item.label)
        && !isSelected(item.element));
      const match = items.find((item) => item.label === expected) || items.find((item) => item.label.includes(expected));
      if (match) {
        const control = [...match.element.querySelectorAll('input[type="checkbox"], [role="checkbox"]')].find(isVisible);
        (control || match.element).setAttribute(attr, 'true');
        return match.displayLabel || text;
      }
      return '';
    }, { text: optionText, skipLabels: options.skipLabels || [] });

    if (found) {
      return found;
    }

    await page.waitForTimeout(100);
  }

  return false;
}

async function fillOpenRfMultiSearch(page, optionText, options = {}) {
  const found = await page.evaluate(() => {
    const attr = 'data-k6-rf-multi-search';
    document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const hasVisiblePopper = (element) => {
      const popper = element.closest('.multiselect-rf-popper');
      return popper && isVisible(popper);
    };
    const inputs = [...document.querySelectorAll('.multiselect-rf-popper input, .multiselect-rf-popper textarea')]
      .filter((element) => {
        const type = String(element.getAttribute('type') || '').toLowerCase();
        return isVisible(element) && hasVisiblePopper(element) && !['checkbox', 'radio', 'hidden', 'button', 'submit'].includes(type);
      });
    const input = inputs[0];
    if (!input) {
      return false;
    }

    input.setAttribute(attr, 'true');
    return true;
  });

  if (!found) {
    return false;
  }

  const locator = page.locator('[data-k6-rf-multi-search="true"]');
  const typeDelayMs = Number(options.typeDelayMs || 10);
  await locator.click().catch(() => {});
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});

  if (typeof locator.type === 'function') {
    await locator.type(optionText, { delay: typeDelayMs }).catch(async () => {
      await locator.fill(optionText);
    });
  } else if (typeof page.keyboard.type === 'function') {
    await page.keyboard.type(optionText, { delay: typeDelayMs }).catch(async () => {
      await locator.fill(optionText);
    });
  } else {
    await locator.fill(optionText);
  }

  await page.evaluate((value) => {
    const input = document.querySelector('[data-k6-rf-multi-search="true"]');
    if (!input) {
      return;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, optionText).catch(() => {});
  await page.waitForTimeout(300);
  return true;
}

async function fillRfFilterValue(page, valueSelector, popupSelector, value, timeoutMs, options = {}) {
  if (valueSelector) {
    await fillOrTypeLocator(page, page.locator(valueSelector), value, options.typeDelayMs);
    return;
  }

  const inputFound = await markRfFilterInput(page, popupSelector, Math.min(timeoutMs, 5000));
  if (inputFound) {
    await fillOrTypeLocator(page, page.locator('[data-k6-rf-filter-value="true"]'), value, options.typeDelayMs);
    return;
  }

  await selectRfOptionInScope(page, popupSelector, value, timeoutMs, {
    reverse: true,
    typeDelayMs: options.typeDelayMs,
  });
}

async function fillOrTypeLocator(page, locator, value, typeDelayMs) {
  const delay = Number(typeDelayMs || 0);
  if (delay <= 0) {
    await locator.fill(value);
    return;
  }

  await locator.click().catch(() => {});
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});

  if (typeof locator.type === 'function') {
    await locator.type(value, { delay }).catch(async () => {
      await locator.fill(value);
    });
  } else if (typeof page.keyboard.type === 'function') {
    await page.keyboard.type(value, { delay }).catch(async () => {
      await locator.fill(value);
    });
  } else {
    await locator.fill(value);
  }
}

async function fillFieldByText(page, fieldText, value, scopeSelector, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate(({ fieldText, scopeSelector }) => {
      const attr = 'data-k6-rf-field-target';
      const normalize = (candidate) => String(candidate || '')
        .replace(/\*/g, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const expected = normalize(fieldText);
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const canEdit = (element) => {
        if (!element || element.disabled) {
          return false;
        }

        const allowReadOnly = expected.includes('date');
        if (element.readOnly && !allowReadOnly) {
          return false;
        }

        const tag = element.tagName.toLowerCase();
        const type = String(element.getAttribute('type') || '').toLowerCase();
        return element.isContentEditable || tag === 'textarea' || (tag === 'input' && !['hidden', 'checkbox', 'radio', 'button', 'submit'].includes(type));
      };

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

      const scope = document.querySelector(scopeSelector) || document;
      const fields = [...scope.querySelectorAll('input, textarea, [contenteditable="true"]')].filter((element) => canEdit(element) && isVisible(element));

      let field = fields.find((element) => {
        const tokens = [
          element.getAttribute('placeholder'),
          element.getAttribute('aria-label'),
          element.getAttribute('name'),
          element.getAttribute('id'),
          element.getAttribute('data-field'),
        ].map(normalize);
        return tokens.some((token) => token === expected || token.includes(expected));
      });

      if (!field) {
        const labels = [...scope.querySelectorAll('label, .label-rf, [class*="label"], div, span')].filter(isVisible);
        const label = labels.find((element) => normalize(element.innerText || element.textContent) === expected);
        if (label) {
          if (label.getAttribute('for')) {
            field = scope.querySelector(`#${CSS.escape(label.getAttribute('for'))}`);
          }
          if (!field) {
            const container = label.closest('.form-group, .input-group, .row, .col, [class*="field"]') || label.parentElement;
            field = container ? [...container.querySelectorAll('input, textarea, [contenteditable="true"]')].find((element) => canEdit(element) && isVisible(element)) : null;
          }
        }
      }

      if (!field) {
        return false;
      }

      field.setAttribute(attr, 'true');
      return true;
    }, { fieldText, scopeSelector });

    if (found) {
      const locator = page.locator('[data-k6-rf-field-target="true"]');
      await locator.click().catch(() => {});
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.press('Backspace').catch(() => {});

      let filled = false;
      if (typeof locator.type === 'function') {
        filled = await locator.type(value, { delay: 10 })
          .then(() => true)
          .catch(async () => locator.fill(value).then(() => true).catch(() => false));
      } else if (typeof page.keyboard.type === 'function') {
        filled = await page.keyboard.type(value, { delay: 10 })
          .then(() => true)
          .catch(async () => locator.fill(value).then(() => true).catch(() => false));
      } else {
        filled = await locator.fill(value).then(() => true).catch(async () => {
          if (typeof page.keyboard.insertText === 'function') {
            return page.keyboard.insertText(value).then(() => true).catch(() => false);
          }

          return false;
        });
      }

      if (!filled) {
        await page.evaluate((inputValue) => {
          const element = document.querySelector('[data-k6-rf-field-target="true"]');
          if (!element) {
            return;
          }

          if (element.isContentEditable) {
            element.textContent = inputValue;
          } else {
            element.value = inputValue;
            element.setAttribute('value', inputValue);
          }
        }, value);
      }

      await page.keyboard.press('Tab').catch(() => {});
      await page.waitForTimeout(250);

      await page.evaluate((inputValue) => {
        const element = document.querySelector('[data-k6-rf-field-target="true"]');
        if (!element) {
          return;
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }, value).catch(async () => {
        await page.evaluate((inputValue) => {
          const element = document.querySelector('[data-k6-rf-field-target="true"]');
          if (!element) {
            return;
          }

          if (element.isContentEditable) {
            element.textContent = inputValue;
          } else {
            element.value = inputValue;
          }
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
      });
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for field: ${fieldText}`);
}

async function markRfFilterInput(page, popupSelector, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await page.evaluate((selector) => {
      const attr = 'data-k6-rf-filter-value';
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

      const scope = document.querySelector(selector);
      if (!scope) {
        return false;
      }

      const inputs = [...scope.querySelectorAll('input, textarea, [contenteditable="true"]')].filter((element) => {
        const type = String(element.getAttribute('type') || '').toLowerCase();
        return isVisible(element) && !['checkbox', 'radio', 'hidden', 'button', 'submit'].includes(type);
      });

      const input = inputs.find((element) => !element.closest('.select-rf')) || inputs[0];
      if (!input) {
        return false;
      }

      input.setAttribute(attr, 'true');
      return true;
    }, popupSelector);

    if (result) {
      return true;
    }

    await page.waitForTimeout(250);
  }

  return false;
}

async function clickVisibleText(page, scopeSelector, text, timeoutMs) {
  await waitForRfLoadingToSettle(page, Math.min(timeoutMs, 30000)).catch(() => {});

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate(({ scopeSelector, text }) => {
      const attr = 'data-k6-rf-click-target';
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const isEnabled = (element) => {
        if (!element) {
          return false;
        }

        if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
          return false;
        }

        const control = element.closest('button, .button-rf, [role="button"], input[type="button"], input[type="submit"], a, [class*="btn"], [class*="Btn"], [class*="button"], [class*="Button"]');
        return !control || (!control.disabled && control.getAttribute('aria-disabled') !== 'true');
      };

      document.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));

      const scope = document.querySelector(scopeSelector);
      if (!scope) {
        return false;
      }

      const expected = normalize(text);
      const clickableSelector = 'button, .button-rf, [role="button"], input[type="button"], input[type="submit"], a, [class*="btn"], [class*="Btn"], [class*="button"], [class*="Button"]';
      const findMatch = (candidates) => candidates.find((element) => {
        if (normalize(element.innerText || element.value || element.getAttribute('aria-label')) !== expected) {
          return false;
        }

        const clickable = element.closest(clickableSelector) || element;
        return isEnabled(clickable);
      });
      const controls = [...scope.querySelectorAll(clickableSelector)].filter(isVisible);
      const containers = [...scope.querySelectorAll('div, span')].filter(isVisible);
      const match = findMatch(controls) || findMatch(containers);
      if (!match) {
        return false;
      }

      const clickable = match.closest(clickableSelector) || match;
      clickable.setAttribute(attr, 'true');
      return true;
    }, { scopeSelector, text });

    if (found) {
      const point = await page.evaluate(() => {
        const target = document.querySelector('[data-k6-rf-click-target="true"]');
        if (!target) {
          return null;
        }

        const centerInScrollableAncestor = (element) => {
          let current = element.parentElement;
          while (current && current !== document.documentElement) {
            const canScrollY = current.scrollHeight > current.clientHeight + 1;
            const canScrollX = current.scrollWidth > current.clientWidth + 1;
            if (canScrollY || canScrollX) {
              const targetRect = element.getBoundingClientRect();
              const scrollerRect = current.getBoundingClientRect();
              if (canScrollY) {
                current.scrollTop += (targetRect.top + (targetRect.height / 2))
                  - (scrollerRect.top + (scrollerRect.height / 2));
              }
              if (canScrollX) {
                current.scrollLeft += (targetRect.left + (targetRect.width / 2))
                  - (scrollerRect.left + (scrollerRect.width / 2));
              }
            }
            current = current.parentElement;
          }
        };

        target.scrollIntoView({ block: 'center', inline: 'center' });
        centerInScrollableAncestor(target);

        const rect = target.getBoundingClientRect();
        const inViewport = rect.right > 0
          && rect.bottom > 0
          && rect.left < window.innerWidth
          && rect.top < window.innerHeight;
        return {
          inViewport,
          x: Math.max(1, Math.min(window.innerWidth - 1, rect.left + (rect.width / 2))),
          y: Math.max(1, Math.min(window.innerHeight - 1, rect.top + (rect.height / 2))),
        };
      }).catch(() => null);

      let clicked = false;
      if (point && point.inViewport && page.mouse && typeof page.mouse.click === 'function') {
        clicked = await page.mouse.click(point.x, point.y).then(() => true).catch(() => false);
      }

      if (!clicked) {
        clicked = await page.locator('[data-k6-rf-click-target="true"]').click().then(() => true).catch(() => false);
      }

      if (!clicked) {
        clicked = await page.evaluate(() => {
          const target = document.querySelector('[data-k6-rf-click-target="true"]');
          if (!target) {
            return false;
          }

          const eventInit = { bubbles: true, cancelable: true, view: window };
          if (typeof PointerEvent === 'function') {
            target.dispatchEvent(new PointerEvent('pointerdown', eventInit));
            target.dispatchEvent(new PointerEvent('pointerup', eventInit));
          }
          target.dispatchEvent(new MouseEvent('mousedown', eventInit));
          target.dispatchEvent(new MouseEvent('mouseup', eventInit));
          target.click();
          return true;
        }).catch(() => false);
      }

      if (!clicked) {
        throw new Error(`Timed out waiting to click "${text}" in ${scopeSelector}`);
      }
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting to click "${text}" in ${scopeSelector}`);
}

async function waitForRfColumnFilterState(page, options, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate(({ columnLabel, tableSelector, condition, value }) => {
      const normalize = (candidate) => String(candidate || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const root = tableSelector ? document.querySelector(tableSelector) : document;
      if (!root) {
        return false;
      }

      const expectedColumn = normalize(columnLabel);
      const headers = [...root.querySelectorAll('th[filter-item]')];
      const header = headers.find((item) => {
        const label = normalize(item.innerText);
        const field = normalize(item.getAttribute('filter-item'));
        return field === expectedColumn || label === expectedColumn || label.includes(expectedColumn);
      });

      if (!header) {
        return false;
      }

      const filterValue = normalize(header.getAttribute('filter-item-val'));
      const filterCondition = normalize(header.getAttribute('filter-item-op'));
      const expectedValue = normalize(value);
      const expectedCondition = normalize(condition);
      const conditionMatches = !expectedCondition
        || !filterCondition
        || filterCondition.includes(expectedCondition)
        || (['equal', 'equals'].includes(expectedCondition) && ['eq', '=', '==', 'equal', 'equals'].includes(filterCondition));

      return filterValue.includes(expectedValue) && conditionMatches;
    }, {
      columnLabel: options.columnLabel,
      tableSelector: options.tableSelector || '',
      condition: options.condition || '',
      value: options.value || '',
    });

    if (found) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for RF table filter state: ${options.columnLabel} ${options.condition || ''} ${options.value || ''}`.trim());
}

async function waitForRfTableColumnVisibleRows(page, options, timeoutMs) {
  const started = Date.now();
  let lastState = null;
  while (Date.now() - started < timeoutMs) {
    lastState = await page.evaluate(({ columnLabel, tableSelector, value }) => {
      const normalize = (candidate) => String(candidate || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const normalizeLoose = (candidate) => normalize(candidate).replace(/[^a-z0-9]+/g, '');
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const horizontalOverlap = (leftA, rightA, leftB, rightB) => Math.max(0, Math.min(rightA, rightB) - Math.max(leftA, leftB));

      const root = tableSelector ? document.querySelector(tableSelector) : document;
      if (!root) {
        return { ready: false, reason: 'table root missing', visibleRows: 0, matchingRows: 0 };
      }

      const expectedColumn = normalize(columnLabel);
      const expectedColumnLoose = normalizeLoose(columnLabel);
      const headers = [...root.querySelectorAll('th, [role="columnheader"]')].filter(isVisible);
      const header = headers.find((item) => {
        const label = normalize(item.innerText || item.textContent);
        const labelLoose = normalizeLoose(item.innerText || item.textContent);
        const field = normalize(item.getAttribute('filter-item') || item.getAttribute('data-field') || item.getAttribute('name'));
        const fieldLoose = normalizeLoose(item.getAttribute('filter-item') || item.getAttribute('data-field') || item.getAttribute('name'));
        return field === expectedColumn
          || fieldLoose === expectedColumnLoose
          || label === expectedColumn
          || label.includes(expectedColumn)
          || labelLoose.includes(expectedColumnLoose);
      });

      if (!header) {
        return { ready: false, reason: 'column missing', visibleRows: 0, matchingRows: 0 };
      }

      const expectedValue = normalize(value);
      const headerRect = header.getBoundingClientRect();
      const headerCenter = headerRect.left + (headerRect.width / 2);
      const table = header.closest('table') || root.querySelector('table');
      if (!table) {
        return { ready: false, reason: 'table missing', visibleRows: 0, matchingRows: 0 };
      }

      let visibleRows = 0;
      let matchingRows = 0;
      const nonMatchingSamples = [];
      const rows = [...table.querySelectorAll('tbody tr, tr')]
        .filter((row) => row.querySelectorAll('td').length && isVisible(row));

      for (const row of rows) {
        const cells = [...row.querySelectorAll('td')].filter(isVisible);
        if (!cells.length) {
          continue;
        }

        const candidates = cells
          .map((cell) => {
            const rect = cell.getBoundingClientRect();
            const overlap = horizontalOverlap(headerRect.left, headerRect.right, rect.left, rect.right);
            const center = rect.left + (rect.width / 2);
            return {
              cell,
              overlap,
              distance: Math.abs(center - headerCenter),
            };
          })
          .filter((candidate) => candidate.overlap > 0)
          .sort((left, right) => right.overlap - left.overlap || left.distance - right.distance);

        const targetCell = candidates[0]?.cell;
        if (!targetCell) {
          continue;
        }

        const cellText = normalize(targetCell.innerText || targetCell.textContent);
        if (!cellText || cellText === 'loading...') {
          continue;
        }

        visibleRows += 1;
        if (cellText === expectedValue || cellText.includes(expectedValue)) {
          matchingRows += 1;
        } else if (nonMatchingSamples.length < 3) {
          nonMatchingSamples.push(cellText);
        }
      }

      return {
        ready: visibleRows > 0 && visibleRows === matchingRows,
        reason: visibleRows ? 'rows not matched' : 'rows missing',
        visibleRows,
        matchingRows,
        nonMatchingSamples,
      };
    }, {
      columnLabel: options.columnLabel,
      tableSelector: options.tableSelector || '',
      value: options.value || '',
    }).catch((error) => ({ ready: false, reason: error.message, visibleRows: 0, matchingRows: 0 }));

    if (lastState.ready) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for visible ${options.columnLabel} rows to equal ${options.value}: ${JSON.stringify(lastState)}`);
}

async function waitForVisibleSelector(page, selector, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isVisibleSelector(page, selector)) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for visible selector: ${selector}`);
}

async function isVisibleSelector(page, selector) {
  return page.evaluate((scopeSelector) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    return [...document.querySelectorAll(scopeSelector)].some(isVisible);
  }, selector).catch(() => false);
}

async function clickElement(page, selector) {
  await page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (element) {
      element.click();
    }
  }, selector).catch(() => {});
}

async function clickElementByLocator(page, selector) {
  await page.locator(selector).click().catch(async () => {
    await clickElement(page, selector);
  });
}

async function waitForElementText(page, selector, expectedText, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await page.locator(selector).textContent().catch(() => '');
    if ((text || '').includes(expectedText)) {
      return text;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Timed out waiting for selector "${selector}" to contain "${expectedText}"`);
}

async function waitForElementTextLike(page, selector, expectedText, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate(({ selector, expectedText }) => {
      const element = document.querySelector(selector);
      if (!element) {
        return false;
      }

      const normalize = (value) => String(value || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const text = normalize(element.innerText || element.textContent);
      const expected = normalize(expectedText);
      return Boolean(text && expected && (text === expected || text.includes(expected)));
    }, { selector, expectedText }).catch(() => false);

    if (found) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for selector "${selector}" to contain option "${expectedText}"`);
}
