package com.docsbot.ops.bulletin;

import org.junit.jupiter.api.Test;

import com.docsbot.ops.bulletin.domain.TenderCategory;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The categories exist to keep a company from reading four hundred announcements to find the six
 * that are theirs, so what matters is not accuracy in the abstract: it is that the obvious cases
 * land where a person would put them, and that the unclear ones say "diğer" instead of guessing.
 */
class TenderCategoryTest {

    @Test
    void putsTheObviousOnesWhereAPersonWould() {
        assertThat(classify("Köy yolu asfalt kaplama yapım işi")).isEqualTo(TenderCategory.INSAAT);
        assertThat(classify("Orta gerilim kablo ve trafo alımı")).isEqualTo(TenderCategory.ELEKTRIK);
        assertThat(classify("Kalorifer kazanı ve radyatör tesisatı yenileme"))
                .isEqualTo(TenderCategory.MEKANIK);
        assertThat(classify("Tıbbi sarf malzeme alımı")).isEqualTo(TenderCategory.SAGLIK);
        assertThat(classify("Malzemeli yemek hizmeti alımı")).isEqualTo(TenderCategory.GIDA);
        assertThat(classify("Sunucu ve ağ altyapısı donanım alımı")).isEqualTo(TenderCategory.BILISIM);
        assertThat(classify("Şoförlü araç kiralama hizmeti")).isEqualTo(TenderCategory.ULASIM);
        assertThat(classify("Malzemeli genel temizlik hizmeti alımı"))
                .isEqualTo(TenderCategory.PERSONEL);
        assertThat(classify("Kırtasiye ve büro malzemesi alımı")).isEqualTo(TenderCategory.BURO);
        assertThat(classify("Damla sulama sistemi ve fidan alımı")).isEqualTo(TenderCategory.TARIM);
        assertThat(classify("İmar planına esas zemin etüdü müşavirlik hizmeti"))
                .isEqualTo(TenderCategory.MUHENDISLIK);
    }

    @Test
    void aTradeBeatsTheBuildingItIsHappeningIn() {
        // From a real bulletin. Every one of these names a facility, and the facility is not the
        // work: a school builder sent to bid on a gas conversion has been sent to the wrong tender.
        assertThat(classify("Pazarlar İlkokulu-Ortaokulu Doğalgaz Dönüşüm İşi"))
                .isEqualTo(TenderCategory.MEKANIK);
        assertThat(classify("288 GM No'lu Sosyal Tesis Binasının Elektrik Tesisatı Yenilenmesi"))
                .isEqualTo(TenderCategory.ELEKTRIK);
        assertThat(classify("Buldan Göğüs Hastalıkları Hastanesi Doğalgaz Dönüşüm İşi"))
                .isEqualTo(TenderCategory.MEKANIK);
        assertThat(classify("1071 Spor Kompleksi Şehir Stadyumuna LED Projektör Alım ve Montaj İşi"))
                .isEqualTo(TenderCategory.ELEKTRIK);
    }

    @Test
    void aBuildingWithNoTradeInItIsConstruction() {
        // The other half of the same rule: when nothing says what trade it is, the facility is all
        // there is, and these are the bulk of the yapım bulletin.
        assertThat(classify("Aydın İli Nazilli İlçesi 24 Derslik Sümer Ortaokulu Yapım İşi"))
                .isEqualTo(TenderCategory.INSAAT);
        assertThat(classify("Saruhanlı Belediyesi Kapalı Spor Salonu Yapım İşi"))
                .isEqualTo(TenderCategory.INSAAT);
        assertThat(classify("Kaş Kalkan 8 Üniteli Vardiya Yatakhanesi Yapım İşi"))
                .isEqualTo(TenderCategory.INSAAT);
        assertThat(classify("Doç Dr Şahnur Yaprak Cami Çevre Düzenleme Yapım İşi"))
                .isEqualTo(TenderCategory.INSAAT);
    }

