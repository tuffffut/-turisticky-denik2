#!/usr/bin/env python3
"""
Synchronizace Garmin Connect -> Google Sheets (27 sloupců), Horský deník & Telegram.
Plně autorizovaný zápis do Firestore s optimalizovanou velikostí trasy (bezpečně pod 1 MB limitem).
Doplněno automatické párování ID kola z listu 'Kola'.
"""

import os
import sys
import json
import math
import logging
import traceback
import unicodedata
import re
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger("garmin_sync")

try:
    from garminconnect import Garmin
except ImportError:
    log.error("Chybí garminconnect: pip install garminconnect")
    sys.exit(0)

try:
    import gspread
    from google.oauth2.service_account import Credentials
except ImportError:
    log.error("Chybí gspread nebo google-auth: pip install gspread google-auth")
    sys.exit(0)

# ==========================================
# KONFIGURACE Z VAŠICH GITHUB SECRETS
# ==========================================
GARMIN_EMAIL = os.environ.get("GARMIN_EMAIL")
GARMIN_PASSWORD = os.environ.get("GARMIN_PASSWORD")
GOOGLE_CREDENTIALS = os.environ.get("GOOGLE_CREDENTIALS")
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID")
GEAR_SHEET_NAME = "Kola"
HIKING_APP_URL = os.environ.get("HIKING_APP_URL", "https://ais-pre-oup32vxwo3nz2n4vroqbmh-579173566500.europe-west2.run.app")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")
ADMIN_PIN = "0303"

FIRESTORE_PROJECT_ID = "gen-lang-client-0010545625"
FIRESTORE_DATABASE_ID = "ai-studio-979ba053-1af7-4aca-8d37-c42a57fcba97"
FIRESTORE_API_KEY = "AIzaSyDNS9uRFz78BykK1J1az3BPCGxemOOnN00"

FIRESTORE_HEADERS = {
    "Content-Type": "application/json",
    "x-goog-api-key": FIRESTORE_API_KEY,
    "google-cloud-resource-prefix": f"projects/{FIRESTORE_PROJECT_ID}/databases/{FIRESTORE_DATABASE_ID}"
}

HIKING_TYPES = {"hiking", "walking", "mountaineering", "casual_walking", "climbing", "snow_shoe"}
HIKING_KEYWORDS = ["turistika", "túra", "tura", "výšlap", "vyslap", "pochod", "hike", "hora", "vrchol", "kopec", "hory"]

