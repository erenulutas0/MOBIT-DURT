package com.docsbot.ops.bulletin.domain;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The line of work an announcement belongs to.
 *
 * <p>The bulletin's own four types — mal, yapım, hizmet, danışmanlık — say how a tender is procured,
 * not what it is for. A cable contractor and a bakery both read the "mal" bulletin, and neither can
 * use ninety percent of it. This is the second axis: what the work actually is.
 *
 * <p>Keywords rather than a model, deliberately. A wrong category here sends somebody to read an
 * announcement that turns out not to be theirs, and a keyword table is a thing a user can be shown,
 * argued with and corrected in an afternoon — which matters more here than the few percent a
 * classifier would add. The semantic engine already in the codebase does the harder job of matching
 * an announcement against a company's own documents; this only has to narrow the list.
 *
 * <p>The table below was written against a real day's bulletin — 279 live announcements — and
 * several entries exist because of what that run got wrong. They are marked where they are not
 * self-explanatory.
 */
public enum TenderCategory {

    /** Power, from the substation to the light fitting. */
    ELEKTRIK("elektrik", "Elektrik ve Enerji", List.of(
            "elektrik", "kablo", "trafo", "trafo merkezi", "aydınlatma", "jeneratör", "pano",
            "orta gerilim", "alçak gerilim", "enerji nakil", "enerji hattı", "eih", " kv",
            "iletken", "güneş enerji", "fotovoltaik", "armatür", "kompanzasyon", "sayaç",
            "projektör", "led ", "elektrifikasyon", "elektrik tesisat")),

    /** Heating, cooling, plumbing, lifts. */
    MEKANIK("mekanik", "Mekanik Tesisat", List.of(
            "ısıtma", "soğutma", "klima", "havalandırma", "doğalgaz", "kalorifer", "kazan dairesi",
            "buhar kazanı", "kalorifer kazanı", "mekanik tesisat", "sıhhi tesisat", "asansör",
            "pompa", "boru", "vana", "radyatör", "chiller", "yangın söndürme", "sprink",
            "hidrofor", "kompresör")),

    /** Software, hardware, and the network in between. */
    BILISIM("bilisim", "Bilişim ve Teknoloji", List.of(
            "yazılım", "donanım", "bilgisayar", "sunucu", "server", "lisans", "veri merkezi",
            "bilgi işlem", "ağ altyapı", "switch", "firewall", "kamera sistemi", "güvenlik kamera",
            "plaka tanıma", "otomasyon", "bilişim", "yazıcı", "tablet", "projeksiyon", "siber",
            "turnike", "geçiş kontrol", "kgys", "veri tabanı")),

    /**
     * Medical goods and services.
     *
     * <p>Without "hastane" or "hasta": a hospital's gas-conversion tender is a mechanical job that
     * happens to be at a hospital, and "hasta" also sits inside "hastalıkları". The building is
     * named in almost every health-authority announcement and says nothing about the work.
     * "İlaç" is out for a different reason — it is inside "ilaçlama", which is pest control.
     */
    SAGLIK("saglik", "Sağlık ve Tıbbi", List.of(
            "tıbbi", "medikal", "tıbbi sarf", "medikal sarf", "laboratuvar", "ameliyat",
            "diş sarf", "ağız ve diş", "diş üniti", "protez", "ortez", "eldiven", "enjektör",
            "kit karşılığı", "görüntüleme", "röntgen", "tomografi", "diyaliz", "hemodiyaliz",
            "reaktif", "steril", "serum", "anjiyografi", "muayene", "ilaç alım", "tıbbi cihaz",
            "dental", "pedodonti", "intraoküler", "endoskop", "üretroskop", "ortopedi", "anestezi",
            "kardiyoloji", "biyomedikal", "radyoterapi", "patoloji",
            // As it is spelled in a real announcement. The bulletin is typeset by hand and a
            // tender nobody can find because of a typo is still a tender nobody can find.
            "pataloji")),

    /**
     * Food, from raw materials to the served meal.
     *
     * <p>Not "et " or "un ": those two matched "Adet", "Hizmet" and "Hatun" across a third of a real
     * bulletin. Short Turkish words need a longer phrase around them.
     */
    GIDA("gida", "Gıda ve Yemek", List.of(
            "gıda", "yemek", "ekmek", "kuru gıda", "sebze", "meyve", "yaş sebze", "süt ürün",
            "süt alım", "malzemeli yemek", "tabldot", "kumanya", "mutfak", "et alım", "kırmızı et",
            "beyaz et", "tavuk", "unlu mam", "erzak", "içecek", "şarküteri", "kahvaltılık",
            "zeytin", "pirinç", "bakliyat", "catering", "aşçı", "yemekhane")),

