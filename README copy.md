# CVA Cash App k6 Browser Load Test Performance Report

This project runs a 1-user k6 browser journey against:

`https://cashapp-test.savethechildren.net/`

The scripted flow:

1. Login with the configured CVA user.
2. Select `Country: Cashland` and `Project: AdminUAT1`.
3. Open `/DuplicationAndDataCleaning`, search `CAS/DIS/9G5TD3`, filter `Potential Duplicate` to `Unique`, check/select all `Potential Duplicate` rows, and send them to master.
4. Open `/BeneficiaryListOverView`, create a beneficiary list with a random `Location3` value, and capture the generated list id.
5. Open `/BeneficiaryHousehold?id=<generated id>`, select households, and save them to the beneficiary list.
6. Open `/BeneficiaryListSelection?id=<generated id>` and send the list for approval.

## Run

```powershell
npm run test
```

The test command removes old artifact images before starting the k6 browser run.

## Useful Environment Overrides

```powershell
$env:CVA_BASE_URL = "https://cashapp-test.savethechildren.net"
$env:CVA_ROUTE_BASE = ""
$env:CVA_USERNAME = "123456789"
$env:CVA_PASSWORD = "123456"
$env:CVA_COUNTRY = "Cashland"
$env:CVA_PROJECT = "AdminUAT1"
$env:CVA_SEARCH_ID = "CAS/DIS/9G5TD3"
$env:CVA_VUS = "5"
$env:CVA_ITERATIONS = "5"
$env:K6_BROWSER_HEADLESS = "true"
npm run test
```

## Dynamic Routes

`scripts/cva-main.js` is route based. The default routes cover the requested duplicate-cleaning and beneficiary-list flow, but you can override them without editing the file:

```powershell
$env:CVA_ROUTES_JSON = '[{"key":"mapper","label":"Country Project Mapper","path":"/CountryProjectMapperList","expectedTexts":["Country Project MapperList","CountryName"]}]'
npm run test
```

Each route supports `key`, `label`, `path`, `expectedTexts`, and optional `actions`. For fill-input actions, use `type: "fillInput"`, `selector`, `value` or `valueEnv`, and `expectedTexts`.

## Script Process

- `scripts/cva-main.js` - browser journey runner.
- `scripts/share.js` - common browser helpers, waits, and route metrics.
- `scripts/routeConfig.js` - environment values, default routes, and dynamic route parsing.
- `scripts/buildRouteUrl.js` - base URL plus route base URL builder.
- `scripts/buildHtmlReport.js` - console summary and HTML report builder.

## Output

After a run:

- `reports/performance-report.html` - readable performance report
- `reports/k6-summary.json` - full k6 summary data
- `artifacts/sample-vu-*-iter-*-*.png` - screenshot for each measured or failed sample
- `artifacts/final-page.png` - final browser screenshot
