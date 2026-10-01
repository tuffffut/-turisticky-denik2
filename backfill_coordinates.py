#!/usr/bin/env python3
"""
Jednorázový skript pro doplnění chybějících souřadnic (Start Lat, Start Lon, Cíl Lat, Cíl Lon)
do Google Tabulky pro záznamy od zadaného data (výchozí: 2026-06-18 16:15:12 a novější).

Zdroj souřadnic (v prioritním pořadí):
 1. Lokální GPX soubory ve složce gpx/ (nejrychlejší, bez volání API)
 2. Databáze Horského deníku (Firestore)
 3. Garmin Connect API (stáhne GPX nebo souřadnice z aktivity)
"""

import os
import sys
import glob
import json
import time
import logging
import unicodedata
import re
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("backfill_coords")

try:
    import gspread
    from gspread.utils import rowcol_to_a1
    from google.oauth2.service_account import Credentials
except ImportError:
    log.error("Chybí knihovny pro Google Sheets. Nainstalujte: pip install gspread google-auth")
    sys.exit(1)

try:
    from garminconnect import Garmin
except ImportError:
    Garmin = None
    log.warning("Knihovna garminconnect není nainstalována. Pokud bude potřeba stáhnout nová data z Garminu, nainstalujte ji: pip install garminconnect")

# ==========================================
# KONFIGURACE Z PROSTŘEDÍ / SECRETS
# ==========================================
GOOGLE_CREDENTIALS = os.environ.get("GOOGLE_CREDENTIALS")
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID")
GARMIN_EMAIL = os.environ.get("GARMIN_EMAIL")
GARMIN_PASSWORD = os.environ.get("GARMIN_PASSWORD")

FIRESTORE_PROJECT_ID = "gen-lang-client-0010545625"
FIRESTORE_DATABASE_ID = "ai-studio-979ba053-1af7-4aca-8d37-c42a57fcba97"
FIRESTORE_API_KEY = "AIzaSyDNS9uRFz78BykK1J1az3BPCGxemOOnN00"

FIRESTORE_HEADERS = {
    "x-goog-api-key": FIRESTORE_API_KEY,
    "google-cloud-resource-prefix": f"projects/{FIRESTORE_PROJECT_ID}/databases/{FIRESTORE_DATABASE_ID}"
}

# Výchozí datum, od kterého kontrolovat (včetně)
DEFAULT_CUTOFF_DATE = datetime(2026, 6, 18, 16, 15, 12)


def format_czech_coord(val):
    if val is None or val == "":
        return ""
    try:
        f = float(val)
        return f"{f:.5f}".replace(".", ",")
    except (ValueError, TypeError):
        return str(val)


def parse_sheet_date(s):
    if not s:
        return None
    cleaned = str(s).strip()
    if " " in cleaned and "." in cleaned.split(" ")[-1]:
        cleaned = cleaned.rsplit(".", 1)[0]
    formats = (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d.%m.%Y %H:%M:%S",
        "%d.%m.%Y %H:%M",
        "%d.%m.%Y",
        "%Y-%m-%dT%H:%M:%S"
    )
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt)
        except Exception:
            pass
    return None


def extract_coords_from_gpx_content(gpx_bytes_or_str):
    try:
        if isinstance(gpx_bytes_or_str, str):
            root = ET.fromstring(gpx_bytes_or_str.encode("utf-8"))
        else:
            root = ET.fromstring(gpx_bytes_or_str)
        points = [elem for elem in root.iter() if elem.tag.endswith("trkpt")]
        if not points:
            points = [elem for elem in root.iter() if elem.tag.endswith("rtept") or elem.tag.endswith("wpt")]
        if points:
            start_lat = float(points[0].attrib.get("lat", 0))
            start_lon = float(points[0].attrib.get("lon", 0))
            end_lat = float(points[-1].attrib.get("lat", 0))
            end_lon = float(points[-1].attrib.get("lon", 0))
            if start_lat != 0 and start_lon != 0:
                return start_lat, start_lon, end_lat, end_lon
    except Exception as e:
        log.debug(f"Chyba parsování GPX: {e}")
    return None, None, None, None


