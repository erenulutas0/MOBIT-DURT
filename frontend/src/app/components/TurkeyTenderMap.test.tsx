import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TURKEY_PROVINCE_PATHS } from '../data/turkeyProvinces';
import { TurkeyTenderMap } from './TurkeyTenderMap';

describe('TurkeyTenderMap', () => {
  it('81 ilin tamamını çizer', () => {
    // Turkey has 81 provinces. A map that quietly drops one shows an empty patch where a province
    // is, and nobody looking at it can tell that from "no tenders there".
    expect(Object.keys(TURKEY_PROVINCE_PATHS)).toHaveLength(81);
    // İstanbul is drawn in two halves by the source and merged here; Cyprus is left out.
    expect(TURKEY_PROVINCE_PATHS['İstanbul']).toBeDefined();
    expect(TURKEY_PROVINCE_PATHS['Kuzey Kıbrıs']).toBeUndefined();
    expect(TURKEY_PROVINCE_PATHS['Hakkari']).toBeDefined();
  });

  it('il adları bültenin kullandığı adlarla aynı', () => {
    // The map is joined to the counts by name, so a single spelling difference silently leaves a
    // province grey however many tenders it has. These are the ones that differ between sources.
    for (const name of ['Afyonkarahisar', 'Şanlıurfa', 'Kahramanmaraş', 'Çanakkale', 'Ağrı',
      'Iğdır', 'İzmir', 'Muğla', 'Nevşehir', 'Zonguldak']) {
      expect(TURKEY_PROVINCE_PATHS[name], name).toBeDefined();
    }
  });

  it('seçili il yoksa toplamı gösterir', () => {
    render(<TurkeyTenderMap counts={{ Ankara: 11, Siirt: 3 }} selected={null} onSelect={vi.fn()} />);

    expect(screen.getByText('14 ihale · 81 il')).toBeInTheDocument();
  });

  it('ihalesi olan ile tıklayınca o ili seçer', async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TurkeyTenderMap counts={{ Ankara: 11 }} selected={null} onSelect={onSelect} />);

    await userEvent.click(container.querySelector('[data-province="Ankara"]')!);

    expect(onSelect).toHaveBeenCalledWith('Ankara');
  });

  it('ihalesi olmayan il tıklanmaz', async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TurkeyTenderMap counts={{ Ankara: 11 }} selected={null} onSelect={onSelect} />);

    await userEvent.click(container.querySelector('[data-province="Sivas"]')!);

    // Filtering to a province with nothing in it empties the list, which reads as a broken filter
    // rather than a quiet province.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('seçili ili tekrar tıklayınca filtreyi kaldırır', async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TurkeyTenderMap counts={{ Ankara: 11 }} selected="Ankara" onSelect={onSelect} />);

    await userEvent.click(container.querySelector('[data-province="Ankara"]')!);

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