MOUNTAIN_REGIONS = [
    ("Krkonoše", 50.55, 50.88, 15.35, 15.95),
    ("Jizerské hory", 50.66, 50.98, 14.95, 15.45),
    ("České Švýcarsko a Lužické hory", 50.76, 50.96, 14.18, 14.88),
    ("Krušné hory", 50.25, 50.85, 12.35, 14.15),
    ("Šumava", 48.65, 49.36, 13.00, 14.20),
    ("Český les a Slavkovský les", 49.30, 50.18, 12.35, 12.95),
    ("Jeseníky", 49.80, 50.36, 16.95, 17.75),
    ("Rychlebské hory", 50.18, 50.48, 16.82, 17.18),
    ("Králický Sněžník", 50.08, 50.28, 16.74, 17.00),
    ("Orlické hory", 50.12, 50.46, 16.24, 16.68),
    ("Beskydy", 49.38, 49.66, 18.05, 18.85),
    ("Javorníky a Vsetínské vrchy", 49.24, 49.46, 17.95, 18.60),
    ("Bílé Karpaty", 48.84, 49.22, 17.48, 18.18),
    ("České středohoří", 50.48, 50.75, 13.88, 14.45),
    ("Brdy a Křivoklátsko", 49.60, 50.05, 13.65, 14.18),
    ("Český ráj", 50.45, 50.66, 15.02, 15.38),
    ("Broumovsko a Adršpach", 50.48, 50.70, 16.05, 16.45),
    ("Moravský kras", 49.26, 49.45, 16.65, 16.88),
    ("Brno a okolí", 49.12, 49.38, 16.32, 17.05),
    ("Pálava a Jižní Morava", 48.60, 49.12, 15.40, 17.30),
    ("Vysočina a Žďárské vrchy", 49.10, 49.85, 15.15, 16.35),
    ("Českomoravské pomezí (Litomyšlsko)", 49.70, 50.08, 16.15, 16.70),
    ("Pardubicko a Polabí", 49.95, 50.25, 15.35, 16.15),
    ("Haná a Střední Morava", 49.35, 49.75, 16.95, 17.55),
    ("Chřiby a Hostýnské vrchy", 49.05, 49.45, 17.15, 17.85),
    ("Praha a okolí", 49.95, 50.20, 14.20, 14.70),
    ("Střední Čechy", 49.40, 50.50, 13.80, 15.40),
    ("Vysoké Tatry", 49.10, 49.26, 19.90, 20.30),
    ("Západné Tatry (Roháče)", 49.14, 49.29, 19.58, 19.92),
    ("Belianske Tatry", 49.22, 49.30, 20.20, 20.35),
    ("Nízke Tatry", 48.84, 49.06, 19.28, 20.28),
    ("Malá Fatra", 49.08, 49.32, 18.88, 19.26),
    ("Veľká Fatra", 48.84, 49.16, 18.94, 19.32),
    ("Chočské vrchy", 49.10, 49.22, 19.24, 19.52),
    ("Slovenský raj", 48.84, 49.02, 20.24, 20.56),
    ("Vídeňské Alpy (Rax / Schneeberg)", 47.50, 48.15, 15.50, 16.35),
    ("Alpy (Rakousko)", 46.30, 48.30, 9.50, 16.50),
]


def detect_mountain_range(lat, lon, title=""):
    if lat and lon:
        try:
            flat = float(lat)
            flon = float(lon)
            for name, min_lat, max_lat, min_lon, max_lon in MOUNTAIN_REGIONS:
                if min_lat <= flat <= max_lat and min_lon <= flon <= max_lon:
                    return name
            if 48.55 <= flat <= 51.06 and 12.09 <= flon <= 18.86:
                if 16.20 <= flon <= 17.50 and 48.90 <= flat <= 49.60:
                    return "Brno a okolí"
        except (ValueError, TypeError):
            pass

    t = (title or "").lower()
    if re.search(r"jesen[ií]k|lou[cč]n[aá]|prad[eě]d|kepr|sedlo|dlouh[eé]\s*str|kouty|[sš]er[aá]k", t):
        return "Jeseníky"
    if re.search(r"brno|h[aá]dy|holedn[aá]|bab[ií]\s*lom|sob[eě][sš]ice|moravany|bystrc|p[rř]ehrada|lule[cč]|slavkov|vy[sš]kov", t):
        return "Brno a okolí"
    if re.search(r"krkono[sš]|sn[eě][zž]k|pec\s*pod|ob[rř][ií]\s*d[uů]l|[sš]pindl|lu[cč]n[ií]\s*boud|medv[eě]d", t):
        return "Krkonoše"
    if re.search(r"jizer|bed[rř]ichov|tanvald|ko[rř]enov|josef", t):
        return "Jizerské hory"
    if re.search(r"beskyd|lys[aá]\s*hora|radho[sš]|pustevn|ostravic|fr[yý]dlant|smrk", t):
        return "Beskydy"
    if re.search(r"p[aá]lava|mikulov|d[eě]v[ií]n|klentnic|pavlov|podyj|znojmo", t):
        return "Pálava a Jižní Morava"
    if re.search(r"kras|adamov|blansko|macocha|sloup|jedovnic|rudic|k[rř]tiny", t):
        return "Moravský kras"
    if re.search(r"[sš]umav|boub[ií]n|poledn[ií]k|kvild|modrav|[zž]elezn[aá]\s*ruda", t):
        return "Šumava"
    if re.search(r"kru[sš]n|kl[ií]novec|bo[zž][ií]\s*dar|j[aá]chymov", t):
        return "Krušné hory"
    if re.search(r"kr[aá]lick|sn[eě][zž]n[ií]k|doln[ií]\s*morav", t):
        return "Králický Sněžník"
    if re.search(r"orlick|de[sš]tn", t):
        return "Orlické hory"
    if re.search(r"rychleb", t):
        return "Rychlebské hory"
    if re.search(r"vyso[cč]in|[zž][dď][aá]r|v[ií]r|jihlav|t[rř]eb[ií][cč]", t):
        return "Vysočina a Žďárské vrchy"
    if re.search(r"tatr|rysy|kriv[aá][nň]|gerlach|lomnic", t):
        return "Vysoké Tatry"
    if re.search(r"fatra", t):
        return "Malá Fatra"
    if re.search(r"alpy|rax|schneeberg|hohe|tauern|dachstein", t):
        return "Alpy (Rakousko)"
    if re.search(r"broumov|adr[sš]pach|teplic", t):
        return "Broumovsko a Adršpach"
    if re.search(r"st[rř]edoho[rř]|mile[sš]ovk", t):
        return "České středohoří"
    if re.search(r"[cč]esk[yý]\s*r[aá]j|trosk", t):
        return "Český ráj"

    return "Česká republika (výlet)"


