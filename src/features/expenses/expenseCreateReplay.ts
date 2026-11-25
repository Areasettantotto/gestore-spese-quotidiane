/**
 * Pure comparison of a submitted expense INSERT payload against one
 * returned create-replay candidate row.
 *
 * A true result means only that the candidate matches the captured payload.
 * It does not authorize the expense save.
 */
import type { ExpenseInsertPayload } from './expenses.mapper';
import { isCategoryCode } from './expenseCategoryCatalog';

export type ExpenseCreateReplayCandidateRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  owner_id: string;
  amount: number | string;
  category_code: string;
  description: string;
  date: string;
  companion_id: string | null;
};

const EXPENSE_IDENTITY_UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_LENGTHS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Positive numeric(12,2) maximum: 9999999999.99 in integer cents. */
const MAX_EXPENSE_AMOUNT_CENTS = 999999999999n;

const AMOUNT_SCALE = 2;

const ORDINARY_DECIMAL_TOKEN = /^([0-9]+)(?:\.([0-9]+))?$/;

const JSON_NUMBER_TOKEN = /^([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/;

const MAX_DECIMAL_TOKEN_LENGTH = 128;

type PositiveDecimal = {
  coefficient: bigint;
  scale: number;
};

function readField(record: unknown, key: string): unknown {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return (record as Record<string, unknown>)[key];
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && EXPENSE_IDENTITY_UUID.test(value);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_CALENDAR_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1 || month < 1 || month > 12) return false;
  const maxDay = month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month];
  return day >= 1 && day <= maxDay;
}

function parsePositiveDecimalToken(token: string, allowExponent: boolean): PositiveDecimal | null {
  if (token.length === 0 || token.length > MAX_DECIMAL_TOKEN_LENGTH) return null;
  const match = (allowExponent ? JSON_NUMBER_TOKEN : ORDINARY_DECIMAL_TOKEN).exec(token);
  if (!match) return null;

  const integerPart = match[1] ?? '';
  const fractionPart = match[2] ?? '';
  const exponentText = match[3];
  let exponent = 0;
  if (exponentText !== undefined) {
    if (exponentText.length > 4) return null;
    exponent = Number(exponentText);
    if (!Number.isSafeInteger(exponent)) return null;
  }

  const digits = (integerPart + fractionPart).replace(/^0+/, '') || '0';
  if (digits === '0') return { coefficient: 0n, scale: 0 };
  if (digits.length > 40) return null;

  let scale = fractionPart.length;
  if (exponent > 0) {
    if (exponent >= scale) {
      const shift = exponent - scale;
      if (shift > 15 || digits.length + shift > 24) return null;
      return { coefficient: BigInt(digits) * 10n ** BigInt(shift), scale: 0 };
    }
    scale -= exponent;
  } else if (exponent < 0) {
    const nextScale = scale + -exponent;
    if (nextScale > 40) return null;
    scale = nextScale;
  }

  return { coefficient: BigInt(digits), scale };
}

function pow10(exponent: number): bigint | null {
  if (!Number.isSafeInteger(exponent) || exponent < 0 || exponent > 40) return null;
  return 10n ** BigInt(exponent);
}

/**
 * Decimal half away from zero, to numeric(12,2) integer cents.
 * The token is the JSON number spelling, including exponent notation.
 */
function roundSubmittedTokenToCents(token: string): bigint | null {
  const parsed = parsePositiveDecimalToken(token, true);
  if (!parsed || parsed.coefficient <= 0n) return null;

  let cents: bigint;
  if (parsed.scale <= AMOUNT_SCALE) {
    const factor = pow10(AMOUNT_SCALE - parsed.scale);
    if (factor == null) return null;
    cents = parsed.coefficient * factor;
  } else {
    const factor = pow10(parsed.scale - AMOUNT_SCALE);
    if (factor == null) return null;
    const head = parsed.coefficient / factor;
    const remainder = parsed.coefficient % factor;
    const half = factor / 2n;
    cents = remainder >= half ? head + 1n : head;
  }

  if (cents <= 0n || cents > MAX_EXPENSE_AMOUNT_CENTS) return null;
  return cents;
}