    /**
     * Vehicles, fuel, and moving people or things.
     *
     * <p>"Nakliye" and "taşıma" only as part of a service phrase: half the goods announcements in
     * the bulletin end "(Nakliye Dahil)", which is a delivery term, not the subject of the tender.
     */
    ULASIM("ulasim", "Araç ve Ulaşım", List.of(
            "araç kiralama", "araç kiralanması", "akaryakıt", "motorin", "benzin", "nakliye hizmet",
            // Taşımalı eğitim is a large, recurring slice of the hizmet bulletin, and its titles
            // name the school rather than the vehicle: without these the announcement falls
            // through to construction on the word "ilkokul".
            "taşımalı eğitim", "taşıma işi", "taşınması işi",
            "taşıma hizmet", "personel taşıma", "öğrenci taşıma", "şoförlü", "sürücülü", "lastik",
            "yedek parça", "iş makinesi", "kamyon", "otobüs", "minibüs", "araç bakım",
            "servis hizmeti", "lokomotif", "vagon", "demiryolu", "pantograf", "raylı sistem")),

    /**
     * Cleaning, security, and the other bodies-on-site services.
     *
     * <p>"Temizlik" only as a service: "Temizlik Malzemesi Mal Alım İşi" is a purchase of supplies,
     * and a cleaning contractor sent to bid on it has been sent to the wrong tender.
     */
    PERSONEL("personel", "Temizlik, Güvenlik ve Personel", List.of(
            "temizlik hizmet", "malzemeli temizlik", "malzemesiz temizlik", "genel temizlik",
            "özel güvenlik", "güvenlik hizmet", "personel çalıştır", "temizlik personel",
            "kat hizmetleri", "bahçe bakım", "ilaçlama", "çamaşırhane", "bekçi",
            "danışma ve yönlendirme", "hasta bakıcı")),

    /** Offices and the things that get consumed in them. */
    BURO("buro", "Büro, Kırtasiye ve Tüketim", List.of(
            "kırtasiye", "büro malzeme", "büro mobilya", "ofis mobilya", "matbaa", "baskı", "kağıt",
            "toner", "fotokopi", "okul sırası", "temizlik malzeme", "züccaciye", "giyim",
            "kıyafet")),

    /**
     * Farming, forestry and animals.
     *
     * <p>Without bare "hayvan": "Hayvan Barınağı Yapım İşi" is a building. And "orman" only in a
     * phrase, because it sits inside "normal".
     */
    TARIM("tarim", "Tarım ve Hayvancılık", List.of(
            "tohum", "fide", "gübre", "büyükbaş", "küçükbaş", "canlı hayvan", "hayvancılık",
            "hayvan yem", "yem alım", "sulama", "damla sulama", "fidan", "orman işletme",
            "orman bölge", "ormancılık", "arıcılık", "veteriner", "zirai", "tarımsal", "sera",
            "hububat", "balya", "pancar")),

    /** Drawing it, surveying it, checking somebody else built it right. */
    MUHENDISLIK("muhendislik", "Mühendislik ve Danışmanlık", List.of(
            "proje hizmeti", "müşavirlik", "danışmanlık", "etüt proje", "kontrollük", "harita",
            "kadastro", "mimarlık", "fizibilite", "zemin etüd", "imar plan", "hâlihazır",
            "halihazır", "yapı denetim", "müellif", "mühendislik hizmet")),

    /**
     * Buildings, roads, and everything poured or laid.
     *
     * <p>Last on purpose, and consulted only when nothing above matched — see
     * {@link #classify(String, String)}. Its keywords are mostly the names of facilities, and a
     * facility is named in every trade's announcements: "İlkokul Doğalgaz Dönüşüm İşi" is a
     * mechanical job, "Sosyal Tesis Binasının Elektrik Tesisatı" is an electrical one, and both
     * would land here if a school or a building counted as evidence of construction work.
     */
    INSAAT("insaat", "İnşaat ve Yapım", List.of(
            "inşaat", "onarım", "tadilat", "asfalt", "beton", "agrega", "parke", "bordür",
            "kaldırım", "tretuvar", "çevre düzenleme", "peyzaj", "köprü", "menfez", "istinat",
            "kanalizasyon", "içme suyu", "içmesuyu", "yağmur suyu", "altyapı", "üstyapı", "bina",
            "prefabrik", "çatı", "izolasyon", "hafriyat", "sondaj", "stabilize", "yıkı",
            "güçlendirme", "kaba yapı", "ince yapı", "duvar", "derslik", "okul", "lise",
            // Compounds, because a keyword only matches where a word starts and Turkish glues
            // these together: "okul" does not find "ilkokul".
            "ilkokul", "ortaokul", "ilköğretim", "otopark",
            "anaokulu", "kreş", "yurd", "yurt", "pansiyon", "yatakhane", "cami", "kütüphane",
            "park", "spor", "stadyum", "halı saha", "salon", "kavşak", "konut", "lojman",
            "barına", "depo", "tesis yapım", "yol yapım", "yol açma", "poliklinik", "mezarlık",
            "kent mobilya", "mıcır", "taş tozu", "taştozu", "kilit taşı", "sfero döküm", "ızgara",
            "yol çizgi", "ıslah", "baraj", "gölet", "tünel", "iskele")),

    /** Everything the table above does not name. */
    DIGER("diger", "Diğer", List.of());

    /**
     * Everything except the fallback tier and the empty one. A hit in any of these settles the
     * question; {@link #INSAAT} is only reached when none of them matched.
     */
    private static final Set<TenderCategory> TRADES = EnumSet.complementOf(EnumSet.of(INSAAT, DIGER));

