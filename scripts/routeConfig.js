import { normalizeRoutePath } from './buildRouteUrl.js';

export const BASE_URL = (__ENV.CVA_BASE_URL || 'https://cashapp.savethechildren.net').replace(/\/+$/, '');
export const ROUTE_BASE = normalizeRoutePath(__ENV.CVA_ROUTE_BASE || '');
export const USERNAME = __ENV.CVA_USERNAME || 'SuperAdmin';
export const PASSWORD = __ENV.CVA_PASSWORD || 'Welcome@2';
export const COUNTRY = __ENV.CVA_COUNTRY || 'Cashland';
export const PROJECT = __ENV.CVA_PROJECT || 'CashApp 3.0 10K Test Project';
// export const PROJECT = __ENV.CVA_PROJECT || 'AdminUAT1';
// export const PROJECT = __ENV.CVA_PROJECT || 'WebApplicationTest';
export const DOMAIN_VALUE = __ENV.DOMAIN_VALUE || 'ci-sb-africa';
export const SAVE_SCREENSHOTS = envBoolean(__ENV.SAVE_SCREENSHOTS, true);

export const LOAD_TEST_PERFORMANCE = envBoolean(__ENV.LOAD_TEST_PERFORMANCE, true);
export const STAGE_BY_STAGE = envBoolean(__ENV.STAGE_BY_STAGE, true);
export const GRAFANA_VISUALIZATION = envBoolean(__ENV.GRAFANA_VISUALIZATION, true);
const TODAY = formatLocalDate(new Date());

const ENV_VALUES = {
  CVA_BASE_URL: BASE_URL,
  CVA_ROUTE_BASE: ROUTE_BASE,
  CVA_USERNAME: USERNAME,
  CVA_PASSWORD: PASSWORD,
  CVA_COUNTRY: COUNTRY,
  CVA_PROJECT: PROJECT,
};