def get_coords_from_local_gpx(act_id, gpx_rel_path=None):
    candidates = []
    if gpx_rel_path and os.path.isfile(gpx_rel_path):
        candidates.append(gpx_rel_path)
    if os.path.isdir("gpx"):
        matches = glob.glob(f"gpx/*{act_id}*.gpx")
        candidates.extend(matches)

    for p in candidates:
        try:
            with open(p, "rb") as f:
                content = f.read()
            s_lat, s_lon, e_lat, e_lon = extract_coords_from_gpx_content(content)
            if s_lat is not None:
                return s_lat, s_lon, e_lat, e_lon
        except Exception:
            pass
    return None, None, None, None


def get_coords_from_firestore(act_id):
    doc_id = f"garmin-{act_id}"
    url = f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT_ID}/databases/{FIRESTORE_DATABASE_ID}/documents/hikes/{doc_id}"
    req = urllib.request.Request(url, headers=FIRESTORE_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            fields = data.get("fields", {})
            track_pts = fields.get("trackPoints", {}).get("arrayValue", {}).get("values", [])
            if track_pts:
                p_first = track_pts[0].get("mapValue", {}).get("fields", {})
                p_last = track_pts[-1].get("mapValue", {}).get("fields", {})
                s_lat = p_first.get("lat", {}).get("doubleValue")
                s_lon = p_first.get("lng", {}).get("doubleValue") or p_first.get("lon", {}).get("doubleValue")
                e_lat = p_last.get("lat", {}).get("doubleValue")
                e_lon = p_last.get("lng", {}).get("doubleValue") or p_last.get("lon", {}).get("doubleValue")
                if s_lat and s_lon:
                    return float(s_lat), float(s_lon), float(e_lat or s_lat), float(e_lon or s_lon)
    except Exception:
        pass
    return None, None, None, None


def get_coords_from_garmin(garmin_client, act_id):
    if not garmin_client:
        return None, None, None, None

    # Zkusíme nejprve stáhnout GPX (poskytuje nejpřesnější start i cíl)
    try:
        gpx_bytes = garmin_client.download_activity(act_id, dl_fmt=Garmin.ActivityDownloadFormat.GPX)
        if gpx_bytes:
            s_lat, s_lon, e_lat, e_lon = extract_coords_from_gpx_content(gpx_bytes)
            if s_lat is not None:
                # Uložíme i lokálně do gpx/ pokud složka existuje
                os.makedirs("gpx", exist_ok=True)
                local_path = f"gpx/activity_{act_id}.gpx"
                if not os.path.exists(local_path):
                    with open(local_path, "wb") as f:
                        f.write(gpx_bytes)
                return s_lat, s_lon, e_lat, e_lon
    except Exception as e:
        log.debug(f"Nelze stáhnout GPX z Garminu pro {act_id}: {e}")

    # Fallback na Garmin activity summary detail
    try:
        summary = garmin_client.get_activity(act_id)
        if summary:
            s_lat = summary.get("startLatitude") or summary.get("summaryDTO", {}).get("startLatitude")
            s_lon = summary.get("startLongitude") or summary.get("summaryDTO", {}).get("startLongitude")
            e_lat = summary.get("endLatitude") or summary.get("summaryDTO", {}).get("endLatitude") or s_lat
            e_lon = summary.get("endLongitude") or summary.get("summaryDTO", {}).get("endLongitude") or s_lon
            if s_lat and s_lon:
                return float(s_lat), float(s_lon), float(e_lat), float(e_lon)
    except Exception as e:
        log.debug(f"Nelze načíst aktivitu z Garmin API pro {act_id}: {e}")

    return None, None, None, None


def main():
    log.info("🚀 Zahajuji kontrolu a doplnění souřadnic v Google Tabulce...")
    log.info(f"📅 Kontrolované období: od {DEFAULT_CUTOFF_DATE.strftime('%Y-%m-%d %H:%M:%S')} a novější")

    # 1. PŘIPOJENÍ KE GOOGLE SHEETS
    if not GOOGLE_CREDENTIALS:
        log.error("❌ Chybí GOOGLE_CREDENTIALS (vložte JSON nebo cestu k JSON souboru servisního účtu).")
        return

    raw_json = GOOGLE_CREDENTIALS
    if os.path.isfile(raw_json):
        with open(raw_json, "r") as f:
            raw_json = f.read()

    try:
        scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
        creds_dict = json.loads(raw_json)
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
        client = gspread.authorize(creds)

        if SPREADSHEET_ID:
            sheet = client.open_by_key(SPREADSHEET_ID)
        else:
            sheets = client.openall()
            sheet = sheets[0]
        ws = sheet.get_worksheet(0)
        log.info(f"📊 Otevřena tabulka: '{sheet.title}' -> list '{ws.title}'")
    except Exception as e:
        log.error(f"❌ Nelze otevřít Google Tabulku: {e}")
        return

    # 2. NAČTENÍ HODNOT A MAPOVÁNÍ SLOUPCŮ
    all_values = ws.get_all_values()
    if not all_values or len(all_values) < 2:
        log.warning("Tabulka je prázdná.")
        return

    header = all_values[0]
    col_map = {}
    for i, name in enumerate(header):
        clean = name.strip().lower().replace(" ", "").replace("_", "")
        if "datum" in clean or "date" in clean:
            col_map["date"] = i
        elif "nazev" in clean or "název" in clean or "title" in clean:
            col_map["title"] = i
        elif "garminactivityid" in clean or "activityid" in clean:
            col_map["act_id"] = i
        elif "gpx" in clean:
            col_map["gpx"] = i
        elif "startlat" in clean:
            col_map["start_lat"] = i
        elif "startlon" in clean:
            col_map["start_lon"] = i
        elif "cíllat" in clean or "cillat" in clean or "endlat" in clean:
            col_map["end_lat"] = i
        elif "cíllon" in clean or "cillon" in clean or "endlon" in clean:
            col_map["end_lon"] = i

    # Výchozí pozice pokud nebyly v hlavičce nalezeny podle textu
    date_col = col_map.get("date", 0)
    title_col = col_map.get("title", 1)
    act_id_col = col_map.get("act_id", 20)  # 21. sloupec
    gpx_col = col_map.get("gpx", 21)        # 22. sloupec
    start_lat_col = col_map.get("start_lat", 23)  # 24. sloupec
    start_lon_col = col_map.get("start_lon", 24)  # 25. sloupec
    end_lat_col = col_map.get("end_lat", 25)      # 26. sloupec
    end_lon_col = col_map.get("end_lon", 26)      # 27. sloupec

    log.info(f"🔎 Mapování sloupců: Datum [sl. {date_col+1}], ID [sl. {act_id_col+1}], Start Lat [sl. {start_lat_col+1}], Cíl Lon [sl. {end_lon_col+1}]")

    # 3. IDENTIFIKACE ŘÁDKŮ K DOPLNĚNÍ
    rows_to_update = []
    for r_idx, row in enumerate(all_values[1:], start=2):
        if not row:
            continue
        date_raw = row[date_col] if len(row) > date_col else ""
        row_dt = parse_sheet_date(date_raw)
        if not row_dt or row_dt < DEFAULT_CUTOFF_DATE:
            continue

        act_id = row[act_id_col].strip() if len(row) > act_id_col else ""
        if not act_id or not act_id.isdigit():
            # Zkusíme najít ID v celém řádku
            for cell in row:
                c = cell.strip()
                if c.isdigit() and 9 <= len(c) <= 12:
                    act_id = c
                    break

        if not act_id:
            continue

        s_lat_val = row[start_lat_col].strip() if len(row) > start_lat_col else ""
        s_lon_val = row[start_lon_col].strip() if len(row) > start_lon_col else ""
        e_lat_val = row[end_lat_col].strip() if len(row) > end_lat_col else ""
        e_lon_val = row[end_lon_col].strip() if len(row) > end_lon_col else ""

        # Kontrola, zda některá ze souřadnic chybí
        if not s_lat_val or not s_lon_val or not e_lat_val or not e_lon_val:
            title = row[title_col] if len(row) > title_col else "Aktivita"
            gpx_path = row[gpx_col] if len(row) > gpx_col else None
            rows_to_update.append({
                "row_num": r_idx,
                "date": date_raw,
                "title": title,
                "act_id": act_id,
                "gpx_path": gpx_path
            })

    log.info(f"📋 Nalezeno celkem {len(rows_to_update)} záznamů s chybějícími souřadnicemi od 18. 6. 2026.")

    if not rows_to_update:
        log.info("✨ Všechny záznamy v daném období již mají souřadnice kompletně vyplněné!")
        return

    # 4. VOLITELNÉ PŘIHLÁŠENÍ DO GARMINU (PRO PŘÍPAD, ŽE DATA NEJSOU LOKÁLNĚ ANI V DENÍKU)
    garmin_client = None
    if Garmin and GARMIN_EMAIL and GARMIN_PASSWORD:
        try:
            log.info("🔐 Připojuji se ke Garmin Connect pro stažení chybějících aktivit...")
            garmin_client = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
            garmin_client.login()
            log.info("✅ Přihlášeno ke Garmin Connect.")
        except Exception as e:
            log.warning(f"Nelze se přihlásit ke Garmin Connect: {e}")

    # 5. DOPLŇOVÁNÍ SOUŘADNIC PO ŘÁDCÍCH
    updated_count = 0
    for item in rows_to_update:
        r_num = item["row_num"]
        act_id = item["act_id"]
        title = item["title"]
        d_str = item["date"]

        s_lat, s_lon, e_lat, e_lon = None, None, None, None
        source = ""

        # 1. Zkusit lokální GPX
        s_lat, s_lon, e_lat, e_lon = get_coords_from_local_gpx(act_id, item["gpx_path"])
        if s_lat is not None:
            source = "lokální GPX soubor"

        # 2. Zkusit Horský deník (Firestore)
        if s_lat is None:
            s_lat, s_lon, e_lat, e_lon = get_coords_from_firestore(act_id)
            if s_lat is not None:
                source = "Horský deník (databáze)"

        # 3. Zkusit Garmin Connect
        if s_lat is None and garmin_client:
            s_lat, s_lon, e_lat, e_lon = get_coords_from_garmin(garmin_client, act_id)
            if s_lat is not None:
                source = "Garmin Connect"

        if s_lat is not None and s_lon is not None:
            s_lat_str = format_czech_coord(s_lat)
            s_lon_str = format_czech_coord(s_lon)
            e_lat_str = format_czech_coord(e_lat if e_lat is not None else s_lat)
            e_lon_str = format_czech_coord(e_lon if e_lon is not None else s_lon)

            try:
                # Rozsah buněk pro 4 souřadnice (sloupce 24 až 27)
                cell_start = rowcol_to_a1(r_num, start_lat_col + 1)
                cell_end = rowcol_to_a1(r_num, end_lon_col + 1)
                ws.update(
                    f"{cell_start}:{cell_end}",
                    [[s_lat_str, s_lon_str, e_lat_str, e_lon_str]],
                    value_input_option="USER_ENTERED"
                )
                updated_count += 1
                log.info(f"✅ Řádek {r_num} ({d_str} | {title}): doplněno ze zdroje '{source}' -> Start: [{s_lat_str}, {s_lon_str}], Cíl: [{e_lat_str}, {e_lon_str}]")
                # Krátká pauza proti překročení Google Sheets API limitů
                time.sleep(0.4)
            except Exception as e:
                log.error(f"❌ Chyba při zápisu do Sheetu pro řádek {r_num}: {e}")
        else:
            log.warning(f"⚠️ Pro aktivitu {title} (ID {act_id}) na řádku {r_num} se nepodařilo souřadnice nalézt.")

    log.info("==================================================")
    log.info(f"🎉 HOTOVO! Úspěšně doplněno {updated_count} z {len(rows_to_update)} záznamů.")


if __name__ == "__main__":
    main()
