import { allCountries } from 'country-region-data';

const AFRICAN_COUNTRY_CODES = new Set([
  'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'CF', 'TD', 'KM',
  'CG', 'CD', 'CI', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM',
  'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR',
  'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'ST', 'SN', 'SC', 'SL',
  'SO', 'ZA', 'SS', 'SD', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW', 'EH',
]);

const countryNames = new Intl.DisplayNames(['pt'], { type: 'region' });

export const africanCountries = allCountries
  .filter(([, code]) => AFRICAN_COUNTRY_CODES.has(code))
  .map(([name, code, regions]) => ({
    isoCode: code,
    name: countryNames.of(code) || name,
    sourceName: name,
    regions: regions.map(([regionName]) => regionName),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));

export function findAfricanCountry(countryId?: string, countryName?: string) {
  const normalizedId = countryId?.toUpperCase();
  const normalizedName = countryName?.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt');

  return africanCountries.find(country => country.isoCode === normalizedId)
    || africanCountries.find(country =>
      [country.name, country.sourceName].some(name =>
        name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt') === normalizedName,
      ),
    );
}