/** Exact positive numeric(12,2) cents. Non-zero digits past scale 2 are rejected. */
function exactPersistedTokenToCents(token: string, allowExponent: boolean): bigint | null {
  const parsed = parsePositiveDecimalToken(token, allowExponent);
  if (!parsed || parsed.coefficient <= 0n) return null;

  let coefficient = parsed.coefficient;
  let scale = parsed.scale;
  if (scale > AMOUNT_SCALE) {
    const factor = pow10(scale - AMOUNT_SCALE);
    if (factor == null) return null;
    if (coefficient % factor !== 0n) return null;
    coefficient /= factor;
    scale = AMOUNT_SCALE;
  }

  if (scale < AMOUNT_SCALE) {
    const factor = pow10(AMOUNT_SCALE - scale);
    if (factor == null) return null;
    coefficient *= factor;
  }

  if (coefficient <= 0n || coefficient > MAX_EXPENSE_AMOUNT_CENTS) return null;
  return coefficient;
}

function submittedAmountCents(amount: unknown): bigint | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || !(amount > 0)) return null;
  return roundSubmittedTokenToCents(JSON.stringify(amount));
}

function persistedAmountCents(amount: unknown): bigint | null {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || !(amount > 0)) return null;
    return exactPersistedTokenToCents(JSON.stringify(amount), true);
  }
  if (typeof amount === 'string') return exactPersistedTokenToCents(amount, false);
  return null;
}

function sameCreateIdentity(submitted: unknown, candidate: unknown): boolean {
  const submittedId = readField(submitted, 'id');
  const submittedTenantId = readField(submitted, 'tenant_id');
  const submittedUserId = readField(submitted, 'user_id');
  const submittedOwnerId = readField(submitted, 'owner_id');
  const candidateId = readField(candidate, 'id');
  const candidateTenantId = readField(candidate, 'tenant_id');
  const candidateUserId = readField(candidate, 'user_id');
  const candidateOwnerId = readField(candidate, 'owner_id');

  if (
    !isUuid(submittedId) ||
    !isUuid(submittedTenantId) ||
    !isUuid(submittedUserId) ||
    !isUuid(submittedOwnerId) ||
    !isUuid(candidateId) ||
    !isUuid(candidateTenantId) ||
    !isUuid(candidateUserId) ||
    !isUuid(candidateOwnerId)
  ) {
    return false;
  }

  if (submittedUserId !== submittedOwnerId || candidateUserId !== candidateOwnerId) return false;

  return (
    submittedId === candidateId &&
    submittedTenantId === candidateTenantId &&
    submittedUserId === candidateUserId &&
    submittedOwnerId === candidateOwnerId
  );
}

function sameAmount(submitted: unknown, candidate: unknown): boolean {
  const submittedCents = submittedAmountCents(readField(submitted, 'amount'));
  const persistedCents = persistedAmountCents(readField(candidate, 'amount'));
  if (submittedCents == null || persistedCents == null) return false;
  return submittedCents === persistedCents;
}

function sameCategory(submitted: unknown, candidate: unknown): boolean {
  const submittedCode = readField(submitted, 'category_code');
  const candidateCode = readField(candidate, 'category_code');
  return isCategoryCode(submittedCode) && submittedCode === candidateCode;
}

function sameDescription(submitted: unknown, candidate: unknown): boolean {
  const submittedDescription = readField(submitted, 'description');
  const candidateDescription = readField(candidate, 'description');
  if (typeof submittedDescription !== 'string' || typeof candidateDescription !== 'string') return false;
  if (submittedDescription.length === 0 || candidateDescription.length === 0) return false;
  return submittedDescription === candidateDescription;
}

function sameDate(submitted: unknown, candidate: unknown): boolean {
  const submittedDate = readField(submitted, 'date');
  const candidateDate = readField(candidate, 'date');
  return isIsoCalendarDate(submittedDate) && submittedDate === candidateDate;
}

function sameCompanion(submitted: unknown, candidate: unknown): boolean {
  const submittedCompanion = readField(submitted, 'companion_id');
  const candidateCompanion = readField(candidate, 'companion_id');
  if (submittedCompanion === null && candidateCompanion === null) return true;
  return isUuid(submittedCompanion) && submittedCompanion === candidateCompanion;
}

export function matchesExpenseCreateReplayPayload(
  submitted: ExpenseInsertPayload,
  candidate: ExpenseCreateReplayCandidateRow | null,
): boolean {
  if (candidate == null) return false;
  return (
    sameCreateIdentity(submitted, candidate) &&
    sameAmount(submitted, candidate) &&
    sameCategory(submitted, candidate) &&
    sameDescription(submitted, candidate) &&
    sameDate(submitted, candidate) &&
    sameCompanion(submitted, candidate)
  );
}
