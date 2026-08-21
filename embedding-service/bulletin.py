"""Reads the Kamu İhale Bülteni: fetches the day's PDF and splits it into tender announcements.

Lives beside the embedding service because both halves of the job are already here — poppler for
the text and one shared container for every tenant, since the bulletin is the same public document
for all of them and downloading it once is both cheaper and politer than downloading it per
customer.

Two things about the extraction that are not obvious and cost an afternoon to find:

  * Python's PDF libraries return the Turkish characters as replacement marks ("A�USTOS"), so
    poppler's pdftotext is used instead — it reads them correctly.
  * It must run with -layout. The announcements are a two-column table; without it every label is
    emitted in one block and every value in another, and pairing them back up is guesswork.
"""

import io
import re
import ssl
import subprocess
import tempfile
import urllib.parse
import urllib.request
import zipfile
from http.cookiejar import CookieJar

BULLETIN_URL = "https://ekap.kik.gov.tr/ekap/ilan/bultenindirme.aspx"


def _tls_context() -> ssl.SSLContext:
    """The site negotiates a cipher Debian's default security level refuses.

    Python fails the handshake outright where curl succeeds, which reads like the site being down.
    Level 1 is what it takes; certificates are still verified and the hostname still checked, so
    this loosens which ciphers are acceptable and nothing else.
    """
    context = ssl.create_default_context()
    context.set_ciphers("DEFAULT@SECLEVEL=1")
    return context

# The four bulletins, and the postback each button raises.
BULLETIN_TYPES = {
    "mal": "ctl00$ContentPlaceHolder1$lnkBtnMal",
    "yapim": "ctl00$ContentPlaceHolder1$lnkBtnYapim",
    "hizmet": "ctl00$ContentPlaceHolder1$lnkBtnHizmet",
    "danismanlik": "ctl00$ContentPlaceHolder1$lnkBtnDanismanlik",
}

# Turkish addresses end "…İlçe/İl", but plenty end in something else entirely, so the province is
# recognised from a list rather than by taking whatever follows the last slash.
PROVINCES = [
    "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya",
    "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik", "Bingöl",
    "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır",
    "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun",
    "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul", "İzmir", "Kahramanmaraş",
    "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kilis", "Kırıkkale", "Kırklareli",
    "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Mardin", "Mersin", "Muğla",
    "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye", "Rize", "Sakarya", "Samsun", "Şanlıurfa",
    "Siirt", "Sinop", "Sivas", "Şırnak", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van",
    "Yalova", "Yozgat", "Zonguldak",
]
def _turkish_fold(value: str) -> str:
    """One folding, used on both sides of every comparison in this file.

    Defined here rather than beside the other helpers because the province table below is built
    with it. When the table was folded one way (I -> i) and the text another (I -> ı), Isparta and
    Iğdır could never be matched at all — two of the eighty-one provinces were permanently
    invisible, and every announcement in them fell through to whatever the fallback found.
    """
    return value.replace("İ", "i").replace("I", "ı").casefold()


_PROVINCE_KEYS = [(name, _turkish_fold(name)) for name in PROVINCES]

# Anchored on both sides against the folded alphabet, which is where the Turkish letters end up —
# a plain \b would treat ı, ç, ğ, ö, ş and ü as boundaries and let "vana" match Van after all.
_PROVINCE_PATTERNS = [
    (name, re.compile(r"(?<![0-9a-zçğıöşü])" + re.escape(key) + r"(?![0-9a-zçğıöşü])"))
    for name, key in _PROVINCE_KEYS
]