    @Test
    void aKeywordOnlyMatchesWhereAWordStarts() {
        // "Hizmet Alımı" ends nearly every service title in the bulletin, and it contains "et
        // alım". Before the boundary, that filed forty-five live tenders as food — cleaning
        // contracts, uniforms, a transport plan. This is the single most expensive mistake the
        // table has made, and it is the reason matching is anchored rather than substring.
        assertThat(classify("Ordu Üniversitesi Güvenlik Görevlileri İçin Kıyafet Alımı"))
                .isEqualTo(TenderCategory.BURO);
        assertThat(classify("Ankara Sürdürülebilir Ulaşım Ana Planı Danışmanlık Hizmet Alımı İşi"))
                .isEqualTo(TenderCategory.MUHENDISLIK);
        // "ekmek" sits inside "gerekmektedir", which is in the body of almost every announcement.
        assertThat(TenderCategory.classify("",
                "İhale dokümanının EKAP üzerinden indirilmesi gerekmektedir. Teklifler elektronik "
                        + "ortamda sunulacak ve tekliflerin EKAP'a yüklenmesi gerekmektedir."))
                .isEqualTo(TenderCategory.DIGER);
    }

    @Test
    void equipmentIsNotAutomaticallyComputerEquipment() {
        // "Donanım" is Turkish for equipment of any kind. On its own it filed a water network's
        // valve rooms and a forestry crew's protective gear as IT — both found by an admin looking
        // at the screen, which is the expensive way to find them.
        assertThat(classify("İçme Suyu Şebekelerinin İzole Alt Bölge Odalarının Donanımlarının Temini"))
                .isEqualTo(TenderCategory.INSAAT);
        assertThat(classify("Orman Bölge Müdürlüğü Personeline Koruyucu Giyim ve Donanım Malzemesi"))
                .isEqualTo(TenderCategory.BURO);
        // It still counts when something says which kind of equipment.
        assertThat(classify("Bilişim Donanımları ve Çevre Birimleri Alımı"))
                .isEqualTo(TenderCategory.BILISIM);
    }

    @Test
    void theWorkIsTheAutomationEvenWhenItPumpsFuel() {
        // Genuinely both: an AI-supported fuel automation system with tanks and pumps. The
        // distinguishing work is the system, and without "yapay zekâ" the tie broke to mechanical
        // on the word "pompa".
        assertThat(classify("Şantiye İstasyonları İçin Yapay Zekâ Destekli Entegre Akaryakıt "
                + "Otomasyon Sistemi, Tank ve Pompa Donanımı")).isEqualTo(TenderCategory.BILISIM);
    }

    @Test
    void aKeywordStillMatchesThroughTurkishSuffixes() {
        // The other half of the rule: the boundary is at the start only, because "kablo" has to
        // find "kabloları" and "hastane" has to find "hastanesi". A rule strict at both ends would
        // match almost nothing in Turkish.
        assertThat(classify("Muhtelif Kabloların Yenilenmesi")).isEqualTo(TenderCategory.ELEKTRIK);
        assertThat(classify("Parke Taşlarının Döşenmesi İşi")).isEqualTo(TenderCategory.INSAAT);
    }

    @Test
    void schoolsGluedToTheFrontOfAWordAreListedInTheirOwnRight() {
        // "okul" cannot find "ilkokul" once matching is anchored, so the compounds are entries of
        // their own. Turkish builds these constantly and they are half the yapım bulletin.
        assertThat(classify("Aydın İli Nazilli İlçesi 24 Derslik Sümer Ortaokulu Yapım İşi"))
                .isEqualTo(TenderCategory.INSAAT);
        assertThat(classify("Van İli Bahçesaray İlçesi 2 Derslikli İlkokul Yapım İşi"))
                .isEqualTo(TenderCategory.INSAAT);
    }

    @Test
    void schoolTransportIsTransportRatherThanTheSchoolItNames() {
        // Taşımalı eğitim is a large recurring slice of the hizmet bulletin, and its titles name
        // the school, not the vehicle. Filed under construction, a bus operator never sees it.
        assertThat(classify("2026-2027 Eğitim Öğretim Yılı İlkokul ve İmam Hatip Taşımalı Eğitim İşi"))
                .isEqualTo(TenderCategory.ULASIM);
        assertThat(classify("Taşımalı Eğitim Kapsamında 346 İlköğretim Öğrencisinin Taşıma İşi"))
                .isEqualTo(TenderCategory.ULASIM);
    }

