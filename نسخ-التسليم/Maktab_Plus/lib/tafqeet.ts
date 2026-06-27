const ONES = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
  'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];
const TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function group(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest) {
    if (rest < 20) parts.push(ONES[rest]);
    else {
      const one = rest % 10;
      const ten = Math.floor(rest / 10);
      parts.push(one ? `${ONES[one]} و${TENS[ten]}` : TENS[ten]);
    }
  }
  return parts.join(' و');
}

function scaled(value: number, singular: string, dual: string, plural: string): string {
  if (value === 1) return singular;
  if (value === 2) return dual;
  if (value >= 3 && value <= 10) return `${group(value)} ${plural}`;
  return `${group(value)} ${singular}`;
}

function integerText(value: number): string {
  if (!value) return 'صفر';
  const billions = Math.floor(value / 1_000_000_000);
  const millions = Math.floor((value % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1_000);
  const rest = value % 1000;
  const parts: string[] = [];
  if (billions) parts.push(scaled(billions, 'مليار', 'ملياران', 'مليارات'));
  if (millions) parts.push(scaled(millions, 'مليون', 'مليونان', 'ملايين'));
  if (thousands) parts.push(scaled(thousands, 'ألف', 'ألفان', 'آلاف'));
  if (rest) parts.push(group(rest));
  return parts.join(' و');
}

export function tafqeet(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  if (amount < 0) return `سالب ${tafqeet(-amount)}`;
  const rounded = Math.round(amount * 100);
  const riyals = Math.floor(rounded / 100);
  const halalas = rounded % 100;
  const parts = [`${integerText(riyals)} ريال سعودي`];
  if (halalas) parts.push(`${integerText(halalas)} هللة`);
  return `${parts.join(' و')} فقط لا غير`;
}
