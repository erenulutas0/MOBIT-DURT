"""Tests for the bulletin parser's pure text rules.

Only the parts that need no network and no PDF: everything here is a string in and a value out.
Run with `python -m unittest discover embedding-service` — the module imports nothing outside the
standard library, so this needs no environment of its own.

find_province is the reason this file exists. It has been wrong three separate ways, each of them
silent: it returned the first province in the LIST rather than the one in the text, it matched
without word boundaries so "vana montajı" was filed under Van, and it folded its own table one way
(I -> i) while folding the text another (I -> ı), which made Isparta and Iğdır impossible to find
at all. Province is the filter customers actually use, so each of those quietly hid tenders from
the companies that wanted them.
"""
import unittest

import bulletin


class FindProvinceTest(unittest.TestCase):
    def test_takes_the_province_at_the_end_not_the_street(self):
        # A Turkish address ends with its province and may name another on the way.
        self.assertEqual(
            bulletin.find_province("Gülbaharhatun Mahallesi Kahramanmaraş Caddesi No:159 Ortahisar/Trabzon"),
            "Trabzon")
        self.assertEqual(
            bulletin.find_province("Horozluhan Mah. Yeni İstanbul Cd. No:64 Selçuklu/Konya"),
            "Konya")
        self.assertEqual(
            bulletin.find_province("Fevzi Çakmak Mah. Eski Bolu Cd Düzce Merkez/Düzce"),
            "Düzce")

    def test_does_not_invent_a_province_out_of_an_ordinary_word(self):
        # "vana" contains "van" and "gidiyordu" contains "ordu"; neither is a place.
        self.assertIsNone(bulletin.find_province("vana montajı yapılacaktır"))
        self.assertIsNone(bulletin.find_province("malzeme gidiyordu depoya"))
        self.assertIsNone(bulletin.find_province("çorumlu bir tedarikçi"))

    def test_finds_the_provinces_written_with_a_dotless_i(self):
        # Isparta and Iğdır were unmatchable while the table and the text were folded differently.
        self.assertEqual(bulletin.find_province("Birlik Mahallesi Atatürk Cadde Sütçüler/Isparta"),
                         "Isparta")
        self.assertEqual(bulletin.find_province("Emek Mahallesi Fatih Caddesi 76000 Iğdır Merkez/Iğdır"),
                         "Iğdır")

    def test_reads_regardless_of_case(self):
        self.assertEqual(bulletin.find_province("ANKARA"), "Ankara")
        self.assertEqual(bulletin.find_province("İSTANBUL"), "İstanbul")
        self.assertEqual(bulletin.find_province("istanbul"), "İstanbul")
        self.assertEqual(bulletin.find_province("şanlıurfa"), "Şanlıurfa")

    def test_says_nothing_rather_than_guessing(self):
        self.assertIsNone(bulletin.find_province(""))
        self.assertIsNone(bulletin.find_province("Mithatpaşa Mah. Milli Egemenlik Caddesi No: 131"))


class AuthorityFromHeaderTest(unittest.TestCase):
    """The buyer's name, which a result block prints after the title and the title twice."""

    def test_cuts_the_doubled_title_off_a_result_block(self):
        header = (
            "8.           2026/1234332 2026 YILI PARK VE BAHÇELER DAİRESİ BAŞKANLIĞININ\n"
            "ATÖLYELERİNDE KULLANILMAK ÜZERE MARANGOZHANE MALZEMELERİ ALIMI\n"
            "2026 YILI PARK VE BAHÇELER DAİRESİ BAŞKANLIĞININ ATÖLYELERİNDE KULLANILMAK\n"
            "ÜZERE MARANGOZHANE MALZEMELERİ ALIMI\n"
            "ANTALYA BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞI PARK VE BAHÇELER DAİRESİ\n"
            "BAŞKANLIĞI\n")
        self.assertEqual(
            bulletin._authority_from_header(header, doubled_title=True),
            "ANTALYA BÜYÜKŞEHİR BELEDİYE BAŞKANLIĞI PARK VE BAHÇELER DAİRESİ BAŞKANLIĞI")

    def test_leaves_an_announcement_alone(self):
        # An ilan prints its title once, so there is no doubled prefix to cut.
        header = ("1 ADET 4X4 ÇEKİŞ SİSTEMLİ PİKAP ALINACAKTIR\n"
                  "BÜNYAN BELEDİYE BAŞKANLIĞI FEN İŞLERİ MÜDÜRLÜĞÜ\n")
        self.assertEqual(bulletin._authority_from_header(header),
                         "BÜNYAN BELEDİYE BAŞKANLIĞI FEN İŞLERİ MÜDÜRLÜĞÜ")


if __name__ == "__main__":
    unittest.main()
