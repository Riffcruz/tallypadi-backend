import { BoostSettings, IBoostSettings } from '../../models/boostSettings.model';
import { AD_PROVIDERS, AdProvider, LEGACY_PROVIDER_MAP, PAID_AD_PROVIDERS } from '../../types/ads';

export const MINOR_UNITS_PER_MAJOR = 100;
const BASIS_POINTS = 10_000;

export class AdBudgetError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface BudgetSplitItem {
  provider: AdProvider;
  weight: number;
  allocationMinor: number;
}

export interface BudgetBreakdown {
  grossBudgetMinor: number;
  serviceFeeMinor: number;
  netCampaignBudgetMinor: number;
  safetyReserveMinor: number;
  fxBufferMinor: number;
  adSpendBudgetMinor: number;
  unallocatedBudgetMinor: number;
  budgetSplit: BudgetSplitItem[];
  settings: IBoostSettings;
}

const assertSafeInteger = (value: number, label: string) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AdBudgetError(`${label} must be a valid amount`, 400);
  }
};

export const toMinorUnits = (majorAmount: unknown) => {
  const amount = Number(majorAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new AdBudgetError('Budget must be a valid amount', 400);
  }
  return Math.round(amount * MINOR_UNITS_PER_MAJOR);
};

export const toMajorUnits = (minorAmount: unknown) => {
  const amount = Number(minorAmount || 0);
  return Math.round(amount) / MINOR_UNITS_PER_MAJOR;
};

