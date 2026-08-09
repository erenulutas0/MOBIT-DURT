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
import subprocess
import tempfile
import urllib.parse
import urllib.request
import zipfile
from http.cookiejar import CookieJar

BULLETIN_URL = "https://ekap.kik.gov.tr/ekap/ilan/bultenindirme.aspx"

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
# Matched case-insensitively against a casefolded haystack; Turkish dotted/dotless I makes
# str.lower() unreliable here, so casefold with an explicit İ→i mapping is used throughout.
_PROVINCE_KEYS = [(name, name.replace("İ", "i").casefold()) for name in PROVINCES]

IKN_LINE = re.compile(r"^\s*İhale Kayıt Numarası[^:]*:\s*(\d{4}/\d+)\s*$", re.MULTILINE)
# Section headings, e.g. "2. İHALE İLANLARI" or "4. İHALE İPTAL İLANLARI".
SECTION_LINE = re.compile(r"^\s*\d+\.\s+([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ ]{5,60})\s*$", re.MULTILINE)
FIELD_LINE = re.compile(r"^\s*(\d+\.\d+\.)\s*(.+?)\s{2,}:\s*(.*)$")


def _turkish_fold(value: str) -> str:
    return value.replace("İ", "i").replace("I", "ı").casefold()


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
        urllib.request.HTTPCookieProcessor(CookieJar()))
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
    """The province an announcement belongs to, or None when the address does not name one."""
    haystack = _turkish_fold(text)
    for name, key in _PROVINCE_KEYS:
        if key in haystack:
            return name
    return None


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


def _fields_of(block: str) -> dict:
    """The numbered fields of one announcement, with wrapped values joined back together."""
    fields = {}
    current = None
    for line in block.split("\n"):
        match = FIELD_LINE.match(line)
        if match:
            current = match.group(1)
            fields[current] = {"label": match.group(2).strip(), "value": match.group(3).strip()}
            continue
        # A continuation: the value column wrapped, so the line is indented with no label.
        if current and line.startswith(" " * 20) and line.strip():
            fields[current]["value"] += " " + line.strip()
    return fields


def parse_announcements(text: str) -> list:
    """Splits the bulletin into announcements and pulls the fields worth searching on."""
    starts = [(match.start(), match.group(1)) for match in IKN_LINE.finditer(text)]
    sections = _sections_by_position(text)
    announcements = []
    for index, (position, ikn) in enumerate(starts):
        end = starts[index + 1][0] if index + 1 < len(starts) else len(text)
        block = text[position:end]
        fields = _fields_of(block)

        def value(key, default=""):
            entry = fields.get(key)
            return entry["value"] if entry else default

        authority = value("1.1.")
        address = value("1.2.")
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
            "tender_at": value("2.1."),
            "title": value("3.1."),
            "quantity": value("3.2."),
            "delivery_place": value("3.3."),
            # Kept whole. The fields say what a tender is; the body says whether it is one this
            # company can do — "3x240/25 mm² XLPE" lives here and nowhere else.
            "text": block.strip(),
        })
    return announcements
