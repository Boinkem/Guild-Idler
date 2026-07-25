#!/usr/bin/env python3
"""
Cheap sanity check: every hook/component that a file *uses* must be imported or
locally defined in that same file. Catches the "used but never imported" bug
that produces a blank-screen runtime crash, without needing node_modules.

This is a backstop, not a replacement for `tsc`. Run `npm run build` (which runs
tsc --noEmit) before shipping; run this for a fast pre-flight.

    python3 tools/check_imports.py
"""
import re, os, sys

CARE = ['useSettings', 'useEngine', 'useNow', 'HeroSprite', 'PixelSprite',
        'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback']


def local_symbols(src: str) -> set:
    syms = set()
    for m in re.finditer(r"import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))\s+from", src):
        if m.group(1):
            for name in m.group(1).split(','):
                name = name.strip().split(' as ')[-1].strip()
                if name:
                    syms.add(name)
        if m.group(2):
            syms.add(m.group(2))
    for m in re.finditer(r"\b(?:const|let|var|function|class|interface|type|enum)\s+(\w+)", src):
        syms.add(m.group(1))
    for m in re.finditer(r"\b(?:const|let)\s+\{([^}]*)\}\s*=", src):
        for name in m.group(1).split(','):
            name = name.strip().split(':')[-1].strip().split(' as ')[-1].strip()
            if name:
                syms.add(name)
    return syms


def main() -> int:
    problems = []
    for root, _, files in os.walk('src'):
        for fn in files:
            if not fn.endswith(('.ts', '.tsx')):
                continue
            path = os.path.join(root, fn)
            src = open(path).read()
            syms = local_symbols(src)
            for name in CARE:
                used = re.search(rf"\b{name}\b\s*[\(<]", src) or re.search(rf"[^.\w]{name}\.", src)
                if used and name not in syms:
                    problems.append(f"{path}: uses '{name}' but it is not imported or defined")
    if problems:
        print('IMPORT CHECK FAILED:')
        for p in problems:
            print('  ' + p)
        return 1
    print('import check OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