IKN_LINE = re.compile(r"^\s*İhale Kayıt Numarası[^:]*:\s*(\d{4}/\d+)\s*$", re.MULTILINE)
# Section headings, e.g. "2. İHALE İLANLARI" or "4. İHALE İPTAL İLANLARI".
SECTION_LINE = re.compile(r"^\s*\d+\.\s+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ ]{5,60})\s*$", re.MULTILINE)
# "3.1. Adı" and "3.1 Adı" are the same field. The trailing dot is optional in their own template
# — the hizmet bulletin prints the tender's name without it — and requiring it cost the title on 58
# of one day's 75 service announcements, along with the value of whichever field came before, since
# an unrecognised label leaves the wrapped lines below it attached to the previous one.
FIELD_LINE = re.compile(r"^\s*(\d+\.\d+)\.?\s*(.+?)\s{2,}:\s*(.*)$")
# The İSTİSNA announcements do not number their fields at all: they write "İşin Adı" and
# "b) Tarihi ve saati". Same two-column layout, different left-hand side, so they are read by label.
LABEL_LINE = re.compile(
    r"^\s*(?:\d+\s*-\s*|[A-Za-zÇĞİÖŞÜçğıöşü]\)\s*)?([^:]{3,60}?)\s{2,}:\s*(.*)$")
# What those announcements call the two fields that matter most.
LABEL_TITLE = "işin adı"
LABEL_TENDER_AT = "tarihi ve saati"

# The two-column separator. A line carrying one belongs to an announcement's field table.
FIELD_SEPARATOR = re.compile(r"\s{2,}:")

# The running number and the İKN a result block opens with, which belong to neither the title nor
# the buyer and would otherwise make the first printing of the title differ from the second.
INDEX_PREFIX = re.compile(r"^\d+\.\s*(?:\d{4}/\d+)?\s*")

# How every headline in the bulletin ends. Used to tell the headline apart from the buyer's name,
# which is printed in the same capitals directly beneath it.
HEADLINE_VERB = re.compile(
    r"(ALINACAKTIR|YAPTIRILACAKTIR|YAPILACAKTIR|EDİLECEKTİR|KİRALANACAKTIR|SATILACAKTIR)")
# "26.08.2026 - 10:00", wherever it sits in the value. The dash is not always there — the
# danışmanlık bulletin writes "24.08.2026 10:00" — so it is optional rather than assumed.
TENDER_AT_VALUE = re.compile(r"\d{2}\.\d{2}\.\d{4}\s*(?:-\s*)?\d{2}[:.]\d{2}")

# ── Sonuç ilanları ────────────────────────────────────────────────────────────
# A second PDF ships in the same archive as the announcements and is laid out differently: no
# section headings, one "SONUÇ İLANI" banner per result, and fields grouped under numbered
# headings ("4- Sözleşmenin") whose letters restart in every group. Two fields called "Tarihi"
# appear in every result — the tender's and the contract's — so a result is read by (group,
# letter) rather than by label alone.
RESULT_BANNER = re.compile(r"\n[ \t]*SONUÇ İLANI[ \t]*\n")
# Lowercase "kayıt" here where the announcements bulletin capitalises it. Same number, other file.
RESULT_IKN_LINE = re.compile(r"^\s*İhale kayıt numarası\s*:\s*(\d{4}/\d+)\s*$",
                             re.MULTILINE | re.IGNORECASE)
RESULT_GROUP_LINE = re.compile(r"^\s*(\d)-\s*(\S[^\n:]{0,60})\s*$")
RESULT_FIELD_LINE = re.compile(r"^\s*([a-zğüşıöç])\)\s*(.+?)\s{2,}:\s*(.*)$")
# "82.368.000,00 TRY" — Turkish grouping, and a currency that is not always the lira. Not anchored
# to the end of the value: where a table row spilled onto the next page pdftotext leaves an arrow
# behind it ("87.231.881,17 TRY -->"), which cost the estimate on every pazarlık result. The two
# decimals are required, so a duration of "240" can never be mistaken for a sum of money.
MONEY_VALUE = re.compile(r"(\d[\d.]*,\d{2})\s*([A-Z]{3})?")
DATE_VALUE = re.compile(r"\d{2}\.\d{2}\.\d{4}")


def _hidden_fields(page: str) -> dict:
    """The ASP.NET state the form posts back. Read from the page rather than guessed."""
    fields = {}
    for name in ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION", "__PIT", "__PITC"):
        match = re.search(r'name="%s"[^>]*value="([^"]*)"' % re.escape(name), page)
        fields[name] = match.group(1) if match else ""
    return fields


