import { Injectable } from '@nestjs/common';
import { Category } from '@prisma/client';

interface SuggestedPrices {
  retail: number;
  reseller: number;
}

@Injectable()
export class PriceService {
  /**
   * Calculate suggested prices based on category markup rules
   * Both retail and reseller use their respective percentage flags:
   * - If percentage true: price = cost * (1 + markup)
   * - If percentage false: price = cost + markup (fixed amount)
   */
  calculateSuggestedPrices(cost: number, category: Category): SuggestedPrices {
    // Retail uses isRetailPercentage
    let retail: number;
    if (category.isRetailPercentage) {
      retail = cost * (1 + category.markupRetail);
    } else {
      retail = cost + category.markupRetail;
    }

    // Reseller uses isResellerPercentage
    let reseller: number;
    if (category.isResellerPercentage) {
      reseller = cost * (1 + category.markupReseller);
    } else {
      reseller = cost + category.markupReseller;
    }

    return {
      retail: Math.round(retail * 100) / 100,
      reseller: Math.round(reseller * 100) / 100,
    };
  }

  /**
   * Calculate prices using default fallbacks (+15% retail, +5% reseller)
   */
  calculateDefaultPrices(cost: number): SuggestedPrices {
    return {
      retail: Math.round(cost * 1.15 * 100) / 100,
      reseller: Math.round(cost * 1.05 * 100) / 100,
    };
  }

  /**
   * Clean and parse price from various formats
   */
  cleanPrice(value: any): number {
    if (typeof value === 'number') {
      return value;
    }

    if (!value) {
      return 0;
    }

    let stringVal = String(value);

    // Handle Argentine/European format: 1.000,00 → 1000.00
    if (stringVal.includes(',') && stringVal.includes('.')) {
      if (stringVal.lastIndexOf(',') > stringVal.lastIndexOf('.')) {
        stringVal = stringVal.replace(/\./g, '').replace(',', '.');
      } else {
        stringVal = stringVal.replace(/,/g, '');
      }
    } else if (stringVal.includes(',')) {
      stringVal = stringVal.replace(',', '.');
    }

    // Remove currency symbols and letters
    stringVal = stringVal.replace(/[^0-9.]/g, '');

    const parsed = parseFloat(stringVal);
    return isNaN(parsed) ? 0 : parsed;
  }
}