    @Test
    void shortTurkishWordsDoNotMatchInsideLongerOnes() {
        // Each of these was a real misfiling: "et " inside "Adet" and "Hizmet", "un " inside
        // "Hatun", "aşı" inside "Taşı", "akü" inside "Fakültesi", "ilaç" inside "ilaçlama".
        assertThat(classify("1 Adet Damperli Kamyon")).isEqualTo(TenderCategory.ULASIM);
        assertThat(classify("Türkan Hatun Yurdu Sprink Sistemi Yapılması İşi"))
                .isEqualTo(TenderCategory.MEKANIK);
        assertThat(classify("Devrekani Belediyesi Parke ve Bordür Taşı Alımı"))
                .isEqualTo(TenderCategory.INSAAT);
        assertThat(classify("Dicle Üniversitesi Tıp Fakültesi Hastanesi Muayene Eldiveni Alımı"))
                .isEqualTo(TenderCategory.SAGLIK);
        assertThat(classify("Sivrisinek ve Haşere İlaçlama Hizmeti"))
                .isEqualTo(TenderCategory.PERSONEL);
    }

    @Test
    void aDeliveryTermIsNotTheSubjectOfTheTender() {
        // "(Nakliye Dahil)" ends half the goods announcements in the bulletin. It says who pays the
        // lorry, not that a haulier should bid.
        assertThat(classify("175000 Ton Agrega (Nakliye Dahil) Alımı İşi"))
                .isEqualTo(TenderCategory.INSAAT);
    }

    @Test
    void suppliesAreNotTheServiceThatUsesThem() {
        // A cleaning contractor bidding on a crate of detergent is a wasted afternoon for them.
        assertThat(classify("Temizlik Malzemesi Mal Alım İşi")).isEqualTo(TenderCategory.BURO);
        assertThat(classify("Malzemeli Genel Temizlik Hizmeti Alımı"))
                .isEqualTo(TenderCategory.PERSONEL);
    }

    @Test
    void theTitleOutweighsTheBody() {
        // An electrical job whose technical annex is full of concrete and poles is still an
        // electrical job. Scoring the body alone files it under construction, which puts it in
        // front of the wrong company.
        TenderCategory category = TenderCategory.classify(
                "Elektrik dağıtım şebekesi yapım işi",
                "beton direk beton direk beton kaide inşaat hafriyat beton");

        assertThat(category).isEqualTo(TenderCategory.ELEKTRIK);
    }

    @Test
    void oneStrayMentionInTheBodyIsNotACategory() {
        // Every announcement in the bulletin mentions a building somewhere — the buyer's own
        // address, if nothing else. A single hit is noise, and "diğer" is the honest outcome.
        assertThat(TenderCategory.classify("", "İdarenin adresi: Belediye binası kat 3"))
                .isEqualTo(TenderCategory.DIGER);
    }

    @Test
    void readsTheBodyWhenTheAnnouncementHasNoTitle() {
        // İstisna kapsamındaki ilanlar have a different layout and often parse without a title.
        // They still say what they are; the text is where it says it.
        TenderCategory category = TenderCategory.classify(
                "", "Hastanemiz ihtiyacı olan tıbbi sarf malzeme ve enjektör alımı yapılacaktır.");

        assertThat(category).isEqualTo(TenderCategory.SAGLIK);
    }

    @Test
    void turkishCapitalIDoesNotBreakTheMatching() {
        // "İNŞAAT".toLowerCase() gives an i with a combining dot that matches nothing, and
        // "ISITMA".toLowerCase() gives "isitma" where the keyword says "ısıtma". Both are the kind
        // of failure that shows up as a category quietly always being empty.
        assertThat(classify("İNŞAAT ONARIM İŞİ")).isEqualTo(TenderCategory.INSAAT);
        assertThat(classify("ISITMA TESİSATI YENİLEME İŞİ")).isEqualTo(TenderCategory.MEKANIK);
    }

    @Test
    void nothingAtAllIsNotAnError() {
        assertThat(TenderCategory.classify(null, null)).isEqualTo(TenderCategory.DIGER);
        assertThat(TenderCategory.classify("", "")).isEqualTo(TenderCategory.DIGER);
    }

    @Test
    void everyCodeRoundTrips() {
        // The code is what goes in the database and comes back in a query string; a category that
        // cannot be read back is a filter that silently returns nothing.
        for (TenderCategory category : TenderCategory.values()) {
            assertThat(TenderCategory.fromCode(category.code())).isEqualTo(category);
            assertThat(category.label()).isNotBlank();
        }
        assertThat(TenderCategory.fromCode("bilinmeyen")).isEqualTo(TenderCategory.DIGER);
        assertThat(TenderCategory.fromCode(null)).isEqualTo(TenderCategory.DIGER);
    }

    private static TenderCategory classify(String title) {
        return TenderCategory.classify(title, title);
    }
}