def fetch_bulletin(kind: str, timeout: int = 300) -> dict:
    """Downloads one bulletin. Returns the archive's PDFs keyed by name."""
    target = BULLETIN_TYPES.get(kind)
    if target is None:
        raise ValueError(f"bilinmeyen bülten türü: {kind}")

    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(CookieJar()),
        urllib.request.HTTPSHandler(context=_tls_context()))
    opener.addheaders = [
        ("User-Agent", "Mozilla/5.0 (compatible; DocsBotOps/1.0)"),
        ("Referer", BULLETIN_URL),
    ]
    page = opener.open(BULLETIN_URL, timeout=timeout).read().decode("utf-8", "replace")

    payload = _hidden_fields(page)
    payload.update({
        "__EVENTTARGET": target,
        "__EVENTARGUMENT": "",
        "__SCROLLPOSITIONX": "0",
        "__SCROLLPOSITIONY": "0",
        "ctl00$ContentPlaceHolder1$ddlstBxIhaleTur": "0",
    })
    request = urllib.request.Request(BULLETIN_URL, data=urllib.parse.urlencode(payload).encode())
    body = opener.open(request, timeout=timeout).read()

    if body[:2] != b"PK":
        # An HTML page here means the form was rejected — reported rather than parsed as if it
        # were a bulletin, so a change on their side surfaces as an error instead of a quiet zero.
        raise RuntimeError("bülten yerine HTML döndü; sayfa yapısı değişmiş olabilir")
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