    private final String code;
    private final String label;
    private final List<String> keywords;

    TenderCategory(String code, String label, List<String> keywords) {
        this.code = code;
        this.label = label;
        this.keywords = keywords;
    }

    public String code() {
        return code;
    }

    /** Turkish, because it is shown to the user as-is. */
    public String label() {
        return label;
    }

    /**
     * Picks the category an announcement belongs to.
     *
     * <p>Two rules, both of which come from being wrong about a real bulletin:
     *
     * <ol>
     *   <li>A trade beats a building. "Pazarlar İlkokulu Doğalgaz Dönüşüm İşi" names a school and
     *       is a mechanical job; whoever is buying it is not looking for a school builder.
     *   <li>The title decides whenever it says anything. A tender's title is its official one-line
     *       description and is already the answer; the body is only read when the title is silent,
     *       because that same mechanical job names concrete and excavation a hundred times in its
     *       technical annex.
     * </ol>
     *
     * <p>The body needs two separate keywords where the title needs one. Every announcement in the
     * bulletin mentions a building somewhere; one stray word is noise.
     */
    public static TenderCategory classify(String title, String body) {
        String haystackTitle = fold(title);
        TenderCategory tradeByTitle = bestMatch(haystackTitle, 1);
        if (tradeByTitle != DIGER) {
            return tradeByTitle;
        }
        if (hits(haystackTitle, INSAAT) >= 1) {
            return INSAAT;
        }
        String haystackBody = fold(body);
        TenderCategory tradeByBody = bestMatch(haystackBody, 2);
        if (tradeByBody != DIGER) {
            return tradeByBody;
        }
        return hits(haystackBody, INSAAT) >= 2 ? INSAAT : DIGER;
    }

    /** The trade with the most distinct keywords in the text. Ties go to whichever is declared first. */
    private static TenderCategory bestMatch(String haystack, int minimumHits) {
        if (haystack.isBlank()) {
            return DIGER;
        }
        TenderCategory best = DIGER;
        int bestHits = 0;
        for (TenderCategory category : TRADES) {
            int hits = hits(haystack, category);
            if (hits > bestHits) {
                bestHits = hits;
                best = category;
            }
        }
        return bestHits >= minimumHits ? best : DIGER;
    }

    private static int hits(String haystack, TenderCategory category) {
        int found = 0;
        for (String keyword : category.keywords) {
            if (KEYWORD_PATTERNS.get(keyword).matcher(haystack).find()) {
                found++;
            }
        }
        return found;
    }

    /**
     * A keyword matches where a word starts, and may run on from there.
     *
     * <p>Both halves are needed. Without the boundary, "et alım" matches "Hizmet Alımı" — which is
     * in the title of nearly every service tender in the bulletin, and filed forty-five of them as
     * food. "ekmek" matches "gerekmektedir", "akü" matches "Fakültesi", "aşı" matches "Bordür
     * Taşı". Without the run-on, Turkish suffixes break everything the other way: "kablo" would
     * miss "kabloları" and "hastane" would miss "hastanesi".
     *
     * <p>The cost is compounds, where a word is glued to the front: "okul" no longer finds
     * "ilkokul", so those are listed in their own right. That is a handful of entries in exchange
     * for a whole class of quiet misfilings, and a missing category is visible in a way that a
     * wrong one is not.
     */
    private static final java.util.Map<String, java.util.regex.Pattern> KEYWORD_PATTERNS = buildPatterns();

    private static java.util.Map<String, java.util.regex.Pattern> buildPatterns() {
        java.util.Map<String, java.util.regex.Pattern> patterns = new java.util.HashMap<>();
        for (TenderCategory category : values()) {
            for (String keyword : category.keywords) {
                patterns.computeIfAbsent(keyword, word -> java.util.regex.Pattern.compile(
                        "(?<!\\p{L})" + java.util.regex.Pattern.quote(fold(word))));
            }
        }
        return patterns;
    }

    /**
     * Whether this is a code the table still knows.
     *
     * <p>Distinct from {@link #fromCode} answering DIGER, which it does both for "diger" and for
     * anything it does not recognise. A saved filter holding a code that no longer exists matches
     * nothing, and an empty screen with no explanation is indistinguishable from a quiet day.
     */
    public static boolean isKnownCode(String code) {
        return code != null && Arrays.stream(values()).anyMatch(c -> c.code.equalsIgnoreCase(code));
    }

    public static TenderCategory fromCode(String code) {
        for (TenderCategory category : values()) {
            if (category.code.equalsIgnoreCase(code)) {
                return category;
            }
        }
        return DIGER;
    }

    /**
     * Lowercases the Turkish way. {@code "İHALE".toLowerCase()} gives "i̇hale" with a combining dot
     * and {@code "IŞIK".toLowerCase()} gives "isik" with the wrong i, so both capital forms are
     * mapped explicitly before the rest is folded.
     */
    private static String fold(String value) {
        if (value == null) {
            return "";
        }
        return value.replace('İ', 'i').replace('I', 'ı').toLowerCase(Locale.forLanguageTag("tr"));
    }
}
