#!/usr/bin/env python3
"""
One-time (repeatable) extraction of hand-authored TS data arrays into JSON, so
they can be edited by non-programmers via tools/devtool.

Safe against the two failure modes a naive regex hits: colons inside string
literals (e.g. "Sealed Orders:") and type annotations before the `=` sign
(e.g. `Template[] = [`). Strings are stashed behind placeholders before any
key-quoting happens, so nothing inside a string is ever touched.

This script is idempotent-ish but not meant to be re-run blindly against a file
that has since been hand-edited back in TS form — it's a one-way door. Once data
lives in JSON (see src/game/data/*.ts for the thin re-export wrappers), edit the
JSON directly or through the devtool.
"""
import re
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def extract_array(block: str):
    m = re.search(r'=\s*(\[)', block)
    start = m.start(1)
    depth, i, in_str, quote = 0, start, False, ''
    end = None
    while i < len(block):
        c = block[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == quote:
                in_str = False
        else:
            if c in ("'", '"'):
                in_str, quote = True, c
            elif c == '[':
                depth += 1
            elif c == ']':
                depth -= 1
                if depth == 0:
                    end = i
                    break
        i += 1
    body = block[start:end + 1]

    strings = []
    def stash(m):
        strings.append(m.group(1) if m.group(1) is not None else m.group(2))
        return f'\x00{len(strings) - 1}\x00'
    # TS source mixes single-quoted strings with double-quoted ones (used when
    # the text itself contains an apostrophe, e.g. "Woodcutter's Axe") — stash
    # both so nothing inside either kind of string gets touched downstream.
    protected = re.sub(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", stash, body)
    # Section-divider comments like `/* weapons */` are common in these files;
    # safe to strip now because string contents are already stashed above.
    protected = re.sub(r'/\*.*?\*/', '', protected, flags=re.S)
    protected = re.sub(r'//[^\n]*', '', protected)
    protected = re.sub(r'(\b[a-zA-Z_]\w*\b)\s*:', r'"\1":', protected)
    protected = re.sub(r',(\s*[\]}])', r'\1', protected)
    protected = re.sub(r'\x00(\d+)\x00', lambda m: json.dumps(strings[int(m.group(1))]), protected)
    return json.loads(protected)


def slice_between(src: str, start_marker: str, end_marker: str) -> str:
    start = src.index(start_marker)
    end = src.index(end_marker, start) if end_marker else len(src)
    return src[start:end]


def main():
    out_dir = os.path.join(ROOT, 'src', 'game', 'data', 'json')
    os.makedirs(out_dir, exist_ok=True)

    jobs = [
        ('src/game/data/quests.ts', 'export const QUEST_TEMPLATES', 'export const QUEST_PREFIXES', 'quest-templates.json'),
        ('src/game/data/quests.ts', 'export const QUEST_PREFIXES', '/* --------------------------- multi-day chains', 'quest-prefixes.json'),
        ('src/game/data/equipment.ts', 'export const EQUIPMENT:', 'export const EQUIPMENT_BY_ID', 'equipment.json'),
        ('src/game/data/items.ts', 'export const CONSUMABLES:', 'export const CONSUMABLE_BY_ID', 'consumables.json'),
        ('src/game/data/events.ts', 'export const EVENTS:', 'export const EVENTS_BY_KIND', 'events.json'),
    ]

    for rel_path, start_marker, end_marker, out_name in jobs:
        src = open(os.path.join(ROOT, rel_path)).read()
        block = slice_between(src, start_marker, end_marker)
        data = extract_array(block)
        out_path = os.path.join(out_dir, out_name)
        json.dump(data, open(out_path, 'w'), indent=2)
        print(f'{out_name}: {len(data)} entries')


if __name__ == '__main__':
    main()