def pdf_to_text(data: bytes) -> str:
    """poppler, with -layout. See the module docstring for why both parts matter."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
        handle.write(data)
        path = handle.name
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", path, "-"],
            capture_output=True, timeout=600, check=True)
        return result.stdout.decode("utf-8", "replace")
    finally:
        import os
        os.unlink(path)


def find_province(text: str):
    """The province an announcement belongs to, or None when the address does not name one.

    Two rules, both learned from being wrong on 210 of 3,078 stored announcements.

    The last match wins, not the first. A Turkish address ends with its province and may name
    another on the way — "Kahramanmaraş Caddesi No:159 Ortahisar/Trabzon" is in Trabzon — and a
    scan that stops at the first hit returns whichever province the list happens to reach first,
    which is alphabetical order and has nothing to do with the text.

    Matches are whole words. Without that, "vana montajı" is filed under Van and "gidiyordu" under
    Ordu: a province invented out of an ordinary Turkish word, which is worse than none because the
    map and the province filter both count it.
    """
    haystack = _turkish_fold(text)
    found, found_at = None, -1
    for name, pattern in _PROVINCE_PATTERNS:
        for match in pattern.finditer(haystack):
            if match.start() > found_at:
                found, found_at = name, match.start()
    return found


def classify(section: str) -> str:
    """What an announcement is, taken from the section it appears under.

    The bulletin is not one list. Alongside new tenders it carries pre-announcements, corrections,
    addenda and cancellations, and they share the İKN format and most of the layout. Showing a
    cancelled tender as something to bid on is worse than showing nothing, and guessing the kind
    from which fields happen to be present gets it wrong on the ones that matter — so the source's
    own heading decides.
    """
    heading = _turkish_fold(section)
    if "iptal" in heading:
        return "iptal"
    if "duzeltme" in heading or "düzeltme" in section.lower() or "zeyilname" in heading:
        return "duzeltme"
    if "on ilan" in heading or "ön ilan" in section.lower():
        return "on_ilan"
    if "sonuc" in heading:
        return "sonuc"
    if "ilan" in heading:
        return "ilan"
    return "diger"


def _sections_by_position(text: str) -> list:
    """Where each heading starts, so an announcement can be told which one it falls under."""
    return [(match.start(), match.group(1).strip()) for match in SECTION_LINE.finditer(text)]


def _section_at(sections: list, position: int) -> str:
    current = ""
    for start, heading in sections:
        if start > position:
            break
        current = heading
    return current


def _fields_of(block: str):
    """The fields of one announcement, keyed both by number and by label.

    Two layouts share the bulletin: most announcements number their fields, the ones published as
    İSTİSNA label them. Reading both costs one extra pattern and saves losing the name and the date
    of every exempt tender — fourteen of them on an ordinary day.

    Wrapped values are joined back together. A label is only recognised in the left-hand column,
    because a value that wrapped far to the right and happens to contain a colon is a continuation,
    not a new field.
    """
    by_number, by_label = {}, {}
    current = None
    for line in block.split("\n"):
        indented = line.startswith(" " * 20)
        match = FIELD_LINE.match(line) if not indented else None
        if match:
            current = {"label": match.group(2).strip(), "value": match.group(3).strip()}
            by_number[match.group(1)] = current
            by_label.setdefault(_turkish_fold(current["label"]), current)
            continue
        match = LABEL_LINE.match(line) if not indented else None
        if match:
            current = {"label": match.group(1).strip(), "value": match.group(2).strip()}
            # First occurrence wins: the numbered layout calls both the buyer and the work "Adı",
            # and the buyer is printed first.
            by_label.setdefault(_turkish_fold(current["label"]), current)
            continue
        # A continuation: the value column wrapped, so the line is indented with no label.
        if current and indented and line.strip():
            current["value"] += " " + line.strip()
    return by_number, by_label


def _block_start(text: str, ikn_position: int, floor: int) -> int:
    """Where an announcement really begins: at its headline, not at its İhale Kayıt Numarası.

    Above the İKN the bulletin prints a headline in capitals, an index line, the buyer's name (in
    the İSTİSNA layout, which has no field for it) and a sentence naming the work. Starting at the
    İKN files all of that under the announcement *before* it — which is how the buyer went missing
    on exempt tenders, and how one tender's opening paragraph ended up in another's text.

    The walk backwards stops at the first line carrying a field separator, because that line still
    belongs to the announcement above.
    """
    start = ikn_position
    for _ in range(14):
        if start <= floor:
            break
        previous = text.rfind("\n", floor, start - 1)
        if previous < 0:
            break
        if FIELD_SEPARATOR.search(text[previous + 1:start - 1]):
            break
        start = previous + 1
    return start


def _authority_from_header(header: str, doubled_title: bool = False) -> str:
    """The buyer's name as printed above the İKN, for the layout that has no field for it.

    Read from the bottom up: the name sits directly above the İhale Kayıt Numarası, in the same
    capitals as the headline above it, and the headline is told apart by the verb it ends with.

    A result block prints the work's name twice — once on the index line beside the İKN and again
    as the block's own heading — while the buyer is printed once, after both. Flattened to words
    the header is therefore TITLE TITLE BUYER, and the buyer is whatever follows the longest
    doubled prefix. That repetition is the only reliable way to tell the two apart, because plenty
    of titles are neither shorter than a buyer's name nor end in one of the headline verbs:
    "1 ADET 4X4 ÇEKİŞ SİSTEMLİ PİKAP ALIMI" reads exactly like an institution to any rule that does
    not count occurrences. Without it the title glued itself to the front of the buyer on three
    quarters of one day's mal contracts, which left every one of them looking like a different
    idare and the per-buyer history unable to accumulate at all.

    Compared as words rather than as lines because the two printings wrap at different columns, so
    they are never equal line for line, and counting occurrences of a line does not work either:
    the walk up from the İKN starts on the tail of a wrapped buyer name, and a tail that short
    ("BAŞKANLIĞI") occurs all over the header as a substring of longer words.

    Only a result block repeats itself, so the caller says which layout it is reading. Left to
    guess, the cut fires on the first announcement of a bulletin, whose header still carries the
    front matter ("1. İSTİSNA İHALE İLANLARI 1.1. MAL ALIMI İHALELERİ BÜLTENİ 1. İSTİSNA…") and
    repeats there for reasons that have nothing to do with a title.
    """
    if doubled_title:
        words = INDEX_PREFIX.sub("", header.strip(), count=1).split()
        for size in range(len(words) // 2, 0, -1):
            if len(words) > size * 2 and words[:size] == words[size : size * 2]:
                return " ".join(words[size * 2 :])[:400]

    # An ilan prints its title once, so there is no doubled prefix to cut and the name has to be
    # read bottom-up from the İKN instead.
    names = []
    for line in reversed(header.split("\n")):
        stripped = line.strip()
        if not stripped:
            if names:
                break
            continue
        if HEADLINE_VERB.search(stripped) or FIELD_SEPARATOR.search(stripped):
            break
        letters = [character for character in stripped if character.isalpha()]
        if not letters or sum(1 for c in letters if c.isupper()) < len(letters) * 0.8:
            break
        names.append(stripped)
        if len(names) == 2:
            break
    return " ".join(reversed(names))[:400]


def _tender_at(raw: str) -> str:
    """Just the date and time. The value can pick up whatever the page printed after it."""
    match = TENDER_AT_VALUE.search(raw or "")
    return match.group(0) if match else (raw or "").strip()


def parse_announcements(text: str) -> list:
    """Splits the bulletin into announcements and pulls the fields worth searching on."""
    starts = [(match.start(), match.group(1)) for match in IKN_LINE.finditer(text)]
    bounds = [
        _block_start(text, position, starts[index - 1][0] if index else 0)
        for index, (position, _) in enumerate(starts)
    ]
    sections = _sections_by_position(text)
    announcements = []
    for index, (position, ikn) in enumerate(starts):
        begin = bounds[index]
        end = bounds[index + 1] if index + 1 < len(bounds) else len(text)
        block = text[begin:end]
        by_number, by_label = _fields_of(block)

        def value(key, label=None, default=""):
            entry = by_number.get(key) or (by_label.get(label) if label else None)
            return entry["value"] if entry else default

        authority = value("1.1") or _authority_from_header(text[begin:position])
        address = value("1.2", "adresi")
        section = _section_at(sections, position)
        announcements.append({
            "ikn": ikn,
            "section": section,
            "kind": classify(section),
            "authority": authority,
            "address": address,
            # Looked for in the address first and the whole block second: an idare's name often
            # carries the province ("… İl Özel İdaresi") when the address is a PO box.
            "province": find_province(address) or find_province(block),
            "tender_at": _tender_at(value("2.1", LABEL_TENDER_AT)),
            "title": value("3.1", LABEL_TITLE),
            "quantity": value("3.2", "niteliği, türü ve miktarı"),
            "delivery_place": value("3.3", "teslim yeri"),
            # Kept whole. The fields say what a tender is; the body says whether it is one this
            # company can do — "3x240/25 mm² XLPE" lives here and nowhere else.
            "text": block.strip(),
        })
    return announcements


def _result_fields(block: str) -> dict:
    """The fields of one result, keyed both "group.letter" and "group|label".

    Keyed by group rather than by name alone because the names repeat: every result carries the
    tender's "Tarihi" under group 1 and the contract's under group 4, and a result read by label
    alone would report the contract as having been signed before the tender was held.

    Keyed by label rather than by letter alone because the letters shift. A pazarlık result adds
    "d) Pazarlık Usulünün Seçilme Gerekçesi" and pushes the estimated cost from d to e; reading
    position 1.d lost the estimate on all thirteen of them in one day's bulletin.

    Two wrapping habits have to be handled and they pull in opposite directions. A long value
    continues on the lines below, indented into the value column. A long *label* continues on the
    line below at the left margin ("a) Dokümanı EKAP üzerinden" / "e-imza kullanarak indiren
    sayısı"), which is why only indented lines are treated as value. And a value the layout chose
    to centre vertically begins on the line *above* its own label, with the label line's own value
    left empty — so indented lines are held until it is known which side wants them.
    """
    fields, group, current, pending = {}, None, None, []

    def flush_backwards():
        """Give the held lines to the field above, which is where they belong by default."""
        nonlocal pending
        if current is not None and pending:
            current["value"] = (current["value"] + " " + " ".join(pending)).strip()
        pending = []

    for line in block.split("\n"):
        stripped = line.strip()
        indented = line.startswith(" " * 20)
        if indented and stripped:
            pending.append(stripped)
            continue
        match = RESULT_GROUP_LINE.match(line)
        if match:
            flush_backwards()
            group, current = match.group(1), None
            continue
        match = RESULT_FIELD_LINE.match(line)
        if match and group:
            entry = {"label": match.group(2).strip(), "value": match.group(3).strip()}
            if entry["value"]:
                flush_backwards()
            else:
                # An empty value means the lines held above were this field's, not the last one's.
                entry["value"] = " ".join(pending).strip()
                pending = []
            current = entry
            fields.setdefault("%s.%s" % (group, match.group(1)), entry)
            fields.setdefault("%s|%s" % (group, _turkish_fold(entry["label"])), entry)
            continue
        # Anything else at the left margin ends a value: a label continuation, a page footer, the
        # closing "Kamuoyuna saygıyla duyurulur."
        flush_backwards()
        current = None
    flush_backwards()
    return fields


def _money(raw: str):
    """A bulletin amount as a number and its currency, or nothing if it is not one.

    Returned as a string rather than a float: these are contract sums, and the caller stores them
    in a numeric column where "54524045.00" survives and 5.4524045e7 is a rounding argument waiting
    to happen.
    """
    match = MONEY_VALUE.search((raw or "").strip())
    if not match:
        return None, None
    digits = match.group(1).replace(".", "").replace(",", ".")
    try:
        float(digits)
    except ValueError:
        return None, None
    return digits, match.group(2) or "TRY"


def parse_results(text: str) -> list:
    """Splits the results bulletin into one record per awarded tender.

    What makes this worth reading rather than the announcements alone: it prints the idare's own
    estimate beside the price the work was actually let for. The gap between the two is the single
    number a company wants before deciding what to bid — on today's yapım bulletin it runs from a
    few percent to nearly sixty, and no amount of reading the announcement tells you which.
    """
    results = []
    for block in RESULT_BANNER.split(text)[1:]:
        ikn = RESULT_IKN_LINE.search(block)
        if not ikn:
            continue
        # Everything above the İKN line: the index entry, the headline, and the buyer's name.
        header = block[:ikn.start()]
        fields = _result_fields(block)

        def value(*keys, default=""):
            """Read by label first, falling back to position for anything unlabelled."""
            for key in keys:
                entry = fields.get(key)
                if entry:
                    return entry["value"]
            return default

        estimated, estimated_currency = _money(value("1|yaklaşık maliyeti"))
        amount, amount_currency = _money(value("4|bedeli", "4.b"))
        address = value("4|yüklenicinin adresi", "4.f")
        work_place = value("2|yapılacağı yer", "2.b")
        tender_date = DATE_VALUE.search(value("1|tarihi", "1.a"))
        contract_date = DATE_VALUE.search(value("4|tarihi", "4.a"))
        results.append({
            "ikn": ikn.group(1),
            "kind": "sonuc",
            "title": value("2|adı", "2.a"),
            "authority": _authority_from_header(header, doubled_title=True),
            "work_place": work_place,
            "tender_date": tender_date.group(0) if tender_date else "",
            "procedure": value("1|usulü", "1.c"),
            "estimated_cost": estimated,
            "estimated_currency": estimated_currency,
            "bid_count": value("3|toplam teklif sayısı", "3.b"),
            "valid_bid_count": value("3|toplam geçerli teklif sayısı", "3.c"),
            "contract_date": contract_date.group(0) if contract_date else "",
            "contract_amount": amount,
            "contract_currency": amount_currency,
            # Both spellings appear: "d) Yüklenicisi" on most, "d) Yüklenici" on a handful.
            "winner": value("4|yüklenicisi", "4|yüklenici", "4.d"),
            "winner_address": address,
            # Where the work is — never where the winner sits. The two are usually different, and
            # a company filtering for its own province would otherwise be shown an İzmir railway
            # job because the firm that took it is registered in Diyarbakır.
            #
            # Only these two fields are searched. Widening the search to the whole announcement
            # filled the blanks and got them wrong: province names are matched as substrings, and
            # a page of Turkish prose about pazarlık grounds contains enough of them to file a
            # railway job in Van. Roughly a fifth are left empty, which is the honest answer — a
            # tender filed under the wrong province is worse than one filed under none.
            "province": find_province(work_place) or find_province(header),
            "winner_province": find_province(address),
            "text": block.strip(),
        })
    return results
