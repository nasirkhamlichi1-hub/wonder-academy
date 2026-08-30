"""Applies the T-SQL schema. Run by the provisioning workflow.

The schema is written as IF-guarded blocks so it can be applied repeatedly
without error - re-running provisioning must never drop a child's progress.
"""
import os, re, sys, time
import pymssql

server = os.environ["SQL_SERVER"] + ".database.windows.net"
password = os.environ["SQL_PASSWORD"]
database = os.environ["SQL_DB"]

# A freshly created database can refuse connections for a few seconds.
conn = None
for attempt in range(12):
    try:
        conn = pymssql.connect(server=server, user="wonderadmin", password=password,
                               database=database, tds_version="7.4", timeout=30)
        break
    except Exception as e:
        print(f"waiting for the database ({attempt + 1}/12): {e}")
        time.sleep(10)

if conn is None:
    sys.exit("could not reach the database")

sql = open("migrations/azure/0001_init.sql").read()
blocks = re.split(r"\n(?=IF (?:OBJECT_ID|NOT EXISTS))", sql)

cur = conn.cursor()
applied = 0
for block in blocks:
    block = block.strip()
    if not block or block.startswith("--"):
        continue
    cur.execute(block)
    applied += 1
conn.commit()
print(f"applied {applied} schema blocks")
