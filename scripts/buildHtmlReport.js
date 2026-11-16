const REPORT_TITLE = 'CVA Cash App k6 Browser Load Test Performance Report';

export function buildConsoleSummary(data, context) {
  const rows = buildAggregateRows(data, context);
  const showLoadTestPerformance = reportOptionEnabled(context, 'showLoadTestPerformance');
  const showStageByStage = reportOptionEnabled(context, 'showStageByStage');
  const showGrafanaVisualization = reportOptionEnabled(context, 'showGrafanaVisualization');
  const lines = [
    '',
    REPORT_TITLE,
    `Flow: ${context.baseUrl}`,
    context.routeBase ? `Route base: /${context.routeBase}` : 'Route base: /',
  ];

  if (showLoadTestPerformance) {
    lines.push('');
    lines.push('Smoke Load Test Performance');
    lines.push('Name\tVUs\tAverage\tMedian\t90% Line\t95% Line\t99% Line\tMin\tMax\tPasses %\tError %\tThroughput\tSize');
    for (const row of rows) {
      lines.push([
        row.label,
        row.samples,
        row.average,
        row.median,
        row.p90,
        row.p95,
        row.p99,
        row.min,
        row.max,
        row.passPercent,
        row.errorPercent,
        row.throughput,
        row.size,
      ].join('\t'));
    }
  }

  if (showStageByStage) {
    lines.push('');
    lines.push('Stress');
    lines.push('Stress\tVUs\tAvg Resp. Time\tP95\tRPS\tPasses %\tError Rate');
    for (const row of buildStageByStageRows(data, context, rows)) {
      lines.push([
        row.stage,
        row.vus,
        row.average,
        row.p95,
        row.rps,
        row.passRate,
        row.errorRate,
      ].join('\t'));
    }
  }

  if (showGrafanaVisualization) {
    lines.push('');
    lines.push('Grafana Visualization');
    lines.push('Time\tActive VUs\tAvg Response\tRPS');
    for (const row of buildGrafanaVisualizationRows(data, context)) {
      lines.push([
        row.time,
        row.activeVus,
        row.average,
        row.rps,
      ].join('\t'));
    }
  }

  lines.push('');
  lines.push('Reports written:');
  lines.push('  reports/performance-report.html');
  lines.push('  reports/k6-summary.json');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export function buildHtmlReport(data, context) {
  const generatedAt = new Date().toISOString();
  const rows = buildAggregateRows(data, context);
  const showLoadTestPerformance = reportOptionEnabled(context, 'showLoadTestPerformance');
  const showStageByStage = reportOptionEnabled(context, 'showStageByStage');
  const showGrafanaVisualization = reportOptionEnabled(context, 'showGrafanaVisualization');
  const stageRows = showStageByStage ? buildStageByStageRows(data, context, rows) : [];
  const grafanaRows = showGrafanaVisualization ? buildGrafanaVisualizationRows(data, context) : [];
  const failureRate = totalErrorRate(data, rows);
  const passRate = inverseRate(failureRate);
  const errorStatusClass = failureRate === undefined || failureRate === 0 ? 'status-ok' : 'status-warn';
  const passStatusClass = passRate === undefined || passRate === 1 ? 'status-ok' : 'status-warn';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(REPORT_TITLE)}</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --panel: #ffffff;
      --line: #d7dde8;
      --head: #e9eef7;
      --text: #172033;
      --muted: #627083;
      --ok: #116329;
      --warn: #9a3412;
    }

    body {
      margin: 0;
      color: var(--text);
      background: var(--bg);
      font: 13px/1.45 Arial, Helvetica, sans-serif;
    }

    main {
      max-width: 1280px;
      margin: 0 auto;
      padding: 28px 18px 44px;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 24px;
      line-height: 1.2;
    }

    .report-head {
      align-items: flex-start;
      display: flex;
      gap: 16px;
      justify-content: space-between;
    }

    .meta {
      color: var(--muted);
      margin: 0 0 18px;
    }

    .report-actions {
      display: flex;
      flex: 0 0 auto;
      gap: 8px;
      justify-content: flex-end;
    }

    .print-button {
      background: #172033;
      border: 1px solid #172033;
      border-radius: 6px;
      color: #ffffff;
      cursor: pointer;
      font: 700 12px Arial, Helvetica, sans-serif;
      padding: 9px 12px;
      white-space: nowrap;
    }

    .print-button:focus,
    .print-button:hover {
      background: #243044;
      border-color: #243044;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 10px;
      margin: 16px 0 22px;
    }

    .tile {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
    }

    .tile span {
      color: var(--muted);
      display: block;
      font-size: 11px;
      margin-bottom: 5px;
      text-transform: uppercase;
    }

    .tile strong {
      display: block;
      font-size: 18px;
      overflow-wrap: anywhere;
    }

    .table-wrap {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow-x: auto;
    }

    table {
      border-collapse: collapse;
      min-width: 1200px;
      width: 100%;
    }

    th,
    td {
      border-bottom: 1px solid var(--line);
      border-right: 1px solid var(--line);
      padding: 8px 10px;
      text-align: right;
      white-space: nowrap;
    }

    th:first-child,
    td:first-child {
      text-align: left;
    }

    th:last-child,
    td:last-child {
      border-right: 0;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    th {
      background: var(--head);
      color: #243044;
      font-weight: 700;
    }

    tbody tr:nth-child(even) td {
      background: #fafbfd;
    }

    .total td {
      background: #edf4ff !important;
      font-weight: 700;
    }

    .status-ok {
      color: var(--ok);
    }

    .status-warn {
      color: var(--warn);
    }

    .summary-details {
      margin-top: 18px;
    }

    .load-test-performance {
      margin-top: 18px;
    }

    .load-test-performance h2,
    .summary-details h2 {
      font-size: 16px;
      margin: 0 0 10px;
    }

    .summary-details table {
      min-width: 720px;
    }

    .summary-details th,
    .summary-details td {
      text-align: left;
      white-space: normal;
    }

    .summary-details td:first-child {
      font-weight: 700;
      width: 180px;
    }

    .stage-report td,
    .stage-report th,
    .grafana-report td,
    .grafana-report th {
      text-align: right;
      white-space: nowrap;
    }

    .stage-report td:first-child,
    .stage-report th:first-child,
    .grafana-report td:first-child,
    .grafana-report th:first-child {
      text-align: left;
    }

    @media (max-width: 760px) {
      main { padding: 18px 10px 32px; }
      .report-head { display: block; }
      .report-actions { justify-content: flex-start; margin-bottom: 14px; }
      .summary { grid-template-columns: 1fr 1fr; }
    }

    @page {
      margin: 10mm;
      size: A4 landscape;
    }

    @media print {
      body {
        background: #ffffff;
        color: #000000;
        font-size: 10px;
      }

      main {
        max-width: none;
        padding: 0;
      }

      h1 {
        font-size: 18px;
      }

      .report-actions {
        display: none !important;
      }

      .meta {
        margin-bottom: 10px;
      }

      .summary {
        gap: 6px;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        margin: 10px 0 12px;
      }

      .tile {
        border-color: #999999;
        break-inside: avoid;
        padding: 7px;
      }

      .tile span {
        font-size: 8px;
      }

      .tile strong {
        font-size: 12px;
      }

      .table-wrap {
        border-color: #999999;
        overflow: visible;
      }

      table {
        font-size: 8.5px;
        min-width: 0;
        width: 100%;
      }

      th,
      td {
        border-color: #999999;
        color: #000000;
        padding: 4px 5px;
        white-space: normal;
      }

      tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      tbody tr:nth-child(even) td,
      .total td {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <main>
    <div class="report-head">
      <div>
        <h1>${escapeHtml(REPORT_TITLE)}</h1>
        <p class="meta">Generated ${escapeHtml(generatedAt)} | ${escapeHtml(context.baseUrl)} | Route base ${escapeHtml(context.routeBase ? `/${context.routeBase}` : '/')}</p>
      </div>
      <div class="report-actions">
        <button class="print-button" type="button" onclick="window.print()">Print PDF</button>
      </div>
    </div>

    <div class="summary">
      <div class="tile"><span>Total Samples</span><strong>${escapeHtml(totalSamples(rows))}</strong></div>
      <div class="tile"><span>Total Pass</span><strong class="${passStatusClass}">${formatPercent(passRate)}</strong></div>
      <div class="tile"><span>Total Error</span><strong class="${errorStatusClass}">${formatPercent(failureRate)}</strong></div>
      <div class="tile"><span>Project</span><strong>${escapeHtml(context.project)}</strong></div>
      <div class="tile"><span>Run Duration</span><strong>${formatDuration(runDurationSeconds(data) * 1000)}</strong></div>
      <div class="tile"><span>Total User</span><strong>${escapeHtml(totalUsers(data))}</strong></div>
    </div>

    ${showLoadTestPerformance ? buildLoadTestPerformanceSection(rows) : ''}

    ${showStageByStage ? buildStageReportSection(stageRows) : ''}

    ${showGrafanaVisualization ? buildGrafanaReportSection(grafanaRows) : ''}

    <section class="summary-details">
      <h2>Summary Details</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${buildSummaryDetailsRows()}
          </tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function buildAggregateRows(data, context) {
  const durationSec = runDurationSeconds(data);
  const iterations = metricValue(data, 'iterations', 'count') || 1;
  const rows = [];

  context.stepMetrics.forEach(([metricName, label], index) => {
    const metric = data.metrics[metricName];
    if (!metric || !metric.values) {
      return;
    }

    const errorRate = stepErrorRate(data, metricName);
    rows.push({
      label: numberedLabel(index + 1, label),
      samples: iterations,
      average: formatDuration(metric.values.avg),
      median: formatDuration(metric.values.med),
      p90: formatDuration(metric.values['p(90)']),
      p95: formatDuration(metric.values['p(95)']),
      p99: formatDuration(metric.values['p(99)'] !== undefined ? metric.values['p(99)'] : metric.values.max),
      min: formatDuration(metric.values.min),
      max: formatDuration(metric.values.max),
      errorRate,
      passRate: inverseRate(errorRate),
      passPercent: formatPercent(inverseRate(errorRate)),
      errorPercent: formatPercent(errorRate),
      throughput: formatThroughput(iterations, durationSec),
      rawAverageMs: metric.values.avg,
      sizeBytes: stepSizeBytes(data, metricName),
      isTotal: metricName === 'cva_total_journey_ms',
      metricName,
    });
  });

  const stepRows = rows.filter((row) => !row.isTotal);
  const estimateWeight = stepRows.reduce((sum, row) => sum + ((Number(row.rawAverageMs) || 0) * row.samples), 0);

  return rows.map((row) => {
    if (!row.isTotal) {
      return {
        ...row,
        size: formatSize(row.sizeBytes !== undefined ? row.sizeBytes : estimateStepAverageBytes(data, row, estimateWeight)),
      };
    }

    const totalRowErrorRate = totalErrorRate(data, rows);
    return {
      ...row,
      label: 'TOTAL',
      samples: rows.filter((item) => !item.isTotal).reduce((sum, item) => sum + item.samples, 0),
      throughput: formatThroughput(rows.filter((item) => !item.isTotal).reduce((sum, item) => sum + item.samples, 0), durationSec),
      errorRate: totalRowErrorRate,
      passRate: inverseRate(totalRowErrorRate),
      passPercent: formatPercent(inverseRate(totalRowErrorRate)),
      errorPercent: formatPercent(totalRowErrorRate),
      size: formatSize(totalBytes(data)),
    };
  });
}

function buildAggregateTableRow(row) {
  return `<tr class="${row.isTotal ? 'total' : ''}">
    <td>${escapeHtml(row.label)}</td>
    <td>${escapeHtml(row.samples)}</td>
    <td>${escapeHtml(row.average)}</td>
    <td>${escapeHtml(row.median)}</td>
    <td>${escapeHtml(row.p90)}</td>
    <td>${escapeHtml(row.p95)}</td>
    <td>${escapeHtml(row.p99)}</td>
    <td>${escapeHtml(row.min)}</td>
    <td>${escapeHtml(row.max)}</td>
    <td>${escapeHtml(row.passPercent)}</td>
    <td>${escapeHtml(row.errorPercent)}</td>
    <td>${escapeHtml(row.throughput)}</td>
    <td>${escapeHtml(row.size)}</td>
  </tr>`;
}

function buildLoadTestPerformanceSection(rows) {
  return `<section class="load-test-performance">
      <h2>Smoke Load Test Performance</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>VUs</th>
              <th>Average</th>
              <th>Median</th>
              <th>90% Line</th>
              <th>95% Line</th>
              <th>99% Line</th>
              <th>Min</th>
              <th>Max</th>
              <th>Passes %</th>
              <th>Error %</th>
              <th>Throughput</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(buildAggregateTableRow).join('\n')}
          </tbody>
        </table>
      </div>
    </section>`;
}

function buildStageReportSection(stageRows) {
  return `<section class="summary-details stage-report">
      <h2>Stress Test</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>VUs</th>
              <th>Avg Resp. Time</th>
              <th>P95</th>
              <th>RPS</th>
              <th>Passes %</th>
              <th>Error Rate</th>
            </tr>
          </thead>
          <tbody>
            ${stageRows.map(buildStageTableRow).join('\n')}
          </tbody>
        </table>
      </div>
    </section>`;
}

function buildGrafanaReportSection(grafanaRows) {
  return `<section class="summary-details grafana-report">
      <h2>Grafana Visualization</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Active VUs</th>
              <th>Avg Response</th>
              <th>RPS</th>
            </tr>
          </thead>
          <tbody>
            ${grafanaRows.map(buildGrafanaTableRow).join('\n')}
          </tbody>
        </table>
      </div>
    </section>`;
}

function buildStageTableRow(row) {
  return `<tr>
    <td>${escapeHtml(row.stage)}</td>
    <td>${escapeHtml(row.vus)}</td>
    <td>${escapeHtml(row.average)}</td>
    <td>${escapeHtml(row.p95)}</td>
    <td>${escapeHtml(row.rps)}</td>
    <td>${escapeHtml(row.passRate)}</td>
    <td>${escapeHtml(row.errorRate)}</td>
  </tr>`;
}

function buildGrafanaTableRow(row) {
  return `<tr>
    <td>${escapeHtml(row.time)}</td>
    <td>${escapeHtml(row.activeVus)}</td>
    <td>${escapeHtml(row.average)}</td>
    <td>${escapeHtml(row.rps)}</td>
  </tr>`;
}

function reportOptionEnabled(context, key) {
  const value = context && context[key];
  if (value === undefined || value === null || value === '') {
    return true;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function buildSummaryDetailsRows() {
  const details = [
    ['Name', 'Name of the report row, route step, action, or total journey.'],
    ['VUs', 'Number of recorded samples for the report row. For page steps, this is one sample per completed iteration.'],
    ['Average', 'Mean response or step duration. Values are auto-formatted as ms, s, or m.'],
    ['Median', 'Middle response or step duration. Values are auto-formatted as ms, s, or m.'],
    ['90% Line', '90 percent of samples completed at or below this duration. Values are auto-formatted as ms, s, or m.'],
    ['95% Line', '95 percent of samples completed at or below this duration. Values are auto-formatted as ms, s, or m.'],
    ['99% Line', '99 percent of samples completed at or below this duration. Values are auto-formatted as ms, s, or m.'],
    ['Min', 'Fastest recorded duration. Values are auto-formatted as ms, s, or m.'],
    ['Max', 'Slowest recorded duration. Values are auto-formatted as ms, s, or m.'],
    ['Passes %', 'Step pass percentage for step rows. TOTAL and the Total Pass tile show the weighted pass percentage across all displayed step rows.'],
    ['Error %', 'Step failure percentage for step rows. TOTAL and the Total Error tile show the weighted error percentage across all displayed step rows. Older summaries fall back to journey, browser, or HTTP request failures when step failure metrics are unavailable.'],
    ['Throughput', 'Samples completed per second during the run.'],
    ['Size', 'Average browser data received for each step sample. TOTAL shows the full run data received. Older summary files without step byte metrics are estimated from total bytes by step time.'],
  ];

  return details.map(([metric, detail]) => `<tr><td>${escapeHtml(metric)}</td><td>${escapeHtml(detail)}</td></tr>`).join('\n');
}

function buildStageByStageRows(data, context, rows = []) {
  const stages = scenarioStages(context);
  const averageMs = responseMetricValue(data, 'avg');
  const p95Ms = responseMetricValue(data, 'p(95)');
  const errorRate = totalErrorRate(data, rows);
  const baseRate = requestRate(data);
  const maxVus = maxConfiguredVus(stages, context, data);

  if (!stages.length) {
    const vus = totalUsers(data);
    return [{
      stage: 'Configured run',
      vus,
      average: formatDuration(averageMs),
      p95: formatDuration(p95Ms),
      rps: formatRate(baseRate),
      passRate: formatPercent(inverseRate(errorRate)),
      errorRate: formatPercent(errorRate),
    }];
  }

  let previousTarget = scenarioStartVus(context);
  return stages.map((stage) => {
    const activeTarget = Number(stage.target || 0);
    const row = {
      stage: `${previousTarget} -> ${activeTarget}`,
      vus: activeTarget < previousTarget ? 'Decreasing' : activeTarget,
      average: formatDuration(averageMs),
      p95: formatDuration(p95Ms),
      rps: formatRate(scaleRateByVus(baseRate, activeTarget, maxVus)),
      passRate: formatPercent(inverseRate(errorRate)),
      errorRate: formatPercent(errorRate),
    };
    previousTarget = activeTarget;
    return row;
  });
}

function buildGrafanaVisualizationRows(data, context) {
  const stages = scenarioStages(context);
  const averageMs = responseMetricValue(data, 'avg');
  const baseRate = requestRate(data);
  const maxVus = maxConfiguredVus(stages, context, data);

  if (!stages.length) {
    const durationSec = runDurationSeconds(data);
    const activeVus = Number(totalUsers(data)) || 0;
    return [
      grafanaTimelineRow(0, 0, averageMs, baseRate, maxVus),
      grafanaTimelineRow(durationSec, activeVus, averageMs, baseRate, maxVus),
    ];
  }

  const totalDurationSec = stages.reduce((sum, stage) => sum + stage.durationSec, 0);
  const intervalSec = timelineIntervalSeconds(totalDurationSec);
  const rows = [];
  let elapsedSec = 0;
  let previousTarget = scenarioStartVus(context);

  rows.push(grafanaTimelineRow(elapsedSec, previousTarget, averageMs, baseRate, maxVus));

  for (const stage of stages) {
    const durationSec = stage.durationSec;
    const pointCount = Math.max(1, Math.ceil(durationSec / intervalSec));

    for (let point = 1; point <= pointCount; point += 1) {
      const offsetSec = Math.min(durationSec, point * intervalSec);
      const ratio = durationSec ? offsetSec / durationSec : 1;
      const activeVus = Math.round(previousTarget + ((Number(stage.target || 0) - previousTarget) * ratio));
      rows.push(grafanaTimelineRow(elapsedSec + offsetSec, activeVus, averageMs, baseRate, maxVus));
    }

    elapsedSec += durationSec;
    previousTarget = Number(stage.target || 0);
  }

  return dedupeTimelineRows(rows);
}

function grafanaTimelineRow(elapsedSec, activeVus, averageMs, baseRate, maxVus) {
  return {
    time: formatTimelineTime(elapsedSec),
    activeVus,
    average: activeVus > 0 ? formatDuration(averageMs) : '-',
    rps: formatRate(scaleRateByVus(baseRate, activeVus, maxVus)),
  };
}

function dedupeTimelineRows(rows) {
  const result = [];
  for (const row of rows) {
    const previous = result[result.length - 1];
    if (previous && previous.time === row.time) {
      result[result.length - 1] = row;
    } else {
      result.push(row);
    }
  }
  return result;
}

function scenarioStages(context) {
  const scenario = context && context.scenario ? context.scenario : {};
  const stages = Array.isArray(scenario.stages) ? scenario.stages : [];
  return stages.map((stage) => ({
    duration: stage.duration || '',
    durationSec: parseDurationSeconds(stage.duration),
    target: Number(stage.target || 0),
  }));
}

function scenarioStartVus(context) {
  const scenario = context && context.scenario ? context.scenario : {};
  return Number(scenario.startVUs || scenario.vus || 0);
}

function maxConfiguredVus(stages, context, data) {
  const stageMax = stages.reduce((max, stage) => Math.max(max, Number(stage.target || 0)), scenarioStartVus(context));
  const summaryMax = Number(metricValue(data, 'vus_max', 'max') || metricValue(data, 'vus_max', 'value') || 0);
  return Math.max(stageMax, summaryMax, 1);
}

function responseMetricValue(data, valueName) {
  return metricValue(data, 'browser_http_req_duration', valueName)
    || metricValue(data, 'http_req_duration', valueName)
    || metricValue(data, 'cva_total_journey_ms', valueName);
}

function responseErrorRate(data) {
  const browserFailureRate = rateMetricRate(data, 'browser_http_req_failed');
  if (browserFailureRate !== undefined) {
    return browserFailureRate;
  }

  const httpFailureRate = rateMetricRate(data, 'http_req_failed');
  if (httpFailureRate !== undefined) {
    return httpFailureRate;
  }

  return undefined;
}

function stepErrorRate(data, metricName) {
  const errorRate = rateMetricRate(data, errorMetricName(metricName));
  if (errorRate !== undefined) {
    return errorRate;
  }

  return responseErrorRate(data);
}

function totalErrorRate(data, rows) {
  const aggregateErrorRate = aggregateStepErrorRate(rows);
  if (aggregateErrorRate !== undefined) {
    return aggregateErrorRate;
  }

  const journeyErrorRate = rateMetricRate(data, errorMetricName('cva_total_journey_ms'));
  if (journeyErrorRate !== undefined) {
    return journeyErrorRate;
  }

  const responseFailureRate = responseErrorRate(data);
  if (responseFailureRate !== undefined) {
    return responseFailureRate;
  }

  return undefined;
}

function aggregateStepErrorRate(rows) {
  let errorSamples = 0;
  let totalSamples = 0;

  for (const row of rows) {
    if (row.isTotal) {
      continue;
    }

    const errorRate = Number(row.errorRate);
    const samples = Number(row.samples);
    if (!Number.isFinite(errorRate) || !Number.isFinite(samples) || samples <= 0) {
      continue;
    }

    errorSamples += errorRate * samples;
    totalSamples += samples;
  }

  return totalSamples ? errorSamples / totalSamples : undefined;
}

function rateMetricRate(data, metricName) {
  const rateMetric = rateMetricValues(data, metricName);
  return rateMetric ? rateMetric.rate : undefined;
}

function rateMetricValues(data, metricName) {
  const metric = data.metrics[metricName];
  if (!metric || !metric.values) {
    return undefined;
  }

  const rate = Number(metric.values.rate);
  const passes = Number(metric.values.passes);
  const fails = Number(metric.values.fails);
  const hasCounts = Number.isFinite(passes) && Number.isFinite(fails) && (passes + fails) > 0;

  if (!Number.isNaN(rate)) {
    return {
      rate,
      passes: hasCounts ? passes : undefined,
      fails: hasCounts ? fails : undefined,
    };
  }

  if (hasCounts) {
    return {
      rate: passes / (passes + fails),
      passes,
      fails,
    };
  }

  return undefined;
}

function errorMetricName(metricName) {
  return String(metricName).replace(/_ms$/, '_error_rate');
}

function requestRate(data) {
  return metricValue(data, 'http_reqs', 'rate')
    || metricValue(data, 'browser_http_reqs', 'rate')
    || metricValue(data, 'iterations', 'rate');
}

function scaleRateByVus(rate, activeVus, maxVus) {
  if (rate === undefined || rate === null || Number.isNaN(Number(rate))) {
    return undefined;
  }

  if (!activeVus || !maxVus) {
    return 0;
  }

  return Number(rate) * (Number(activeVus) / Number(maxVus));
}

function timelineIntervalSeconds(totalDurationSec) {
  if (totalDurationSec <= 15 * 60) {
    return 60;
  }

  if (totalDurationSec <= 60 * 60) {
    return 5 * 60;
  }

  return 15 * 60;
}

function parseDurationSeconds(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) {
    return 0;
  }

  let total = 0;
  let matched = false;
  text.replace(/([0-9]+(?:\.[0-9]+)?)\s*(ms|s|m|h)/g, (_match, amount, unit) => {
    matched = true;
    const number = Number(amount);
    if (unit === 'ms') {
      total += number / 1000;
    } else if (unit === 's') {
      total += number;
    } else if (unit === 'm') {
      total += number * 60;
    } else if (unit === 'h') {
      total += number * 60 * 60;
    }
    return '';
  });

  if (matched) {
    return total;
  }

  const numeric = Number(text);
  return Number.isNaN(numeric) ? 0 : numeric;
}

function numberedLabel(index, label) {
  return `${String(index).padStart(2, '0')}_${String(label).replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function runDurationSeconds(data) {
  const durationMs = data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs : metricValue(data, 'iteration_duration', 'max');
  return durationMs ? durationMs / 1000 : 1;
}

function metricValue(data, metricName, valueName) {
  const metric = data.metrics[metricName];
  return metric && metric.values ? metric.values[valueName] : undefined;
}

function totalSamples(rows) {
  const total = rows.find((row) => row.isTotal);
  return total ? total.samples : rows.reduce((sum, row) => sum + row.samples, 0);
}

function totalUsers(data) {
  const vusMax = metricValue(data, 'vus_max', 'max') || metricValue(data, 'vus_max', 'value');
  if (vusMax !== undefined) {
    return Math.round(Number(vusMax));
  }

  const scenarios = data.options && data.options.scenarios ? Object.values(data.options.scenarios) : [];
  const configuredVus = scenarios.reduce((sum, scenario) => sum + Number(scenario.vus || 0), 0);
  return configuredVus || 'n/a';
}

function formatThroughput(samples, durationSec) {
  if (!durationSec || Number.isNaN(durationSec)) {
    return '0.0';
  }
  return (samples / durationSec).toFixed(1);
}

function formatRate(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }

  const rate = Number(value);
  if (rate === 0) {
    return '0';
  }

  if (Math.abs(rate) < 10) {
    return rate.toFixed(2);
  }

  return rate.toFixed(1);
}

function stepSizeBytes(data, metricName) {
  const value = metricValue(data, sizeMetricName(metricName), 'avg');
  return value === undefined ? undefined : Number(value);
}

function sizeMetricName(metricName) {
  return String(metricName).replace(/_ms$/, '_bytes');
}

function estimateStepAverageBytes(data, row, estimateWeight) {
  if (!estimateWeight || !row.samples) {
    return 0;
  }

  const rowWeight = (Number(row.rawAverageMs) || 0) * row.samples;
  return (totalBytes(data) * rowWeight / estimateWeight) / row.samples;
}

function totalBytes(data) {
  return metricValue(data, 'browser_data_received', 'count') || metricValue(data, 'data_received', 'count') || 0;
}

function formatSize(bytes) {
  if (bytes === undefined || bytes === null || Number.isNaN(Number(bytes))) {
    return 'n/a';
  }

  const value = Number(bytes);
  if (value < 1024) {
    return `${Math.round(value)} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  const ms = Number(value);
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }

  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }

  return `${(ms / 60000).toFixed(2)} m`;
}

function inverseRate(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return undefined;
  }

  return Math.max(0, Math.min(1, 1 - Number(value)));
}

function formatPercent(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatTimelineTime(elapsedSec) {
  const totalSeconds = Math.max(0, Math.round(Number(elapsedSec) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