const DEFAULT_ROUTES = [
  {
    key: 'login_scenario_0',
    label: 'Login - Scenario 0',
    path: '/',
    expectedTexts: [],
    actions: [
      {
        key: 'login_email_scenario_0',
        label: `Login Email - Scenario 0`,
        type: 'fillInput',
        selector: 'input[type="text"]',
        value: USERNAME,
        submit: false,
        skipIfAnyTexts: ['Dashboard', 'Country:', 'Project:'],
        expectedTexts: ['Password'],
        timeoutMs: 60000,
      },
      {
        key: 'login_password_scenario_0',
        label: `Login Password - Scenario 0`,
        type: 'fillInput',
        selector: 'input[type="password"]',
        value: PASSWORD,
        submit: false,
        skipIfAnyTexts: ['Dashboard', 'Country:', 'Project:'],
        expectedTexts: ['Login'],
        timeoutMs: 60000,
      },
      {
        key: 'login_submit_scenario_0',
        label: `Submit Login - Scenario 0`,
        type: 'click',
        selector: 'button[type="submit"]',
        skipIfAnyTexts: ['Dashboard', 'Country:', 'Project:'],
        expectedTexts: ['Dashboard', 'Country:', 'Project:'],
        timeoutMs: 90000,
      },
      {
        key: 'select_domain_api_name_scenario_0',
        label: `Select Domain - Scenario 0`,
        type: 'selectRfOption',
        selector: '.select-rf[id$="-CashAppPageHeaderRF-SelectedDomainId"]',
        value: DOMAIN_VALUE,
        expectedTexts: [DOMAIN_VALUE],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'select_country_scenario_0',
        label: `Select Country - Scenario 0`,
        type: 'selectRfOption',
        selector: '.select-rf[id$="-CashAppPageHeaderRF-SelectedCountryId"]',
        value: COUNTRY,
        expectedTexts: [COUNTRY],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'select_project_scenario_0',
        label: `Select Project - Scenario 0`,
        type: 'selectRfOption',
        selector: '.select-rf[id$="-CashAppPageHeaderRF-SelectedProjectId"]', 
        value: PROJECT,
        expectedTexts: [PROJECT],
        timeoutMs: 60000,
        settleMs: 1500,
      },
    ],
  },
  {
    key: 'fetch_data_cases_project_synch_performance_scenario_16',
    label: 'Fetch Data - Cases Project - Scenario 16',
    path: '/FetchData',
    expectedTexts: ['Fetch Data', 'API Name'],
    actions: [
      {
        key: 'select_fetch_data_api_name_scenario_16',
        label: `Select Fetch Data API Name - Cases - Scenario 16`,
        type: 'selectRfOption',
        selector: '.select-rf[id$="-FetchData-APIName"]',
        value: 'Cases',
        expectedTexts: ['Cases', 'Case Type'],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'select_fetch_data_case_type_scenario_16',
        label: `Select Fetch Data Case Type - Household - Scenario 16`,
        type: 'selectRfOption',
        selector: '.select-rf[id$="-FetchData-Case_Type"]',
        value: 'Household',
        expectedTexts: ['Household'],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'start_fetch_data_scenario_16',
        label: 'Start Fetch Data - Cases Project - Scenario 16',
        type: 'clickText',
        text: 'Start',
        timeoutMs: 240000,
        settleMs: 3000,
      },
    ],
  },
  {
    key: 'duplication_and_data_cleaning_and_unique_scenario_4',
    label: 'Duplication & Data Cleaning - Scenario 4',
    path: '/DuplicationAndDataCleaning',
    expectedTexts: ['Deduplication and Data Cleaning', 'Household SCI ID'],
    actions: [
      {
        key: 'select_full_household_details_scenario_4',
        label: 'Select Full Household Details - Scenario 4',
        type: 'rfTableHeaderCheckbox',
        expectedTexts: ['Check Duplicate'],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'check_duplicate_scenario_4',
        label: 'Check Duplicate - Scenario 4',
        type: 'clickText',
        text: 'Check Duplicate',
        // expectedTexts: ['Unique', 'Potential Duplicate'],
        timeoutMs: 240000,
        settleMs: 1500,
      },
    ]
  },
  {
    key: 'duplication_and_data_cleaning_send_to_master_scenario_5',
    label: 'Duplication & Data Cleaning - Send to Master - Scenario 5',
    path: '/DuplicationAndDataCleaning',
    expectedTexts: ['Deduplication and Data Cleaning', 'Household SCI ID'],
    actions: [
      {
        key: 'duplicate_check_unique_filter_scenario_5',
        label: 'Filter Duplicate Check equals Unique - Scenario 5',
        type: 'rfTableColumnFilter',
        columnLabel: 'Duplicate Check',
        condition: 'Equals',
        value: 'Unique',
        applyText: 'Apply',
        expectedTexts: ['Unique'],
        timeoutMs: 120000,
        settleMs: 1500,
        verifyFilterState: true,
        verifyVisibleRows: true,
      },
      {
        key: 'select_full_household_details_unique_scenario_5',
        label: 'Select All Filtered Full Household Details - Scenario 5',
        type: 'rfTableHeaderCheckbox',
        expectedTexts: ['Send to Master'],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      // {
      //   key: 'select_full_household_details_unique_scenario_5',
      //   label: 'Select Filtered Full Household Details - Scenario 5',
      //   type: 'rfTableFirstRows',
      //   rowCount: 3,
      //   verifyFilterState: true,
      //   verifyVisibleRows: true,
      //   expectedTexts: ['Send to Master'],
      //   timeoutMs: 60000,
      //   settleMs: 1500,
      // },
      {
        key: 'send_to_master_scenario_5',
        label: 'Send to Master - Scenario 5',
        type: 'clickText',
        text: 'Send to Master',
        timeoutMs: 60000,
        settleMs: 1500,
      },
    ],
  },
  {
    key: 'master_household_data_scenario_2',
    label: 'Master Household Data - Scenario 2',
    path: '/MasterHouseholdData',
    expectedTexts: ['Master Household Data', 'Full Household Details', 'Eligibility Status'],
    timeoutMs: 180000,
    actions: [
      {
        key: 'eligibility_status_eligible_filter_scenario_2',
        label: 'Filter Eligibility Status equals Eligible - Scenario 2',
        type: 'rfTableColumnFilter',
        columnLabel: 'Eligibility Status',
        condition: 'Equals',
        value: 'Eligible',
        applyText: 'Apply',
        expectedTexts: ['Eligible'],
        timeoutMs: 120000,
        settleMs: 1500,
        popupSettleMs: 2000,
        typeDelayMs: 100,
        verifyFilterState: true,
        verifyVisibleRows: true,
      },
      {
        key: 'select_eligibility_status_all_scenario_2',
        label: 'Select all Eligibility Status rows - Scenario 2',
        type: 'rfTableColumnCheckbox',
        columnLabel: 'Eligibility Status',
        enabledText: 'Eligible',
        expectedTexts: ['Eligible', 'Ineligible', 'Rejected'],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'save_to_eligible_scenario_2',
        label: 'Eligible - Scenario 2',
        type: 'clickText',
        text: 'Eligible',
        timeoutMs: 120000,
        settleMs: 5000,
      },
    ],
  },
  {
    key: 'master_household_data_scenario_3',
    label: 'Master Household Data - Scenario 3',
    path: '/MasterHouseholdData',
    expectedTexts: ['Master Household Data', 'Full Household Details', 'Household SCI ID', 'Head of Household Full Name', 'Phone Number'],
    timeoutMs: 180000,
    actions: [
      {
        key: 'search_by_household_sci_id_scenario_3',
        label: 'Search Household SCI ID - Scenario 3',
        type: 'fillInput',
        selector: 'input[placeholder="Search"]',
        value: 'CAS/DIS',
        expectedTexts: ['CAS/DIS'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'search_by_head_of_household_name_scenario_3',
        label: 'Search Head of Household Name - Scenario 3',
        type: 'fillInput',
        selector: 'input[placeholder="Search"]',
        value: 'Ru',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'search_by_phone_number_scenario_3',
        label: 'Search Phone Number - Scenario 3',
        type: 'fillInput',
        selector: 'input[placeholder="Search"]',
        value: '999',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'view_full_household_details_scenario_3',
        label: 'View Full Household Details - Scenario 3',
        type: 'clickText',
        text: 'View',
        ifExists: true,
        expectedTexts: ['Full Household Details'],
      },
    ],
  },
  {
    key: 'beneficiary_list_overview_scenario_7',
    label: 'Beneficiary List Overview - Scenario 7',
    path: '/BeneficiaryListOverView',
    expectedTexts: ['Create New Beneficiary List'],
    actions: [
      {
        key: 'open_create_beneficiary_list_modal_scenario_7',
        label: 'Open Create New Beneficiary List - Scenario 7',
        type: 'clickText',
        text: 'Create New Beneficiary List',
        expectedTexts: ['Location3'],
        timeoutMs: 120000,
        settleMs: 1500,
      },
      {
        key: 'create_beneficiary_list_scenario_7',
        label: 'Create New Beneficiary List - Scenario 7',
        fieldLabel: 'Location3',
        type: 'fillInput',
        selector: '.modal-rf .input-rf input',
        value: 'Test Location 2',
        submit: false,
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'save_new_create_beneficiary_list_scenario_7',
        label: 'Save New Beneficiary List - Scenario 7',
        type: 'click',
        selector: '.modal-rf button.button-rf-danger',
        timeoutMs: 120000,
        settleMs: 1500,
      },
      {
        key: 'beneficiary_list_overview_selection_id_scenario_7',
        label: 'Beneficiary List Overview Selection ID - Scenario 7',
        type: 'captureUrlParam',
        urlIncludes: '/BeneficiaryHousehold?id=',
        urlParam: 'id',
        stateKey: 'BeneficiaryHouseholdId',
        timeoutMs: 180000,
      },
      {
        key: 'select_full_household_details_scenario_7',
        label: 'Select 3 Full Household Details - Scenario 7',
        type: 'rfTableFirstRows',
        rowCount: 4,
        timeoutMs: 120000,
        settleMs: 500,
      },
      {
        key: 'save_to_beneficiary_list_scenario_7',
        label: 'Save to Beneficiary List - Scenario 7',
        type: 'clickText',
        text: 'Save to Beneficiary List',
        expectedTexts: ['Send List for Approval'],
        timeoutMs: 120000,
        settleMs: 5000,
      },
      {
        key: 'beneficiary_list_selection_id_scenario_7',
        label: 'Beneficiary List Selection ID - Scenario 7',
        type: 'captureUrlParam',
        urlIncludes: '/BeneficiaryListSelection?id=',
        urlParam: 'id',
        stateKey: 'BeneficiaryListSelectionId',
        timeoutMs: 180000,
      },
      {
        key: 'scroll_send_list_for_approval_scenario_7',
        label: 'Scroll Send List For Approval - Scenario 7',
        type: 'scrollPositionPercent',
        scrollPositionPercentage: 100,
        timeoutMs: 60000,
        settleMs: 500,
      },
      {
        key: 'send_list_for_approval_scenario_7',
        label: 'Send List for Approval - Scenario 7',
        type: 'clickText',
        text: 'Send List for Approval',
        timeoutMs: 120000,
        settleMs: 1500,
      },
    ],
  },
  {
    key: 'master_household_data_scenario_8',
    label: 'Beneficiary List Approval - Scenario 8',
    path: '/BeneficiaryListApproval',
    expectedTexts: ['Beneficiary List Approval', 'Beneficiary List Unique ID', 'Beneficiary List Name', 'Project Name', 'Donor'],
    timeoutMs: 180000,
    actions: [
      {
        key: 'pending_approval_beneficiary_list_status_scenario_8',
        label: 'Pending Approval Beneficiary List Status - Scenario 8',
        type: 'rfTableColumnText',
        columnLabel: 'Beneficiary List Status',
        text: 'Pending Approval',
        rowValueStateKey: 'beneficiaryListSelectionId',
        rowMatchText: 'Pending Approval',
        rowCellIndex: 0,
        timeoutMs: 90000,
      },
      {
        key: 'payment_list_selection_approval_view_id_scenario_8',
        label: 'Beneficiary List Selection Approve - Scenario 8',
        type: 'captureUrlParam',
        urlIncludes: '/BeneficiaryListSelection?id=',
        urlParam: 'id',
        stateKey: 'beneficiaryListId',
        timeoutMs: 60000,
      },
      {
        key: 'view-beneficiary_list_selection_approve_scenario_8',
        label: 'Beneficiary List Selection Approve - Scenario 8',
        type: 'clickText',
        ifExists: true,
        text: 'Approve',
        timeoutMs: 90000,
      },
    ],
  },
  {
    key: 'payment_list_overview_scenario_9',
    label: 'Payment List Overview - Scenario 9',
    path: '/PaymentListOverView',
    expectedTexts: ['Create New Payment List'],
    actions: [
      {
        key: 'open_create_payment_list_modal_scenario_9',
        label: 'Open Create New Payment List - Scenario 9',
        type: 'clickText',
        text: 'Create New Payment List',
        expectedTexts: ['Location3', 'Select Beneficiary List(s)*'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'create_payment_list_location3_scenario_9',
        label: 'Create New Payment List Location3 - Scenario 9',
        type: 'selectRfOption',
        selector: 'div[id$="-PaymentList-location3_id"]',
        fieldLabel: 'Location3',
        value: 'District9',
        expectedTexts: ['District9'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'create_payment_list_scenario_9',
        label: 'Create New Payment List - Scenario 9',
        type: 'selectRfMultiOption',
        selector: 'div[id$="-PaymentList-ben_list_case_id"]',
        fieldLabel: 'Select Beneficiary List(s)*',
        value: '',
        expectedTexts: [''],
        selectionCount: 1,
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'save_payment_list_scenario_9',
        label: 'Save Payment List - Scenario 9',
        type: 'click',
        selector: '.modal-rf button.button-rf-danger',
        timeoutMs: 180000,
      },
      {
        key: 'capture_payment_list_selection_id_scenario_9',
        label: 'Capture Payment List Selection ID - Scenario 9',
        type: 'captureUrlParam',
        urlIncludes: '/PaymentListSelection?id=',
        urlParam: 'id',
        stateKey: 'paymentListId',
        timeoutMs: 180000,
      },
      {
        key: 'assign_payments_scenario_9',
        label: 'Assign Payments - Scenario 9',
        type: 'click',
        selector: 'button.button-rf-danger',
        expectedTexts: ['CVA Type'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_cva_type_scenario_9',
        label: 'Select CVA Type - Scenario 9',
        type: 'selectRfOptionByFieldLabel',
        fieldLabel: 'CVA Type*',
        scopeSelector: '.modal-rf, body',
        value: 'mpca',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_currency_of_transfer_scenario_9',
        label: 'Select Currency of Transfer - Scenario 9',
        type: 'selectRfOptionByFieldLabel',
        fieldLabel: 'Currency of Transfer*',
        scopeSelector: '.modal-rf, body',
        value: 'US Dollar',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_financial_service_provider_scenario_9',
        label: 'Select Financial Service Provider* - Scenario 9',
        type: 'selectRfOptionByFieldLabel',
        fieldLabel: 'Financial Service Provider*',
        scopeSelector: '.modal-rf, body',
        value: 'Other Bank',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_delivery_mechanism_scenario_9',
        label: 'Select Delivery Mechanism* - Scenario 9',
        type: 'selectRfOptionByFieldLabel',
        fieldLabel: 'Delivery Mechanism*',
        scopeSelector: '.modal-rf, body',
        value: 'Mobile money',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'set_expected_transfer_date_scenario_9',
        label: 'Set Expected Transfer Date** - Scenario 9',
        type: 'datepicker',
        fieldLabel: 'Expected Transfer Date*',
        scopeSelector: '.modal-rf, body',
        value: TODAY,
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 500,
      },
      {
        key: 'set_transfer_value_scenario_9',
        label: 'Set Transfer Value* - Scenario 9',
        type: 'fillInput',
        selector: 'input[type="number"]',
        value: '100',
        submit: false,
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_full_household_details_scenario_9',
        label: 'Select All Filtered Full Household Details - Scenario 9',
        type: 'rfTableHeaderCheckbox',
        expectedTexts: ['Apply to Selected'],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'apply_for_approval_scenario_9',
        label: 'Apply to Selected - Scenario 9',
        type: 'clickText',
        text: 'Apply to Selected',
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'scroll_payment_approval_scenario_9',
        label: 'Scroll Payment Approval - Scenario 9',
        type: 'scrollPositionPercent',
        scrollPositionPercentage: 100,
        timeoutMs: 60000,
        settleMs: 500,
      },
      {
        key: 'send_list_for_approval_scenario_9',
        label: 'Send List for Approval - Scenario 9',
        type: 'clickText',
        text: 'Send List for Approval',
        timeoutMs: 180000,
        settleMs: 1500,
      },
    ],
  },
  {
    key: 'payment_list_overview_scenario_round_9',
    label: 'Payment List Overview Round - Scenario 9',
    path: '/PaymentListOverView',
    expectedTexts: ['Add new payment tranche to existing list'],
    actions: [
      {
        key: 'open_add_new_payment_tranche_to_existing_list_modal_round_scenario_9',
        label: 'Open Add new payment tranche to existing list Round - Scenario 9',
        type: 'clickText',
        text: 'Add new payment tranche to existing list',
        expectedTexts: ['Select Payment List', 'Round Number'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'create_payment_list_location3_scenario_round_9',
        label: 'Select Payment List Round - Scenario 9',
        type: 'selectRfOption',
        selector: 'div[id$="-PaymentList-master_pay_list_case_id"]',
        fieldLabel: 'Select Payment List',
        value: 'PAYMENT',
        expectedTexts: ['PAYMENT'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'save_payment_list_scenario_round_9',
        label: 'Save Payment List Round - Scenario 9',
        type: 'click',
        selector: '.modal-rf button.button-rf-danger',
        timeoutMs: 180000,
      },
      {
        key: 'capture_payment_list_selection_id_round_scenario_9',
        label: 'Capture Payment List Selection ID Round - Scenario 9',
        type: 'captureUrlParam',
        urlIncludes: '/PaymentListSelection?id=',
        urlParam: 'id',
        stateKey: 'paymentListId',
        timeoutMs: 180000,
      },
      {
        key: 'assign_payments_round_scenario_9',
        label: 'Assign Payments Round - Scenario 9',
        type: 'click',
        selector: 'button.button-rf-danger',
        expectedTexts: ['CVA Type'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_cva_type_round_scenario_9',
        label: 'Select CVA Type Round - Scenario 9',
        type: 'selectRfOptionByFieldLabel',
        fieldLabel: 'CVA Type*',
        scopeSelector: '.modal-rf, body',
        value: 'mpca',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_currency_of_transfer_round_scenario_9',
        label: 'Select Currency of Transfer Round - Scenario 9',
        type: 'selectRfOptionByFieldLabel',
        fieldLabel: 'Currency of Transfer*',
        scopeSelector: '.modal-rf, body',
        value: 'US Dollar',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_financial_service_provider_round_scenario_9',
        label: 'Select Financial Service Provider* Round - Scenario 9',
        type: 'selectRfOptionByFieldLabel',
        fieldLabel: 'Financial Service Provider*',
        scopeSelector: '.modal-rf, body',
        value: 'Other Bank',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_delivery_mechanism_round_scenario_9',
        label: 'Select Delivery Mechanism* Round - Scenario 9',
        type: 'selectRfOptionByFieldLabel',
        fieldLabel: 'Delivery Mechanism*',
        scopeSelector: '.modal-rf, body',
        value: 'Mobile money',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'set_expected_transfer_date_round_scenario_9',
        label: 'Set Expected Transfer Date* Round - Scenario 9',
        type: 'datepicker',
        fieldLabel: 'Expected Transfer Date*',
        scopeSelector: '.modal-rf, body',
        value: TODAY,
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 500,
      },
      {
        key: 'set_transfer_value_round_scenario_9',
        label: 'Set Transfer Value* Round - Scenario 9',
        type: 'fillInput',
        selector: 'input[type="number"]',
        value: '100',
        submit: false,
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_full_household_details_round_scenario_9',
        label: 'Select All Filtered Full Household Details Round - Scenario 9',
        type: 'rfTableHeaderCheckbox',
        expectedTexts: ['Apply to Selected'],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'apply_for_approval_round_scenario_9',
        label: 'Apply to Selected Round - Scenario 9',
        type: 'clickText',
        text: 'Apply to Selected',
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'scroll_payment_approval_round_scenario_9',
        label: 'Scroll Payment Approval Round - Scenario 9',
        type: 'scrollPositionPercent',
        scrollPositionPercentage: 100,
        timeoutMs: 60000,
        settleMs: 500,
      },
      {
        key: 'send_list_for_approval_round_scenario_9',
        label: 'Send List for Approval Round - Scenario 9',
        type: 'clickText',
        text: 'Send List for Approval',
        timeoutMs: 180000,
        settleMs: 1500,
      },
    ],
  },
  {
    key: 'payment_approval_overview_scenario_10',
    label: 'Payment Approval List Overview - Scenario 10',
    path: '/PaymentListApproval',
    expectedTexts: ['Payment List Approval'],
    actions: [
      {
        key: 'payment_status_sample_approval_list_status_scenario_10',
        label: 'Payment Status Sample Approval List Status - Scenario 10',
        type: 'rfTableColumnText',
        columnLabel: 'Payment List Status',
        text: 'Pending Approval',
        expectedTexts: ['View Payments'],
        rowValueStateKey: 'paymentListApprovalPaymentId',
        rowMatchText: 'Pending Approval',
        rowCellIndex: 0,
        timeoutMs: 90000,
      },
      {
        key: 'payment_list_selection_approval_view_id_scenario_10',
        label: 'Payment List Selection View ID - Scenario 10',
        type: 'captureUrlParam',
        urlIncludes: '/PaymentListSelection?id=',
        urlParam: 'id',
        stateKey: 'paymentListSelectionId',
        expectedTexts: ['View Payments'],
        timeoutMs: 60000,
      },
       {
        key: 'view-payments_approval_list_status_scenario_10',
        label: 'View Payments Approval List Status - Scenario 10',
        type: 'clickText',
        text: 'View Payments',
        timeoutMs: 90000,
      },
      {
        key: 'set_payment_list_selection_approval_view_id_scenario_10',
        label: 'set Payment List Selection View ID - Scenario 10',
        type: 'captureUrlParam',
        urlIncludes: '/SetTransferDetails?id=',
        urlParam: 'id',
        stateKey: 'SetTransferDetailsId',
        expectedTexts: ['PAYMENT LIST STATUS', 'Pending Approval'],
        timeoutMs: 60000,
      },
      {
        key: 'scroll_payment_approval_scenario_10',
        label: 'Scroll Payment Approval - Scenario 10',
        type: 'scrollPositionPercent',
        scrollPositionPercentage: 100,
        timeoutMs: 60000,
        settleMs: 500,
      },
      {
        key: 'payment_approval_scenario_10',
        label: 'Payment Approval - Scenario 10',
        type: 'clickText',
        text: 'Approve',
        ifExists: true,
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'wait_payment_approval_completed_scenario_10',
        label: 'Wait Payment Approval Completed - Scenario 10',
        type: 'waitForTableRowColumnText',
        urlIncludes: '/PaymentListApproval',
        rowValueStateKey: 'paymentListApprovalPaymentId',
        columnLabel: 'Payment List Status',
        text: 'Approved',
        timeoutMs: 180000,
      },
    ]
  },
  {
    key: 'payment_tracking_overview_overview_scenario_11',
    label: 'Payment Tracking Overview List Overview - Scenario 11',
    path: '/PaymentTrackingOverview',
    expectedTexts: ['Payment Tracking Overview'],
    actions: [
      {
        key: 'open_transfer_records_11',
        label: 'Payment Tracking Overview Payment Status - Scenario 11',
        type: 'click',
        selector: 'table tbody tr:first-child td:nth-child(3)',
        expectedTexts: ['Save & Record Transfer'],
        timeoutMs: 120000,
      },
      {
        key: 'capture_transfer_records_ids_11',
        label: 'Review And Manage Transfer Records ID - Scenario 11',
        type: 'captureUrlParam',
        urlIncludes: '/ReviewAndManageTransferRecords?id=',
        urlParam: 'id',
        stateKey: 'reviewAndManageTransferRecords',
        timeoutMs: 180000,
      },
      {
        key: 'select_transfer_rows_s11',
        label: 'Select Filtered Review And Manage Transfer Records Donor - Scenario 11',
        type: 'rfTableHeaderCheckbox',
        expectedTexts: ['Apply to Selected'],
        timeoutMs: 60000,
      },
      {
        key: 'select_payment_status_11',
        label: 'Select Review And Manage Transfer Records Update Payment Status - Scenario 11',
        type: 'selectRfOption',
        selector: '.select-rf[id$="-ReviewAndManageTransferRecords-paymentStatus"]',
        value: 'Successful',
        expectedTexts: [],
        timeoutMs: 180000,
      },
      {
        key: 'set_transfer_date_11',
        label: 'Transfer Made Transfer Date - Scenario 11',
        type: 'datepicker',
        fieldLabel: 'What date was the transfer made',
        selector: '.datepicker-rf input',
        scopeSelector: 'body',
         value: TODAY,
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 500,
      },
      {
        key: 'select_transfer_amount_ok_11',
        label: 'Select Review And Manage Transfer Records Transfer Amount - Scenario 11',
        type: 'selectRfOption',
        selector: '.select-rf[id$="-ReviewAndManageTransferRecords-correctTransferAmount"]',
        value: 'Yes',
        expectedTexts: [],
        timeoutMs: 180000,
      },
      {
        key: 'apply_selected_transfer_11',
        label: 'Select Review And Manage Transfer Apply to Selected - Scenario 11',
        type: 'clickText',
        text: 'Apply to Selected',
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'save_record_transfer_11',
        label: 'Save & Record Transfer - Scenario 11',
        type: 'clickText',
        text: 'Save & Record Transfer',
        selectorIndex: 5,
        expectedTexts: ['Payment Tracking Overview'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
    ]
  },
  {
    key: 'sample_report_overview_scenario_20',
    label: 'SampleReport List Overview - Scenario 20',
    path: '/SampleReportOverView',
    expectedTexts: ['Create New Sample'],
    actions: [
      {
        key: 'open_create_payment_list_modal_scenario_20',
        label: 'Open Create New Sample - Scenario 20',
        type: 'clickText',
        text: 'Create New Sample',
        expectedTexts: ['Sample Name', 'Survey Type'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'report_name_scenario_20',
        label: 'Sample Name - Scenario 20',
        type: 'fillInput',
        selector: '.modal-rf input[type="text"]',
        value: `sample_01_${new Date().toISOString().replace(/[:.]/g, '-')}`,
        submit: false,
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'survey_type_scenario_20',
        label: 'Survey Type - Scenario 20',
        type: 'selectRfMultiOption',
        selector: 'div[id$="-SampleReport-survey_type"]',
        fieldLabel: 'Survey Type',
        value: '',
        expectedTexts: [''],
        selectionCount: 1,
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_no_pre_filter_population_scenario_20',
        label: 'Select All Registered Households - Scenario 20',
        type: 'clickChoice',
        fieldLabel: 'Choose One:',
        text: 'All registered households in this project',
        scopeSelector: '.modal-rf, body',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'create_new_sample_scenario_20',
        label: 'Create New Sample - Scenario 20',
        type: 'click',
        selector: '.modal-rf button.button-rf-danger',
        timeoutMs: 180000,
      },
      {
        key: 'sample_list_selection_id_scenario_20',
        label: 'Sample List Selection ID - Scenario 20',
        type: 'captureUrlParam',
        urlIncludes: '/SamplingHousehold?id=',
        urlParam: 'id',
        stateKey: 'samplingId',
        timeoutMs: 180000,
      },
      {
        key: 'select_full_household_details_sampling_household_scenario_20',
        label: 'Select Filtered Full Household Details - Scenario 20',
        type: 'rfTableFirstRows',
        rowCount: 4,
        verifyFilterState: true,
        verifyVisibleRows: true,
        expectedTexts: ['Save to Sample List'],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'save_to_sample_list_scenario_20',
        label: 'Save to Sample List - Scenario 20',
        type: 'clickText',
        text: 'Save to Sample List',
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'sample_list_selection_generate_id_scenario_20',
        label: 'Sample List Selection Generate ID - Scenario 20',
        type: 'captureUrlParam',
        urlIncludes: '/SampleReportSelection?id=',
        urlParam: 'id',
        stateKey: 'samplingGenerateId',
        timeoutMs: 180000,
      },
      {
        key: 'select_currency_of_transfer_scenario_20',
        label: 'Select Currency of Transfer - Scenario 20',
        type: 'selectRfOption',
        selector: '.select-rf[id$="-SampleReportSelection-SampleSizeType"]',
        value: 'Percentage (%)',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'report_name_scenario_20',
        label: 'Input Sample Size - Scenario 20',
        type: 'fillInput',
        selector: '.input-rf input[type="number"]',
        value: '50',
        submit: true,
        submitKey: 'Tab',
        expectedTexts: [],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'select_full_household_details_sampling_household_generate_scenario_20',
        label: 'Select Filtered Full Household Details Generate - Scenario 20',
        type: 'rfTableHeaderCheckbox',
        expectedTexts: ['Generate Random Sample'],
        timeoutMs: 60000,
        settleMs: 1500,
      },
      {
        key: 'generate_random_sample_scenario_20',
        label: 'Generate Random Sample - Scenario 20',
        type: 'clickText',
        text: 'Generate Random Sample',
        expectedTexts: ['Send List for Approval'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'scroll_send_list_approval_scenario_20',
        label: 'Scroll Send List Approval - Scenario 20',
        type: 'scrollPositionPercent',
        scrollPositionPercentage: 100,
        timeoutMs: 60000,
        settleMs: 500,
      },
      {
        key: 'send_list_for_approval_sample_scenario_20',
        label: 'Send List for Approval Sample - Scenario 20',
        type: 'clickText',
        text: 'Send List for Approval',
        expectedTexts: ['Create New Sample'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
    ],
  },
  {
    key: 'sample_report_approval_overview_scenario_22',
    label: 'Sample Report Approval List Overview - Scenario 22',
    path: '/SampleReportApproval',
    expectedTexts: ['Sample Report Approval'],
    actions: [
      {
        key: 'survey_status_sample_approval_list_status_scenario_22',
        label: 'Survey Status Sample Approval List Status - Scenario 22',
        type: 'rfTableColumnText',
        columnLabel: 'Survey Status',
        text: 'Pending Approval',
        rowValueStateKey: 'sampleReportSelectionId',
        rowMatchText: 'Pending Approval',
        rowCellIndex: 0,
        timeoutMs: 90000,
      },
      {
        key: 'sample_list_selection_approval_id_scenario_22',
        label: 'Sample List Selection Approval ID - Scenario 22',
        type: 'captureUrlParam',
        urlIncludes: '/SampleReportSelection?id=',
        urlParam: 'id',
        stateKey: 'samplingReportId',
        timeoutMs: 180000,
      },
      {
        key: 'send_list_for_approval_sample_scenario_22',
        label: 'Approve Sample - Scenario 22',
        type: 'clickText',
        text: 'Approve',
        ifExists: true,
        timeoutMs: 180000,
        settleMs: 1500,
      },
    ]
  },
  {
    key: 'beneficiary_listOver_view_export_scenario_13',
    label: 'Beneficiary ListOver View Export - Scenario 13',
    path: '/BeneficiaryListOverView',
    expectedTexts: ['Create New Beneficiary List'],
    actions: [
      {
        key: 'beneficiary_open_transfer_records_details_13',
        label: 'Beneficiary List Overview Export Details - Scenario 13',
        type: 'clickText',
        selector: 'table tbody tr:first-child td:last-child',
        text: 'Export',
        timeoutMs: 120000,
      },
    ]
  },
  {
    key: 'payment_list_over_view_export_scenario_13',
    label: 'Payment List Over View Export - Scenario 13',
    path: '/PaymentListOverView',
    expectedTexts: ['Create New Payment List'],
    actions: [
      {
        key: 'payment_open_transfer_records_details_13',
        label: 'Payment List OverView Export Details - Scenario 13',
        type: 'clickText',
        selector: 'table tbody tr:first-child td:last-child',
        text: 'Export',
        timeoutMs: 120000,
      }
    ]
  },
  {
    key: 'sample_report_over_view_export_scenario_13',
    label: 'Sample Report Over View Export - Scenario 13',
    path: '/SampleReportOverView',
    expectedTexts: ['Create New Sample'],
    actions: [
      {
        key: 'sample_report_open_transfer_records_details_13',
        label: 'Sample Report OverView Export Details - Scenario 13',
        type: 'clickText',
        selector: 'table tbody tr:first-child td:last-child',
        text: 'Export',
        timeoutMs: 120000,
      }
    ]
  },
  {
    key: 'project_criteria_setup',
    label: 'Project Criteria Setup List',
    path: '/ProjectCriteriaSetupList',
    expectedTexts: ['Project Criteria Setup List', 'Eligibility Score'],
    actions: [
      {
        key: 'country_project_mapper_list_view_scenario_50',
        label: 'Country Project Mapper List - Scenario 50',
        type: 'clickText',
        text: 'Country Project Mapper List',
        expectedTexts: ['Country Name'],
        timeoutMs: 60000,
      },
      {
        key: 'action-item-username_scenario_50',
        label: 'Action-username - Scenario 50',
        type: 'click',
        selector: '.rf-page-header-action-item-username',
        expectedTexts: ['Logout'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
      {
        key: 'action-item-logout_scenario_50',
        label: 'Action-logout - Scenario 50',
        type: 'clickText',
        text: 'Logout',
        expectedTexts: ['Admin Login', 'Email Address', 'Password'],
        timeoutMs: 180000,
        settleMs: 1500,
      },
    ]
  },
];

export const ROUTES = loadRoutes();

export function stepMetrics(routes) {
  const metrics = [];

  for (const route of routes) {
    metrics.push([route.metricName, `Open ${route.label}`]);
    for (const action of route.actions) {
      metrics.push([action.metricName, action.label]);
    }
  }

  metrics.push(['cva_total_journey_ms', 'Total Journey']);
  return metrics;
}

export function metricKey(value) {
  return String(value || 'route')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'route';
}

function loadRoutes() {
  if (__ENV.CVA_ROUTES_JSON) {
    return normalizeRoutes(JSON.parse(__ENV.CVA_ROUTES_JSON));
  }

  if (__ENV.CVA_ROUTES) {
    return normalizeRoutes(__ENV.CVA_ROUTES.split(',').map((path) => ({ path: path.trim() })).filter((route) => route.path));
  }

  return normalizeRoutes(DEFAULT_ROUTES);
}

function envBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function formatLocalDate(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${date.getFullYear()}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`;
}

function normalizeRoutes(routes) {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error('At least one route must be configured.');
  }

  return routes.map((route, index) => {
    if (typeof route === 'string') {
      route = { path: route };
    }

    const path = route.path || route.route || route.url;
    if (!path) {
      throw new Error(`Route at index ${index} is missing path, route, or url.`);
    }

    const label = resolveTemplate(route.label || route.name || path);
    const key = metricKey(route.key || route.name || label || `route_${index + 1}`);
    const expectedTexts = normalizeTextList(route.expectedTexts || route.expectedText || route.waitForTexts || route.waitForText || label);

    return {
      key,
      label,
      path: resolveTemplate(path),
      expectedTexts,
      actions: normalizeActions(route.actions, key),
      timeoutMs: Number(route.timeoutMs || route.timeout || 45000),
      navigationTimeoutMs: Number(route.navigationTimeoutMs || route.navigationTimeout || route.timeoutMs || route.timeout || 45000),
    };
  });
}

function normalizeActions(actions, routeKey) {
  if (!actions) {
    return [];
  }

  const actionList = Array.isArray(actions) ? actions : [actions];
  return actionList.map((action, index) => {
    const type = action.type || 'waitForText';
    const label = resolveTemplate(action.label || action.name || `${type} ${index + 1}`);
    const key = metricKey(action.key || action.name || label || `${routeKey}_action_${index + 1}`);
    const value = resolveConfigValue(action.value, action.valueEnv);
    const expectedTexts = normalizeTextList(action.expectedTexts || action.expectedText || action.waitForTexts || action.waitForText || value);

    return {
      key,
      label,
      type,
      selector: action.selector || 'input[placeholder="Search"]',
      value,
      expectedTexts,
      timeoutMs: Number(action.timeoutMs || action.timeout || 30000),
      settleMs: Number(action.settleMs || 0),
      submit: action.submit,
      submitKey: action.submitKey,
      ifExists: Boolean(action.ifExists),
      skipIfAnyTexts: normalizeTextList(action.skipIfAnyTexts || action.skipIfAnyText || action.skipIfTexts || action.skipIfText || []),
      text: resolveTemplate(action.text || ''),
      buttonText: resolveTemplate(action.buttonText || ''),
      fieldLabel: resolveTemplate(action.fieldLabel || ''),
      scopeSelector: action.scopeSelector || '',
      formSelector: action.formSelector || '',
      rowValueStateKey: action.rowValueStateKey || '',
      stateKey: action.stateKey || '',
      rowMatchText: resolveTemplate(action.rowMatchText || ''),
      rowCellIndex: action.rowCellIndex === undefined ? undefined : Number(action.rowCellIndex || 0),
      columnLabel: resolveTemplate(action.columnLabel || ''),
      condition: resolveTemplate(action.condition || ''),
      tableSelector: action.tableSelector || '',
      popupSelector: action.popupSelector || '',
      valueSelector: action.valueSelector || '',
      conditionSelector: action.conditionSelector || '',
      urlIncludes: resolveTemplate(action.urlIncludes || ''),
      urlPathIncludes: resolveTemplate(action.urlPathIncludes || ''),
      urlParam: resolveTemplate(action.urlParam || ''),
      columnSelectAll: Boolean(action.columnSelectAll),
      columnSelectAllRequired: Boolean(action.columnSelectAllRequired),
      verifyFilterState: Boolean(action.verifyFilterState),
      verifyVisibleRows: Boolean(action.verifyVisibleRows),
      popupSettleMs: Number(action.popupSettleMs || 0),
      typeDelayMs: Number(action.typeDelayMs || 0),
      selectionCount: Number(action.selectionCount || action.selectorIndex || action.selectCount || 1),
      selectorIndex: Number(action.selectorIndex || 0),
      scrollPositionPercentage: action.scrollPositionPercentage === undefined ? undefined : Number(action.scrollPositionPercentage),
      horizontalScrollPositionPercentage: action.horizontalScrollPositionPercentage === undefined ? undefined : Number(action.horizontalScrollPositionPercentage),
      enabledText: resolveTemplate(action.enabledText || ''),
      selectAll: Boolean(action.selectAll),
      selectAllText: resolveTemplate(action.selectAllText || 'All'),
      applyText: resolveTemplate(action.applyText || 'Apply'),
      rowCount: Number(action.rowCount || action.count || 0),
    };
  });
}

function normalizeTextList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item) => item !== undefined && item !== null && item !== '').map((item) => resolveTemplate(item));
}

function resolveConfigValue(value, envName) {
  if (envName) {
    return resolveEnvValue(envName);
  }
  if (value === undefined || value === null) {
    return '';
  }
  return resolveTemplate(value);
}

function resolveEnvValue(envName) {
  return ENV_VALUES[envName] || __ENV[envName] || '';
}

function resolveTemplate(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, name) => resolveEnvValue(name));
}

