/**
 * Where a kırım figure comes from, and whose decision it is not.
 *
 * <p>Shown wherever a discount percentage is printed large enough to be acted on. The number is
 * derived from EKAP's own sonuç ilanları — if the published PDF is wrong, this repeats the error —
 * and a buyer's past behaviour is not a promise about the tender being priced today. A company that
 * bids to this number and loses, or trips the aşırı düşük teklif threshold, should have been told
 * once where it came from.
 *
 * <p>Wording identical to the phone's copy, and for the same reason it is a component there: the
 * sentence is the point, and a sentence that drifts between surfaces is worth less than one that
 * does not.
 */
export function DiscountSourceNote() {
  return (
    <p className="text-xs text-slate-500 leading-relaxed">
      Kaynak: EKAP sonuç ilanları. Geçmiş kırım, bugünkü bir ihale için taahhüt değildir —
      teklif kararı sizindir.
    </p>
  );
}
