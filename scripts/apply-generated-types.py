"""Supabase MCP の generate_typescript_types の出力(JSON)を types/supabase.ts に書き出す。

公開用ビュー locapass_public_casts の列は PostgREST の型生成では全部 null 可になるが、
元テーブル locapass_cast_members で NOT NULL の列はビューでも必ず値があるので、非nullに補正する。
使い方: python3 scripts/apply-generated-types.py <MCP出力ファイル>
"""
import json
import sys

raw = open(sys.argv[1]).read()
types = json.loads(raw)["types"]
i = types.index("      locapass_public_casts: {")
j = types.index("Row: {", i)
k = types.index("}", j)
row = types[j:k]
for col in ["cast_code", "created_at", "id", "name", "shop_id", "updated_at"]:
    row = row.replace(f"          {col}: string | null\n", f"          {col}: string\n")
types = types[:j] + row + types[k:]
open("types/supabase.ts", "w").write(types if types.endswith("\n") else types + "\n")
print("ok", len(types))