def format_czech_num(val, decimals=2):
    if val is None or val == "":
        return ""
    try:
        f = float(val)
        return f"{f:.{decimals}f}".replace(".", ",")
    except (ValueError, TypeError):
        return str(val)


def format_duration(seconds):
    if seconds is None or seconds == "":
        return ""
    try:
        s = int(round(float(seconds)))
        h = s // 3600
        m = (s % 3600) // 60
        sec = s % 60
        return f"{h}:{m:02d}:{sec:02d}"
    except (ValueError, TypeError):
        return str(seconds)


def sanitize_filename(name):
    nfkd = unicodedata.normalize("NFKD", name or "")
    no_diacritics = "".join([c for c in nfkd if not unicodedata.combining(c)])
    clean = re.sub(r"[^a-zA-Z0-9]", "", no_diacritics)
    return clean[:30] if clean else "activity"


def parse_datetime(raw_dt):
    if not raw_dt:
        now = datetime.now()
        return now, now.strftime("%Y-%m-%d %H:%M:%S"), now.strftime("%Y-%m-%d_%H-%M-%S")
    try:
        cleaned = str(raw_dt).replace("T", " ").split(".")[0]
        dt = datetime.strptime(cleaned, "%Y-%m-%d %H:%M:%S")
        date_col = f"{dt.year}-{dt.month:02d}-{dt.day:02d} {dt.hour}:{dt.minute:02d}:{dt.second:02d}"
        file_prefix = f"{dt.year}-{dt.month:02d}-{dt.day:02d}_{dt.hour:02d}-{dt.minute:02d}-{dt.second:02d}"
        return dt, date_col, file_prefix
    except Exception:
        s = str(raw_dt).replace("T", " ")[:19]
        return None, s, s.replace(" ", "_").replace(":", "-")