export const formatMinorNaira = (minorAmount: number) =>
  `₦${toMajorUnits(minorAmount).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

export const bps = (amountMinor: number, basisPoints: number) => {
  assertSafeInteger(amountMinor, 'Amount');
  assertSafeInteger(basisPoints, 'Basis points');
  return Math.floor((amountMinor * basisPoints) / BASIS_POINTS);
};

export const getBoostSettings = async () => {
  let settings = await BoostSettings.findOne({ currency: 'NGN' });
  if (!settings) {
    settings = await BoostSettings.create({ currency: 'NGN' });
  }
  return settings;
};

export const normalizeProviders = (raw: unknown): AdProvider[] => {
  const values = Array.isArray(raw) ? raw : [raw];
  const expanded = values.flatMap((value) => {
    const key = String(value || '').trim().toUpperCase();
    if (!key) return [];
    if (key === 'ALL') return [...AD_PROVIDERS];
    return [LEGACY_PROVIDER_MAP[key] || key];
  });

  const providers = Array.from(new Set(expanded))
    .filter((provider): provider is AdProvider => AD_PROVIDERS.includes(provider as AdProvider));

  if (providers.length === 0) {
    throw new AdBudgetError('Select at least one promotion channel', 400);
  }

  return providers;
};

const largestRemainderSplit = (amountMinor: number, weightedProviders: { provider: AdProvider; weight: number }[]) => {
  const totalWeight = weightedProviders.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0 || amountMinor <= 0) {
    return weightedProviders.map((item) => ({ ...item, allocationMinor: 0 }));
  }

  const exact = weightedProviders.map((item) => {
    const numerator = amountMinor * item.weight;
    const floor = Math.floor(numerator / totalWeight);
    return {
      ...item,
      allocationMinor: floor,
      remainder: numerator % totalWeight,
    };
  });

  let remaining = amountMinor - exact.reduce((sum, item) => sum + item.allocationMinor, 0);
  exact
    .sort((a, b) => b.remainder - a.remainder || b.weight - a.weight || a.provider.localeCompare(b.provider))
    .forEach((item) => {
      if (remaining <= 0) return;
      item.allocationMinor += 1;
      remaining -= 1;
    });

  return exact
    .sort((a, b) => AD_PROVIDERS.indexOf(a.provider) - AD_PROVIDERS.indexOf(b.provider))
    .map(({ remainder, ...item }) => item);
};

export const calculateBudgetBreakdown = async (input: {
  grossBudgetMajor?: unknown;
  grossBudgetMinor?: unknown;
  selectedProviders: AdProvider[];
  durationDays: number;
  customSplitBasisPoints?: Partial<Record<AdProvider, number>>;
  providerCurrencyDiffers?: boolean;
}): Promise<BudgetBreakdown> => {
  const settings = await getBoostSettings();
  const grossBudgetMinor = input.grossBudgetMinor === undefined
    ? toMinorUnits(input.grossBudgetMajor)
    : Number(input.grossBudgetMinor);

  assertSafeInteger(grossBudgetMinor, 'Gross budget');

  if (grossBudgetMinor < settings.minimumGrossBudgetMinor) {
    throw new AdBudgetError(`Minimum campaign budget is ${formatMinorNaira(settings.minimumGrossBudgetMinor)}`, 400);
  }
  if (!Number.isInteger(input.durationDays) || input.durationDays < settings.minimumDurationDays || input.durationDays > settings.maximumDurationDays) {
    throw new AdBudgetError(`Duration must be between ${settings.minimumDurationDays} and ${settings.maximumDurationDays} days`, 400);
  }

  const serviceFeeMinor = bps(grossBudgetMinor, settings.serviceFeeBasisPoints);
  const netCampaignBudgetMinor = grossBudgetMinor - serviceFeeMinor;
  const safetyReserveMinor = bps(netCampaignBudgetMinor, settings.safetyReserveBasisPoints);
  const fxBufferMinor = input.providerCurrencyDiffers ? bps(netCampaignBudgetMinor, settings.fxBufferBasisPoints) : 0;
  const adSpendBudgetMinor = Math.max(0, netCampaignBudgetMinor - safetyReserveMinor - fxBufferMinor);

  const selectedPaidProviders = input.selectedProviders.filter((provider) => PAID_AD_PROVIDERS.includes(provider));
  let weightedProviders: { provider: AdProvider; weight: number }[] = [];

  if (selectedPaidProviders.length > 0) {
    if (input.customSplitBasisPoints && Object.keys(input.customSplitBasisPoints).length > 0) {
      const totalBps = selectedPaidProviders.reduce((sum, provider) => sum + Number(input.customSplitBasisPoints?.[provider] || 0), 0);
      if (totalBps !== BASIS_POINTS) {
        throw new AdBudgetError('Custom split must total exactly 100%', 400);
      }
      weightedProviders = selectedPaidProviders.map((provider) => ({
        provider,
        weight: Number(input.customSplitBasisPoints?.[provider] || 0),
      }));
    } else {
      weightedProviders = selectedPaidProviders.map((provider) => ({
        provider,
        weight: Number(settings.paidProviderWeights?.[provider as keyof typeof settings.paidProviderWeights] || 0),
      }));
    }
  }

  const paidSplit = largestRemainderSplit(adSpendBudgetMinor, weightedProviders);
  const lowAllocation = paidSplit.find((item) => item.allocationMinor > 0 && item.allocationMinor < settings.minimumProviderAllocationMinor);
  if (lowAllocation) {
    throw new AdBudgetError('Your budget is too low for the selected platforms. Increase your budget or select fewer platforms.', 400);
  }

  const internalSplit = input.selectedProviders.includes('TALLYPADI_MARKETPLACE_BOOST')
    ? [{ provider: 'TALLYPADI_MARKETPLACE_BOOST' as AdProvider, weight: 0, allocationMinor: 0 }]
    : [];

  const budgetSplit = [...paidSplit, ...internalSplit];
  const allocatedBudgetMinor = paidSplit.reduce((sum, item) => sum + item.allocationMinor, 0);

  return {
    grossBudgetMinor,
    serviceFeeMinor,
    netCampaignBudgetMinor,
    safetyReserveMinor,
    fxBufferMinor,
    adSpendBudgetMinor,
    unallocatedBudgetMinor: Math.max(0, adSpendBudgetMinor - allocatedBudgetMinor),
    budgetSplit,
    settings,
  };
};

export const convertLegacyBudgetToMinor = (amount: unknown) => toMinorUnits(amount);
