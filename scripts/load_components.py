"""Mirrors the curriculum's knowledge components into the component table.

Runs on the Actions runner, not through the API: there are 6,665 components and
Static Web Apps caps a managed Function at 45 seconds. A direct bulk insert
takes a few seconds.

The JSON files stay the source of truth - this table exists so the coach can
query components in SQL - so it is rebuilt wholesale each time.
"""
import json, os, time
import pymssql

TYPE_MAP = {"fact": "A", "gpc": "A", "word": "A",
            "procedure": "B", "skill": "B",
            "discrimination": "D", "concept": "C"}
KEY_STAGE = {"year2": "ks1", "year7": "ks3", "year10": "gcse"}
TARGET_MS = {"A": {"ks1": 5000}, "B": {"ks1": 20000}, "D": {}}

def target_latency(item_type, key_stage):
    if item_type == "A":
        return 5000 if key_stage == "ks1" else 3000
    if item_type == "B":
        return 30000 if key_stage == "gcse" else 20000
    if item_type == "D":
        return 10000
    return None

rows = []
now_ms = int(time.time() * 1000)

for curriculum_id in ("year2", "year7", "year10"):
    key_stage = KEY_STAGE[curriculum_id]
    data = json.load(open(f"api/curriculum/{curriculum_id}.json"))
    for subject in data.get("subjects", []):
        strand = subject.get("strand") or "core"
        for term in subject.get("terms", []):
            for week in term.get("weeks", []):
                first = (week.get("lessons") or [{}])[0].get("id")
                for kc in week.get("knowledgeComponents", []):
                    item_type = TYPE_MAP.get((kc.get("type") or "").lower(), "C")
                    rows.append((
                        kc["id"], curriculum_id, "2014", subject["id"], strand, key_stage,
                        kc.get("ncRef") or kc.get("specRef"),
                        item_type, kc.get("statement", ""),
                        kc.get("lesson") or first, term.get("id"), week.get("week"),
                        json.dumps(kc.get("prereqIds") or []),
                        kc.get("generator"),
                        json.dumps(kc["rubric"]) if kc.get("rubric") else None,
                        target_latency(item_type, key_stage), now_ms))

# Duplicate ids across files would silently drop rows, so fail loudly instead.
seen = {}
for r in rows:
    seen.setdefault(r[0], 0)
    seen[r[0]] += 1
dupes = [k for k, v in seen.items() if v > 1]
if dupes:
    raise SystemExit(f"duplicate component ids: {dupes[:5]} ({len(dupes)} total)")

conn = pymssql.connect(
    server=os.environ["SQL_SERVER"] + ".database.windows.net",
    user="wonderadmin", password=os.environ["SQL_PASSWORD"],
    database=os.environ["SQL_DB"], tds_version="7.4", timeout=120)
cur = conn.cursor()
cur.execute("DELETE FROM component")

# Multi-row INSERTs rather than executemany. executemany sends one round trip per
# row, which against a 5 DTU database took over ten minutes for these 6,665 rows;
# batching brings it under a minute. SQL Server caps a statement at 2,100
# parameters, and 17 columns x 100 rows = 1,700.
COLUMNS = ("id, curriculum_id, curriculum_version, subject, strand, key_stage,"
           " nc_reference, item_type, statement, lesson_id, term_id, week,"
           " prereq_ids, generator, rubric, target_latency_ms, created_at")
BATCH = 100
placeholder = "(" + ",".join(["%s"] * 17) + ")"

for i in range(0, len(rows), BATCH):
    chunk = rows[i:i + BATCH]
    sql = ("INSERT INTO component (" + COLUMNS + ") VALUES "
           + ",".join([placeholder] * len(chunk)))
    cur.execute(sql, tuple(v for row in chunk for v in row))
conn.commit()

cur.execute("SELECT curriculum_id, COUNT(*) FROM component GROUP BY curriculum_id")
for curriculum_id, n in cur.fetchall():
    print(f"{curriculum_id}: {n} components")
print(f"total: {len(rows)}")