def clean_app_url(base_url, route_id):
    if not base_url:
        return ""
    base = base_url.strip().rstrip("/")
    base = base.replace("/?key=0303", "").replace("?key=0303", "")
    sep = "&" if "?" in base else "?"
    return f"{base}/?key={ADMIN_PIN}&routeId={route_id}" if "key=" not in base else f"{base}&routeId={route_id}"


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_gpx(gpx_bytes, act_summary=None):
    max_e, min_e, pts = None, None, []
    p_lat, p_lon = None, None

    if gpx_bytes:
        try:
            root = ET.fromstring(gpx_bytes)
            points = [elem for elem in root.iter() if elem.tag.endswith("trkpt")]
            if not points:
                points = [elem for elem in root.iter() if elem.tag.endswith("rtept") or elem.tag.endswith("wpt")]

            raw_max = -9999.0
            raw_min = 9999.0
            total_d = 0.0
            prev_lat, prev_lon = None, None

            for pt in points:
                try:
                    lat = float(pt.attrib.get("lat", 0))
                    lon = float(pt.attrib.get("lon", 0))
                except Exception:
                    continue

                if lat == 0 and lon == 0:
                    continue

                ele = None
                for child in pt:
                    if child.tag.endswith("ele") and child.text:
                        try:
                            ele = float(child.text.strip())
                        except Exception:
                            pass
                        break

                if prev_lat is not None:
                    total_d += haversine_km(prev_lat, prev_lon, lat, lon)
                prev_lat, prev_lon = lat, lon

                if ele is not None:
                    if ele > raw_max:
                        raw_max, p_lat, p_lon = ele, lat, lon
                    if ele < raw_min:
                        raw_min = ele

                p_obj = {
                    "lat": round(lat, 6),
                    "lng": round(lon, 6),
                    "lon": round(lon, 6),
                    "distFromStartKm": round(total_d, 3)
                }
                if ele is not None:
                    p_obj["ele"] = round(ele, 1)
                    p_obj["elevationM"] = round(ele, 1)
                pts.append(p_obj)

            if raw_max > -9000:
                max_e = round(raw_max, 1)
            if raw_min < 9000:
                min_e = round(raw_min, 1)

        except Exception as e:
            log.warning(f"GPX parse warning: {e}")

    # Fallback na Garmin data
    if act_summary:
        if max_e is None and act_summary.get("maxElevation"):
            try: max_e = round(float(act_summary["maxElevation"]), 1)
            except: pass
        if min_e is None and act_summary.get("minElevation"):
            try: min_e = round(float(act_summary["minElevation"]), 1)
            except: pass
        if max_e is None and act_summary.get("elevationGain"):
            try: max_e = round(float(act_summary["elevationGain"]), 1)
            except: pass

    # Downsampling na max 350 bodů pro dokonalé zobrazení a bleskové načtení (~30 KB)
    sampled_pts = pts
    if len(pts) > 350:
        step = max(1, len(pts) // 350)
        sampled_pts = pts[::step]
        if pts[-1] not in sampled_pts:
            sampled_pts.append(pts[-1])

    return sampled_pts, max_e, min_e, p_lat, p_lon


def get_google_sheet():
    if not GOOGLE_CREDENTIALS:
        log.warning("⚠️ GOOGLE_CREDENTIALS není nastaveno v env.")
        return None

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
            log.info("📊 Google Tabulka otevřena podle SPREADSHEET_ID.")
            return sheet.get_worksheet(0)
        else:
            all_s = client.openall()
            if all_s:
                log.info(f"📊 Google Tabulka otevřena: '{all_s[0].title}'")
                return all_s[0].get_worksheet(0)
    except Exception as e:
        log.error(f"❌ Chyba při otevírání Google Tabulky: {e}")
        return None


def load_gear_list(spreadsheet):
    """
    Načte pravidla pro přiřazení kol z listu 'Kola'.
    Očekává sloupce: ID kola, Typ aktivity, Platnost od, Platnost do.
    """
    if not spreadsheet:
        return []
    try:
        ws_gear = None
        if hasattr(spreadsheet, "spreadsheet"):
            try:
                ws_gear = spreadsheet.spreadsheet.worksheet(GEAR_SHEET_NAME)
            except Exception:
                pass
        if not ws_gear and hasattr(spreadsheet, "worksheet"):
            try:
                ws_gear = spreadsheet.worksheet(GEAR_SHEET_NAME)
            except Exception:
                pass

        if not ws_gear:
            return []

        rows = ws_gear.get_all_values()
        if len(rows) <= 1:
            return []

        header = [c.strip().lower() for c in rows[0]]
        idx_id, idx_type, idx_from, idx_to = 0, 1, 2, 3
        for i, col in enumerate(header):
            c = col.replace(" ", "").replace("_", "")
            if ("id" in c or "kolo" in c) and idx_id == 0:
                idx_id = i
            elif ("typ" in c or "type" in c) and idx_type == 1:
                idx_type = i
            elif ("od" in c or "from" in c) and idx_from == 2:
                idx_from = i
            elif ("do" in c or "to" in c) and idx_to == 3:
                idx_to = i

        def parse_gear_date(val):
            if not val or not str(val).strip():
                return None
            val_s = str(val).strip()
            for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y", "%Y/%m/%d"):
                try:
                    return datetime.strptime(val_s, fmt).date()
                except Exception:
                    pass
            try:
                return datetime.fromisoformat(val_s.replace(" ", "T")).date()
            except Exception:
                pass
            return None

        gear_list = []
        for r in rows[1:]:
            if not r:
                continue
            gid = r[idx_id].strip() if len(r) > idx_id else ""
            if not gid:
                continue
            gtype = r[idx_type].strip() if len(r) > idx_type else ""
            gfrom = parse_gear_date(r[idx_from]) if len(r) > idx_from else None
            gto = parse_gear_date(r[idx_to]) if len(r) > idx_to else None
            gear_list.append({"id": gid, "type": gtype, "from": gfrom, "to": gto})

        log.info(f"🚲 Načteno {len(gear_list)} pravidel pro kola z listu '{GEAR_SHEET_NAME}'.")
        return gear_list
    except Exception as e:
        log.warning(f"Nelze načíst list '{GEAR_SHEET_NAME}': {e}")
        return []


def find_gear_id(a, gear_list):
    if not gear_list:
        return ""
    act_type = a.get("activityType", {}).get("typeKey", "") if isinstance(a.get("activityType"), dict) else a.get("activityType", "")
    start_raw = a.get("startTimeLocal") or a.get("beginTimestamp") or ""
    try:
        activity_date = datetime.fromisoformat(start_raw.replace(" ", "T")).date()
    except Exception:
        return ""
    for gear in gear_list:
        if gear["type"] == act_type:
            date_from_ok = activity_date >= gear["from"] if gear["from"] else True
            date_to_ok   = activity_date <= gear["to"]   if gear["to"]   else True
            if date_from_ok and date_to_ok:
                return gear["id"]
    return ""


def to_fs_val(v):
    if v is None: return {"nullValue": None}
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": float(v)}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [to_fs_val(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: to_fs_val(val) for k, val in v.items()}}}
    return {"stringValue": str(v)}


def hike_exists_in_diary(doc_id):
    """Zkontroluje, zda daná túra již v Horském deníku (Firestore) existuje."""
    url = f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT_ID}/databases/{FIRESTORE_DATABASE_ID}/documents/hikes/{doc_id}"
    req = urllib.request.Request(url, headers=FIRESTORE_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        return False
    except Exception:
        return False


def save_to_diary(act, track_pts, max_ele, min_ele, p_lat, p_lon):
    """Bezpečně a autorizovaně uloží túru do Horského deníku bez přetékání 1MB limitu."""
    try:
        act_id = str(act["activityId"])
        doc_id = f"garmin-{act_id}"
        name = act.get("activityName") or f"Túra {str(act.get('startTimeLocal', ''))[:10]}"
        dist_km = round(act.get("distance", 0) / 1000.0, 2)
        gain_m = round(act.get("elevationGain", 0))
        dur_min = round(act.get("duration", 0) / 60.0)
        date_str = str(act.get("startTimeLocal") or datetime.now().isoformat())[:10]

        # Přesné určení pohoří
        ref_lat = p_lat or (track_pts[0]["lat"] if track_pts else None) or act.get("startLatitude")
        ref_lon = p_lon or (track_pts[0]["lon"] if track_pts else None) or act.get("startLongitude")
        mountain_range = detect_mountain_range(ref_lat, ref_lon, name)

        hike = {
            "id": doc_id,
            "title": name,
            "name": name,
            "mountainRange": mountain_range,
            "date": date_str,
            "distanceKm": dist_km,
            "elevationGainM": gain_m,
            "duration": f"{int(dur_min // 60)}h {int(dur_min % 60):02d}m" if dur_min >= 60 else f"{int(dur_min)}m",
            "description": "Automaticky synchronizováno z Garmin Connect.",
            "photos": [],
            "createdAt": datetime.utcnow().isoformat() + "Z"
        }
        if max_ele and max_ele > 0:
            hike["highestPointM"] = int(round(max_ele))
        if min_ele and min_ele > 0:
            hike["lowestPointM"] = int(round(min_ele))
        if track_pts:
            hike["trackPoints"] = track_pts
            hike["peakCoords"] = {"lat": p_lat or track_pts[0]["lat"], "lng": p_lon or track_pts[0]["lng"], "name": name}

        # Ukládáme optimalizovaný payload (~30 KB), čisté GPX si deník generuje z bodů
        url = f"https://firestore.googleapis.com/v1/projects/{FIRESTORE_PROJECT_ID}/databases/{FIRESTORE_DATABASE_ID}/documents/hikes/{doc_id}"
        body = json.dumps({"fields": {k: to_fs_val(v) for k, v in hike.items()}}).encode("utf-8")
        
        req = urllib.request.Request(url, data=body, headers=FIRESTORE_HEADERS, method="PATCH")
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                log.info(f"🏔️ Zapsáno do Horského deníku: {name} [{mountain_range}] (Nejvyšší bod: {hike.get('highestPointM', '—')} m)")
                return doc_id
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        log.error(f"❌ Chyba Firestore REST API ({e.code}): {err_msg}")
    except Exception as e:
        log.error(f"❌ Chyba spojení s Horským deníkem: {e}")
    return None


def send_tg(act, doc_id, max_ele):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID: return
    try:
        name = act.get("activityName") or "Nová túra"
        dist = round(act.get("distance", 0) / 1000.0, 2)
        gain = round(act.get("elevationGain", 0))
        mins = round(act.get("duration", 0) / 60.0)
        time_str = f"{mins // 60}h {mins % 60}m" if mins >= 60 else f"{mins}m"
        link = clean_app_url(HIKING_APP_URL, doc_id)
        ele_str = f"\n🏔️ *Nejvyšší bod:* {int(round(max_ele))} m n. m." if max_ele else ""

        text = f"🥾 *Nová výprava v Horském deníku!*\n\n📍 *{name}*\n📏 *Vzdálenost:* {dist} km\n⛰️ *Převýšení:* +{gain} m{ele_str}\n⏱️ *Čas:* {time_str}\n\n👉 [Otevřít v Horském deníku]({link})"
        payload = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "Markdown"}).encode("utf-8")
        req = urllib.request.Request(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage", data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10):
            log.info("📱 Telegram notifikace odeslána.")
    except Exception as e:
        log.warning(f"Telegram warning: {e}")


def main():
    log.info("🚀 Zahajuji synchronizaci Garmin Connect...")
    if not GARMIN_EMAIL or not GARMIN_PASSWORD:
        log.error("Chybí GARMIN_EMAIL nebo GARMIN_PASSWORD.")
        return

    # 1. NAČTENÍ EXISTUJÍCÍCH AKTIVIT ZE SHEETU (21. SLOUPEC: Garmin Activity ID)
    ws = get_google_sheet()
    existing_ids = set()
    gear_list = []
    if ws:
        try:
            gear_list = load_gear_list(ws.spreadsheet)
        except Exception as e:
            log.warning(f"Nelze načíst list '{GEAR_SHEET_NAME}': {e}")

        try:
            all_values = ws.get_all_values()
            if all_values and len(all_values) > 1:
                header = all_values[0]
                id_col_idx = 20
                for i, col_name in enumerate(header):
                    c_clean = col_name.lower().replace(" ", "").replace("_", "")
                    if "garminactivityid" in c_clean or "activityid" in c_clean:
                        id_col_idx = i
                        break

                for row in all_values[1:]:
                    if len(row) > id_col_idx and row[id_col_idx].strip():
                        existing_ids.add(row[id_col_idx].strip())
                    for cell in row:
                        c = cell.strip()
                        if c.isdigit() and 9 <= len(c) <= 12:
                            existing_ids.add(c)
                        if ".gpx" in c and "_" in c:
                            parts = c.replace(".gpx", "").split("_")
                            if parts and parts[-1].isdigit():
                                existing_ids.add(parts[-1])

                log.info(f"📋 V Google Sheetu nalezeno {len(existing_ids)} již existujících aktivit.")
        except Exception as e:
            log.warning(f"Chyba při čtení stávajících ID ze Sheetu: {e}")

    # 2. PŘIHLÁŠENÍ DO GARMIN CONNECT
    try:
        garmin = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
        garmin.login()
        log.info("✅ Přihlášeno ke Garmin Connect.")
    except Exception as e:
        log.error(f"❌ Přihlášení ke Garmin selhalo: {e}")
        return

    try:
        activities = garmin.get_activities(0, 30)
    except Exception as e:
        log.error(f"Nelze stáhnout aktivity z Garminu: {e}")
        return

    os.makedirs("gpx", exist_ok=True)

    # 3. ZPRACOVÁNÍ AKTIVIT V CHRONOLOGICKÉM POŘADÍ
    for act in reversed(activities):
        act_id = str(act.get("activityId", ""))
        if not act_id:
            continue

        name = act.get("activityName") or "Aktivita"
        act_type = act.get("activityType", {})
        type_key = act_type.get("typeKey", "").lower() if isinstance(act_type, dict) else str(act_type).lower()
        is_hiking = type_key in HIKING_TYPES or any(k in name.lower() for k in HIKING_KEYWORDS)
        
        already_in_sheet = act_id in existing_ids

        # Pokud aktivita už je v Sheetu A zároveň není turistika (nebo už je i v deníku), přeskočíme
        diary_doc_id = f"garmin-{act_id}"
        if already_in_sheet and (not is_hiking or hike_exists_in_diary(diary_doc_id)):
            continue

        # Datum a časy
        start_time_raw = act.get("startTimeLocal") or ""
        _, date_str, file_prefix = parse_datetime(start_time_raw)
        moving_dur_str = format_duration(act.get("movingDuration") or act.get("duration"))
        elapsed_dur_str = format_duration(act.get("elapsedDuration") or act.get("duration"))

        # Vzdálenost a rychlosti
        dist_km = (act.get("distance", 0) or 0) / 1000.0
        dist_str = format_czech_num(dist_km, 3)
        gain_m = int(round(act.get("elevationGain") or 0))
        avg_speed_kmh = (act.get("averageSpeed", 0) or 0) * 3.6
        max_speed_kmh = (act.get("maxSpeed", 0) or 0) * 3.6
        avg_speed_str = format_czech_num(avg_speed_kmh, 2)
        max_speed_str = format_czech_num(max_speed_kmh, 2)

        # Tepovky a výkon
        avg_hr = int(round(act["averageHR"])) if act.get("averageHR") else ""
        max_hr = int(round(act["maxHR"])) if act.get("maxHR") else ""
        cadence = int(round(act.get("averageRunningCadenceInStepsPerMinute") or act.get("averageBikingCadenceInRevPerMinute") or act.get("averageCadence", 0))) or ""
        avg_power = int(round(act.get("avgPower") or act.get("averageWatts", 0))) or ""
        calories = int(round(act.get("calories") or act.get("bmrCalories") or act.get("work", 0))) or ""

        # Teploty
        avg_temp = int(round(act["averageTemperature"])) if act.get("averageTemperature") is not None else ""
        min_temp = int(round(act["minTemperature"])) if act.get("minTemperature") is not None else ""
        max_temp = int(round(act["maxTemperature"])) if act.get("maxTemperature") is not None else ""

        # Tréninkový efekt & Suffer score
        aerobic_te = format_czech_num(act.get("aerobicTrainingEffect"), 1)
        anaerobic_te = format_czech_num(act.get("anaerobicTrainingEffect"), 1)
        suffer_score = act.get("sufferScore") or ""

        # GPX název a stažení na disk (celý nezkrácený GPX soubor zůstává v repozitáři)
        safe_name = sanitize_filename(name)
        gpx_rel_path = f"gpx/{file_prefix}_{safe_name}_{act_id}.gpx"

        # Kolo / Gear ID (hledání v listu 'Kola', případně fallback na Garmin gear)
        gear_id = find_gear_id(act, gear_list) or str(act.get("gearUuid") or act.get("gearPk") or "")

        # Souřadnice start / cíl
        start_lat = format_czech_num(act.get("startLatitude"), 5)
        start_lon = format_czech_num(act.get("startLongitude"), 5)
        end_lat = format_czech_num(act.get("endLatitude"), 5)
        end_lon = format_czech_num(act.get("endLongitude"), 5)

        # Stažení GPX
        gpx_bytes = None
        try:
            gpx_bytes = garmin.download_activity(act_id, dl_fmt=Garmin.ActivityDownloadFormat.GPX)
            if gpx_bytes:
                with open(gpx_rel_path, "wb") as f:
                    f.write(gpx_bytes)
        except Exception as e:
            log.warning(f"Nelze stáhnout GPX pro {act_id}: {e}")

        # ZÁPIS DO GOOGLE SHEETU (pouze pokud tam ještě není)
        if ws and not already_in_sheet:
            row_data = [
                date_str,          # 1. Datum
                name,              # 2. Název
                type_key,          # 3. Typ
                dist_str,          # 4. Vzdálenost (km)
                moving_dur_str,    # 5. Čas pohybu
                elapsed_dur_str,   # 6. Čas celkem
                gain_m,            # 7. Převýšení (m)
                avg_speed_str,     # 8. Průměrná rychlost (km/h)
                max_speed_str,     # 9. Max rychlost (km/h)
                avg_hr,            # 10. Průměrný HR
                max_hr,            # 11. Max HR
                cadence,           # 12. Kadence
                avg_power,         # 13. Průměrný výkon (W)
                calories,          # 14. Kilojoule
                avg_temp,          # 15. Průměrná teplota (°C)
                min_temp,          # 16. Min teplota (°C)
                max_temp,          # 17. Max teplota (°C)
                aerobic_te,        # 18. Aerobní TE
                anaerobic_te,      # 19. Anaerobní TE
                suffer_score,      # 20. Suffer score
                str(act_id),       # 21. Garmin Activity ID
                gpx_rel_path,      # 22. GPX soubor
                gear_id,           # 23. Kolo ID
                start_lat,         # 24. Start Lat
                start_lon,         # 25. Start Lon
                end_lat,           # 26. Cíl Lat
                end_lon            # 27. Cíl Lon
            ]
            try:
                ws.append_row(row_data, value_input_option="USER_ENTERED")
                log.info(f"📊 Uloženo do Google Sheetu: {name} (Kolo ID: {gear_id or '—'})")
                existing_ids.add(act_id)
            except Exception as e:
                log.error(f"Chyba zápisu do Sheetu: {e}")

        # TURISTIKA DO HORSKÉHO DENÍKU & TELEGRAMU
        if is_hiking:
            if not hike_exists_in_diary(diary_doc_id):
                log.info(f"🔍 Doplňuji do Horského deníku trasu: {name} ({act_id})...")
                track_pts, max_ele, min_ele, p_lat, p_lon = parse_gpx(gpx_bytes, act_summary=act)

                # Uložíme optimalizovaný payload (pod 30 KB)
                doc_id = save_to_diary(act, track_pts, max_ele, min_ele, p_lat, p_lon)
                if doc_id and not already_in_sheet:
                    send_tg(act, doc_id, max_ele)

    log.info("🎉 Synchronizace úspěšně dokončena.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log.error(f"Chyba: {e}")
        traceback.print_exc()
        sys.exit(0)
