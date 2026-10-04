import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export interface NormalizedContact {
  value: string;
  normalizedValue: string;
  validationStatus: 'UNKNOWN' | 'VALID' | 'INVALID' | 'RISKY';
  lineType?: string;
}

export class ContactNormalizationService {
  normalizeEmail(value: string): NormalizedContact {
    const normalizedValue = value.trim().toLowerCase();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue);
    return {
      value: value.trim(),
      normalizedValue,
      validationStatus: isValid ? 'VALID' : 'INVALID',
    };
  }

  normalizePhone(value: string, defaultCountry: CountryCode = 'IN'): NormalizedContact {
    const trimmed = value.trim();
    const phone = parsePhoneNumberFromString(trimmed, defaultCountry);
    if (!phone) {
      return { value: trimmed, normalizedValue: trimmed, validationStatus: 'INVALID' };
    }

    return {
      value: trimmed,
      normalizedValue: phone.number,
      validationStatus: phone.isValid() ? 'VALID' : 'INVALID',
      lineType: phone.getType() ?? undefined,
    };
  }

  normalize(channel: string, value: string, defaultCountry: CountryCode = 'IN'): NormalizedContact {
    if (channel === 'EMAIL') return this.normalizeEmail(value);
    if (channel === 'VOICE' || channel === 'SMS' || channel === 'WHATSAPP') {
      return this.normalizePhone(value, defaultCountry);
    }
    const trimmed = value.trim();
    return { value: trimmed, normalizedValue: trimmed, validationStatus: 'UNKNOWN' };
  }
}
